"use client";

import { useEffect, useState } from "react";
import { startSession, getWordGlosses, type SessionWord } from "@/lib/practice/actions";
import { chunkWords } from "@/lib/practice/chunk";
import {
  gradeSentence,
  getSentenceHint,
  logSentenceResult,
  type SentenceGrade,
} from "@/lib/practice/grading";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, ButtonLink } from "@/components/ui/button";
import { ExerciseTopBar } from "@/components/ui/exercise-top-bar";
import { MascotPlaceholder } from "@/components/ui/mascot-placeholder";

type Phase = "loading" | "prompt" | "grading" | "result" | "complete" | "error";

export default function WritingSession() {
  const [groups, setGroups] = useState<SessionWord[][]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [sentence, setSentence] = useState("");
  const [grade, setGrade] = useState<SentenceGrade | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [glosses, setGlosses] = useState<Record<string, string>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  function begin() {
    setPhase("loading");
    startSession("sentence", 9)
      .then(({ words: sessionWords, level }) => {
        setGroups(chunkWords(sessionWords));
        setIndex(0);
        setSentence("");
        setGrade(null);
        setHint(null);
        setScore({ correct: 0, total: 0 });
        if (!level) {
          setError(
            "No words available yet -- add a word or wait for the word bank to load.",
          );
          setPhase("error");
        } else if (sessionWords.length === 0) {
          setError(
            `No ${level} words available yet. Pick a different level in Settings.`,
          );
          setPhase("error");
        } else {
          setPhase("prompt");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to start session");
        setPhase("error");
      });
  }

  useEffect(() => {
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = groups[index];

  // Meanings for the hover tooltip on each target word -- fetched per
  // group, since a stuck learner may not know one of the words at all.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    getWordGlosses(current).then((g) => {
      if (!cancelled) setGlosses((prev) => ({ ...prev, ...g }));
    });
    return () => {
      cancelled = true;
    };
  }, [current]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !sentence.trim()) return;
    setPhase("grading");
    setError(null);
    try {
      const result = await gradeSentence(current, sentence.trim());
      setGrade(result);
      setScore((s) => ({
        correct: s.correct + (result.allCorrect ? 1 : 0),
        total: s.total + 1,
      }));
      setPhase("result");
      await logSentenceResult({ grade: result, userResponse: sentence.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade sentence");
      setPhase("error");
    }
  }

  async function handleHint() {
    if (!current || hintLoading) return;
    setHintLoading(true);
    try {
      setHint(await getSentenceHint(current));
    } catch {
      // A failed hint isn't worth interrupting the exercise over.
    } finally {
      setHintLoading(false);
    }
  }

  function advance() {
    setHint(null);
    if (index + 1 >= groups.length) {
      setPhase("complete");
    } else {
      setIndex(index + 1);
      setSentence("");
      setGrade(null);
      setPhase("prompt");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-md">
        <ExerciseTopBar
          backHref="/activities"
          typeLabel="Sentence practice"
          status={groups.length > 0 ? `${Math.min(index + 1, groups.length)} / ${groups.length}` : undefined}
        />

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
              {error}
            </p>
            <div className="flex gap-2">
              {groups.length > 0 && index < groups.length && (
                <Button variant="secondary" onClick={advance}>
                  Skip
                </Button>
              )}
              <ButtonLink href="/settings" variant="secondary">
                Change level
              </ButtonLink>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <p className="mt-4 font-medium text-primary-ink/70">Loading session...</p>
        )}

        {current && (phase === "prompt" || phase === "grading" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <Card className="flex flex-col justify-center gap-3">
              <p className="text-sm font-medium text-text-muted">
                Write one German sentence using all of these words:{" "}
                <span className="font-normal">(hover a word for its meaning)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {current.map((w) => {
                  const wordGrade = grade?.wordResults.find(
                    (r) => r.wordId === w.wordId,
                  );
                  const tone =
                    phase === "result" && wordGrade
                      ? wordGrade.usedCorrectly
                        ? "success"
                        : "error"
                      : "neutral";
                  return (
                    <Pill key={w.wordId} tone={tone} title={glosses[w.wordId]}>
                      {w.gender ? `${w.gender} ` : ""}
                      {w.lemma}
                    </Pill>
                  );
                })}
              </div>

              {phase === "result" && grade && (
                <div className="mt-2 flex flex-col gap-2 text-left text-sm">
                  <p className="text-text">{grade.feedback}</p>
                  {grade.grammarIssues.length > 0 && (
                    <ul className="list-inside list-disc text-text-muted">
                      {grade.grammarIssues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {grade.correctedSentence.trim().toLowerCase() !==
                    sentence.trim().toLowerCase() && (
                    <p className="italic text-text-muted">
                      Suggested: {grade.correctedSentence}
                    </p>
                  )}
                  {!grade.levelAppropriate && grade.levelNote && (
                    <p className="font-medium text-accent-ink">{grade.levelNote}</p>
                  )}
                </div>
              )}
            </Card>

            {(phase === "prompt" || phase === "grading") && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  disabled={phase === "grading"}
                  placeholder="Schreib einen Satz..."
                  rows={3}
                  className="rounded-btn border-[2.5px] border-text px-4 py-3 font-medium shadow-hard-sm disabled:opacity-50 focus:outline-none"
                  autoFocus
                />

                {hint && (
                  <p className="rounded-btn border-2 border-accent bg-accent/10 px-3 py-2 text-sm font-medium text-accent-ink">
                    💡 {hint}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHint}
                    disabled={hintLoading || phase === "grading"}
                    aria-label="Get a hint"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn border-2 border-text bg-surface text-lg shadow-hard-sm transition active:scale-95 disabled:opacity-50 hover:border-accent"
                  >
                    {hintLoading ? "…" : "💡"}
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={advance}
                    disabled={phase === "grading"}
                  >
                    Skip
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={phase === "grading" || !sentence.trim()}
                  >
                    {phase === "grading" ? "Grading..." : "Submit"}
                  </Button>
                </div>
              </form>
            )}

            {phase === "result" && <Button onClick={advance}>Next</Button>}
          </div>
        )}

        {phase === "complete" && (
          <div className="mt-4 flex flex-col items-center gap-4 text-center">
            <MascotPlaceholder alt="Potato mascot celebrating" size={72} />
            <p className="font-heading text-lg font-extrabold">
              Session complete: {score.correct} / {score.total} sentences fully correct
            </p>
            <div className="flex gap-2">
              <ButtonLink href="/home" variant="secondary" className="flex-1">
                Home
              </ButtonLink>
              <Button className="flex-1" onClick={begin}>
                Practice again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
