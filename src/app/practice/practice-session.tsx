"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  startSession,
  generateFlashcard,
  generateFillBlank,
  logExerciseResult,
  type SessionWord,
  type FlashcardContent,
  type FillBlankContent,
} from "./actions";

type Phase = "loading" | "front" | "result" | "complete" | "error";

export default function PracticeSession() {
  const [queue, setQueue] = useState<SessionWord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [flashcard, setFlashcard] = useState<FlashcardContent | null>(null);
  const [fillBlank, setFillBlank] = useState<FillBlankContent | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startSession(10)
      .then((words) => {
        setQueue(words);
        if (words.length === 0) {
          setPhase("complete");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to start session");
        setPhase("error");
      });
  }, []);

  useEffect(() => {
    if (queue.length === 0 || index >= queue.length) return;

    const current = queue[index];
    setPhase("loading");
    setFlashcard(null);
    setFillBlank(null);
    setSelected(null);
    setError(null);

    const load =
      current.type === "flashcard"
        ? generateFlashcard(current).then(setFlashcard)
        : generateFillBlank(current).then(setFillBlank);

    load
      .then(() => setPhase("front"))
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to generate exercise",
        );
        setPhase("error");
      });
  }, [queue, index]);

  const current = queue[index];

  function advance() {
    if (index + 1 >= queue.length) {
      setPhase("complete");
    } else {
      setIndex(index + 1);
    }
  }

  async function handleFlashcardGrade(knewIt: boolean) {
    if (!current) return;
    setScore((s) => ({ correct: s.correct + (knewIt ? 1 : 0), total: s.total + 1 }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "flashcard",
      correct: knewIt,
      userResponse: knewIt ? "knew_it" : "didnt_know",
    });
  }

  async function handleFillBlankSelect(option: string) {
    if (!current || !fillBlank) return;
    const correct = option === fillBlank.correctAnswer;
    setSelected(option);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "fill_blank",
      correct,
      userResponse: option,
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Practice</h1>

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
            {queue.length > 0 && index < queue.length && (
              <button
                onClick={advance}
                className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Skip word
              </button>
            )}
          </div>
        )}

        {phase !== "error" && queue.length === 0 && (
          <p className="mt-4 text-gray-500">Loading session...</p>
        )}

        {phase === "loading" && current && (
          <p className="mt-4 text-gray-500">Generating exercise...</p>
        )}

        {current &&
          current.type === "flashcard" &&
          flashcard &&
          (phase === "front" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {index + 1} / {queue.length} &middot; {current.level}
            </p>
            <div className="rounded-lg border border-gray-300 p-6 text-center">
              <p className="text-2xl font-semibold">
                {current.gender ? `${current.gender} ` : ""}
                {current.lemma}
              </p>
              {phase === "result" && (
                <div className="mt-4 flex flex-col gap-2 text-left">
                  <p className="italic text-gray-700">
                    {flashcard.exampleSentence}
                  </p>
                  <p className="text-sm text-gray-500">{flashcard.gloss}</p>
                </div>
              )}
            </div>

            {phase === "front" && (
              <button
                onClick={() => setPhase("result")}
                className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                Show answer
              </button>
            )}

            {phase === "result" && score.total === index && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleFlashcardGrade(false)}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
                >
                  Didn&apos;t know it
                </button>
                <button
                  onClick={() => handleFlashcardGrade(true)}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
                >
                  Knew it
                </button>
              </div>
            )}

            {phase === "result" && score.total > index && (
              <button
                onClick={advance}
                className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                Next
              </button>
            )}
          </div>
        )}

        {current &&
          current.type === "fill_blank" &&
          fillBlank &&
          (phase === "front" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {index + 1} / {queue.length} &middot; {current.level}
            </p>
            <div className="rounded-lg border border-gray-300 p-6 text-center">
              <p className="text-lg">{fillBlank.sentence}</p>
            </div>

            <div className="flex flex-col gap-2">
              {fillBlank.options.map((option) => {
                const isSelected = selected === option;
                const isCorrectOption = option === fillBlank.correctAnswer;
                const showFeedback = phase === "result";
                let classes =
                  "rounded-md border px-4 py-2 text-left hover:bg-gray-100 border-gray-300";
                if (showFeedback && isCorrectOption) {
                  classes =
                    "rounded-md border px-4 py-2 text-left border-green-500 bg-green-50 text-green-800";
                } else if (showFeedback && isSelected && !isCorrectOption) {
                  classes =
                    "rounded-md border px-4 py-2 text-left border-red-500 bg-red-50 text-red-800";
                }
                return (
                  <button
                    key={option}
                    disabled={phase === "result"}
                    onClick={() => handleFillBlankSelect(option)}
                    className={classes}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {phase === "result" && (
              <button
                onClick={advance}
                className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                Next
              </button>
            )}
          </div>
        )}

        {phase === "complete" && (
          <div className="mt-4 flex flex-col gap-4 text-center">
            <p className="text-lg">
              Session complete: {score.correct} / {score.total} correct
            </p>
            <div className="flex gap-2">
              <Link
                href="/"
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Home
              </Link>
              <button
                onClick={() => {
                  setIndex(0);
                  setScore({ correct: 0, total: 0 });
                  setQueue([]);
                  startSession(10).then(setQueue);
                }}
                className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
              >
                Practice again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
