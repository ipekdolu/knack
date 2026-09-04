"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  startSession,
  generateFlashcard,
  generateFillBlank,
  logExerciseResult,
  type SessionWord,
  type ExerciseType,
  type FlashcardContent,
  type FillBlankContent,
} from "./actions";

type Phase = "level-select" | "loading" | "front" | "result" | "complete" | "error";
type Content = FlashcardContent | FillBlankContent;

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  learning: "Learning",
  mastered: "Mastered",
};
const STAGE_CLASSES: Record<string, string> = {
  new: "bg-gray-100 text-gray-600",
  learning: "bg-amber-100 text-amber-700",
  mastered: "bg-green-100 text-green-700",
};

export default function ExerciseSession({
  type,
  title,
  levels,
  showAddWord = false,
}: {
  type: ExerciseType;
  title: string;
  levels: string[];
  showAddWord?: boolean;
}) {
  const [level, setLevel] = useState<string | null>(null);
  const [queue, setQueue] = useState<SessionWord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("level-select");
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Content is cached by queue index in a ref (not state) so a background
  // prefetch of the *next* card doesn't need to trigger a re-render -- only
  // fetches for the currently-displayed index drive a phase change. This is
  // what lets the "Generating exercise..." screen disappear between cards:
  // by the time the user clicks Next, the next card's content is usually
  // already sitting in this cache.
  const contentCache = useRef<Record<number, Content>>({});
  const fetching = useRef<Set<number>>(new Set());
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  function fetchContent(word: SessionWord): Promise<Content> {
    return type === "flashcard" ? generateFlashcard(word) : generateFillBlank(word);
  }

  function ensureFetched(i: number, words: SessionWord[]) {
    if (i < 0 || i >= words.length) return;
    if (contentCache.current[i] || fetching.current.has(i)) return;
    fetching.current.add(i);
    fetchContent(words[i])
      .then((content) => {
        contentCache.current[i] = content;
        fetching.current.delete(i);
        if (i === indexRef.current) {
          setPhase("front");
        }
      })
      .catch((err) => {
        fetching.current.delete(i);
        if (i === indexRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to generate exercise",
          );
          setPhase("error");
        }
      });
  }

  function begin(chosenLevel: string) {
    setLevel(chosenLevel);
    setPhase("loading");
    contentCache.current = {};
    fetching.current.clear();
    startSession(type, chosenLevel, 10)
      .then((sessionWords) => {
        setQueue(sessionWords);
        setIndex(0);
        setScore({ correct: 0, total: 0 });
        if (sessionWords.length === 0) {
          setError(`No ${chosenLevel} words available yet.`);
          setPhase("error");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to start session");
        setPhase("error");
      });
  }

  useEffect(() => {
    if (queue.length === 0 || index >= queue.length) return;

    setSelected(null);
    setError(null);

    if (contentCache.current[index]) {
      setPhase("front");
    } else {
      setPhase("loading");
      ensureFetched(index, queue);
    }
    // Prefetch the next card while this one is being viewed/answered.
    ensureFetched(index + 1, queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  const current = queue[index];
  const content = contentCache.current[index];

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
    if (!current || !content) return;
    const fillBlank = content as FillBlankContent;
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
        <Link href="/practice" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>

        {phase === "level-select" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-gray-500">Choose a level to practice.</p>
            <div className="flex flex-wrap gap-2">
              {levels.map((l) => (
                <button
                  key={l}
                  onClick={() => begin(l)}
                  className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
                >
                  {l}
                </button>
              ))}
            </div>
            {showAddWord && (
              <Link
                href="/words/add"
                className="mt-2 text-sm text-gray-500 hover:underline"
              >
                Don&apos;t see a word you want? Add one &rarr;
              </Link>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
            <div className="flex gap-2">
              {queue.length > 0 && index < queue.length && (
                <button
                  onClick={advance}
                  className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
                >
                  Skip word
                </button>
              )}
              <button
                onClick={() => setPhase("level-select")}
                className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Choose a different level
              </button>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <p className="mt-4 text-gray-500">
            {queue.length === 0 ? "Loading session..." : "Generating exercise..."}
          </p>
        )}

        {current &&
          type === "flashcard" &&
          content &&
          (phase === "front" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {index + 1} / {queue.length} &middot; {current.level}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${STAGE_CLASSES[current.masteryStage]}`}
              >
                {STAGE_LABEL[current.masteryStage]}
              </span>
            </div>
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-gray-300 p-6 text-center">
              <p className="text-2xl font-semibold">
                {current.gender ? `${current.gender} ` : ""}
                {current.lemma}
              </p>
              {phase === "result" && (
                <div className="mt-4 flex flex-col gap-2 text-left">
                  <p className="italic text-gray-700">
                    {(content as FlashcardContent).exampleSentence}
                  </p>
                  <p className="text-sm text-gray-500">
                    {(content as FlashcardContent).gloss}
                  </p>
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
          type === "fill_blank" &&
          content &&
          (phase === "front" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {index + 1} / {queue.length} &middot; {current.level}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${STAGE_CLASSES[current.masteryStage]}`}
              >
                {STAGE_LABEL[current.masteryStage]}
              </span>
            </div>
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-gray-300 p-6 text-center">
              <p className="text-lg">{(content as FillBlankContent).sentence}</p>
            </div>

            <div className="flex flex-col gap-2">
              {(content as FillBlankContent).options.map((option) => {
                const isSelected = selected === option;
                const isCorrectOption =
                  option === (content as FillBlankContent).correctAnswer;
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
                onClick={() => level && begin(level)}
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
