"use client";

import { useEffect, useRef, useState } from "react";
import {
  getSeenWordsWithFlashcardContent,
  generateFlashcard,
  type SessionWord,
  type FlashcardContent,
} from "@/lib/practice/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExerciseTopBar } from "@/components/ui/exercise-top-bar";

type Phase = "idle" | "preparing" | "running" | "done";
type Card = { word: SessionWord; content: FlashcardContent };

const DURATION_S = 60;
const POOL_SIZE = 30;

export default function SpeedReviewSession() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pool, setPool] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [secondsLeft, setSecondsLeft] = useState(DURATION_S);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setError(null);
    setPhase("preparing");
    setPool([]);
    setIndex(0);
    setRevealed(false);
    setScore({ correct: 0, total: 0 });
    try {
      const words = await getSeenWordsWithFlashcardContent(POOL_SIZE);
      if (words.length === 0) {
        setError(
          "No words available yet -- practice a bit first so there's a pool to drill.",
        );
        setPhase("idle");
        return;
      }
      // Every word here already has cached content (see
      // getSeenWordsWithFlashcardContent), so this is a set of fast DB
      // reads, not Claude calls -- the clock never waits on generation.
      const loaded = await Promise.all(
        words.map(async (word) => ({
          word,
          content: await generateFlashcard(word, { allowNewVariant: false }),
        })),
      );
      setPool(loaded);
      setSecondsLeft(DURATION_S);
      setPhase("running");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start speed review",
      );
      setPhase("idle");
    }
  }

  useEffect(() => {
    if (phase !== "running") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("done");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Drill only: score is shown for fun but never touches mastery stage,
  // streaks, or scheduling -- no logExerciseResult call here.
  function grade(knewIt: boolean) {
    setScore((s) => ({
      correct: s.correct + (knewIt ? 1 : 0),
      total: s.total + 1,
    }));
    setRevealed(false);
    setIndex((i) => {
      const next = i + 1;
      if (next >= pool.length) {
        setPhase("done");
        return i;
      }
      return next;
    });
  }

  const current = pool[index];

  return (
    <div className="mx-auto w-full max-w-md">
      <ExerciseTopBar backHref="/vocab" typeLabel="Speed review" />
      <p className="mt-2 text-sm font-medium text-primary-ink/70">
        As many as you can in {DURATION_S} seconds. This is a drill --
        it doesn&apos;t affect your progress tracking.
      </p>

      {error && (
        <p className="mt-4 rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
          {error}
        </p>
      )}

      {phase === "idle" && (
        <Button className="mt-4" onClick={start}>
          Start
        </Button>
      )}

      {phase === "preparing" && (
        <p className="mt-4 font-medium text-primary-ink/70">Preparing cards...</p>
      )}

      {phase === "running" && current && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-primary-ink/70">
              {index + 1} / {pool.length}
            </p>
            <p
              className={`font-heading text-3xl font-extrabold tabular-nums ${
                secondsLeft <= 10 ? "text-error" : "text-text"
              } ${secondsLeft <= 5 ? "animate-pulse" : ""}`}
            >
              {secondsLeft}s
            </p>
          </div>
          <Card className="flex min-h-52 flex-col items-center justify-center text-center">
            <p className="w-full break-words font-heading text-3xl font-extrabold [overflow-wrap:anywhere]">
              {current.word.gender ? `${current.word.gender} ` : ""}
              {current.word.lemma}
            </p>
            {revealed && (
              <div className="mt-4 flex w-full flex-col items-start gap-3 text-left">
                <p className="text-base font-medium italic text-text">
                  {current.content.exampleSentence}
                </p>
                <div className="w-fit max-w-full rounded-btn bg-peach/40 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-peach-ink/70">
                    Meaning
                  </p>
                  <p className="text-sm font-bold text-peach-ink">
                    {current.content.gloss}
                  </p>
                </div>
              </div>
            )}
          </Card>
          {!revealed ? (
            <Button onClick={() => setRevealed(true)}>Show answer</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => grade(false)}>
                Didn&apos;t know it
              </Button>
              <Button className="flex-1" onClick={() => grade(true)}>
                Knew it
              </Button>
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="mt-4 flex flex-col gap-4 text-center">
          <p className="font-heading text-lg font-extrabold">
            {score.correct} / {score.total} correct
          </p>
          <Button onClick={start}>Go again</Button>
        </div>
      )}
    </div>
  );
}
