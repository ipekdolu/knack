"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  startSession,
  getLevelPracticeWords,
  generateFlashcard,
  generateFillBlank,
  logExerciseResult,
  toggleWordFlag,
  type SessionWord,
  type ExerciseType,
  type FlashcardContent,
  type FillBlankContent,
} from "@/lib/practice/actions";

type Phase = "loading" | "front" | "result" | "complete" | "error";
type Content = FlashcardContent | FillBlankContent;
// "My words" reinforces vocabulary the learner has already seen/drilled
// (the pre-existing due+new mix). "Level practice" samples randomly across
// the whole level so recognizing a familiar word can't shortcut the task --
// only offered for fill-blank; flashcards stay word-anchored on purpose.
type VocabSource = "my_words" | "level_practice";
// Multiple-choice lets a learner eliminate options by elimination; typing
// the answer removes that shortcut entirely. Same generated content either
// way -- this only changes how the correct answer is presented and checked.
type AnswerMode = "choice" | "type";

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
  showAddWord = false,
  // This component backs both a Vocab space (flashcards) and an Activities
  // one (fill-blank), so where "back" goes depends on the caller.
  backHref = "/activities",
  // Difficult Words reuses this component with its own word pool instead of
  // the default due+new mix from startSession.
  loadWords,
  emptyMessage,
  showFlagButton = false,
}: {
  type: ExerciseType;
  title: string;
  showAddWord?: boolean;
  backHref?: string;
  loadWords?: () => Promise<SessionWord[]>;
  emptyMessage?: string;
  showFlagButton?: boolean;
}) {
  const [queue, setQueue] = useState<SessionWord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const showVocabToggle = type === "fill_blank";
  const [vocabSource, setVocabSource] = useState<VocabSource>("level_practice");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("choice");
  const [typedAnswer, setTypedAnswer] = useState("");

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

  // Bumped on every begin() so in-flight fetches from a session that has
  // since been restarted (Practice again, or React Strict Mode's dev-mode
  // double-invoke of the mount effect) know to discard their result instead
  // of writing a stale word's content into the new queue's cache slot.
  const sessionId = useRef(0);

  function fetchContent(word: SessionWord): Promise<Content> {
    return type === "flashcard" ? generateFlashcard(word) : generateFillBlank(word);
  }

  function ensureFetched(i: number, words: SessionWord[]) {
    if (i < 0 || i >= words.length) return;
    if (contentCache.current[i] || fetching.current.has(i)) return;
    const mySession = sessionId.current;
    fetching.current.add(i);
    fetchContent(words[i])
      .then((content) => {
        fetching.current.delete(i);
        if (mySession !== sessionId.current) return;
        contentCache.current[i] = content;
        if (i === indexRef.current) {
          setPhase("front");
        }
      })
      .catch((err) => {
        fetching.current.delete(i);
        if (mySession !== sessionId.current) return;
        if (i === indexRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to generate exercise",
          );
          setPhase("error");
        }
      });
  }

  function begin(source: VocabSource = vocabSource) {
    const mySession = ++sessionId.current;
    setPhase("loading");
    contentCache.current = {};
    fetching.current.clear();

    const load = loadWords
      ? loadWords().then((sessionWords) => ({
          words: sessionWords,
          level: sessionWords[0]?.level ?? null,
        }))
      : showVocabToggle && source === "level_practice"
        ? getLevelPracticeWords(type)
        : startSession(type);

    load
      .then(({ words: sessionWords, level }) => {
        if (mySession !== sessionId.current) return;
        setQueue(sessionWords);
        setIndex(0);
        setScore({ correct: 0, total: 0 });
        if (sessionWords.length === 0) {
          setError(
            emptyMessage ??
              (!level
                ? "No words available yet -- add a word or wait for the word bank to load."
                : `No ${level} words available yet. Pick a different level in Settings.`),
          );
          setPhase("error");
        }
      })
      .catch((err) => {
        if (mySession !== sessionId.current) return;
        setError(err instanceof Error ? err.message : "Failed to start session");
        setPhase("error");
      });
  }

  useEffect(() => {
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (queue.length === 0 || index >= queue.length) return;

    setSelected(null);
    setTypedAnswer("");
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

  async function handleToggleFlag() {
    if (!current || flagging) return;
    setFlagging(true);
    try {
      const nextFlagged = await toggleWordFlag(current.wordId);
      setQueue((q) =>
        q.map((w, i) => (i === index ? { ...w, isFlagged: nextFlagged } : w)),
      );
    } finally {
      setFlagging(false);
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
      // Level practice draws a random word regardless of whether the
      // learner chose to drill it -- a hit or miss there shouldn't move
      // its mastery stage or scheduling the way "My words" does.
      updateMastery: vocabSource !== "level_practice",
    });
  }

  async function handleFillBlankTypeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !content || !typedAnswer.trim()) return;
    const fillBlank = content as FillBlankContent;
    const correct =
      typedAnswer.trim().toLowerCase() === fillBlank.correctAnswer.toLowerCase();
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "fill_blank",
      correct,
      userResponse: typedAnswer.trim(),
      updateMastery: vocabSource !== "level_practice",
    });
  }

  function handleVocabSourceChange(source: VocabSource) {
    if (source === vocabSource) return;
    setVocabSource(source);
    begin(source);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between">
          <Link href={backHref} className="text-sm text-gray-500 hover:underline">
            &larr; Back
          </Link>
          {showAddWord && (
            <Link
              href="/vocab/add"
              className="text-sm text-gray-500 hover:underline"
            >
              + Create a flashcard
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>

        {showVocabToggle && (
          <div className="mt-3 flex gap-1 rounded-md border border-gray-300 p-1 text-sm">
            {(
              [
                { value: "level_practice", label: "Level practice" },
                { value: "my_words", label: "My words" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleVocabSourceChange(opt.value)}
                className={`flex-1 rounded px-3 py-1.5 ${
                  vocabSource === opt.value
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {showVocabToggle && (
          <div className="mt-2 flex gap-1 rounded-md border border-gray-300 p-1 text-sm">
            {(
              [
                { value: "choice", label: "Multiple choice" },
                { value: "type", label: "Type the answer" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAnswerMode(opt.value)}
                className={`flex-1 rounded px-3 py-1.5 ${
                  answerMode === opt.value
                    ? "bg-black text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
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
              <Link
                href="/settings"
                className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Change level
              </Link>
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
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${STAGE_CLASSES[current.masteryStage]}`}
                >
                  {STAGE_LABEL[current.masteryStage]}
                </span>
                {showFlagButton && (
                  <button
                    type="button"
                    onClick={handleToggleFlag}
                    disabled={flagging}
                    aria-label={
                      current.isFlagged
                        ? "Unmark as difficult"
                        : "Mark as difficult"
                    }
                    className={`text-lg leading-none ${current.isFlagged ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
                  >
                    {current.isFlagged ? "★" : "☆"}
                  </button>
                )}
              </div>
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

            {answerMode === "choice" ? (
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
            ) : phase === "front" ? (
              <form
                onSubmit={handleFillBlankTypeSubmit}
                className="flex flex-col gap-3"
              >
                <input
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  placeholder="Fehlendes Wort..."
                  className="rounded-md border border-gray-300 px-3 py-2"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!typedAnswer.trim()}
                  className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  Submit
                </button>
              </form>
            ) : (
              <div
                className={`rounded-md border px-4 py-2 text-left ${
                  typedAnswer.trim().toLowerCase() ===
                  (content as FillBlankContent).correctAnswer.toLowerCase()
                    ? "border-green-500 bg-green-50 text-green-800"
                    : "border-red-500 bg-red-50 text-red-800"
                }`}
              >
                <p>Your answer: {typedAnswer}</p>
                <p className="mt-1 font-medium">
                  Correct answer: {(content as FillBlankContent).correctAnswer}
                </p>
              </div>
            )}

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
                href="/home"
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Home
              </Link>
              <button
                onClick={() => begin()}
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
