"use server";

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyMissions, userPoints, streakRepairs, exerciseLog } from "@/db/schema";
import { requireUser } from "@/lib/practice/shared";

type MissionCatalogEntry = {
  type: string;
  label: string;
  targetCount: number;
  // Which exercise_log.exercise_type values count toward this mission.
  exerciseTypes: string[];
};

// Flat 10 points per mission, 2 missions a day -- deliberately small and
// uniform so this stays a light touch rather than a system to optimize.
// At 20 points/day it takes 2-3 days to afford a streak repair (50 points),
// which is the point: a genuine catch-up, not a same-day undo.
const MISSION_POINTS = 10;

const MISSION_CATALOG: MissionCatalogEntry[] = [
  {
    type: "review_x10",
    label: "Review 10 flashcards",
    targetCount: 10,
    exerciseTypes: ["flashcard"],
  },
  {
    type: "fill_blank_x5",
    label: "Answer 5 fill-in-the-blank exercises",
    targetCount: 5,
    exerciseTypes: ["fill_blank"],
  },
  {
    type: "sentence_x2",
    label: "Write 2 practice sentences",
    targetCount: 2,
    exerciseTypes: ["sentence"],
  },
  {
    type: "scenario_x1",
    label: "Complete a scenario writing exercise",
    targetCount: 1,
    exerciseTypes: ["scenario"],
  },
  {
    type: "reading_x1",
    label: "Complete a reading exercise",
    targetCount: 1,
    exerciseTypes: ["reading"],
  },
  {
    type: "speaking_x1",
    label: "Complete a speaking exercise",
    targetCount: 1,
    // Phase 12 replaced speaking_read/speaking_prompt with a single
    // conversational exercise type -- old rows under the retired types
    // still exist in exercise_log but nothing logs them anymore.
    exerciseTypes: ["speaking_conversation"],
  },
];

