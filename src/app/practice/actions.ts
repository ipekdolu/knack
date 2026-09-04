"use server";

import Anthropic from "@anthropic-ai/sdk";
import { or, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  words,
  exerciseLog,
  userWordProgress,
  userSettings,
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
  level: string | null;
  dueToday: number;
  streak: number;
};

export type SessionResult = {
  words: SessionWord[];
  level: string | null;
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

// Resolves which level a user's sessions/stats should use: their explicit
// setting if they've picked one, otherwise the lowest level they have words
// in. Returns null only if they have no words available at any level.
async function getEffectiveLevel(userId: string): Promise<string | null> {
  const [settingsRow] = await db
    .select({ preferredLevel: userSettings.preferredLevel })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  if (settingsRow?.preferredLevel) return settingsRow.preferredLevel;

  const rows = await db
    .selectDistinct({ level: words.level })
    .from(words)
    .where(or(eq(words.source, "seed"), eq(words.userId, userId)));

  if (rows.length === 0) return null;
  return rows
    .map((r) => r.level)
    .sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))[0];
}

const DUE_TARGET = 7;
const NEW_TARGET = 3;

const sessionWordCols = {
  id: words.id,
  lemma: words.lemma,
  level: words.level,
  pos: words.pos,
  gender: words.gender,
  masteryStage: userWordProgress.masteryStage,
};

export async function startSession(
  type: ExerciseType,
  count = 10,
): Promise<SessionResult> {
  const user = await requireUser();
  const level = await getEffectiveLevel(user.id);
  if (!level) return { words: [], level: null };

  const scopeWhere = and(
    or(eq(words.source, "seed"), eq(words.userId, user.id)),
    eq(words.level, level as Level),
  );

  // Due: already-seen words whose next_due_at has passed, most overdue first.
  const dueCandidates = await db
    .select(sessionWordCols)
    .from(words)
    .innerJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(and(scopeWhere, sql`${userWordProgress.nextDueAt} <= now()`))
    .orderBy(sql`${userWordProgress.nextDueAt} asc`)
    .limit(count);

  // New: never-seen words (no progress row at all), random order.
  const newCandidates = await db
    .select(sessionWordCols)
    .from(words)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(and(scopeWhere, sql`${userWordProgress.id} is null`))
    .orderBy(sql`random()`)
    .limit(count);

  const pickedIds = new Set<string>();
  const picked: SessionWord[] = [];

  type CandidateRow = {
    id: string;
    lemma: string;
    level: Level;
    pos: string;
    gender: "der" | "die" | "das" | null;
    masteryStage: MasteryStage | null;
  };

  function addFrom(pool: CandidateRow[], max: number) {
    let added = 0;
    for (const row of pool) {
      if (added >= max || picked.length >= count) break;
      if (pickedIds.has(row.id)) continue;
      pickedIds.add(row.id);
      picked.push({
        wordId: row.id,
        lemma: row.lemma,
        level: row.level,
        pos: row.pos,
        gender: row.gender,
        type,
        masteryStage: row.masteryStage ?? "new",
      });
      added++;
    }
  }

  addFrom(dueCandidates, DUE_TARGET);
  addFrom(newCandidates, NEW_TARGET);
  // Backfill: whichever pool has slack, then anything else at this level.
  if (picked.length < count) addFrom(dueCandidates, count);
  if (picked.length < count) addFrom(newCandidates, count);

  if (picked.length < count) {
    const fallback = await db
      .select(sessionWordCols)
      .from(words)
      .leftJoin(
        userWordProgress,
        and(
          eq(userWordProgress.wordId, words.id),
          eq(userWordProgress.userId, user.id),
        ),
      )
      .where(scopeWhere)
      .orderBy(sql`random()`)
      .limit(count * 2);
    addFrom(fallback, count);
  }

  return { words: shuffle(picked), level };
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

  const level = await getEffectiveLevel(user.id);
  let dueToday = 0;
  if (level) {
    const [dueRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userWordProgress)
      .innerJoin(words, eq(words.id, userWordProgress.wordId))
      .where(
        and(
          eq(userWordProgress.userId, user.id),
          eq(words.level, level as Level),
          sql`${userWordProgress.nextDueAt} <= now()`,
        ),
      );
    dueToday = dueRow?.count ?? 0;
  }

  const practiceDays = await db.execute<{ day: string }>(
    sql`select distinct to_char(${exerciseLog.createdAt} at time zone 'utc', 'YYYY-MM-DD') as day from exercise_log where user_id = ${user.id}`,
  );
  const streak = computeStreak(new Set(practiceDays.map((r) => r.day)));

  return {
    totalExercises: agg?.totalExercises ?? 0,
    accuracyPct: agg?.accuracyPct ?? null,
    wordsPracticed,
    mastery: { new: explicitNew + untouched, learning, mastered },
    level,
    dueToday,
    streak,
  };
}

function computeStreak(practiceDays: Set<string>): number {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  let cursor = new Date();
  cursor = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()),
  );

  // Don't break the streak just because today hasn't happened yet -- start
  // counting from yesterday if today has no exercises logged.
  if (!practiceDays.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  let streak = 0;
  while (practiceDays.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
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
