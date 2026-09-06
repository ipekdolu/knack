"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { exerciseLog } from "@/db/schema";
import { requireUser } from "./shared";

export type TaskType =
  | "self_intro_qa"
  | "describe_narrate_opinion"
  | "discuss_argue"
  | "present_problem_solve";

export type FeedbackTiming = "nudges" | "report";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationStart = {
  taskType: TaskType;
  taskDescription: string;
  openingMessage: string;
  maxTurns: number;
};

export type ConversationTurnResult = {
  reply: string;
  nudge: string | null;
  done: boolean;
};

export type ConversationCriterion = {
  score: number;
  maxScore: 5;
  note: string;
};

export type ConversationExample = {
  original: string;
  corrected: string;
  note: string;
};

export type ConversationReport = {
  criteria: {
    fluency: ConversationCriterion;
    accuracy: ConversationCriterion;
    spontaneity: ConversationCriterion;
    interaction: ConversationCriterion;
    vocabularyRange: ConversationCriterion;
    taskCompletion: ConversationCriterion;
  };
  feedback: string;
  examples: ConversationExample[];
};

const MAX_TURNS = 6;

// Mirrors real Goethe oral-exam task shapes per level, from the spec:
// A1/A2 self-intro + everyday Q&A, B1 describe/narrate + opinion, B2
// discuss/argue (Claude pushes back), C1 present + problem-solve.
function pickTaskType(level: string): TaskType {
  if (level === "A1" || level === "A2") return "self_intro_qa";
  if (level === "B1") return "describe_narrate_opinion";
  if (level === "B2") return "discuss_argue";
  return "present_problem_solve";
}

const TASK_DESCRIPTIONS: Record<TaskType, string> = {
  self_intro_qa:
    "A friendly conversation partner will introduce themself and ask you simple everyday questions -- about you, your day, your routine.",
  describe_narrate_opinion:
    "Your partner will ask you to describe something, tell a short story about something that happened to you, and share a simple opinion.",
  discuss_argue:
    "Your partner will raise a topic to discuss and push back on your view -- be ready to defend your opinion.",
  present_problem_solve:
    "Your partner will ask you to present an idea and work through a problem together with them.",
};

const PERSONA_INSTRUCTIONS: Record<TaskType, string> = {
  self_intro_qa:
    "You are a warm, patient conversation partner meeting the learner for the first time. Introduce yourself briefly, then ask simple, concrete everyday questions one at a time (name, where they're from, hobbies, daily routine, family, likes/dislikes). Use very simple, short German sentences (A1/A2 level): common words, present tense, short clauses. Never switch to English.",
  describe_narrate_opinion:
    "You are a friendly conversation partner. Ask the learner to describe something familiar (a place, a photo, a routine), then to narrate a simple past experience, then to share a short opinion on an everyday topic. Use natural but clear B1-level German -- some past tense (Perfekt), simple connectors (weil, aber, deshalb). Never switch to English.",
  discuss_argue:
    "You are an engaged conversation partner having a real discussion. Raise a everyday-life or mildly opinion-based topic (not politics/religion), listen to the learner's view, and take a genuine counter-position to push them to defend and elaborate their opinion -- respectfully, like a real debate partner, not hostile. Use natural, idiomatic B2-level German. Never switch to English.",
  present_problem_solve:
    "You are a sharp, engaged conversation partner. Ask the learner to present an idea or argument on a substantive topic, probe it with follow-up questions, then pose a real problem for the two of you to reason through together. Use full native-level C1 German with nuance and register-appropriate idiom. Never switch to English.",
};

