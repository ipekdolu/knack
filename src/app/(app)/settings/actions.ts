"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  userSettings,
  levelEnum,
  userWordProgress,
  exerciseLog,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

type Level = (typeof levelEnum.enumValues)[number];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function getPreferredLevel(): Promise<string | null> {
  const user = await requireUser();

  const [row] = await db
    .select({ preferredLevel: userSettings.preferredLevel })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id));

  return row?.preferredLevel ?? null;
}

export async function setPreferredLevel(level: string): Promise<void> {
  const user = await requireUser();
  const now = new Date();

  await db
    .insert(userSettings)
    .values({ userId: user.id, preferredLevel: level as Level, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { preferredLevel: level as Level, updatedAt: now },
    });
}

export async function getCardsPerSession(): Promise<number | null> {
  const user = await requireUser();

  const [row] = await db
    .select({ cardsPerSession: userSettings.cardsPerSession })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id));

  return row?.cardsPerSession ?? null;
}

export async function setCardsPerSession(count: number): Promise<void> {
  const user = await requireUser();
  const now = new Date();

  await db
    .insert(userSettings)
    .values({ userId: user.id, cardsPerSession: count, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { cardsPerSession: count, updatedAt: now },
    });
}

export async function getDisplayName(): Promise<string | null> {
  const user = await requireUser();

  const [row] = await db
    .select({ displayName: userSettings.displayName })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id));

  return row?.displayName ?? null;
}

export async function setDisplayName(name: string): Promise<void> {
  const user = await requireUser();
  const now = new Date();
  const trimmed = name.trim().slice(0, 40);

  await db
    .insert(userSettings)
    .values({
      userId: user.id,
      displayName: trimmed || null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { displayName: trimmed || null, updatedAt: now },
    });
}

export async function getSpeakingTurns(): Promise<number | null> {
  const user = await requireUser();

  const [row] = await db
    .select({ speakingTurns: userSettings.speakingTurns })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id));

  return row?.speakingTurns ?? null;
}

export async function setSpeakingTurns(count: number): Promise<void> {
  const user = await requireUser();
  const now = new Date();

  await db
    .insert(userSettings)
    .values({ userId: user.id, speakingTurns: count, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { speakingTurns: count, updatedAt: now },
    });
}

export async function getAccountEmail(): Promise<string | null> {
  const user = await requireUser();
  return user.email ?? null;
}

// Wipes learning progress and exercise history but leaves the word bank and
// preferences (level, cards/session, name) alone -- a fresh start on
// vocabulary mastery, not a full account reset.
export async function resetProgress(): Promise<void> {
  const user = await requireUser();

  await db.delete(userWordProgress).where(eq(userWordProgress.userId, user.id));
  await db.delete(exerciseLog).where(eq(exerciseLog.userId, user.id));
}
