"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/practice/shared";

export type SpeakingPrompt = {
  question: string;
  translation: string;
};

/**
 * Writes a short German question that naturally invites an answer using the
 * given target words -- the spoken counterpart to the writing exercise's
 * "use these words" instruction.
 */
export async function generateSpeakingPrompt(
  words: { lemma: string; level: string; pos: string; gender: string | null }[],
): Promise<SpeakingPrompt> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    system:
      "You write short spoken-practice prompts for a German vocabulary learning app, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write one short, natural German question for a learner at CEFR level ${levels} to answer out loud. A good answer to it should naturally use all of these target words: ${wordList}. Keep the question to one sentence, simple enough to understand at this level, and open enough that the learner has to form a real sentence rather than answer with just "ja" or "nein". Also give a plain English translation of the question. Call the speaking_prompt tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "speaking_prompt",
        description: "Record a spoken-practice question for a learner.",
        input_schema: {
          type: "object",
          properties: {
            question: { type: "string", description: "The German question." },
            translation: {
              type: "string",
              description: "Plain English translation of the question.",
            },
          },
          required: ["question", "translation"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "speaking_prompt" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a speaking prompt");
  }
  const input = toolUse.input as { question: string; translation: string };
  return { question: input.question, translation: input.translation };
}
