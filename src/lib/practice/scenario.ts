"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser } from "./shared";
import type { TargetWord } from "./grading";

export type Register = "du" | "Sie";

export type HelperWord = {
  word: string;
  gloss: string;
};

export type ScenarioPrompt = {
  // The full task text, in German, as a real Schreiben task would present
  // it: situation + who you're writing to.
  situation: string;
  recipient: string;
  register: Register;
  leitpunkte: string[];
  // Hidden by default in the UI -- optional vocabulary, not required, and
  // revealing the answer isn't the point of offering it.
  helperWords: HelperWord[];
};

export type LeitpunktCoverage = {
  point: string;
  covered: boolean;
  note: string;
};

export type ScenarioCriterion = {
  score: number;
  maxScore: number;
  note: string;
};

export type ScenarioCorrection = {
  original: string;
  corrected: string;
  explanation: string;
};

export type ScenarioGrade = {
  leitpunkte: LeitpunktCoverage[];
  registerCorrect: boolean;
  registerNote: string | null;
  criteria: {
    // Kommunikative Zielerreichung/Erfüllung -- did the response actually
    // do what the task asked (cover the Leitpunkte, fit the situation)?
    erfuellung: ScenarioCriterion;
    // Kohärenz -- organization, connectors, logical flow.
    kohaerenz: ScenarioCriterion;
    // Wortschatz -- vocabulary range and appropriateness.
    wortschatz: ScenarioCriterion;
    // Korrektheit -- grammatical accuracy.
    korrektheit: ScenarioCriterion;
  };
  totalScore: number;
  passed: boolean;
  feedback: string;
  corrections: ScenarioCorrection[];
};

const POINTS_PER_CRITERION = 25;
const PASS_THRESHOLD = 60;

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
    max_tokens: 1536,
    system:
      "You write German writing-exam tasks (Schreiben) modeled on real Goethe-Institut and telc exam formats, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write one realistic German writing task for a CEFR level ${levels} learner, modeled on a real Goethe/telc Schreiben task (e.g. an email or letter responding to a everyday situation -- a complaint, an invitation, an apology, a request, asking for information, etc).

Requirements:
- "situation": the task text itself, IN GERMAN, describing the situation the learner is responding to (who they are, what happened, what they need to write). Do not list the Leitpunkte inside this text -- they're shown separately.
- "recipient": a short German description of who the letter/email is to (e.g. "Ihre Vermieterin", "dein Freund Max", "die Kundenservice-Abteilung").
- "register": "du" if the recipient is a friend/family/someone the learner would naturally address informally, "Sie" if it's an institution, company, stranger, or formal relationship -- this must be unambiguous so it's testable.
- "leitpunkte": exactly 3-4 content points in German, in the imperative/infinitive style real exams use (e.g. "Beschreiben Sie das Problem", "Fragen Sie nach einer Lösung"), that the learner's response must address. These are the actual grading checklist, so make each one distinct and concretely checkable.
- "helper_words": 5-8 German words or short phrases relevant to the topic (each with a short English gloss) that could help someone write the response, but are NOT required and are not needed to complete any Leitpunkt. Where they fit naturally, prefer drawing from this word list the learner has been studying: ${wordList || "(none provided)"}.

Call the scenario_prompt tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "scenario_prompt",
        description: "Record a German writing-exam task.",
        input_schema: {
          type: "object",
          properties: {
            situation: { type: "string" },
            recipient: { type: "string" },
            register: { type: "string", enum: ["du", "Sie"] },
            leitpunkte: {
              type: "array",
              items: { type: "string" },
              description: "3-4 content points in German.",
            },
            helper_words: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  word: { type: "string" },
                  gloss: { type: "string" },
                },
                required: ["word", "gloss"],
              },
              description: "5-8 optional helper words with English glosses.",
            },
          },
          required: [
            "situation",
            "recipient",
            "register",
            "leitpunkte",
            "helper_words",
          ],
        },
      },
    ],
    tool_choice: { type: "tool", name: "scenario_prompt" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a scenario");
  }
  const input = toolUse.input as {
    situation: string;
    recipient: string;
    register: Register;
    leitpunkte: string[];
    helper_words: { word: string; gloss: string }[];
  };

  return {
    situation: input.situation,
    recipient: input.recipient,
    register: input.register,
    leitpunkte: input.leitpunkte,
    helperWords: input.helper_words,
  };
}

