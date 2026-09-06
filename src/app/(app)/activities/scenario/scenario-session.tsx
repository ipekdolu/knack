"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startSession, type SessionWord } from "@/lib/practice/actions";
import {
  generateScenarioPrompt,
  gradeScenario,
  logScenarioResult,
  type ScenarioGrade,
} from "@/lib/practice/scenario";

type Phase = "loading" | "generating" | "answer" | "grading" | "result" | "error";

const WORDS_PER_SCENARIO = 5;

export default function ScenarioSession() {
  const [suggestedWords, setSuggestedWords] = useState<SessionWord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [scenario, setScenario] = useState<string | null>(null);
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
    setScenario(null);
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
        setScenario(result.scenario);
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
    if (!scenario || !response.trim()) return;
    setPhase("grading");
    setError(null);
    try {
      const result = await gradeScenario(scenario, suggestedWords, response.trim());
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

        {scenario && (phase === "answer" || phase === "grading" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-gray-300 p-4">
              <p>{scenario}</p>
              <div className="flex flex-wrap gap-2">
                {suggestedWords.map((w) => (
                  <span
                    key={w.wordId}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-500"
                  >
                    {w.gender ? `${w.gender} ` : ""}
                    {w.lemma}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                These words are optional -- use them if they fit.
              </p>
            </div>

            {phase === "result" && grade && (
              <div className="flex flex-col gap-2 text-left text-sm">
                <p
                  className={`font-medium ${grade.meetsGoal ? "text-green-700" : "text-amber-700"}`}
                >
                  {grade.meetsGoal
                    ? "Solid response."
                    : "This could use another pass."}
                </p>
                <p className="text-gray-700">{grade.feedback}</p>
                <p className="text-gray-500">
                  <span className="font-medium">Tone:</span> {grade.toneNote}
                </p>
                <p className="text-gray-500">
                  <span className="font-medium">Structure:</span>{" "}
                  {grade.structureNote}
                </p>
                {grade.grammarIssues.length > 0 && (
                  <ul className="list-inside list-disc text-gray-500">
                    {grade.grammarIssues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
                <p className="text-gray-500">
                  Used {grade.wordsUsedCount} of the {suggestedWords.length}{" "}
                  suggested words.
                </p>
                {grade.correctedResponse.trim().toLowerCase() !==
                  response.trim().toLowerCase() && (
                  <p className="italic text-gray-600">
                    Suggested: {grade.correctedResponse}
                  </p>
                )}
                {!grade.levelAppropriate && grade.levelNote && (
                  <p className="text-amber-700">{grade.levelNote}</p>
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
                  rows={6}
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
