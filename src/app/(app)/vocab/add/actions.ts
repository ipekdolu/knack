"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { words as wordsTable } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import {
  LEVELS,
  POS_VALUES,
  GENDERS,
  MAX_BATCH_WORDS,
  type WordSuggestion,
  type BatchInferenceResult,
} from "./types";

export async function inferWordDetails(
  rawLemma: string,
): Promise<WordSuggestion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const lemma = rawLemma.trim();
  if (!lemma) throw new Error("Word cannot be empty");

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      "You classify German vocabulary words for a CEFR-aligned (A1-C1) vocabulary learning app.",
    messages: [
      {
        role: "user",
        content: `For the German word "${lemma}", determine its canonical dictionary form (correct capitalization/spelling if needed), CEFR level, part of speech, and — if it's a noun — its grammatical gender. Call the suggest_word_details tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "suggest_word_details",
        description:
          "Record the classification for a single German vocabulary word.",
        input_schema: {
          type: "object",
          properties: {
            lemma: {
              type: "string",
              description:
                "Canonical dictionary form, with correct capitalization (German nouns are capitalized).",
            },
            level: { type: "string", enum: LEVELS as unknown as string[] },
            pos: { type: "string", enum: POS_VALUES as unknown as string[] },
            gender: {
              type: "string",
              enum: GENDERS as unknown as string[],
              description: "Only include this field if pos is 'noun'.",
            },
          },
          required: ["lemma", "level", "pos"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "suggest_word_details" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a classification");
  }

  const input = toolUse.input as {
    lemma: string;
    level: string;
    pos: string;
    gender?: string;
  };

  return {
    lemma: input.lemma,
    level: LEVELS.includes(input.level as (typeof LEVELS)[number])
      ? (input.level as (typeof LEVELS)[number])
      : "A1",
    pos: POS_VALUES.includes(input.pos as (typeof POS_VALUES)[number])
      ? (input.pos as (typeof POS_VALUES)[number])
      : "noun",
    gender: GENDERS.includes(input.gender as (typeof GENDERS)[number])
      ? (input.gender as (typeof GENDERS)[number])
      : null,
  };
}

export async function inferWordBatch(
  rawWords: string[],
): Promise<BatchInferenceResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const capped = rawWords
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .slice(0, MAX_BATCH_WORDS);

  return Promise.all(
    capped.map(async (raw) => {
      try {
        const suggestion = await inferWordDetails(raw);
        return { raw, suggestion, error: null };
      } catch (err) {
        return {
          raw,
          suggestion: null,
          error: err instanceof Error ? err.message : "Something went wrong",
        };
      }
    }),
  );
}

export async function saveWords(words: WordSuggestion[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = words
    .map((w) => ({ ...w, lemma: w.lemma.trim() }))
    .filter((w) => w.lemma.length > 0)
    .map((w) => ({
      lemma: w.lemma,
      level: w.level,
      pos: w.pos,
      gender: w.gender ?? undefined,
      source: "manual" as const,
      userId: user.id,
    }));

  if (rows.length === 0) return;
  await db.insert(wordsTable).values(rows);
}
