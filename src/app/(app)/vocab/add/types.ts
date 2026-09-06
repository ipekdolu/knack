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

export { LEVELS, POS_VALUES, GENDERS };

export type WordSuggestion = {
  lemma: string;
  level: (typeof LEVELS)[number];
  pos: (typeof POS_VALUES)[number];
  gender: (typeof GENDERS)[number] | null;
};

export type BatchInferenceResult = {
  raw: string;
  suggestion: WordSuggestion | null;
  error: string | null;
};

// Batches keep a single flashcard creation session small and reviewable
// rather than turning into a bulk-import tool.
export const MAX_BATCH_WORDS = 10;
