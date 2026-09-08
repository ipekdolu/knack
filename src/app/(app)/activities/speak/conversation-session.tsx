"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserLevel } from "@/lib/practice/actions";
import { getSpeakingTurns } from "@/app/(app)/settings/actions";
import {
  startConversation,
  sendConversationTurn,
  gradeConversation,
  getConversationHint,
  logConversationResult,
  type FeedbackTiming,
  type ConversationMode,
  type TaskType,
  type ConversationMessage,
  type ConversationReport,
} from "@/lib/practice/conversation";
import { DEFAULT_TURNS } from "@/lib/practice/conversation-constants";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { useSpeechSynthesis } from "@/lib/speech/use-speech-synthesis";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { ExerciseTopBar } from "@/components/ui/exercise-top-bar";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

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
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [level, setLevel] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversationMode>("casual");
  const [feedbackTiming, setFeedbackTiming] = useState<FeedbackTiming>("report");
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [maxTurns, setMaxTurns] = useState(DEFAULT_TURNS);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [nudges, setNudges] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const [report, setReport] = useState<ConversationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  const speech = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const [muted, setMuted] = useState(false);
  const sessionId = useRef(0);

  useEffect(() => {
    const mySession = ++sessionId.current;
    Promise.all([getUserLevel(), getSpeakingTurns()])
      .then(([lvl, turns]) => {
        if (mySession !== sessionId.current) return;
        if (turns) setMaxTurns(turns);
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

  // Speaks each new assistant turn as it arrives -- this is a listening
  // exercise as much as a speaking one, closer to a real oral exam where
  // you hear the examiner rather than read them. The text bubble still
  // stays visible alongside it.
  useEffect(() => {
    if (muted) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant") {
      tts.speak(last.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, muted]);

  async function handleStart() {
    if (!level) return;
    setPhase("starting");
    setError(null);
    try {
      const result = await startConversation(level, feedbackTiming, mode, maxTurns);
      setTaskType(result.taskType);
      setTaskDescription(result.taskDescription);
      setTopic(result.topic);
      setMaxTurns(result.maxTurns);
      setMessages([{ role: "assistant", content: result.openingMessage }]);
      setNudges({});
      setDone(false);
      setReport(null);
      setHint(null);
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
    setHint(null);
    try {
      const result = await sendConversationTurn({
        level,
        taskType,
        topic,
        feedbackTiming,
        history: messages,
        userMessage,
        maxTurns,
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

  async function handleHint() {
    if (!level || !taskType || hintLoading) return;
    setHintLoading(true);
    try {
      setHint(await getConversationHint({ level, taskType, topic, history: messages }));
    } catch {
      // A failed hint isn't worth interrupting the conversation over.
    } finally {
      setHintLoading(false);
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

  // "End session" shouldn't just throw the conversation away -- if the
  // learner said anything, grade what's there instead of losing it.
  function handleEndSession() {
    if (messages.some((m) => m.role === "user")) {
      handleGetReport();
    } else {
      router.push("/activities");
    }
  }

  function handleRestart() {
    setPhase("setup");
    setMessages([]);
    setReport(null);
    setDone(false);
    setNudges({});
    setHint(null);
    speech.reset();
  }

  // Display-only turn count, derived from how many user replies are already
  // in the transcript -- independent of the render-time counter below.
  const displayTurn = Math.min(
    messages.filter((m) => m.role === "user").length + 1,
    maxTurns,
  );
  let userTurnCounter = -1;

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-md">
        <ExerciseTopBar
          backHref="/activities"
          typeLabel="Sprechen"
          level={level}
          status={
            phase === "chat" || phase === "sending" || phase === "grading"
              ? `Turn ${displayTurn} / ${maxTurns}`
              : undefined
          }
        />
        {tts.supported && (phase === "chat" || phase === "sending" || phase === "grading") && (
          <button
            onClick={() => {
              if (!muted) tts.stop();
              setMuted((m) => !m);
            }}
            className="mt-1 text-sm font-bold text-primary-ink/70 hover:text-primary-ink"
          >
            {muted ? "🔇 Unmute" : "🔊 Mute"}
          </button>
        )}

        {!speech.supported && phase !== "loading" && phase !== "setup" && (
          <p className="mt-4 rounded-btn border-2 border-accent bg-accent/10 px-3 py-2 text-sm font-medium text-accent-ink">
            This browser doesn&apos;t support speech recognition. Try Chrome or
            Edge instead.
          </p>
        )}

        {phase === "loading" && (
          <p className="mt-4 font-medium text-primary-ink/70">Loading...</p>
        )}

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
              {error}
            </p>
            <ButtonLink href="/settings" variant="secondary" className="w-fit">
              Change level
            </ButtonLink>
          </div>
        )}

        {phase === "setup" && (
          <div className="mt-4 flex flex-col gap-5">
            <p className="text-sm font-medium text-primary-ink/70">
              {maxTurns} exchanges, no target words -- just talk. Level {level}.
            </p>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">Format</p>
              <SegmentedToggle
                options={
                  [
                    { value: "casual", label: "Casual chat" },
                    { value: "exam", label: "Exam format" },
                  ] as const
                }
                value={mode}
                onChange={setMode}
              />
              <p className="text-xs text-text-muted">
                {mode === "casual"
                  ? "A relaxed chat about an everyday topic -- no exam structure."
                  : "A level-appropriate exam-style task (Goethe oral-exam format)."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">Feedback</p>
              <SegmentedToggle
                options={
                  [
                    { value: "nudges", label: "Gentle nudges" },
                    { value: "report", label: "End-of-session report" },
                  ] as const
                }
                value={feedbackTiming}
                onChange={setFeedbackTiming}
              />
              <p className="text-xs text-text-muted">
                {feedbackTiming === "nudges"
                  ? "Short tips after each reply, without breaking the flow."
                  : "No interruptions -- a full report once the conversation ends."}
              </p>
            </div>

            <Button onClick={handleStart}>Start conversation</Button>
          </div>
        )}

        {phase === "starting" && (
          <p className="mt-4 font-medium text-primary-ink/70">
            Starting the conversation...
          </p>
        )}

        {(phase === "chat" || phase === "sending" || phase === "grading") &&
          taskType && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-xs font-medium text-primary-ink/70">
                {taskDescription}
              </p>

              <div className="flex flex-col gap-3">
                {messages.map((m, i) => {
                  if (m.role === "assistant") {
                    return (
                      <Card
                        key={i}
                        shadow="shadow-hard-sm"
                        padding="p-3"
                        className="flex max-w-[85%] items-start gap-2 self-start text-sm"
                      >
                        <span>{m.content}</span>
                        {tts.supported && (
                          <button
                            onClick={() => tts.speak(m.content)}
                            aria-label="Play aloud"
                            className="shrink-0 text-text/30 hover:text-text"
                          >
                            🔊
                          </button>
                        )}
                      </Card>
                    );
                  }
                  userTurnCounter++;
                  const myTurnIndex = userTurnCounter;
                  const nudge = nudges[myTurnIndex];
                  return (
                    <div key={i} className="flex flex-col items-end gap-1">
                      <div className="max-w-[85%] self-end rounded-btn border-[2.5px] border-text bg-text px-3 py-2 text-sm text-primary shadow-hard-sm">
                        <span className="mb-0.5 block text-xs font-bold text-primary/70">
                          You said
                        </span>
                        {m.content}
                      </div>
                      {nudge && (
                        <p className="max-w-[85%] text-right text-xs font-medium text-accent-ink">
                          {nudge}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {speech.error && (
                <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
                  {speech.error}
                </p>
              )}

              {hint && (
                <p className="rounded-btn border-2 border-accent bg-accent/10 px-3 py-2 text-sm font-medium text-accent-ink">
                  💡 {hint}
                </p>
              )}

              {!done && (
                <>
                  <div className="flex flex-col items-center gap-2 py-1">
                    <button
                      onClick={() => {
                        if (speech.listening) {
                          speech.stop();
                        } else {
                          tts.stop();
                          speech.start();
                        }
                      }}
                      disabled={phase === "sending" || !speech.supported}
                      aria-label={speech.listening ? "Stop recording" : "Tap to speak"}
                      className={`flex h-20 w-20 items-center justify-center rounded-full border-[2.5px] border-text text-3xl shadow-hard transition active:scale-95 disabled:opacity-50 ${
                        speech.listening ? "bg-error" : "bg-accent"
                      }`}
                    >
                      🎙️
                    </button>
                    <p className="text-xs font-bold text-primary-ink/70">
                      {speech.listening
                        ? "Listening... tap to stop"
                        : speech.transcript
                          ? "Tap to speak again"
                          : "Tap to speak"}
                    </p>
                  </div>

                  {(speech.transcript || speech.interim) && (
                    <Card shadow="shadow-hard-sm" padding="p-3" className="text-sm">
                      {speech.interim
                        ? `${speech.transcript} ${speech.interim}`.trim()
                        : speech.transcript}
                    </Card>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleHint}
                      disabled={hintLoading || phase === "sending"}
                      aria-label="Get a hint"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn border-2 border-text bg-surface text-lg shadow-hard-sm transition active:scale-95 disabled:opacity-50 hover:border-accent"
                    >
                      {hintLoading ? "…" : "💡"}
                    </button>
                    <Button variant="secondary" onClick={handleEndSession}>
                      End session
                    </Button>
                    <Button
                      onClick={handleSend}
                      disabled={
                        !speech.transcript.trim() ||
                        speech.listening ||
                        phase === "sending"
                      }
                      className="flex-1"
                    >
                      {phase === "sending" ? "Sending..." : "Send reply →"}
                    </Button>
                  </div>
                </>
              )}

              {done && (
                <Button onClick={handleGetReport} disabled={phase === "grading"}>
                  {phase === "grading" ? "Scoring..." : "Get feedback report"}
                </Button>
              )}
            </div>
          )}

        {phase === "report" && report && (
          <div className="mt-4 flex flex-col gap-4 text-left text-sm">
            <p className="text-text">{report.feedback}</p>

            <div className="flex flex-col gap-2">
              {(
                Object.keys(report.criteria) as (keyof ConversationReport["criteria"])[]
              ).map((key) => {
                const c = report.criteria[key];
                return (
                  <Card key={key} shadow="shadow-hard-sm" padding="p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{CRITERION_LABELS[key]}</span>
                      <span className="text-text-muted">
                        {c.score} / {c.maxScore}
                      </span>
                    </div>
                    <p className="mt-1 text-text-muted">{c.note}</p>
                  </Card>
                );
              })}
            </div>

            {report.examples.length > 0 && (
              <div>
                <p className="font-bold">Examples</p>
                <div className="mt-1 flex flex-col gap-2">
                  {report.examples.map((ex, i) => (
                    <Card key={i} shadow="shadow-hard-sm" padding="p-3">
                      <p className="text-error line-through">{ex.original}</p>
                      <p className="text-success">{ex.corrected}</p>
                      <p className="mt-1 text-xs text-text-muted">{ex.note}</p>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <ButtonLink href="/home" variant="secondary" className="flex-1">
                Home
              </ButtonLink>
              <Button className="flex-1" onClick={handleRestart}>
                New conversation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
