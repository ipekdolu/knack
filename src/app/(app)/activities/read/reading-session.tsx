"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startSession, type SessionWord } from "@/lib/practice/actions";
import { chunkWords } from "@/lib/practice/chunk";
import {
  generateReadingPassage,
  logReadingResult,
  type ReadingContent,
} from "@/lib/practice/reading";

type Phase = "loading" | "generating" | "answer" | "result" | "complete" | "error";

export default function ReadingSession() {
  const [groups, setGroups] = useState<SessionWord[][]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [content, setContent] = useState<ReadingContent | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [presentPicks, setPresentPicks] = useState<Set<string>>(new Set());
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Bumped on every begin() so a stale in-flight request from a prior
  // session (React Strict Mode's dev-mode double-invoke of the mount
  // effect, or a fast "Practice again") can't write its result over the
  // newer session's state.
  const sessionId = useRef(0);

  function begin() {
    const mySession = ++sessionId.current;
    setPhase("loading");
    startSession("reading", 10)
      .then(({ words: sessionWords, level }) => {
        if (mySession !== sessionId.current) return;
        setGroups(chunkWords(sessionWords, { min: 4, max: 6 }));
        setIndex(0);
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
          setPhase("generating");
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

  const current = groups[index];

  useEffect(() => {
    if (!current || phase !== "generating") return;
    const mySession = sessionId.current;
    setContent(null);
    setAnswers({});
    setPresentPicks(new Set());
    generateReadingPassage(current)
      .then((result) => {
        if (mySession !== sessionId.current) return;
        setContent(result);
        setPhase("answer");
      })
      .catch((err) => {
        if (mySession !== sessionId.current) return;
        setError(
          err instanceof Error ? err.message : "Failed to generate passage",
        );
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase]);

  function togglePresent(lemma: string) {
    setPresentPicks((prev) => {
      const next = new Set(prev);
      if (next.has(lemma)) next.delete(lemma);
      else next.add(lemma);
      return next;
    });
  }

  async function handleSubmit() {
    if (!current || !content) return;

    const questionResults = content.questions.map((q, qi) => ({
      question: q.question,
      correct: answers[qi] === q.correctAnswer,
    }));
    const questionsAllCorrect = questionResults.every((r) => r.correct);

    const wordsUsedLower = new Set(content.wordsUsed.map((w) => w.toLowerCase()));
    const wordIdResults = current.map((w) => {
      const shouldBePresent = wordsUsedLower.has(w.lemma.toLowerCase());
      const picked = presentPicks.has(w.lemma);
      return { lemma: w.lemma, correct: shouldBePresent === picked };
    });
    const wordIdAllCorrect = wordIdResults.every((r) => r.correct);

    const allCorrect = questionsAllCorrect && wordIdAllCorrect;
    setScore((s) => ({ correct: s.correct + (allCorrect ? 1 : 0), total: s.total + 1 }));
    setPhase("result");

    await logReadingResult({
      wordIds: current.map((w) => w.wordId),
      correct: allCorrect,
      questionResults,
      wordIdResults,
    });
  }

  function advance() {
    if (index + 1 >= groups.length) {
      setPhase("complete");
    } else {
      setIndex(index + 1);
      setPhase("generating");
    }
  }

  const allQuestionsAnswered =
    content && content.questions.every((_, i) => answers[i] !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/activities" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Reading</h1>

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
            <div className="flex gap-2">
              {groups.length > 0 && index < groups.length && (
                <button
                  onClick={advance}
                  className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
                >
                  Skip
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

        {(phase === "loading" || phase === "generating") && (
          <p className="mt-4 text-gray-500">
            {phase === "loading" ? "Loading session..." : "Writing a passage..."}
          </p>
        )}

        {current && content && (phase === "answer" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {index + 1} / {groups.length}
            </p>

            <div className="rounded-lg border border-gray-300 p-4">
              <p className="whitespace-pre-line leading-relaxed">
                {content.passage}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {content.questions.map((q, qi) => (
                <div key={qi} className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{q.question}</p>
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((option) => {
                      const isSelected = answers[qi] === option;
                      const showFeedback = phase === "result";
                      const isCorrectOption = option === q.correctAnswer;
                      let classes =
                        "rounded-md border px-3 py-1.5 text-left text-sm hover:bg-gray-100 border-gray-300";
                      if (showFeedback && isCorrectOption) {
                        classes =
                          "rounded-md border px-3 py-1.5 text-left text-sm border-green-500 bg-green-50 text-green-800";
                      } else if (showFeedback && isSelected && !isCorrectOption) {
                        classes =
                          "rounded-md border px-3 py-1.5 text-left text-sm border-red-500 bg-red-50 text-red-800";
                      }
                      return (
                        <button
                          key={option}
                          disabled={phase === "result"}
                          onClick={() =>
                            setAnswers((a) => ({ ...a, [qi]: option }))
                          }
                          className={classes}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Which of these words appeared in the passage?
              </p>
              <div className="flex flex-wrap gap-2">
                {current.map((w) => {
                  const picked = presentPicks.has(w.lemma);
                  const showFeedback = phase === "result";
                  const wasPresent = content.wordsUsed
                    .map((l) => l.toLowerCase())
                    .includes(w.lemma.toLowerCase());
                  let classes =
                    "rounded-full border px-3 py-1 text-sm font-medium border-gray-300";
                  if (showFeedback) {
                    const correct = picked === wasPresent;
                    classes = correct
                      ? "rounded-full border px-3 py-1 text-sm font-medium border-green-500 bg-green-50 text-green-800"
                      : "rounded-full border px-3 py-1 text-sm font-medium border-red-500 bg-red-50 text-red-800";
                  } else if (picked) {
                    classes =
                      "rounded-full border px-3 py-1 text-sm font-medium border-black bg-black text-white";
                  }
                  return (
                    <button
                      key={w.wordId}
                      disabled={phase === "result"}
                      onClick={() => togglePresent(w.lemma)}
                      className={classes}
                    >
                      {w.gender ? `${w.gender} ` : ""}
                      {w.lemma}
                      {showFeedback && wasPresent && " ✓"}
                    </button>
                  );
                })}
              </div>
            </div>

            {phase === "answer" && (
              <button
                onClick={handleSubmit}
                disabled={!allQuestionsAnswered}
                className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Submit
              </button>
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
              Session complete: {score.correct} / {score.total} fully correct
            </p>
            <div className="flex gap-2">
              <Link
                href="/home"
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Home
              </Link>
              <button
                onClick={begin}
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
