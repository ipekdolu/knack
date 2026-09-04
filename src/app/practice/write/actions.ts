"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser, applyProgressUpdate } from "../shared";

export type TargetWord = {
  wordId: string;
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
};

export type WordGrade = {
  wordId: string;
  lemma: string;
  usedCorrectly: boolean;
};

export type SentenceGrade = {
  wordResults: WordGrade[];
  grammarIssues: string[];
  feedback: string;
  correctedSentence: string;
  allCorrect: boolean;
};

export async function gradeSentence(
  words: TargetWord[],
  userSentence: string,
): Promise<SentenceGrade> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const bareLemmas = words.map((w) => w.lemma);
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You grade German sentences written by language learners practicing specific target vocabulary. Be encouraging but precise about actual errors.",
    messages: [
      {
        role: "user",
        content: `A learner at approximately CEFR level ${levels} was asked to write one German sentence using all of these target words: ${wordList}.

Their sentence: "${userSentence}"

For each target word, judge whether it appears in the sentence used correctly (present, correctly inflected/conjugated for its role, and used with its expected meaning). In word_results, set "lemma" to exactly one of these strings, with no article and no other formatting: ${bareLemmas.map((l) => `"${l}"`).join(", ")}. Note any grammar issues in the sentence more broadly (word order, case, conjugation, agreement, etc); return an empty array if there are none. Give brief, encouraging, specific feedback (1-2 sentences, in English). Provide a corrected or improved version of the sentence in German -- return the sentence unchanged if it's already good. Call the grade_sentence tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "grade_sentence",
        description: "Record a graded assessment of a learner's German sentence.",
        input_schema: {
          type: "object",
          properties: {
            word_results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  lemma: { type: "string" },
                  used_correctly: { type: "boolean" },
                },
                required: ["lemma", "used_correctly"],
              },
              description: "One entry per target word, in the order given.",
            },
            grammar_issues: {
              type: "array",
              items: { type: "string" },
              description: "Short descriptions of grammar mistakes found. Empty if none.",
            },
            feedback: { type: "string" },
            corrected_sentence: { type: "string" },
          },
          required: ["word_results", "grammar_issues", "feedback", "corrected_sentence"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "grade_sentence" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a grading result");
  }
  const input = toolUse.input as {
    word_results: { lemma: string; used_correctly: boolean }[];
    grammar_issues: string[];
    feedback: string;
    corrected_sentence: string;
  };

  // Match graded results back to word IDs by lemma. The prompt asks for an
  // exact bare-lemma match, but Claude sometimes echoes it with the article
  // attached anyway (e.g. "der Bahnhof" instead of "Bahnhof") -- fall back
  // to a substring match before giving up and marking it wrong, since a
  // false "not used correctly" is worse than a loose match here.
  const wordResults: WordGrade[] = words.map((w) => {
    const lemmaLower = w.lemma.toLowerCase();
    const match =
      input.word_results.find((r) => r.lemma.toLowerCase() === lemmaLower) ??
      input.word_results.find((r) => r.lemma.toLowerCase().includes(lemmaLower));
    return { wordId: w.wordId, lemma: w.lemma, usedCorrectly: match?.used_correctly ?? false };
  });

  return {
    wordResults,
    grammarIssues: input.grammar_issues,
    feedback: input.feedback,
    correctedSentence: input.corrected_sentence,
    allCorrect:
      wordResults.every((r) => r.usedCorrectly) && input.grammar_issues.length === 0,
  };
}

export async function logSentenceResult(entry: {
  wordResults: WordGrade[];
  userResponse: string;
  allCorrect: boolean;
}): Promise<void> {
  const user = await requireUser();

  await db.transaction(async (tx) => {
    await tx.insert(exerciseLog).values({
      userId: user.id,
      wordIds: entry.wordResults.map((r) => r.wordId),
      exerciseType: "sentence",
      userResponse: entry.userResponse,
      score: entry.allCorrect ? 1 : 0,
    });

    for (const result of entry.wordResults) {
      await applyProgressUpdate(tx, user.id, result.wordId, result.usedCorrectly);
    }
  });
}
