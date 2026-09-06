"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser } from "./shared";
import type { TargetWord } from "./grading";

export type ReadingQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
};

export type ReadingContent = {
  passage: string;
  // Bare lemmas of the target words that actually made it into the
  // passage -- ground truth for the word-identification step, since not
  // every target word will fit a natural passage.
  wordsUsed: string[];
  questions: ReadingQuestion[];
};

export async function generateReadingPassage(
  words: TargetWord[],
): Promise<ReadingContent> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const bareLemmas = words.map((w) => w.lemma);
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1536,
    system:
      "You write short German reading passages for language learners, calibrated to CEFR levels, along with comprehension questions.",
    messages: [
      {
        role: "user",
        content: `Write a short, coherent German passage (4-6 sentences) appropriate for a CEFR level ${levels} learner. Naturally work in as many of these target words as fit without forcing awkward phrasing: ${wordList}. It's fine to leave some out if they don't fit naturally.

Then list which of the target words actually appear in the passage (bare lemma, no article, exactly matching one of: ${bareLemmas.map((l) => `"${l}"`).join(", ")}).

Then write exactly 2 comprehension questions about the passage's content (not vocabulary quizzes -- test whether the reader understood what happened), each with exactly 4 multiple-choice options in German and one correct answer.

Call the reading_content tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "reading_content",
        description: "Record a reading passage with comprehension questions.",
        input_schema: {
          type: "object",
          properties: {
            passage: { type: "string" },
            words_used: {
              type: "array",
              items: { type: "string" },
              description:
                "Bare lemmas of target words that actually appear in the passage.",
            },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Exactly 4 options.",
                  },
                  correct_answer: { type: "string" },
                },
                required: ["question", "options", "correct_answer"],
              },
              description: "Exactly 2 comprehension questions.",
            },
          },
          required: ["passage", "words_used", "questions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "reading_content" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a reading passage");
  }
  const input = toolUse.input as {
    passage: string;
    words_used: string[];
    questions: {
      question: string;
      options: string[];
      correct_answer: string;
    }[];
  };

  // Ground truth is matched to the caller's exact lemma casing where
  // possible, falling back to whatever Claude returned -- keeps the
  // word-identification step comparing against the same strings shown to
  // the user as chips.
  const wordsUsed = input.words_used
    .map((raw) => {
      const match = bareLemmas.find(
        (l) => l.toLowerCase() === raw.toLowerCase(),
      );
      return match ?? raw;
    })
    .filter((lemma, i, arr) => arr.indexOf(lemma) === i);

  return {
    passage: input.passage,
    wordsUsed,
    questions: input.questions.map((q) => ({
      question: q.question,
      options: q.options,
      correctAnswer: q.correct_answer,
    })),
  };
}

export async function logReadingResult(entry: {
  wordIds: string[];
  correct: boolean;
  questionResults: { question: string; correct: boolean }[];
  wordIdResults: { lemma: string; correct: boolean }[];
}): Promise<void> {
  const user = await requireUser();

  // Log only -- reading tests comprehension, a different skill than the
  // recall/production that drives flashcard and sentence-writing mastery,
  // so it deliberately doesn't call applyProgressUpdate.
  const feedback = JSON.stringify({
    questionResults: entry.questionResults,
    wordIdResults: entry.wordIdResults,
  });

  await db.insert(exerciseLog).values({
    userId: user.id,
    wordIds: entry.wordIds,
    exerciseType: "reading",
    score: entry.correct ? 1 : 0,
    feedback,
  });
}
