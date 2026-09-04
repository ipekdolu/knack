"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { words } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
const POS_VALUES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "numeral",
  "interjection",
  "particle",
] as const;
const GENDERS = ["der", "die", "das"] as const;

export type WordSuggestion = {
  lemma: string;
  level: (typeof LEVELS)[number];
  pos: (typeof POS_VALUES)[number];
  gender: (typeof GENDERS)[number] | null;
};

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
    model: "claude-opus-5",
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

export async function saveWord(word: WordSuggestion): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const lemma = word.lemma.trim();
  if (!lemma) throw new Error("Word cannot be empty");

  await db.insert(words).values({
    lemma,
    level: word.level,
    pos: word.pos,
    gender: word.gender ?? undefined,
    source: "manual",
    userId: user.id,
  });
}
