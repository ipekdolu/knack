"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startSession, type SessionWord } from "../../actions";
import { chunkWords } from "../../chunk";
import {
  gradeSentence,
  logSentenceResult,
  type SentenceGrade,
} from "../../write/actions";
import { generateSpeakingPrompt, type SpeakingPrompt } from "../actions";
import { useSpeechRecognition } from "../use-speech-recognition";

type Phase = "loading" | "prompt" | "grading" | "result" | "complete" | "error";

export default function SpeakingPromptSession() {
  const [groups, setGroups] = useState<SessionWord[][]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [grade, setGrade] = useState<SentenceGrade | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);

  const speech = useSpeechRecognition();

  const promptCache = useRef<Record<number, SpeakingPrompt>>({});
  const fetching = useRef<Set<number>>(new Set());
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  function ensureFetched(i: number, wordGroups: SessionWord[][]) {
    if (i < 0 || i >= wordGroups.length) return;
    if (promptCache.current[i] || fetching.current.has(i)) return;
    fetching.current.add(i);
    generateSpeakingPrompt(wordGroups[i])
      .then((prompt) => {
        promptCache.current[i] = prompt;
        fetching.current.delete(i);
        if (i === indexRef.current) setPhase("prompt");
      })
      .catch((err) => {
        fetching.current.delete(i);
        if (i === indexRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to generate a prompt",
          );
          setPhase("error");
        }
      });
  }

  function begin() {
    setPhase("loading");
    promptCache.current = {};
    fetching.current.clear();
    speech.reset();
    startSession("speaking_prompt", 9)
      .then(({ words: sessionWords, level }) => {
        setGroups(chunkWords(sessionWords));
        setIndex(0);
        setGrade(null);
        setScore({ correct: 0, total: 0 });
        if (!level) {
          setError("No words available yet -- add a word to get started.");
          setPhase("error");
        } else if (sessionWords.length === 0) {
          setError(
            `No ${level} words available yet. Pick a different level in Settings.`,
          );
          setPhase("error");
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

  useEffect(() => {
    if (groups.length === 0 || index >= groups.length) return;
    setGrade(null);
    setError(null);
    setShowTranslation(false);
    speech.reset();

    if (promptCache.current[index]) setPhase("prompt");
    else setPhase("loading");

    ensureFetched(index, groups);
    ensureFetched(index + 1, groups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, index]);

  const current = groups[index];
  const prompt = promptCache.current[index];

  async function handleSubmit() {
    if (!current || !prompt) return;
    const spoken = speech.transcript.trim();
    if (!spoken) return;

    setPhase("grading");
    setError(null);
    try {
      const result = await gradeSentence(current, spoken, {
        prompt: prompt.question,
        spoken: true,
      });
      setGrade(result);
      setScore((s) => ({
        correct: s.correct + (result.allCorrect ? 1 : 0),
        total: s.total + 1,
      }));
      setPhase("result");
      await logSentenceResult({
        grade: result,
        userResponse: spoken,
        exerciseType: "speaking_prompt",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade your answer");
      setPhase("error");
    }
  }

  function advance() {
    if (index + 1 >= groups.length) setPhase("complete");
    else setIndex(index + 1);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-md">
        <Link href="/practice" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Speaking Prompt</h1>

        {!speech.supported && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This browser doesn&apos;t support speech recognition. Chrome or Edge
            work best -- in other browsers you can still type your answer.
          </p>
        )}

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
          <p className="mt-4 text-gray-500">
            {groups.length === 0 ? "Loading session..." : "Writing a question..."}
          </p>
        )}

        {current && prompt && phase !== "loading" && phase !== "complete" && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {index + 1} / {groups.length}
            </p>

            <div className="flex min-h-64 flex-col justify-center gap-3 rounded-lg border border-gray-300 p-6">
              <p className="text-center text-lg">{prompt.question}</p>
              {showTranslation ? (
                <p className="text-center text-sm text-gray-500">
                  {prompt.translation}
                </p>
              ) : (
                <button
                  onClick={() => setShowTranslation(true)}
                  className="text-center text-sm text-gray-400 hover:underline"
                >
                  Show translation
                </button>
              )}

              <p className="mt-2 text-sm text-gray-500">
                Answer out loud, using:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
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
                  <p className="italic text-gray-600">
                    Suggested: {grade.correctedSentence}
                  </p>
                  {!grade.levelAppropriate && grade.levelNote && (
                    <p className="text-amber-700">{grade.levelNote}</p>
                  )}
                </div>
              )}
            </div>

            {speech.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {speech.error}
              </p>
            )}

            <textarea
              value={
                speech.interim
                  ? `${speech.transcript} ${speech.interim}`.trim()
                  : speech.transcript
              }
              onChange={(e) => speech.setTranscript(e.target.value)}
              placeholder={
                speech.supported
                  ? "Press the mic and answer in German..."
                  : "Type your answer in German..."
              }
              rows={3}
              disabled={phase === "result" || phase === "grading"}
              className="rounded-md border border-gray-300 px-3 py-2 disabled:opacity-60"
            />

            {(phase === "prompt" || phase === "grading") && (
              <div className="flex gap-2">
                {speech.supported && (
                  <button
                    onClick={speech.listening ? speech.stop : speech.start}
                    disabled={phase === "grading"}
                    className={`flex-1 rounded-md px-4 py-2 disabled:opacity-50 ${
                      speech.listening
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "border border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    {speech.listening ? "Stop" : "Start speaking"}
                  </button>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={
                    !speech.transcript.trim() ||
                    speech.listening ||
                    phase === "grading"
                  }
                  className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {phase === "grading" ? "Grading..." : "Submit"}
                </button>
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
              Session complete: {score.correct} / {score.total} answers fully correct
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
