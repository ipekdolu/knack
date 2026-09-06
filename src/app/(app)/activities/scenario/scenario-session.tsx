"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startSession, type SessionWord } from "@/lib/practice/actions";
import {
  generateScenarioPrompt,
  gradeScenario,
  logScenarioResult,
  type ScenarioPrompt,
  type ScenarioGrade,
} from "@/lib/practice/scenario";

type Phase = "loading" | "generating" | "answer" | "grading" | "result" | "error";

const WORDS_PER_SCENARIO = 6;

const CRITERION_LABELS: Record<
  keyof ScenarioGrade["criteria"],
  string
> = {
  erfuellung: "Kommunikative Erfüllung",
  kohaerenz: "Kohärenz",
  wortschatz: "Wortschatz",
  korrektheit: "Korrektheit",
};

export default function ScenarioSession() {
  const [suggestedWords, setSuggestedWords] = useState<SessionWord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [prompt, setPrompt] = useState<ScenarioPrompt | null>(null);
  const [showHelperWords, setShowHelperWords] = useState(false);
  const [response, setResponse] = useState("");
  const [grade, setGrade] = useState<ScenarioGrade | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumped on every begin() so a stale in-flight request from a prior round
  // (e.g. clicking "Another scenario" before the current one settles, or
  // React Strict Mode's dev-mode double-invoke of the mount effect) can't
  // write its result over the newer round's state.
  const sessionId = useRef(0);

  function begin() {
    const mySession = ++sessionId.current;
    setPhase("loading");
    setPrompt(null);
    setShowHelperWords(false);
    setResponse("");
    setGrade(null);
    startSession("scenario", WORDS_PER_SCENARIO)
      .then(({ words: sessionWords, level }) => {
        if (mySession !== sessionId.current) return;
        setSuggestedWords(sessionWords);
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

  useEffect(() => {
    if (phase !== "generating" || suggestedWords.length === 0) return;
    const mySession = sessionId.current;
    generateScenarioPrompt(suggestedWords)
      .then((result) => {
        if (mySession !== sessionId.current) return;
        setPrompt(result);
        setPhase("answer");
      })
      .catch((err) => {
        if (mySession !== sessionId.current) return;
        setError(err instanceof Error ? err.message : "Failed to generate scenario");
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, suggestedWords]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt || !response.trim()) return;
    setPhase("grading");
    setError(null);
    try {
      const result = await gradeScenario(prompt, response.trim());
      setGrade(result);
      setPhase("result");
      await logScenarioResult({
        wordIds: suggestedWords.map((w) => w.wordId),
        userResponse: response.trim(),
        grade: result,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade response");
      setPhase("error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/activities" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Scenario writing</h1>

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

        {(phase === "loading" || phase === "generating") && (
          <p className="mt-4 text-gray-500">
            {phase === "loading" ? "Loading session..." : "Writing a scenario..."}
          </p>
        )}

        {prompt && (phase === "answer" || phase === "grading" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-gray-300 p-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>An: {prompt.recipient}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                  {prompt.register}
                </span>
              </div>
              <p>{prompt.situation}</p>
              <ul className="list-inside list-disc text-sm text-gray-700">
                {prompt.leitpunkte.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>

              {!showHelperWords ? (
                <button
                  type="button"
                  onClick={() => setShowHelperWords(true)}
                  className="w-fit text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Wörter anzeigen, die helfen
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {prompt.helperWords.map((hw, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600"
                      title={hw.gloss}
                    >
                      {hw.word}
                      <span className="ml-1 text-gray-400">({hw.gloss})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {phase === "result" && grade && (
              <div className="flex flex-col gap-3 text-left text-sm">
                <div className="flex items-center justify-between rounded-lg border border-gray-300 p-3">
                  <span
                    className={`text-lg font-semibold ${grade.passed ? "text-green-700" : "text-amber-700"}`}
                  >
                    {grade.totalScore} / 100
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      grade.passed
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {grade.passed ? "Bestanden" : "Nicht bestanden"}
                  </span>
                </div>

                <p className="text-gray-700">{grade.feedback}</p>

                {!grade.registerCorrect && grade.registerNote && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                    Register: {grade.registerNote}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {(
                    Object.keys(grade.criteria) as (keyof ScenarioGrade["criteria"])[]
                  ).map((key) => {
                    const c = grade.criteria[key];
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

                <div>
                  <p className="font-medium">Leitpunkte</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {grade.leitpunkte.map((lp, i) => (
                      <li key={i} className={lp.covered ? "text-green-700" : "text-red-700"}>
                        {lp.covered ? "✓" : "✗"} {lp.point}
                        <span className="block text-xs text-gray-500">{lp.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {grade.corrections.length > 0 && (
                  <div>
                    <p className="font-medium">Corrections</p>
                    <div className="mt-1 flex flex-col gap-2">
                      {grade.corrections.map((c, i) => (
                        <div key={i} className="rounded-md bg-gray-50 p-2">
                          <p className="text-red-700 line-through">{c.original}</p>
                          <p className="text-green-700">{c.corrected}</p>
                          <p className="mt-1 text-xs text-gray-500">{c.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(phase === "answer" || phase === "grading") && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  disabled={phase === "grading"}
                  placeholder="Schreib deine Antwort..."
                  rows={8}
                  className="rounded-md border border-gray-300 px-3 py-2 disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={phase === "grading" || !response.trim()}
                  className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {phase === "grading" ? "Grading..." : "Submit"}
                </button>
              </form>
            )}

            {phase === "result" && (
              <div className="flex gap-2">
                <Link
                  href="/home"
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-center hover:bg-gray-100"
                >
                  Home
                </Link>
                <button
                  onClick={begin}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
                >
                  Another scenario
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