export async function gradeScenario(
  prompt: ScenarioPrompt,
  response: string,
): Promise<ScenarioGrade> {
  await requireUser();

  const anthropic = new Anthropic();

  const result = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "You grade German writing-exam (Schreiben) responses the way a real Goethe/telc examiner does, on the four official criteria. Be precise and fair -- cite specific evidence from the learner's own text for every judgment.",
    messages: [
      {
        role: "user",
        content: `A learner was given this German writing task:

Situation: "${prompt.situation}"
Recipient: ${prompt.recipient} (expected register: ${prompt.register})
Leitpunkte (content points that must be addressed):
${prompt.leitpunkte.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Their response: "${response}"

Grade this exactly as a Goethe/telc examiner would, on these four official criteria, each worth ${POINTS_PER_CRITERION} points (total 100, ${PASS_THRESHOLD} = pass):

1. Kommunikative Erfüllung (erfuellung): did the response address every Leitpunkt and actually fit the situation and recipient? For EACH Leitpunkt listed above, judge separately whether it was covered (covered: true/false) and give a one-sentence note citing what the learner wrote (or didn't). Score this criterion based on how completely and appropriately the Leitpunkte were addressed overall.
2. Kohärenz (kohaerenz): organization, logical flow, appropriate connectors (e.g. deshalb, außerdem, trotzdem), whether it reads as a coherent letter/email rather than disconnected sentences.
3. Wortschatz (wortschatz): range and appropriateness of vocabulary for the level and topic -- variety, not just repetition of the same words.
4. Korrektheit (korrektheit): grammatical accuracy -- word order, case, verb conjugation, agreement. Also judge register here: does the learner consistently use ${prompt.register === "du" ? "du/dich/dein (informal)" : "Sie/Ihnen/Ihr (formal)"} as this situation requires, with no informal/formal mixing? Set register_correct to false and explain in register_note (citing the specific words) if they used the wrong register anywhere, even partially correctly elsewhere.

For each criterion return a score out of ${POINTS_PER_CRITERION} and a one-to-two sentence note citing specific evidence from the response.

Then list 2-5 concrete corrections: each one must quote the learner's own original phrase (exactly as they wrote it, verbatim substring of their response), the corrected German version of that phrase, and a short explanation of why. Prioritize the most instructive errors, not every typo.

Finally, give brief overall feedback (2-3 sentences, in English, encouraging but specific about what would raise the score).

Call the grade_scenario tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "grade_scenario",
        description: "Record an exam-style grading of a German writing response.",
        input_schema: {
          type: "object",
          properties: {
            leitpunkte: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  point: { type: "string" },
                  covered: { type: "boolean" },
                  note: { type: "string" },
                },
                required: ["point", "covered", "note"],
              },
              description:
                "One entry per Leitpunkt given, in the same order, each citing evidence.",
            },
            register_correct: { type: "boolean" },
            register_note: {
              type: "string",
              description: "Empty string if register_correct is true.",
            },
            erfuellung: {
              type: "object",
              properties: {
                score: { type: "integer" },
                note: { type: "string" },
              },
              required: ["score", "note"],
            },
            kohaerenz: {
              type: "object",
              properties: {
                score: { type: "integer" },
                note: { type: "string" },
              },
              required: ["score", "note"],
            },
            wortschatz: {
              type: "object",
              properties: {
                score: { type: "integer" },
                note: { type: "string" },
              },
              required: ["score", "note"],
            },
            korrektheit: {
              type: "object",
              properties: {
                score: { type: "integer" },
                note: { type: "string" },
              },
              required: ["score", "note"],
            },
            corrections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  original: {
                    type: "string",
                    description: "Verbatim substring of the learner's response.",
                  },
                  corrected: { type: "string" },
                  explanation: { type: "string" },
                },
                required: ["original", "corrected", "explanation"],
              },
            },
            feedback: { type: "string" },
          },
          required: [
            "leitpunkte",
            "register_correct",
            "register_note",
            "erfuellung",
            "kohaerenz",
            "wortschatz",
            "korrektheit",
            "corrections",
            "feedback",
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
    leitpunkte: { point: string; covered: boolean; note: string }[];
    register_correct: boolean;
    register_note: string;
    erfuellung: { score: number; note: string };
    kohaerenz: { score: number; note: string };
    wortschatz: { score: number; note: string };
    korrektheit: { score: number; note: string };
    corrections: { original: string; corrected: string; explanation: string }[];
    feedback: string;
  };

  const clampScore = (n: number) => Math.max(0, Math.min(POINTS_PER_CRITERION, n));
  const criteria = {
    erfuellung: {
      score: clampScore(input.erfuellung.score),
      maxScore: POINTS_PER_CRITERION,
      note: input.erfuellung.note,
    },
    kohaerenz: {
      score: clampScore(input.kohaerenz.score),
      maxScore: POINTS_PER_CRITERION,
      note: input.kohaerenz.note,
    },
    wortschatz: {
      score: clampScore(input.wortschatz.score),
      maxScore: POINTS_PER_CRITERION,
      note: input.wortschatz.note,
    },
    korrektheit: {
      score: clampScore(input.korrektheit.score),
      maxScore: POINTS_PER_CRITERION,
      note: input.korrektheit.note,
    },
  };
  const totalScore =
    criteria.erfuellung.score +
    criteria.kohaerenz.score +
    criteria.wortschatz.score +
    criteria.korrektheit.score;

  return {
    leitpunkte: input.leitpunkte,
    registerCorrect: input.register_correct,
    registerNote: input.register_note?.trim() ? input.register_note.trim() : null,
    criteria,
    totalScore,
    passed: totalScore >= PASS_THRESHOLD,
    feedback: input.feedback,
    corrections: input.corrections,
  };
}

export async function logScenarioResult(entry: {
  wordIds: string[];
  userResponse: string;
  grade: ScenarioGrade;
}): Promise<void> {
  const user = await requireUser();
  const { grade } = entry;

  // Log only -- helper words are optional bonus vocabulary here, not the
  // graded objective (the four writing criteria are), so this doesn't call
  // applyProgressUpdate the way sentence-writing's required words do.
  const feedback = JSON.stringify({
    leitpunkte: grade.leitpunkte,
    registerCorrect: grade.registerCorrect,
    registerNote: grade.registerNote,
    criteria: grade.criteria,
    totalScore: grade.totalScore,
    corrections: grade.corrections,
  });

  await db.insert(exerciseLog).values({
    userId: user.id,
    wordIds: entry.wordIds,
    exerciseType: "scenario",
    userResponse: entry.userResponse,
    score: grade.passed ? 1 : 0,
    feedback,
  });
}
