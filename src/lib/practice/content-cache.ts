import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { wordContent } from "@/db/schema";

export type ContentKind = "flashcard" | "fill_blank";

// How many distinct versions we'll accumulate per (word, kind). Spaced
// repetition shows the same word many times, so a single cached sentence
// would let you answer from memory of the exercise rather than the word.
const MAX_VARIANTS = 3;
// Chance of generating a fresh variant when the pool isn't full yet. Kept
// low so the common path is a cache hit; the session's prefetch hides the
// occasional generation entirely.
const NEW_VARIANT_CHANCE = 0.25;

export async function readVariants<T>(
  wordId: string,
  kind: ContentKind,
): Promise<T[]> {
  const rows = await db
    .select({ content: wordContent.content })
    .from(wordContent)
    .where(and(eq(wordContent.wordId, wordId), eq(wordContent.kind, kind)));
  return rows.map((r) => r.content as T);
}

async function storeVariant<T>(
  wordId: string,
  kind: ContentKind,
  content: T,
): Promise<void> {
  await db.insert(wordContent).values({
    wordId,
    kind,
    content: content as object,
  });
}

/**
 * Returns cached content for a word, generating it only when the pool is
 * empty or (occasionally) when it still has room to grow.
 *
 * `allowNewVariant` lets a caller insist on the fast path -- Speed Review
 * passes false, because a timed drill can't afford a generation mid-run.
 */
export async function getOrCreateContent<T>(
  wordId: string,
  kind: ContentKind,
  generate: () => Promise<T>,
  { allowNewVariant = true }: { allowNewVariant?: boolean } = {},
): Promise<T> {
  const existing = await readVariants<T>(wordId, kind);

  if (existing.length === 0) {
    const fresh = await generate();
    await storeVariant(wordId, kind, fresh);
    return fresh;
  }

  const roomToGrow = existing.length < MAX_VARIANTS;
  if (allowNewVariant && roomToGrow && Math.random() < NEW_VARIANT_CHANCE) {
    const fresh = await generate();
    await storeVariant(wordId, kind, fresh);
    return fresh;
  }

  return existing[Math.floor(Math.random() * existing.length)];
}

/** Word IDs that already have cached content of this kind. */
export async function wordIdsWithContent(
  wordIds: string[],
  kind: ContentKind,
): Promise<Set<string>> {
  if (wordIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ wordId: wordContent.wordId })
    .from(wordContent)
    .where(
      and(
        eq(wordContent.kind, kind),
        sql`${wordContent.wordId} = ANY(${wordIds}::uuid[])`,
      ),
    );
  return new Set(rows.map((r) => r.wordId));
}
