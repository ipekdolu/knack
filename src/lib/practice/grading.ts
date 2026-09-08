"use server";

import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser, applyProgressUpdate } from "./shared";
import { createAnthropicClient, createMessage } from "@/lib/claude/client";
import { enforceDailyLimit } from "./rate-limit";

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
  levelAppropriate: boolean;
  levelNote: string | null;
  allCorrect: boolean;
};

export type GradeOptions = {
  /** The question the learner was answering, when there was one. */
  prompt?: string;
  /** True when the text came from speech-to-text rather than a keyboard. */
  spoken?: boolean;
};

export async function gradeSentence(
  words: TargetWord[],
  userSentence: string,
  options: GradeOptions = {},
): Promise<SentenceGrade> {
  const user = await requireUser();
  await enforceDailyLimit(user.id, "sentence_grade");

  const anthropic = createAnthropicClient();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const bareLemmas = words.map((w) => w.lemma);
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await createMessage(anthropic, {
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You grade German sentences written by language learners practicing specific target vocabulary. Be encouraging but precise about actual errors.",
    messages: [
      {
        role: "user",
        content: `A learner at approximately CEFR level ${levels} was asked to ${
          options.prompt
            ? `answer this question in German using all of these target words: ${wordList}.\n\nThe question: "${options.prompt}"`
            : `write one German sentence using all of these target words: ${wordList}.`
        }

Their ${options.spoken ? "spoken answer, as transcribed by speech recognition" : "sentence"}: "${userSentence}"
${
  options.spoken
    ? "\nThis is a speech-to-text transcript, so it has no punctuation and unreliable capitalization, and the recognizer may have garbled a word. Judge only the spoken German -- never report missing punctuation, lowercase nouns, or an obvious transcription artifact as a mistake.\n"
    : ""
}
For each target word, judge whether it appears in the sentence used correctly (present, correctly inflected/conjugated for its role, and used with its expected meaning). In word_results, set "lemma" to exactly one of these strings, with no article and no other formatting: ${bareLemmas.map((l) => `"${l}"`).join(", ")}. Note any grammar issues in the sentence more broadly (word order, case, conjugation, agreement, etc); return an empty array if there are none. Judge whether the sentence is appropriate for a learner at level ${levels} -- set level_appropriate to false only if it's notably below the level (trivially simple for the words involved) or reaches well beyond it in a way that produced errors, and in that case give a one-sentence level_note, in English, explaining why. Give brief, encouraging, specific feedback (1-2 sentences, in English). Provide a corrected or improved version of the sentence in German -- return the sentence unchanged if it's already good. Call the grade_sentence tool with your answer.`,
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
            level_appropriate: {
              type: "boolean",
              description:
                "Whether the sentence sits at a reasonable level for the learner.",
            },
            level_note: {
              type: "string",
              description:
                "One sentence explaining the level judgment. Empty string when level_appropriate is true.",
            },
          },
          required: [
            "word_results",
            "grammar_issues",
            "feedback",
            "corrected_sentence",
            "level_appropriate",
            "level_note",
          ],
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
    level_appropriate: boolean;
    level_note: string;
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
    levelAppropriate: input.level_appropriate,
    // Level is informational only -- it never counts against the learner's
    // mastery progress, so it's deliberately left out of allCorrect below.
    levelNote: input.level_note?.trim() ? input.level_note.trim() : null,
    allCorrect:
      wordResults.every((r) => r.usedCorrectly) && input.grammar_issues.length === 0,
  };
}

// A light nudge for a learner stuck on this word group -- not the answer,
// just a starter phrase or a reminder of what one of the words means, so
// they're unblocked without the exercise being handed to them.
export async function getSentenceHint(words: TargetWord[]): Promise<string> {
  const user = await requireUser();
  await enforceDailyLimit(user.id, "sentence_hint");

  const anthropic = createAnthropicClient();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await createMessage(anthropic, {
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system:
      "You give brief, encouraging hints to a German learner stuck writing a sentence. Never write the full sentence for them.",
    messages: [
      {
        role: "user",
        content: `A learner at CEFR level ${levels} is stuck writing one German sentence using all of these target words: ${wordList}. Give one short hint (max 2 sentences, in English) -- e.g. a sentence starter, a reminder of what a tricky word means, or a suggestion for how the words could relate to each other. Do not write the full sentence.`,
      },
    ],
    tools: [
      {
        name: "give_hint",
        description: "Record a short hint for the learner.",
        input_schema: {
          type: "object",
          properties: { hint: { type: "string" } },
          required: ["hint"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "give_hint" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a hint");
  }
  return (toolUse.input as { hint: string }).hint;
}

export async function logSentenceResult(entry: {
  grade: SentenceGrade;
  userResponse: string;
}): Promise<void> {
  const user = await requireUser();
  const { grade } = entry;

  // Persisted as JSON rather than prose so a future review screen can render
  // the parts separately (which words passed, what to fix) instead of having
  // to re-parse a paragraph.
  const feedback = JSON.stringify({
    feedback: grade.feedback,
    grammarIssues: grade.grammarIssues,
    correctedSentence: grade.correctedSentence,
    levelAppropriate: grade.levelAppropriate,
    levelNote: grade.levelNote,
    wordResults: grade.wordResults.map((r) => ({
      lemma: r.lemma,
      usedCorrectly: r.usedCorrectly,
    })),
  });

  await db.transaction(async (tx) => {
    await tx.insert(exerciseLog).values({
      userId: user.id,
      wordIds: grade.wordResults.map((r) => r.wordId),
      exerciseType: "sentence",
      userResponse: entry.userResponse,
      score: grade.allCorrect ? 1 : 0,
      feedback,
    });

    for (const result of grade.wordResults) {
      await applyProgressUpdate(tx, user.id, result.wordId, result.usedCorrectly);
    }
  });
}
