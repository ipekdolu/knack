"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { startSession, type SessionWord } from "../actions";
import { chunkWords } from "../chunk";
import { gradeSentence, logSentenceResult, type SentenceGrade } from "./actions";

type Phase = "loading" | "prompt" | "grading" | "result" | "complete" | "error";

export default function WritingSession() {
  const [groups, setGroups] = useState<SessionWord[][]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [sentence, setSentence] = useState("");
  const [grade, setGrade] = useState<SentenceGrade | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  function begin() {
    setPhase("loading");
    startSession("sentence", 9)
      .then(({ words: sessionWords, level }) => {
        setGroups(chunkWords(sessionWords));
        setIndex(0);
        setSentence("");
        setGrade(null);
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

  function advance() {
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-md">
        <Link href="/practice" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Write a Sentence</h1>

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

        {phase === "loading" && (
          <p className="mt-4 text-gray-500">Loading session...</p>
        )}

        {current && (phase === "prompt" || phase === "grading" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {index + 1} / {groups.length}
            </p>

            <div className="flex min-h-64 flex-col justify-center gap-3 rounded-lg border border-gray-300 p-6">
              <p className="text-sm text-gray-500">
                Write one German sentence using all of these words:
              </p>
              <div className="flex flex-wrap gap-2">
                {current.map((w) => {
                  const wordGrade = grade?.wordResults.find(
                    (r) => r.wordId === w.wordId,
                  );
                  let classes =
                    "rounded-full border px-3 py-1 text-sm font-medium border-gray-300";
                  if (phase === "result" && wordGrade) {
                    classes = wordGrade.usedCorrectly
                      ? "rounded-full border px-3 py-1 text-sm font-medium border-green-500 bg-green-50 text-green-800"
                      : "rounded-full border px-3 py-1 text-sm font-medium border-red-500 bg-red-50 text-red-800";
                  }
                  return (
                    <span key={w.wordId} className={classes}>
                      {w.gender ? `${w.gender} ` : ""}
                      {w.lemma}
                    </span>
                  );
                })}
              </div>

              {phase === "result" && grade && (
                <div className="mt-2 flex flex-col gap-2 text-left text-sm">
                  <p className="text-gray-700">{grade.feedback}</p>
                  {grade.grammarIssues.length > 0 && (
                    <ul className="list-inside list-disc text-gray-500">
                      {grade.grammarIssues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {grade.correctedSentence.trim().toLowerCase() !==
                    sentence.trim().toLowerCase() && (
                    <p className="italic text-gray-600">
                      Suggested: {grade.correctedSentence}
                    </p>
                  )}
                  {!grade.levelAppropriate && grade.levelNote && (
                    <p className="text-amber-700">{grade.levelNote}</p>
                  )}
                </div>
              )}
            </div>

            {(phase === "prompt" || phase === "grading") && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  disabled={phase === "grading"}
                  placeholder="Schreib einen Satz..."
                  rows={3}
                  className="rounded-md border border-gray-300 px-3 py-2 disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={phase === "grading" || !sentence.trim()}
                  className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {phase === "grading" ? "Grading..." : "Submit"}
                </button>
              </form>
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
              Session complete: {score.correct} / {score.total} sentences fully correct
            </p>
            <div className="flex gap-2">
              <Link
                href="/"
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
