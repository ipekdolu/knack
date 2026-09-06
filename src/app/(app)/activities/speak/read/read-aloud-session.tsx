"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  startSession,
  generateFlashcard,
  logExerciseResult,
  type SessionWord,
  type FlashcardContent,
} from "@/lib/practice/actions";
import { useSpeechRecognition } from "@/lib/speech/use-speech-recognition";
import { matchTranscript, type MatchResult } from "@/lib/practice/match";

type Phase = "loading" | "prompt" | "result" | "complete" | "error";

export default function ReadAloudSession() {
  const [queue, setQueue] = useState<SessionWord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeechRecognition();

  // Same ref-based cache as the other exercises: the next sentence is
  // generated in the background while this one is being read, so there's no
  // "generating" screen between cards.
  const contentCache = useRef<Record<number, FlashcardContent>>({});
  const fetching = useRef<Set<number>>(new Set());
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  function ensureFetched(i: number, words: SessionWord[]) {
    if (i < 0 || i >= words.length) return;
    if (contentCache.current[i] || fetching.current.has(i)) return;
    fetching.current.add(i);
    generateFlashcard(words[i])
      .then((content) => {
        contentCache.current[i] = content;
        fetching.current.delete(i);
        if (i === indexRef.current) setPhase("prompt");
      })
      .catch((err) => {
        fetching.current.delete(i);
        if (i === indexRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to generate a sentence",
          );
          setPhase("error");
        }
      });
  }

  function begin() {
    setPhase("loading");
    contentCache.current = {};
    fetching.current.clear();
    speech.reset();
    startSession("speaking_read", 10)
      .then(({ words: sessionWords, level }) => {
        setQueue(sessionWords);
        setIndex(0);
        setResult(null);
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
    if (queue.length === 0 || index >= queue.length) return;
    setResult(null);
    setError(null);
    speech.reset();

    if (contentCache.current[index]) setPhase("prompt");
    else setPhase("loading");

    ensureFetched(index, queue);
    ensureFetched(index + 1, queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  const current = queue[index];
  const content = contentCache.current[index];

  async function handleCheck() {
    if (!current || !content) return;
    const spoken = speech.transcript.trim();
    if (!spoken) return;

    const matchResult = matchTranscript(content.exampleSentence, spoken);
    setResult(matchResult);
    setScore((s) => ({
      correct: s.correct + (matchResult.matched ? 1 : 0),
      total: s.total + 1,
    }));
    setPhase("result");
    await logExerciseResult({
      wordId: current.wordId,
      type: "speaking_read",
      correct: matchResult.matched,
      userResponse: spoken,
    });
  }

  function advance() {
    if (index + 1 >= queue.length) setPhase("complete");
    else setIndex(index + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/activities" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Read Aloud</h1>

        {!speech.supported && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This browser doesn&apos;t support speech recognition. Chrome or Edge
            work best -- in other browsers you can still read the sentence and
            type what you said.
          </p>
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
            {queue.length === 0 ? "Loading session..." : "Generating sentence..."}
          </p>
        )}

        {current && content && (phase === "prompt" || phase === "result") && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              {index + 1} / {queue.length} &middot; {current.level}
            </p>

            <div className="flex min-h-64 flex-col justify-center gap-3 rounded-lg border border-gray-300 p-6 text-center">
              <p className="text-sm text-gray-500">Read this sentence aloud:</p>
              {phase === "result" && result ? (
                // After checking, colour each word by whether it was heard.
                <p className="text-lg">
                  {result.words.map((w, i) => (
                    <span
                      key={i}
                      className={w.hit ? "text-green-700" : "text-red-600"}
                    >
                      {w.word}
                      {i < result.words.length - 1 ? " " : ""}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-lg">{content.exampleSentence}</p>
              )}
              <p className="text-sm text-gray-500">{content.gloss}</p>
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
                  ? "Press the mic and read the sentence..."
                  : "Type what you said..."
              }
              rows={2}
              disabled={phase === "result"}
              className="rounded-md border border-gray-300 px-3 py-2 disabled:opacity-60"
            />

            {phase === "prompt" && (
              <div className="flex gap-2">
                {speech.supported && (
                  <button
                    onClick={speech.listening ? speech.stop : speech.start}
                    className={`flex-1 rounded-md px-4 py-2 ${
                      speech.listening
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "border border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    {speech.listening ? "Stop" : "Start speaking"}
                  </button>
                )}
                <button
                  onClick={handleCheck}
                  disabled={!speech.transcript.trim() || speech.listening}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  Check
                </button>
              </div>
            )}

            {phase === "result" && result && (
              <>
                <p
                  className={`rounded-md px-3 py-2 text-sm ${
                    result.matched
                      ? "bg-green-50 text-green-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {result.matched
                    ? `Matched ${Math.round(result.score * 100)}% of the sentence.`
                    : `Only ${Math.round(result.score * 100)}% matched -- the words in red weren't heard.`}
                </p>
                <button
                  onClick={advance}
                  className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
                >
                  Next
                </button>
              </>
            )}
          </div>
        )}

        {phase === "complete" && (
          <div className="mt-4 flex flex-col gap-4 text-center">
            <p className="text-lg">
              Session complete: {score.correct} / {score.total} read correctly
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
