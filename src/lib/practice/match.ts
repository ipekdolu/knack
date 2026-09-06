// Speech-to-text gives back no punctuation, inconsistent capitalization, and
// often mangles umlauts and long compounds. Matching a spoken sentence against
// the target text therefore has to be forgiving: this normalizes both sides
// and scores by word overlap rather than demanding an exact string.

export const MATCH_THRESHOLD = 0.8;

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    // Strip anything that isn't a letter, digit or space -- punctuation never
    // survives transcription anyway, so comparing it would only add noise.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export type MatchResult = {
  score: number;
  matched: boolean;
  /** Target words, in order, flagged with whether the transcript contained them. */
  words: { word: string; hit: boolean }[];
};

export function matchTranscript(target: string, transcript: string): MatchResult {
  const targetWords = normalize(target);
  const spoken = normalize(transcript);

  if (targetWords.length === 0) {
    return { score: 0, matched: false, words: [] };
  }

  // Multiset match: each spoken word can only account for one target word, so
  // repeating a single word can't inflate the score.
  const remaining = new Map<string, number>();
  for (const word of spoken) {
    remaining.set(word, (remaining.get(word) ?? 0) + 1);
  }

  const words = targetWords.map((word) => {
    const left = remaining.get(word) ?? 0;
    if (left > 0) {
      remaining.set(word, left - 1);
      return { word, hit: true };
    }
    return { word, hit: false };
  });

  const hits = words.filter((w) => w.hit).length;
  const score = hits / targetWords.length;

  return { score, matched: score >= MATCH_THRESHOLD, words };
}
