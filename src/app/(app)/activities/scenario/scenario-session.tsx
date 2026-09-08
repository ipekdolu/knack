"use client";

import { useEffect, useRef, useState } from "react";
import { startSession, type SessionWord } from "@/lib/practice/actions";
import {
  generateScenarioPrompt,
  gradeScenario,
  logScenarioResult,
  type ScenarioPrompt,
  type ScenarioGrade,
} from "@/lib/practice/scenario";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, ButtonLink } from "@/components/ui/button";
import { ExerciseTopBar } from "@/components/ui/exercise-top-bar";

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
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-2xl">
        <ExerciseTopBar backHref="/activities" typeLabel="Scenario writing" />

        {phase === "error" && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-sm font-medium text-error">
              {error}
            </p>
            <ButtonLink href="/settings" variant="secondary" className="w-fit">
              Change level
            </ButtonLink>
          </div>
        )}

        {(phase === "loading" || phase === "generating") && (
          <p className="mt-4 font-medium text-primary-ink/70">
            {phase === "loading" ? "Loading session..." : "Writing a scenario..."}
          </p>
        )}

        {prompt && (phase === "answer" || phase === "grading" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <Card className="flex flex-col gap-3">
              <p className="text-sm font-medium text-text-muted">
                An: {prompt.recipient}
              </p>
              <p className="font-bold">{prompt.situation}</p>
              <ul className="list-inside list-disc text-sm text-text">
                {prompt.leitpunkte.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>

              {!showHelperWords ? (
                <button
                  type="button"
                  onClick={() => setShowHelperWords(true)}
                  className="w-fit text-xs font-bold text-primary-ink underline"
                >
                  💡 Wörter anzeigen, die helfen
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {prompt.helperWords.map((hw, i) => (
                    <Pill key={i} tone="peach" title={hw.gloss}>
                      {hw.word}
                      <span className="ml-1 text-peach-ink/60">({hw.gloss})</span>
                    </Pill>
                  ))}
                </div>
              )}
            </Card>

            {phase === "result" && grade && (
              <div className="flex flex-col gap-3 text-left text-sm">
                <Card
                  shadow="shadow-hard-sm"
                  className="flex items-center justify-between"
                >
                  <span className="font-heading text-2xl font-extrabold">
                    {grade.totalScore} / 100
                  </span>
                  <Pill tone={grade.passed ? "success" : "error"}>
                    {grade.passed ? "Bestanden" : "Nicht bestanden"}
                  </Pill>
                </Card>

                <p className="text-text">{grade.feedback}</p>

                {!grade.registerConsistent && grade.registerNote && (
                  <p className="rounded-btn border-2 border-error bg-error/10 px-3 py-2 font-medium text-error">
                    Register: {grade.registerNote}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {(
                    Object.keys(grade.criteria) as (keyof ScenarioGrade["criteria"])[]
                  ).map((key) => {
                    const c = grade.criteria[key];
                    return (
                      <Card key={key} shadow="shadow-hard-sm" padding="p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{CRITERION_LABELS[key]}</span>
                          <span className="text-text-muted">
                            {c.score} / {c.maxScore}
                          </span>
                        </div>
                        <p className="mt-1 text-text-muted">{c.note}</p>
                      </Card>
                    );
                  })}
                </div>

                <div>
                  <p className="font-bold">Leitpunkte</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {grade.leitpunkte.map((lp, i) => (
                      <li
                        key={i}
                        className={lp.covered ? "text-success" : "text-error"}
                      >
                        {lp.covered ? "✓" : "✗"} {lp.point}
                        <span className="block text-xs text-text-muted">
                          {lp.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {grade.corrections.length > 0 && (
                  <div>
                    <p className="font-bold">Corrections</p>
                    <div className="mt-1 flex flex-col gap-2">
                      {grade.corrections.map((c, i) => (
                        <Card key={i} shadow="shadow-hard-sm" padding="p-3">
                          <p className="text-error line-through">{c.original}</p>
                          <p className="text-success">{c.corrected}</p>
                          <p className="mt-1 text-xs text-text-muted">
                            {c.explanation}
                          </p>
                        </Card>
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
                  className="rounded-btn border-[2.5px] border-text px-4 py-3 font-medium shadow-hard-sm disabled:opacity-50 focus:outline-none"
                  autoFocus
                />
                <Button type="submit" disabled={phase === "grading" || !response.trim()}>
                  {phase === "grading" ? "Grading..." : "Bewerten"}
                </Button>
              </form>
            )}

            {phase === "result" && (
              <div className="flex gap-2">
                <ButtonLink href="/home" variant="secondary" className="flex-1">
                  Home
                </ButtonLink>
                <Button className="flex-1" onClick={begin}>
                  Another scenario
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