function buildSystemPrompt(
  taskType: TaskType,
  level: string,
  feedbackTiming: FeedbackTiming,
  turnNumber: number,
): string {
  const wrapUp =
    turnNumber >= MAX_TURNS
      ? " This is the FINAL turn of the conversation -- after this reply, the session ends. Wrap up warmly and naturally (e.g. say goodbye, thank them) rather than asking a new question."
      : ` This is turn ${turnNumber} of ${MAX_TURNS} in a fixed-length conversation, so keep it moving toward a natural close by the final turn.`;

  const nudgeInstruction =
    feedbackTiming === "nudges"
      ? " Additionally, in the separate `nudge` field, give ONE short, gentle, encouraging tip in English about the learner's most recent message ONLY if there's a genuinely useful correction or improvement (a real error, an unnatural phrasing) -- otherwise leave `nudge` empty. Never let the nudge interrupt the German conversation flow in `reply`."
      : " Leave the `nudge` field as an empty string -- feedback for this session is saved for an end-of-session report instead.";

  return `${PERSONA_INSTRUCTIONS[taskType]} The learner is at approximately CEFR level ${level}.${wrapUp}${nudgeInstruction} Always respond with the conversation_turn tool.`;
}

async function callConversationModel(args: {
  taskType: TaskType;
  level: string;
  feedbackTiming: FeedbackTiming;
  turnNumber: number;
  messages: ConversationMessage[];
}): Promise<{ reply: string; nudge: string | null }> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: buildSystemPrompt(
      args.taskType,
      args.level,
      args.feedbackTiming,
      args.turnNumber,
    ),
    messages: args.messages,
    tools: [
      {
        name: "conversation_turn",
        description: "Record the next turn of the spoken-practice conversation.",
        input_schema: {
          type: "object",
          properties: {
            reply: {
              type: "string",
              description: "Your next conversational reply, in German only.",
            },
            nudge: {
              type: "string",
              description:
                "Optional short English tip about the learner's last message. Empty string if none.",
            },
          },
          required: ["reply", "nudge"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "conversation_turn" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a conversation turn");
  }
  const input = toolUse.input as { reply: string; nudge: string };
  return {
    reply: input.reply,
    nudge: input.nudge?.trim() ? input.nudge.trim() : null,
  };
}

export async function startConversation(
  level: string,
  feedbackTiming: FeedbackTiming,
): Promise<ConversationStart> {
  await requireUser();
  const taskType = pickTaskType(level);

  const { reply } = await callConversationModel({
    taskType,
    level,
    feedbackTiming,
    turnNumber: 0,
    messages: [
      {
        role: "user",
        content: "(Begin the conversation now with your opening line.)",
      },
    ],
  });

  return {
    taskType,
    taskDescription: TASK_DESCRIPTIONS[taskType],
    openingMessage: reply,
    maxTurns: MAX_TURNS,
  };
}

export async function sendConversationTurn(args: {
  level: string;
  taskType: TaskType;
  feedbackTiming: FeedbackTiming;
  history: ConversationMessage[];
  userMessage: string;
}): Promise<ConversationTurnResult> {
  await requireUser();

  const messages: ConversationMessage[] = [
    ...args.history,
    { role: "user", content: args.userMessage },
  ];
  const turnNumber = messages.filter((m) => m.role === "user").length;

  const { reply, nudge } = await callConversationModel({
    taskType: args.taskType,
    level: args.level,
    feedbackTiming: args.feedbackTiming,
    turnNumber,
    messages,
  });

  return { reply, nudge, done: turnNumber >= MAX_TURNS };
}

export async function gradeConversation(args: {
  level: string;
  taskType: TaskType;
  history: ConversationMessage[];
}): Promise<ConversationReport> {
  await requireUser();

  const anthropic = new Anthropic();
  const transcript = args.history
    .map((m) => `${m.role === "assistant" ? "Partner" : "Lernende:r"}: ${m.content}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "You assess a learner's spoken German (delivered via speech-to-text) from a conversation transcript, scoring it the way a real Goethe-Institut oral examiner would. Be encouraging but precise, and cite specific evidence from the transcript.",
    messages: [
      {
        role: "user",
        content: `A learner at approximately CEFR level ${args.level} had this conversation (task type: ${args.taskType}). "Lernende:r" is the learner; "Partner" is their conversation partner (an examiner-like role).

Transcript:
${transcript}

Score the learner (not the partner) on these six dimensions, each out of 5, with a one-to-two sentence note citing specific evidence from their turns:
1. fluency: flow and ease of speaking (remember this is a transcript, so judge sentence flow/hesitation markers like "äh", not pronunciation).
2. accuracy: grammatical correctness -- word order, case, conjugation, agreement.
3. spontaneity: how naturally and readily they responded, vs. short/minimal answers.
4. interaction: how well they engaged with what the partner actually said (responding to content, asking follow-ups) rather than giving disconnected answers.
5. vocabulary_range: variety and appropriateness of vocabulary for the level and topic.
6. task_completion: how fully they did what the task type asked (introduced themselves and answered / described and narrated and opined / discussed and defended a position / presented and problem-solved).

Then give 2-5 concrete examples: each must quote a phrase the learner actually said (verbatim substring from their turns), a corrected German version, and a short explanation.

Finally, brief overall feedback (2-3 sentences, in English, encouraging but specific about what to work on next).

Call the grade_conversation tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "grade_conversation",
        description: "Record an oral-exam-style assessment of a conversation.",
        input_schema: {
          type: "object",
          properties: {
            fluency: {
              type: "object",
              properties: { score: { type: "integer" }, note: { type: "string" } },
              required: ["score", "note"],
            },
            accuracy: {
              type: "object",
              properties: { score: { type: "integer" }, note: { type: "string" } },
              required: ["score", "note"],
            },
            spontaneity: {
              type: "object",
              properties: { score: { type: "integer" }, note: { type: "string" } },
              required: ["score", "note"],
            },
            interaction: {
              type: "object",
              properties: { score: { type: "integer" }, note: { type: "string" } },
              required: ["score", "note"],
            },
            vocabulary_range: {
              type: "object",
              properties: { score: { type: "integer" }, note: { type: "string" } },
              required: ["score", "note"],
            },
            task_completion: {
              type: "object",
              properties: { score: { type: "integer" }, note: { type: "string" } },
              required: ["score", "note"],
            },
            examples: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  original: {
                    type: "string",
                    description: "Verbatim substring of the learner's turn.",
                  },
                  corrected: { type: "string" },
                  note: { type: "string" },
                },
                required: ["original", "corrected", "note"],
              },
            },
            feedback: { type: "string" },
          },
          required: [
            "fluency",
            "accuracy",
            "spontaneity",
            "interaction",
            "vocabulary_range",
            "task_completion",
            "examples",
            "feedback",
          ],
        },
      },
    ],
    tool_choice: { type: "tool", name: "grade_conversation" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a grading result");
  }
  const input = toolUse.input as {
    fluency: { score: number; note: string };
    accuracy: { score: number; note: string };
    spontaneity: { score: number; note: string };
    interaction: { score: number; note: string };
    vocabulary_range: { score: number; note: string };
    task_completion: { score: number; note: string };
    examples: { original: string; corrected: string; note: string }[];
    feedback: string;
  };

  const clamp = (n: number) => Math.max(0, Math.min(5, n)) as number;
  const toCriterion = (c: { score: number; note: string }): ConversationCriterion => ({
    score: clamp(c.score),
    maxScore: 5,
    note: c.note,
  });

  return {
    criteria: {
      fluency: toCriterion(input.fluency),
      accuracy: toCriterion(input.accuracy),
      spontaneity: toCriterion(input.spontaneity),
      interaction: toCriterion(input.interaction),
      vocabularyRange: toCriterion(input.vocabulary_range),
      taskCompletion: toCriterion(input.task_completion),
    },
    feedback: input.feedback,
    examples: input.examples,
  };
}

export async function logConversationResult(entry: {
  taskType: TaskType;
  history: ConversationMessage[];
  report: ConversationReport;
}): Promise<void> {
  const user = await requireUser();
  const { report } = entry;

  const scores = Object.values(report.criteria).map((c) => c.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  const feedback = JSON.stringify({
    taskType: entry.taskType,
    criteria: report.criteria,
    examples: report.examples,
    turnCount: entry.history.filter((m) => m.role === "user").length,
  });

  await db.insert(exerciseLog).values({
    userId: user.id,
    wordIds: [],
    exerciseType: "speaking_conversation",
    userResponse: entry.history
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" / "),
    // No pass/fail concept for a rubric-scored conversation -- this just
    // feeds the shared accuracyPct stat, so "meets expectations" (3/5
    // average) maps to the 1 the rest of the app treats as correct.
    score: avg >= 3 ? 1 : 0,
    feedback,
  });
}