const MISSIONS_PER_DAY = 2;
const STREAK_REPAIR_COST = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function dayKeyOffset(daysAgo: number): string {
  const now = new Date();
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(utcMidnight - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

function pickMissions(): MissionCatalogEntry[] {
  const shuffled = [...MISSION_CATALOG].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, MISSIONS_PER_DAY);
}

export type MissionView = {
  id: string;
  type: string;
  label: string;
  targetCount: number;
  progressCount: number;
  completed: boolean;
  points: number;
};

export type MissionsSummary = {
  missions: MissionView[];
  pointsBalance: number;
  streakRepairAvailable: boolean;
  streakRepairCost: number;
};

export async function getTodayMissions(): Promise<MissionsSummary> {
  const user = await requireUser();
  const date = todayUTC();

  let rows = await db
    .select()
    .from(dailyMissions)
    .where(and(eq(dailyMissions.userId, user.id), eq(dailyMissions.date, date)));

  if (rows.length === 0) {
    const picks = pickMissions();
    await db
      .insert(dailyMissions)
      .values(
        picks.map((p) => ({
          userId: user.id,
          date,
          missionType: p.type,
          targetCount: p.targetCount,
          pointsAwarded: MISSION_POINTS,
        })),
      )
      .onConflictDoNothing();
    rows = await db
      .select()
      .from(dailyMissions)
      .where(and(eq(dailyMissions.userId, user.id), eq(dailyMissions.date, date)));
  }

  // Progress is recomputed live from exercise_log rather than incremented
  // at each logging call site -- avoids touching every exercise type's
  // logging code, and can't double-count or drift out of sync.
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(startOfDay.getTime() + DAY_MS);

  const counts = await db
    .select({
      exerciseType: exerciseLog.exerciseType,
      count: sql<number>`count(*)::int`,
    })
    .from(exerciseLog)
    .where(
      and(
        eq(exerciseLog.userId, user.id),
        gte(exerciseLog.createdAt, startOfDay),
        lt(exerciseLog.createdAt, endOfDay),
      ),
    )
    .groupBy(exerciseLog.exerciseType);
  const countByType = new Map<string, number>(
    counts.map((c) => [c.exerciseType, c.count]),
  );

  const views: MissionView[] = [];
  let pointsEarnedNow = 0;

  for (const row of rows) {
    const catalogEntry = MISSION_CATALOG.find((c) => c.type === row.missionType);
    if (!catalogEntry) continue;

    const progress = Math.min(
      catalogEntry.exerciseTypes.reduce(
        (sum, t) => sum + (countByType.get(t) ?? 0),
        0,
      ),
      row.targetCount,
    );
    const nowCompleted = progress >= row.targetCount;

    if (nowCompleted && !row.completed) {
      pointsEarnedNow += row.pointsAwarded;
    }
    if (progress !== row.progressCount || nowCompleted !== row.completed) {
      await db
        .update(dailyMissions)
        .set({ progressCount: progress, completed: nowCompleted })
        .where(eq(dailyMissions.id, row.id));
    }

    views.push({
      id: row.id,
      type: row.missionType,
      label: catalogEntry.label,
      targetCount: row.targetCount,
      progressCount: progress,
      completed: nowCompleted,
      points: row.pointsAwarded,
    });
  }

  if (pointsEarnedNow > 0) {
    await db
      .insert(userPoints)
      .values({ userId: user.id, balance: pointsEarnedNow })
      .onConflictDoUpdate({
        target: userPoints.userId,
        set: {
          balance: sql`${userPoints.balance} + ${pointsEarnedNow}`,
          updatedAt: new Date(),
        },
      });
  }

  const [pointsRow] = await db
    .select({ balance: userPoints.balance })
    .from(userPoints)
    .where(eq(userPoints.userId, user.id));

  return {
    missions: views,
    pointsBalance: pointsRow?.balance ?? 0,
    streakRepairAvailable: await getStreakRepairEligibility(user.id),
    streakRepairCost: STREAK_REPAIR_COST,
  };
}

async function getActiveDaySet(userId: string): Promise<Set<string>> {
  const practiceDays = await db.execute<{ day: string }>(
    sql`select distinct to_char(${exerciseLog.createdAt} at time zone 'utc', 'YYYY-MM-DD') as day from exercise_log where user_id = ${userId}`,
  );
  const repaired = await db
    .select({ date: streakRepairs.date })
    .from(streakRepairs)
    .where(eq(streakRepairs.userId, userId));

  const days = new Set(practiceDays.map((r) => r.day));
  for (const r of repaired) days.add(r.date);
  return days;
}

// Eligible only for a single-day gap: yesterday missing, the day before
// active. An older or larger gap isn't repairable -- this is a genuine
// catch-up, not a way to buy back an arbitrary streak.
async function getStreakRepairEligibility(userId: string): Promise<boolean> {
  const activeDays = await getActiveDaySet(userId);
  const yesterday = dayKeyOffset(1);
  const dayBefore = dayKeyOffset(2);
  return !activeDays.has(yesterday) && activeDays.has(dayBefore);
}

export async function repairStreak(): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();

  const eligible = await getStreakRepairEligibility(user.id);
  if (!eligible) {
    return {
      success: false,
      message: "Streak repair isn't available right now.",
    };
  }

  const [pointsRow] = await db
    .select({ balance: userPoints.balance })
    .from(userPoints)
    .where(eq(userPoints.userId, user.id));
  const balance = pointsRow?.balance ?? 0;
  if (balance < STREAK_REPAIR_COST) {
    return {
      success: false,
      message: `You need ${STREAK_REPAIR_COST} points to repair your streak (you have ${balance}).`,
    };
  }

  const yesterday = dayKeyOffset(1);
  await db.transaction(async (tx) => {
    await tx
      .insert(streakRepairs)
      .values({ userId: user.id, date: yesterday })
      .onConflictDoNothing();
    await tx
      .update(userPoints)
      .set({
        balance: sql`${userPoints.balance} - ${STREAK_REPAIR_COST}`,
        updatedAt: new Date(),
      })
      .where(eq(userPoints.userId, user.id));
  });

  return { success: true, message: "Streak repaired." };
}
