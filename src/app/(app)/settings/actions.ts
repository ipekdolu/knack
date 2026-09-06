"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings, levelEnum } from "@/db/schema";
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
