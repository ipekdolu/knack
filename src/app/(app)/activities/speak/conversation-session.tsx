"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getUserLevel } from "@/lib/practice/actions";
import {
  startConversation,
  sendConversationTurn,
  gradeConversation,
  logConversationResult,
  type FeedbackTiming,
  type TaskType,
  type ConversationMessage,
  type ConversationReport,
} from "@/lib/practice/conversation";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";

type Phase =
  | "loading"
  | "setup"
  | "starting"
  | "chat"
  | "sending"
  | "grading"
  | "report"
  | "error";

const CRITERION_LABELS: Record<keyof ConversationReport["criteria"], string> = {
  fluency: "Fluency",
  accuracy: "Accuracy",
  spontaneity: "Spontaneity",
  interaction: "Interaction",
  vocabularyRange: "Vocabulary range",
  taskCompletion: "Task completion",
};

export default function ConversationSession() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [level, setLevel] = useState<string | null>(null);
  const [feedbackTiming, setFeedbackTiming] = useState<FeedbackTiming>("report");
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [maxTurns, setMaxTurns] = useState(6);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [nudges, setNudges] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const [report, setReport] = useState<ConversationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeechRecognition();
  const sessionId = useRef(0);

  useEffect(() => {
    const mySession = ++sessionId.current;
    getUserLevel()
      .then((lvl) => {
        if (mySession !== sessionId.current) return;
        if (!lvl) {
          setError(
            "No level set yet -- add a word or pick a level in Settings first.",
          );
          setPhase("error");
        } else {
          setLevel(lvl);
          setPhase("setup");
        }
      })
      .catch((err) => {
        if (mySession !== sessionId.current) return;
        setError(err instanceof Error ? err.message : "Failed to load your level");
        setPhase("error");
      });
  }, []);

  async function handleStart(timing: FeedbackTiming) {
    if (!level) return;
    setFeedbackTiming(timing);
    setPhase("starting");
    setError(null);
    try {
      const result = await startConversation(level, timing);
      setTaskType(result.taskType);
      setTaskDescription(result.taskDescription);
      setMaxTurns(result.maxTurns);
      setMessages([{ role: "assistant", content: result.openingMessage }]);
      setNudges({});
      setDone(false);
      setReport(null);
      speech.reset();
      setPhase("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start conversation");
      setPhase("error");
    }
  }

  async function handleSend() {
    const userMessage = speech.transcript.trim();
    if (!userMessage || !level || !taskType) return;
    setPhase("sending");
    setError(null);
    try {
      const result = await sendConversationTurn({
        level,
        taskType,
        feedbackTiming,
        history: messages,
        userMessage,
      });
      const userIndex = messages.filter((m) => m.role === "user").length;
      if (result.nudge) {
        setNudges((n) => ({ ...n, [userIndex]: result.nudge! }));
      }
      setMessages((m) => [
        ...m,
        { role: "user", content: userMessage },
        { role: "assistant", content: result.reply },
      ]);
      setDone(result.done);
      speech.reset();
      setPhase("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send your reply");
      setPhase("error");
    }
  }

  async function handleGetReport() {
    if (!level || !taskType) return;
    setPhase("grading");
    setError(null);
    try {
      const result = await gradeConversation({ level, taskType, history: messages });
      setReport(result);
      await logConversationResult({ taskType, history: messages, report: result });
      setPhase("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade the conversation");
      setPhase("error");
    }
  }

  function handleRestart() {
    setPhase("setup");
    setMessages([]);
    setReport(null);
    setDone(false);
    setNudges({});
    speech.reset();
  }

  let userTurnCounter = -1;

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/activities" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Speaking</h1>

        {!speech.supported && phase !== "loading" && phase !== "setup" && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This browser doesn&apos;t support speech recognition. Chrome or Edge
            work best -- in other browsers you can still type your replies.
          </p>
        )}

        {phase === "loading" && (
          <p className="mt-4 text-gray-500">Loading...</p>
        )}

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
            <Link
              href="/settings"
              className="w-fit rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
            >
              Change level
            </Link>
          </div>
        )}

        {phase === "setup" && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              A free-flowing conversation in German, {maxTurns} exchanges, no
              target words -- just talk. Level {level}.
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                How do you want feedback this session?
              </p>
              <button
                onClick={() => handleStart("nudges")}
                className="rounded-md border border-gray-300 px-4 py-3 text-left hover:bg-gray-100"
              >
                <p className="font-medium">Gentle nudges</p>
                <p className="text-sm text-gray-500">
                  Short tips after each reply, without breaking the flow.
                </p>
              </button>
              <button
                onClick={() => handleStart("report")}
                className="rounded-md border border-gray-300 px-4 py-3 text-left hover:bg-gray-100"
              >
                <p className="font-medium">End-of-session report</p>
                <p className="text-sm text-gray-500">
                  No interruptions -- a full report once the conversation ends.
                </p>
              </button>
            </div>
          </div>
        )}

        {phase === "starting" && (
          <p className="mt-4 text-gray-500">Starting the conversation...</p>
        )}

        {(phase === "chat" || phase === "sending" || phase === "grading") &&
          taskType && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-xs text-gray-500">{taskDescription}</p>

              <div className="flex flex-col gap-3">
                {messages.map((m, i) => {
                  if (m.role === "assistant") {
                    return (
                      <div
                        key={i}
                        className="max-w-[85%] self-start rounded-lg bg-gray-100 px-3 py-2 text-sm"
                      >
                        {m.content}
                      </div>
                    );
                  }
                  userTurnCounter++;
                  const myTurnIndex = userTurnCounter;
                  const nudge = nudges[myTurnIndex];
                  return (
                    <div key={i} className="flex flex-col items-end gap-1">
                      <div className="max-w-[85%] self-end rounded-lg bg-black px-3 py-2 text-sm text-white">
                        {m.content}
                      </div>
                      {nudge && (
                        <p className="max-w-[85%] text-right text-xs text-amber-700">
                          {nudge}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {speech.error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {speech.error}
                </p>
              )}

              {!done && (
                <>
                  <textarea
                    value={
                      speech.interim
                        ? `${speech.transcript} ${speech.interim}`.trim()
                        : speech.transcript
                    }
                    onChange={(e) => speech.setTranscript(e.target.value)}
                    placeholder={
                      speech.supported
                        ? "Press the mic and reply in German..."
                        : "Type your reply in German..."
                    }
                    rows={3}
                    disabled={phase === "sending"}
                    className="rounded-md border border-gray-300 px-3 py-2 disabled:opacity-60"
                  />
                  <div className="flex gap-2">
                    {speech.supported && (
                      <button
                        onClick={speech.listening ? speech.stop : speech.start}
                        disabled={phase === "sending"}
                        className={`flex-1 rounded-md px-4 py-2 disabled:opacity-50 ${
                          speech.listening
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "border border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {speech.listening ? "Stop" : "Start speaking"}
                      </button>
                    )}
                    <button
                      onClick={handleSend}
                      disabled={
                        !speech.transcript.trim() ||
                        speech.listening ||
                        phase === "sending"
                      }
                      className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {phase === "sending" ? "Sending..." : "Reply"}
                    </button>
                  </div>
                </>
              )}

              {done && (
                <button
                  onClick={handleGetReport}
                  disabled={phase === "grading"}
                  className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {phase === "grading" ? "Scoring..." : "Get feedback report"}
                </button>
              )}
            </div>
          )}

        {phase === "report" && report && (
          <div className="mt-4 flex flex-col gap-4 text-left text-sm">
            <p className="text-gray-700">{report.feedback}</p>

            <div className="flex flex-col gap-2">
              {(
                Object.keys(report.criteria) as (keyof ConversationReport["criteria"])[]
              ).map((key) => {
                const c = report.criteria[key];
                return (
                  <div key={key} className="rounded-md border border-gray-200 p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{CRITERION_LABELS[key]}</span>
                      <span className="text-gray-500">
                        {c.score} / {c.maxScore}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-500">{c.note}</p>
                  </div>
                );
              })}
            </div>

            {report.examples.length > 0 && (
              <div>
                <p className="font-medium">Examples</p>
                <div className="mt-1 flex flex-col gap-2">
                  {report.examples.map((ex, i) => (
                    <div key={i} className="rounded-md bg-gray-50 p-2">
                      <p className="text-red-700 line-through">{ex.original}</p>
                      <p className="text-green-700">{ex.corrected}</p>
                      <p className="mt-1 text-xs text-gray-500">{ex.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Link
                href="/home"
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-center hover:bg-gray-100"
              >
                Home
              </Link>
              <button
                onClick={handleRestart}
                className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                New conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
