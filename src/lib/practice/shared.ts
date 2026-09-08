import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userWordProgress, levelEnum, masteryStageEnum } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type Level = (typeof levelEnum.enumValues)[number];
export type MasteryStage = (typeof masteryStageEnum.enumValues)[number];

export const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"];

const DAY_MS_FOR_STREAK = 24 * 60 * 60 * 1000;

export function computeStreak(practiceDays: Set<string>): number {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  let cursor = new Date();
  cursor = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()),
  );

  // Don't break the streak just because today hasn't happened yet -- start
  // counting from yesterday if today has no exercises logged.
  if (!practiceDays.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS_FOR_STREAK);
  }

  let streak = 0;
  while (practiceDays.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS_FOR_STREAK);
  }
  return streak;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MASTERED_INTERVAL_MS = 7 * DAY_MS;
const LEARNING_INTERVAL_MS = 1 * DAY_MS;

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function nextMasteryStage(
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Applies one word's exercise result to its mastery-stage/spaced-repetition
// state: streak-based stage transitions (new -> learning on first correct,
// learning -> mastered at a streak of 3, any miss demotes one stage and
// resets the streak), with next_due_at following fixed intervals per stage.
// Shared by every exercise type (flashcard, fill-blank, sentence, ...) so
// they all feed the same progress model.
export async function applyProgressUpdate(
  tx: Tx,
  userId: string,
  wordId: string,
  correct: boolean,
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(userWordProgress)
    .where(and(eq(userWordProgress.userId, userId), eq(userWordProgress.wordId, wordId)));

  const currentStage: MasteryStage = existing?.masteryStage ?? "new";
  const correctStreak = correct ? (existing?.correctStreak ?? 0) + 1 : 0;
  const stage = nextMasteryStage(currentStage, correct, correctStreak);

  const now = new Date();
  const nextDueAt = !correct
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
    timesCorrect: (existing?.timesCorrect ?? 0) + (correct ? 1 : 0),
  };

  await tx
    .insert(userWordProgress)
    .values({ userId, wordId, ...values })
    .onConflictDoUpdate({
      target: [userWordProgress.userId, userWordProgress.wordId],
      set: values,
    });
}
