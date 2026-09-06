"use client";

import { useState } from "react";
import Link from "next/link";
import { inferWordBatch, saveWords } from "./actions";
import {
  MAX_BATCH_WORDS,
  type WordSuggestion,
  type BatchInferenceResult,
} from "./types";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
const POS_VALUES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "numeral",
  "interjection",
  "particle",
] as const;
const GENDERS = ["der", "die", "das"] as const;

type Step = "input" | "confirm";
// null suggestion means this line failed inference and won't be saved.
type Row = { raw: string; suggestion: WordSuggestion | null; error: string | null };

export default function AddWordForm() {
  const [step, setStep] = useState<Step>("input");
  const [rawInput, setRawInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);

  const lineCount = rawInput
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const words = rawInput.split("\n");
      const results: BatchInferenceResult[] = await inferWordBatch(words);
      if (results.length === 0) {
        setError("Enter at least one word.");
        return;
      }
      setRows(results);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const suggestions = rows
      .map((r) => r.suggestion)
      .filter((s): s is WordSuggestion => s !== null);
    if (suggestions.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      await saveWords(suggestions);
      setSaved(suggestions.length);
      setStep("input");
      setRawInput("");
      setRows([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function updateSuggestion(index: number, patch: Partial<WordSuggestion>) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index && r.suggestion
          ? { ...r, suggestion: { ...r.suggestion, ...patch } }
          : r,
      ),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-sm">
        <Link href="/vocab" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Create your own flashcard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Write one or more German words, one per line. Claude fills in the
          level, part of speech, and gender.
        </p>

        {saved > 0 && (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Saved {saved} {saved === 1 ? "word" : "words"}.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {step === "input" && (
          <form onSubmit={handleSuggest} className="mt-4 flex flex-col gap-3">
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={"e.g.\nKündigung\nbegreifen\nneugierig"}
              rows={6}
              className="rounded-md border border-gray-300 px-3 py-2"
              autoFocus
            />
            <p className="text-xs text-gray-500">
              {lineCount}/{MAX_BATCH_WORDS} words
              {lineCount > MAX_BATCH_WORDS &&
                ` (only the first ${MAX_BATCH_WORDS} will be used)`}
            </p>
            <button
              type="submit"
              disabled={loading || lineCount === 0}
              className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Suggest details"}
            </button>
          </form>
        )}

        {step === "confirm" && (
          <form onSubmit={handleSave} className="mt-4 flex flex-col gap-4">
            {rows.map((row, i) =>
              row.suggestion ? (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-gray-300 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      from &ldquo;{row.raw}&rdquo;
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>

                  <label className="flex flex-col gap-1 text-sm">
                    Word
                    <input
                      type="text"
                      value={row.suggestion.lemma}
                      onChange={(e) =>
                        updateSuggestion(i, { lemma: e.target.value })
                      }
                      className="rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>

                  <div className="flex gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-sm">
                      Level
                      <select
                        value={row.suggestion.level}
                        onChange={(e) =>
                          updateSuggestion(i, {
                            level: e.target.value as WordSuggestion["level"],
                          })
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      >
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-1 flex-col gap-1 text-sm">
                      Part of speech
                      <select
                        value={row.suggestion.pos}
                        onChange={(e) =>
                          updateSuggestion(i, {
                            pos: e.target.value as WordSuggestion["pos"],
                            gender:
                              e.target.value === "noun"
                                ? row.suggestion!.gender
                                : null,
                          })
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      >
                        {POS_VALUES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {row.suggestion.pos === "noun" && (
                    <label className="flex flex-col gap-1 text-sm">
                      Gender
                      <select
                        value={row.suggestion.gender ?? ""}
                        onChange={(e) =>
                          updateSuggestion(i, {
                            gender: (e.target.value ||
                              null) as WordSuggestion["gender"],
                          })
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      >
                        <option value="">(none)</option>
                        {GENDERS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ) : (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  <span>
                    &ldquo;{row.raw}&rdquo; failed: {row.error}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              ),
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("input");
                  setRows([]);
                }}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || rows.every((r) => !r.suggestion)}
                className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading
                  ? "Saving..."
                  : `Save ${rows.filter((r) => r.suggestion).length || ""}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
