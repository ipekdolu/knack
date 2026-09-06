"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  startSession,
  generateFlashcard,
  type SessionWord,
  type FlashcardContent,
} from "@/lib/practice/actions";

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
      const { words, level } = await startSession("flashcard", POOL_SIZE);
      if (!level || words.length === 0) {
        setError(
          "No words available yet -- practice a bit first so there's a pool to drill.",
        );
        setPhase("idle");
        return;
      }
      // Load everything up front, with no chance of a fresh generation, so
      // the clock never waits on a Claude call mid-drill.
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
      <Link href="/vocab" className="text-sm text-gray-500 hover:underline">
        &larr; Back
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Speed review</h1>
      <p className="mt-1 text-sm text-gray-500">
        As many as you can in {DURATION_S} seconds. This is a drill --
        it doesn&apos;t affect your progress tracking.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === "idle" && (
        <button
          onClick={start}
          className="mt-4 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Start
        </button>
      )}

      {phase === "preparing" && (
        <p className="mt-4 text-gray-500">Preparing cards...</p>
      )}

      {phase === "running" && current && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {index + 1} / {pool.length}
            </span>
            <span className="font-medium">{secondsLeft}s</span>
          </div>
          <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-gray-300 p-6 text-center">
            <p className="text-2xl font-semibold">
              {current.word.gender ? `${current.word.gender} ` : ""}
              {current.word.lemma}
            </p>
            {revealed && (
              <div className="mt-4 flex flex-col gap-2 text-left">
                <p className="italic text-gray-700">
                  {current.content.exampleSentence}
                </p>
                <p className="text-sm text-gray-500">{current.content.gloss}</p>
              </div>
            )}
          </div>
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
            >
              Show answer
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => grade(false)}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Didn&apos;t know it
              </button>
              <button
                onClick={() => grade(true)}
                className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                Knew it
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="mt-4 flex flex-col gap-4 text-center">
          <p className="text-lg">
            {score.correct} / {score.total} correct
          </p>
          <button
            onClick={start}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
          >
            Go again
          </button>
        </div>
      )}
    </div>
  );
}
