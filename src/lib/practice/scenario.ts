"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser } from "./shared";
import type { TargetWord } from "./grading";

export type ScenarioPrompt = {
  scenario: string;
};

export type ScenarioGrade = {
  toneAppropriate: boolean;
  toneNote: string;
  structureNote: string;
  grammarIssues: string[];
  feedback: string;
  correctedResponse: string;
  wordsUsedCount: number;
  levelAppropriate: boolean;
  levelNote: string | null;
  meetsGoal: boolean;
};

export async function generateScenarioPrompt(
  words: TargetWord[],
): Promise<ScenarioPrompt> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordList = words
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const levels = [...new Set(words.map((w) => w.level))].join("/");

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You write realistic writing-practice scenarios for German language learners, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write one realistic writing scenario, in English, for a learner at CEFR level ${levels} to respond to in German -- e.g. "Write a short email to your landlord explaining that the heating is broken and asking when it will be fixed." It should be answerable in a paragraph or two. Where it fits naturally, design the scenario so these words could plausibly come up: ${wordList} -- but don't force it or mention that requirement in the scenario text itself. Call the scenario_prompt tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "scenario_prompt",
        description: "Record a writing-practice scenario.",
        input_schema: {
          type: "object",
          properties: {
            scenario: {
              type: "string",
              description:
                "The scenario/instructions shown to the learner, in English.",
            },
          },
          required: ["scenario"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "scenario_prompt" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a scenario");
  }
  const input = toolUse.input as { scenario: string };
  return { scenario: input.scenario };
}

export async function gradeScenario(
  scenario: string,
  suggestedWords: TargetWord[],
  response: string,
): Promise<ScenarioGrade> {
  await requireUser();

  const anthropic = new Anthropic();
  const wordList = suggestedWords
    .map((w) => (w.gender ? `${w.gender} ${w.lemma}` : w.lemma))
    .join(", ");
  const levels = [...new Set(suggestedWords.map((w) => w.level))].join("/");

  const result = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You grade German writing-scenario responses from language learners. Judge tone and structure, not just vocabulary -- be encouraging but precise about real issues.",
    messages: [
      {
        role: "user",
        content: `A learner at approximately CEFR level ${levels} was given this scenario:
"${scenario}"

Their German response: "${response}"

These words were suggested as optional vocabulary they could use if it fit naturally (not required): ${wordList}.

Assess: whether the tone/register fits the scenario (tone_appropriate, tone_note -- one sentence, in English), whether the response is well-structured and actually addresses what the scenario asked (structure_note -- one sentence, in English), any grammar issues (grammar_issues, empty array if none), how many of the suggested words appear used correctly (words_used_count), whether the response sits at a reasonable level for the learner (level_appropriate, level_note in English if not), brief encouraging specific feedback (feedback, 1-2 sentences in English), an improved version of the response in German (corrected_response, unchanged if already good), and an overall judgment of whether this is a solid, appropriate response to the scenario (meets_goal). Call the grade_scenario tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "grade_scenario",
        description: "Record a graded assessment of a learner's scenario response.",
        input_schema: {
          type: "object",
          properties: {
            tone_appropriate: { type: "boolean" },
            tone_note: { type: "string" },
            structure_note: { type: "string" },
            grammar_issues: { type: "array", items: { type: "string" } },
            words_used_count: { type: "integer" },
            feedback: { type: "string" },
            corrected_response: { type: "string" },
            level_appropriate: { type: "boolean" },
            level_note: { type: "string" },
            meets_goal: { type: "boolean" },
          },
          required: [
            "tone_appropriate",
            "tone_note",
            "structure_note",
            "grammar_issues",
            "words_used_count",
            "feedback",
            "corrected_response",
            "level_appropriate",
            "level_note",
            "meets_goal",
          ],
        },
      },
    ],
    tool_choice: { type: "tool", name: "grade_scenario" },
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a grading result");
  }
  const input = toolUse.input as {
    tone_appropriate: boolean;
    tone_note: string;
    structure_note: string;
    grammar_issues: string[];
    words_used_count: number;
    feedback: string;
    corrected_response: string;
    level_appropriate: boolean;
    level_note: string;
    meets_goal: boolean;
  };

  return {
    toneAppropriate: input.tone_appropriate,
    toneNote: input.tone_note,
    structureNote: input.structure_note,
    grammarIssues: input.grammar_issues,
    feedback: input.feedback,
    correctedResponse: input.corrected_response,
    wordsUsedCount: input.words_used_count,
    levelAppropriate: input.level_appropriate,
    levelNote: input.level_note?.trim() ? input.level_note.trim() : null,
    meetsGoal: input.meets_goal,
  };
}

export async function logScenarioResult(entry: {
  wordIds: string[];
  userResponse: string;
  grade: ScenarioGrade;
}): Promise<void> {
  const user = await requireUser();
  const { grade } = entry;

  // Log only -- the suggested words are optional bonus vocabulary here, not
  // the graded objective (tone/structure are), so this doesn't call
  // applyProgressUpdate the way sentence-writing's required words do.
  const feedback = JSON.stringify({
    toneAppropriate: grade.toneAppropriate,
    toneNote: grade.toneNote,
    structureNote: grade.structureNote,
    grammarIssues: grade.grammarIssues,
    correctedResponse: grade.correctedResponse,
    wordsUsedCount: grade.wordsUsedCount,
    levelAppropriate: grade.levelAppropriate,
    levelNote: grade.levelNote,
  });

  await db.insert(exerciseLog).values({
    userId: user.id,
    wordIds: entry.wordIds,
    exerciseType: "scenario",
    userResponse: entry.userResponse,
    score: grade.meetsGoal ? 1 : 0,
    feedback,
  });
}
