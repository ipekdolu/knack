"use client";

import { useState } from "react";
import Link from "next/link";
import { inferWordDetails, saveWord, type WordSuggestion } from "./actions";

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

export default function AddWordForm() {
  const [step, setStep] = useState<Step>("input");
  const [lemmaInput, setLemmaInput] = useState("");
  const [suggestion, setSuggestion] = useState<WordSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await inferWordDetails(lemmaInput);
      setSuggestion(result);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!suggestion) return;
    setError(null);
    setLoading(true);
    try {
      await saveWord(suggestion);
      setSaved(true);
      setStep("input");
      setLemmaInput("");
      setSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-sm">
        <Link href="/vocab" className="text-sm text-gray-500 hover:underline">
          &larr; Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Add a word</h1>

        {saved && (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Word saved.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {step === "input" && (
          <form onSubmit={handleSuggest} className="mt-4 flex flex-col gap-3">
            <input
              type="text"
              value={lemmaInput}
              onChange={(e) => setLemmaInput(e.target.value)}
              placeholder="e.g. Kündigung"
              className="rounded-md border border-gray-300 px-3 py-2"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !lemmaInput.trim()}
              className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Suggest details"}
            </button>
          </form>
        )}

        {step === "confirm" && suggestion && (
          <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Word
              <input
                type="text"
                value={suggestion.lemma}
                onChange={(e) =>
                  setSuggestion({ ...suggestion, lemma: e.target.value })
                }
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Level
              <select
                value={suggestion.level}
                onChange={(e) =>
                  setSuggestion({
                    ...suggestion,
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

            <label className="flex flex-col gap-1 text-sm">
              Part of speech
              <select
                value={suggestion.pos}
                onChange={(e) =>
                  setSuggestion({
                    ...suggestion,
                    pos: e.target.value as WordSuggestion["pos"],
                    gender: e.target.value === "noun" ? suggestion.gender : null,
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

            {suggestion.pos === "noun" && (
              <label className="flex flex-col gap-1 text-sm">
                Gender
                <select
                  value={suggestion.gender ?? ""}
                  onChange={(e) =>
                    setSuggestion({
                      ...suggestion,
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("input");
                  setSuggestion(null);
                }}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
