"use server";

import Anthropic from "@anthropic-ai/sdk";
import { or, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  words,
  exerciseLog,
  userWordProgress,
  levelEnum,
  masteryStageEnum,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

type Level = (typeof levelEnum.enumValues)[number];
type MasteryStage = (typeof masteryStageEnum.enumValues)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const MASTERED_INTERVAL_MS = 7 * DAY_MS;
const LEARNING_INTERVAL_MS = 1 * DAY_MS;

export type ExerciseType = "flashcard" | "fill_blank";

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"];

export type SessionWord = {
  wordId: string;
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
  type: ExerciseType;
  masteryStage: MasteryStage;
};

export type DashboardStats = {
  totalExercises: number;
  accuracyPct: number | null;
  wordsPracticed: number;
  mastery: { new: number; learning: number; mastered: number };
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
      masteryStage: userWordProgress.masteryStage,
    })
    .from(words)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(
      and(
        or(eq(words.source, "seed"), eq(words.userId, user.id)),
        eq(words.level, level as Level),
      ),
    )
    .orderBy(
      sql`(${userWordProgress.nextDueAt} is null or ${userWordProgress.nextDueAt} <= now()) desc`,
      sql`${userWordProgress.nextDueAt} asc nulls last`,
      sql`random()`,
    )
    .limit(count);

  return rows.map((row) => ({
    wordId: row.id,
    lemma: row.lemma,
    level: row.level,
    pos: row.pos,
    gender: row.gender,
    type,
    masteryStage: row.masteryStage ?? "new",
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

  const [totalWordsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(words)
    .where(or(eq(words.source, "seed"), eq(words.userId, user.id)));
  const totalWords = totalWordsRow?.count ?? 0;

  const stageCounts = await db
    .select({
      stage: userWordProgress.masteryStage,
      count: sql<number>`count(*)::int`,
    })
    .from(userWordProgress)
    .where(eq(userWordProgress.userId, user.id))
    .groupBy(userWordProgress.masteryStage);

  const learning = stageCounts.find((s) => s.stage === "learning")?.count ?? 0;
  const mastered = stageCounts.find((s) => s.stage === "mastered")?.count ?? 0;
  const explicitNew = stageCounts.find((s) => s.stage === "new")?.count ?? 0;
  const untouched = Math.max(totalWords - learning - mastered - explicitNew, 0);

  return {
    totalExercises: agg?.totalExercises ?? 0,
    accuracyPct: agg?.accuracyPct ?? null,
    wordsPracticed,
    mastery: { new: explicitNew + untouched, learning, mastered },
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

function nextMasteryStage(
  currentStage: MasteryStage,
  correct: boolean,
  correctStreak: number,
): MasteryStage {
  if (correct) {
    if (currentStage === "new") return "learning";
    if (currentStage === "learning") return correctStreak >= 3 ? "mastered" : "learning";
    return "mastered";
  }
  if (currentStage === "mastered") return "learning";
  return "new";
}

export async function logExerciseResult(entry: {
  wordId: string;
  type: ExerciseType;
  correct: boolean;
  userResponse: string;
}): Promise<void> {
  const user = await requireUser();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(exerciseLog).values({
      userId: user.id,
      wordIds: [entry.wordId],
      exerciseType: entry.type,
      userResponse: entry.userResponse,
      score: entry.correct ? 1 : 0,
    });

    const [existing] = await tx
      .select()
      .from(userWordProgress)
      .where(
        and(
          eq(userWordProgress.userId, user.id),
          eq(userWordProgress.wordId, entry.wordId),
        ),
      );

    const currentStage: MasteryStage = existing?.masteryStage ?? "new";
    const correctStreak = entry.correct ? (existing?.correctStreak ?? 0) + 1 : 0;
    const stage = nextMasteryStage(currentStage, entry.correct, correctStreak);

    const nextDueAt = !entry.correct
      ? now
      : new Date(
          now.getTime() +
            (stage === "mastered" ? MASTERED_INTERVAL_MS : LEARNING_INTERVAL_MS),
        );

    const values = {
      masteryStage: stage,
      lastSeenAt: now,
      nextDueAt,
      correctStreak,
      timesSeen: (existing?.timesSeen ?? 0) + 1,
      timesCorrect: (existing?.timesCorrect ?? 0) + (entry.correct ? 1 : 0),
    };

    await tx
      .insert(userWordProgress)
      .values({ userId: user.id, wordId: entry.wordId, ...values })
      .onConflictDoUpdate({
        target: [userWordProgress.userId, userWordProgress.wordId],
        set: values,
      });
  });
}
