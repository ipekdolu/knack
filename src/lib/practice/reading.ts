"use server";

import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser } from "./shared";
import type { TargetWord } from "./grading";
import { createAnthropicClient, createMessage } from "@/lib/claude/client";
import { enforceDailyLimit } from "./rate-limit";

export type ReadingQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
};

export type GlossaryEntry = {
  word: string;
  gloss: string;
};

export type ReadingMode = "story" | "article";

export type ReadingContent = {
  // Only populated for "article" mode -- a short headline for the piece.
  title: string | null;
  passage: string;
  // Every distinct content word in the passage, glossed -- powers a hover/
  // click tooltip on the passage itself so an unfamiliar word never blocks
  // comprehension entirely.
  glossary: GlossaryEntry[];
  questions: ReadingQuestion[];
};

const MODE_INSTRUCTIONS: Record<ReadingMode, string> = {
  story: `Write a short, coherent German passage (5-7 sentences) -- an everyday narrative or anecdote, the kind of thing that happens in daily life.`,
  article: `Write a short German informational article (8-11 sentences), like a small news brief or magazine piece on a real-world topic (e.g. a place, a custom, an everyday phenomenon, a simple how-something-works). Give it a short German headline. It should read as a genuine short article, not a personal story.`,
};

export async function generateReadingPassage(
  words: TargetWord[],
  mode: ReadingMode = "story",
): Promise<ReadingContent> {
  const user = await requireUser();
  await enforceDailyLimit(user.id, "reading");

  const anthropic = createAnthropicClient();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await createMessage(anthropic, {
    // Sonnet -- pure generation, no judgment call to get right.
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system:
      "You write German reading passages for language learners using comprehensible-input principles (i+1: mostly familiar language with a few new words introduced in context), along with comprehension questions that test understanding, not word-recognition.",
    messages: [
      {
        role: "user",
        content: `${MODE_INSTRUCTIONS[mode]} Appropriate for a CEFR level ${levels} learner. Naturally work in as many of these words as fit without forcing awkward phrasing: ${wordList}. It's fine to leave some out if they don't fit naturally. Do not introduce other vocabulary beyond level ${levels} -- stick to words a learner at this level would already know, plus the given list.

Then build a glossary: every distinct content word that appears in the passage (nouns, verbs, adjectives, adverbs -- skip trivial function words like articles, pronouns, and conjunctions), each as it appears in the passage (inflected form is fine) paired with a short English gloss for its meaning as used there. This powers a hover/click-to-translate feature, so it needs to cover the passage thoroughly, not just the target words.

Then write exactly 2 comprehension questions in German, each with exactly 4 multiple-choice options in German and one correct answer. These must test whether the reader understood MEANING and could INFER things from the passage -- e.g. why something happened, what the writer implied, what a character would likely do next, what the overall point was. A question must NOT be answerable just by spotting a familiar word in the passage that also appears in the question -- it must require having understood what was actually said.

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
            title: {
              type: "string",
              description:
                "A short German headline, for article mode only -- empty string for story mode.",
            },
            passage: { type: "string" },
            glossary: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  word: { type: "string" },
                  gloss: { type: "string" },
                },
                required: ["word", "gloss"],
              },
              description:
                "Every distinct content word in the passage, as it appears there, with a short English gloss.",
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
              description:
                "Exactly 2 meaning/inference comprehension questions.",
            },
          },
          required: ["title", "passage", "glossary", "questions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "reading_content" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Knack could not generate a passage -- try again");
  }
  const input = toolUse.input as {
    title: string;
    passage: string;
    glossary: { word: string; gloss: string }[];
    questions: {
      question: string;
      options: string[];
      correct_answer: string;
    }[];
  };

  return {
    title: input.title?.trim() ? input.title.trim() : null,
    passage: input.passage,
    // Despite being in the tool's required list, Claude occasionally omits
    // an array field outright rather than returning it empty -- default
    // defensively instead of letting a missing key crash the UI's .map().
    glossary: input.glossary ?? [],
    questions: (input.questions ?? []).map((q) => ({
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
}): Promise<void> {
  const user = await requireUser();

  // Log only -- reading tests comprehension, a different skill than the
  // recall/production that drives flashcard and sentence-writing mastery,
  // so it deliberately doesn't call applyProgressUpdate.
  const feedback = JSON.stringify({
    questionResults: entry.questionResults,
  });

  await db.insert(exerciseLog).values({
    userId: user.id,
    wordIds: entry.wordIds,
    exerciseType: "reading",
    score: entry.correct ? 1 : 0,
    feedback,
  });
}
