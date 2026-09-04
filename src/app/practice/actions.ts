"use server";

import Anthropic from "@anthropic-ai/sdk";
import { or, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { words, exerciseLog, levelEnum } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

type Level = (typeof levelEnum.enumValues)[number];

export type ExerciseType = "flashcard" | "fill_blank";

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"];

export type SessionWord = {
  wordId: string;
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
  type: ExerciseType;
};

export type DashboardStats = {
  totalExercises: number;
  accuracyPct: number | null;
  wordsPracticed: number;
};

export type FlashcardContent = {
  exampleSentence: string;
  gloss: string;
};

export type FillBlankContent = {
  sentence: string;
  options: string[];
  correctAnswer: string;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function getAvailableLevels(): Promise<string[]> {
  const user = await requireUser();

  const rows = await db
    .selectDistinct({ level: words.level })
    .from(words)
    .where(or(eq(words.source, "seed"), eq(words.userId, user.id)));

  return rows
    .map((r) => r.level)
    .sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
}

export async function startSession(
  type: ExerciseType,
  level: string,
  count = 10,
): Promise<SessionWord[]> {
  const user = await requireUser();

  const rows = await db
    .select({
      id: words.id,
      lemma: words.lemma,
      level: words.level,
      pos: words.pos,
      gender: words.gender,
    })
    .from(words)
    .where(
      and(
        or(eq(words.source, "seed"), eq(words.userId, user.id)),
        eq(words.level, level as Level),
      ),
    )
    .orderBy(sql`random()`)
    .limit(count);

  return rows.map((row) => ({
    wordId: row.id,
    lemma: row.lemma,
    level: row.level,
    pos: row.pos,
    gender: row.gender,
    type,
  }));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const user = await requireUser();

  const [agg] = await db
    .select({
      totalExercises: sql<number>`count(*)::int`,
      accuracyPct: sql<number | null>`round(avg(${exerciseLog.score}) * 100)::int`,
    })
    .from(exerciseLog)
    .where(eq(exerciseLog.userId, user.id));

  const wordsPracticedResult = await db.execute<{ count: number }>(
    sql`select count(distinct w)::int as count from exercise_log, unnest(word_ids) as w where user_id = ${user.id}`,
  );
  const wordsPracticed = Number(wordsPracticedResult[0]?.count ?? 0);

  return {
    totalExercises: agg?.totalExercises ?? 0,
    accuracyPct: agg?.accuracyPct ?? null,
    wordsPracticed,
  };
}

export async function generateFlashcard(word: {
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
}): Promise<FlashcardContent> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordDesc = word.gender ? `${word.gender} ${word.lemma}` : word.lemma;
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You write flashcard content for a German vocabulary learning app, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write flashcard content for the German ${word.pos} "${wordDesc}" at CEFR level ${word.level}. Provide a natural example sentence using the word, appropriate for a learner at this level, and a short, plain English gloss (a few words, not a full sentence). Call the flashcard_content tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "flashcard_content",
        description: "Record flashcard content for a vocabulary word.",
        input_schema: {
          type: "object",
          properties: {
            example_sentence: { type: "string" },
            gloss: {
              type: "string",
              description:
                "Short, plain English translation of the word as used in the example sentence.",
            },
          },
          required: ["example_sentence", "gloss"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "flashcard_content" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return flashcard content");
  }
  const input = toolUse.input as { example_sentence: string; gloss: string };
  return { exampleSentence: input.example_sentence, gloss: input.gloss };
}

export async function generateFillBlank(word: {
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
}): Promise<FillBlankContent> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordDesc = word.gender ? `${word.gender} ${word.lemma}` : word.lemma;
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You write fill-in-the-blank exercises for a German vocabulary learning app, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write a fill-in-the-blank exercise for the German ${word.pos} "${wordDesc}" at CEFR level ${word.level}. Write a natural German sentence at this level that uses the word (inflected/conjugated as natural for the sentence), then replace that word with the exact placeholder "_____". Provide the exact word form that correctly fills the blank, and three incorrect but plausible same-part-of-speech distractor words that would NOT correctly complete the sentence. Call the fill_blank_content tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "fill_blank_content",
        description: "Record a fill-in-the-blank exercise.",
        input_schema: {
          type: "object",
          properties: {
            sentence: {
              type: "string",
              description:
                "German sentence with the target word replaced by the placeholder _____.",
            },
            correct_answer: { type: "string" },
            distractors: {
              type: "array",
              items: { type: "string" },
              description: "Exactly three incorrect distractor options.",
            },
          },
          required: ["sentence", "correct_answer", "distractors"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "fill_blank_content" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a fill-in-the-blank exercise");
  }
  const input = toolUse.input as {
    sentence: string;
    correct_answer: string;
    distractors: string[];
  };

  return {
    sentence: input.sentence,
    correctAnswer: input.correct_answer,
    options: shuffle([input.correct_answer, ...input.distractors]),
  };
}

export async function logExerciseResult(entry: {
  wordId: string;
  type: ExerciseType;
  correct: boolean;
  userResponse: string;
}): Promise<void> {
  const user = await requireUser();

  await db.insert(exerciseLog).values({
    userId: user.id,
    wordIds: [entry.wordId],
    exerciseType: entry.type,
    userResponse: entry.userResponse,
    score: entry.correct ? 1 : 0,
  });
}
