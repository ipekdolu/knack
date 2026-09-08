"use server";

import { or, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  words,
  exerciseLog,
  userWordProgress,
  userSettings,
  streakRepairs,
} from "@/db/schema";
import {
  requireUser,
  shuffle,
  applyProgressUpdate,
  computeStreak,
  LEVEL_ORDER,
  type Level,
  type MasteryStage,
} from "./shared";
import { createAnthropicClient, createMessage } from "@/lib/claude/client";
import { getOrCreateContent, wordIdsWithContent } from "./content-cache";

// speaking_read/speaking_prompt retired in Phase 12 -- speaking_conversation
// replaces both, handled by its own module (conversation.ts) rather than
// this shared session/generation pipeline (no target-word pool).
export type ExerciseType =
  | "flashcard"
  | "fill_blank"
  | "sentence"
  | "scenario"
  | "reading";

export type SessionWord = {
  wordId: string;
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
  type: ExerciseType;
  masteryStage: MasteryStage;
  isFlagged: boolean;
};

export type DashboardStats = {
  totalExercises: number;
  accuracyPct: number | null;
  wordsPracticed: number;
  mastery: { new: number; learning: number; mastered: number };
  level: string | null;
  dueToday: number;
  streak: number;
};

export type SessionResult = {
  words: SessionWord[];
  level: string | null;
};

export type FlashcardContent = {
  exampleSentence: string;
  gloss: string;
};

export type FillBlankContent = {
  sentence: string;
  options: string[];
  correctAnswer: string;
};

export async function getAvailableLevels(): Promise<string[]> {
  const user = await requireUser();

  const rows = await db
    .selectDistinct({ level: words.level })
    .from(words)
    .where(or(eq(words.source, "seed"), eq(words.userId, user.id)));

  return rows
    .map((r) => r.level)
    .sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
}

// Resolves which level a user's sessions/stats should use: their explicit
// setting if they've picked one, otherwise the lowest level they have words
// in. Returns null only if they have no words available at any level.
async function getEffectiveLevel(userId: string): Promise<string | null> {
  const [settingsRow] = await db
    .select({ preferredLevel: userSettings.preferredLevel })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  if (settingsRow?.preferredLevel) return settingsRow.preferredLevel;

  const rows = await db
    .selectDistinct({ level: words.level })
    .from(words)
    .where(or(eq(words.source, "seed"), eq(words.userId, userId)));

  if (rows.length === 0) return null;
  return rows
    .map((r) => r.level)
    .sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))[0];
}

// The conversational speaking module (Phase 12) has no target-word pool --
// it just needs the user's level, same resolution rule as everything else.
export async function getUserLevel(): Promise<string | null> {
  const user = await requireUser();
  return getEffectiveLevel(user.id);
}

const DUE_TARGET = 7;
const NEW_TARGET = 3;

const sessionWordCols = {
  id: words.id,
  lemma: words.lemma,
  level: words.level,
  pos: words.pos,
  gender: words.gender,
  masteryStage: userWordProgress.masteryStage,
  isFlagged: userWordProgress.isFlagged,
};

const DEFAULT_SESSION_SIZE = 10;

export async function startSession(
  type: ExerciseType,
  count?: number,
): Promise<SessionResult> {
  const user = await requireUser();
  const level = await getEffectiveLevel(user.id);
  if (!level) return { words: [], level: null };

  if (count === undefined) {
    const [settingsRow] = await db
      .select({ cardsPerSession: userSettings.cardsPerSession })
      .from(userSettings)
      .where(eq(userSettings.userId, user.id));
    count = settingsRow?.cardsPerSession ?? DEFAULT_SESSION_SIZE;
  }
  const sessionSize: number = count;

  const scopeWhere = and(
    or(eq(words.source, "seed"), eq(words.userId, user.id)),
    eq(words.level, level as Level),
  );

  // Due: already-seen words whose next_due_at has passed, most overdue first.
  const dueCandidates = await db
    .select(sessionWordCols)
    .from(words)
    .innerJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(and(scopeWhere, sql`${userWordProgress.nextDueAt} <= now()`))
    .orderBy(sql`${userWordProgress.nextDueAt} asc`)
    .limit(sessionSize);

  // New: never-seen words (no progress row at all), random order.
  const newCandidates = await db
    .select(sessionWordCols)
    .from(words)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(and(scopeWhere, sql`${userWordProgress.id} is null`))
    .orderBy(sql`random()`)
    .limit(sessionSize);

  const pickedIds = new Set<string>();
  const picked: SessionWord[] = [];

  type CandidateRow = {
    id: string;
    lemma: string;
    level: Level;
    pos: string;
    gender: "der" | "die" | "das" | null;
    masteryStage: MasteryStage | null;
    isFlagged: boolean | null;
  };

  function addFrom(pool: CandidateRow[], max: number) {
    let added = 0;
    for (const row of pool) {
      if (added >= max || picked.length >= sessionSize) break;
      if (pickedIds.has(row.id)) continue;
      pickedIds.add(row.id);
      picked.push({
        wordId: row.id,
        lemma: row.lemma,
        level: row.level,
        pos: row.pos,
        gender: row.gender,
        type,
        masteryStage: row.masteryStage ?? "new",
        isFlagged: row.isFlagged ?? false,
      });
      added++;
    }
  }

  addFrom(dueCandidates, DUE_TARGET);
  addFrom(newCandidates, NEW_TARGET);
  // Backfill: whichever pool has slack, then anything else at this level.
  if (picked.length < sessionSize) addFrom(dueCandidates, sessionSize);
  if (picked.length < sessionSize) addFrom(newCandidates, sessionSize);

  if (picked.length < sessionSize) {
    const fallback = await db
      .select(sessionWordCols)
      .from(words)
      .leftJoin(
        userWordProgress,
        and(
          eq(userWordProgress.wordId, words.id),
          eq(userWordProgress.userId, user.id),
        ),
      )
      .where(scopeWhere)
      .orderBy(sql`random()`)
      .limit(sessionSize * 2);
    addFrom(fallback, sessionSize);
  }

  return { words: shuffle(picked), level };
}

// Start Learning: never-seen words only, at the user's level, with no due
// words mixed in -- Review already covers the due+new blend, this is for
// someone who just wants fresh vocabulary.
export async function getNewWords(count?: number): Promise<SessionWord[]> {
  const user = await requireUser();
  const level = await getEffectiveLevel(user.id);
  if (!level) return [];

  if (count === undefined) {
    const [settingsRow] = await db
      .select({ cardsPerSession: userSettings.cardsPerSession })
      .from(userSettings)
      .where(eq(userSettings.userId, user.id));
    count = settingsRow?.cardsPerSession ?? DEFAULT_SESSION_SIZE;
  }

  const rows = await db
    .select(sessionWordCols)
    .from(words)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(
      and(
        or(eq(words.source, "seed"), eq(words.userId, user.id)),
        eq(words.level, level as Level),
        sql`${userWordProgress.id} is null`,
      ),
    )
    .orderBy(sql`random()`)
    .limit(count);

  return rows.map((row) => ({
    wordId: row.id,
    lemma: row.lemma,
    level: row.level,
    pos: row.pos,
    gender: row.gender,
    type: "flashcard" as const,
    masteryStage: "new" as const,
    isFlagged: row.isFlagged ?? false,
  }));
}

// Level practice: a pure random sample of every word at the user's level,
// seen or not -- deliberately ignores user_word_progress for *selection*
// (still left-joined so the UI can show an accurate mastery badge). This is
// what stops fill-blank/reading from being answerable by recognizing a
// word the learner has drilled a hundred times; "My words" (startSession)
// stays the recognition-friendly, SRS-anchored mode.
export async function getLevelPracticeWords(
  type: ExerciseType,
  count?: number,
): Promise<SessionResult> {
  const user = await requireUser();
  const level = await getEffectiveLevel(user.id);
  if (!level) return { words: [], level: null };

  if (count === undefined) {
    const [settingsRow] = await db
      .select({ cardsPerSession: userSettings.cardsPerSession })
      .from(userSettings)
      .where(eq(userSettings.userId, user.id));
    count = settingsRow?.cardsPerSession ?? DEFAULT_SESSION_SIZE;
  }

  const rows = await db
    .select(sessionWordCols)
    .from(words)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(
      and(
        or(eq(words.source, "seed"), eq(words.userId, user.id)),
        eq(words.level, level as Level),
      ),
    )
    .orderBy(sql`random()`)
    .limit(count);

  return {
    words: rows.map((row) => ({
      wordId: row.id,
      lemma: row.lemma,
      level: row.level,
      pos: row.pos,
      gender: row.gender,
      type,
      masteryStage: row.masteryStage ?? "new",
      isFlagged: row.isFlagged ?? false,
    })),
    level,
  };
}

// Difficult pool: manually flagged OR auto-flagged by weak accuracy (at
// least 3 attempts and under 50% correct). Manual flags surface regardless
// of accuracy -- the point is user judgment can override the average.
const MIN_ATTEMPTS_FOR_AUTO_DIFFICULT = 3;
const AUTO_DIFFICULT_ACCURACY_THRESHOLD = 0.5;

export async function getDifficultWords(count = 20): Promise<SessionWord[]> {
  const user = await requireUser();

  const rows = await db
    .select(sessionWordCols)
    .from(words)
    .innerJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(
      and(
        or(eq(words.source, "seed"), eq(words.userId, user.id)),
        or(
          eq(userWordProgress.isFlagged, true),
          and(
            sql`${userWordProgress.timesSeen} >= ${MIN_ATTEMPTS_FOR_AUTO_DIFFICULT}`,
            sql`${userWordProgress.timesCorrect}::float / nullif(${userWordProgress.timesSeen}, 0) < ${AUTO_DIFFICULT_ACCURACY_THRESHOLD}`,
          ),
        ),
      ),
    )
    .orderBy(sql`random()`)
    .limit(count);

  return shuffle(
    rows.map((row) => ({
      wordId: row.id,
      lemma: row.lemma,
      level: row.level,
      pos: row.pos,
      gender: row.gender,
      type: "flashcard" as const,
      masteryStage: row.masteryStage ?? "new",
      isFlagged: row.isFlagged ?? false,
    })),
  );
}

// Speed Review: already-seen words only, and only ones that already have a
// cached flashcard variant -- the drill is timed, so it can't afford a
// Claude generation mid-run. A brand-new word (no progress row yet) or a
// seen word with no cached content would still force one, so both are
// filtered out here rather than left to getOrCreateContent's fallback.
export async function getSeenWordsWithFlashcardContent(
  count: number,
): Promise<SessionWord[]> {
  const user = await requireUser();
  const level = await getEffectiveLevel(user.id);
  if (!level) return [];

  const scopeWhere = and(
    or(eq(words.source, "seed"), eq(words.userId, user.id)),
    eq(words.level, level as Level),
  );

  // A wider candidate pool than `count` since some will get filtered out
  // for lacking cached content.
  const seenRows = await db
    .select(sessionWordCols)
    .from(words)
    .innerJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, words.id),
        eq(userWordProgress.userId, user.id),
      ),
    )
    .where(scopeWhere)
    .orderBy(sql`random()`)
    .limit(count * 3);

  const cachedIds = await wordIdsWithContent(
    seenRows.map((r) => r.id),
    "flashcard",
  );
  const withCache = seenRows.filter((r) => cachedIds.has(r.id));
  const chosen = (withCache.length > 0 ? withCache : seenRows).slice(0, count);

  return shuffle(
    chosen.map((row) => ({
      wordId: row.id,
      lemma: row.lemma,
      level: row.level,
      pos: row.pos,
      gender: row.gender,
      type: "flashcard" as const,
      masteryStage: row.masteryStage ?? "new",
      isFlagged: row.isFlagged ?? false,
    })),
  );
}

// Meanings for a hover tooltip -- reuses the flashcard content cache
// (same gloss shown on the flashcard back) rather than a fresh translation
// call, so repeat lookups for the same word are instant.
export async function getWordGlosses(
  wordList: {
    wordId: string;
    lemma: string;
    level: string;
    pos: string;
    gender: string | null;
  }[],
): Promise<Record<string, string>> {
  await requireUser();
  const entries = await Promise.all(
    wordList.map(async (word) => {
      const content = await generateFlashcard(word);
      return [word.wordId, content.gloss] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function toggleWordFlag(wordId: string): Promise<boolean> {
  const user = await requireUser();

  const [existing] = await db
    .select({ isFlagged: userWordProgress.isFlagged })
    .from(userWordProgress)
    .where(
      and(
        eq(userWordProgress.userId, user.id),
        eq(userWordProgress.wordId, wordId),
      ),
    );

  const nextFlagged = !(existing?.isFlagged ?? false);

  await db
    .insert(userWordProgress)
    .values({ userId: user.id, wordId, isFlagged: nextFlagged })
    .onConflictDoUpdate({
      target: [userWordProgress.userId, userWordProgress.wordId],
      set: { isFlagged: nextFlagged },
    });

  return nextFlagged;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const user = await requireUser();

  const [agg] = await db
    .select({
      totalExercises: sql<number>`count(*)::int`,
      accuracyPct: sql<number | null>`round(avg(${exerciseLog.score}) * 100)::int`,
    })
    .from(exerciseLog)
    .where(eq(exerciseLog.userId, user.id));

  const wordsPracticedResult = await db.execute<{ count: number }>(
    sql`select count(distinct w)::int as count from exercise_log, unnest(word_ids) as w where user_id = ${user.id}`,
  );
  const wordsPracticed = Number(wordsPracticedResult[0]?.count ?? 0);

  const [totalWordsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(words)
    .where(or(eq(words.source, "seed"), eq(words.userId, user.id)));
  const totalWords = totalWordsRow?.count ?? 0;

  const stageCounts = await db
    .select({
      stage: userWordProgress.masteryStage,
      count: sql<number>`count(*)::int`,
    })
    .from(userWordProgress)
    .where(eq(userWordProgress.userId, user.id))
    .groupBy(userWordProgress.masteryStage);

  const learning = stageCounts.find((s) => s.stage === "learning")?.count ?? 0;
  const mastered = stageCounts.find((s) => s.stage === "mastered")?.count ?? 0;
  const explicitNew = stageCounts.find((s) => s.stage === "new")?.count ?? 0;
  const untouched = Math.max(totalWords - learning - mastered - explicitNew, 0);

  const level = await getEffectiveLevel(user.id);
  let dueToday = 0;
  if (level) {
    const [dueRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userWordProgress)
      .innerJoin(words, eq(words.id, userWordProgress.wordId))
      .where(
        and(
          eq(userWordProgress.userId, user.id),
          eq(words.level, level as Level),
          sql`${userWordProgress.nextDueAt} <= now()`,
        ),
      );
    dueToday = dueRow?.count ?? 0;
  }

  const practiceDays = await db.execute<{ day: string }>(
    sql`select distinct to_char(${exerciseLog.createdAt} at time zone 'utc', 'YYYY-MM-DD') as day from exercise_log where user_id = ${user.id}`,
  );
  const repairedDays = await db
    .select({ date: streakRepairs.date })
    .from(streakRepairs)
    .where(eq(streakRepairs.userId, user.id));
  const activeDays = new Set(practiceDays.map((r) => r.day));
  for (const r of repairedDays) activeDays.add(r.date);
  const streak = computeStreak(activeDays);

  return {
    totalExercises: agg?.totalExercises ?? 0,
    accuracyPct: agg?.accuracyPct ?? null,
    wordsPracticed,
    mastery: { new: explicitNew + untouched, learning, mastered },
    level,
    dueToday,
    streak,
  };
}


async function callFlashcardModel(word: {
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
}): Promise<FlashcardContent> {
  const anthropic = createAnthropicClient();
  const wordDesc = word.gender ? `${word.gender} ${word.lemma}` : word.lemma;
  const response = await createMessage(anthropic, {
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      "You write flashcard content for a German vocabulary learning app, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write flashcard content for the German ${word.pos} "${wordDesc}" at CEFR level ${word.level}. Provide a natural example sentence using the word, appropriate for a learner at this level, and a short, plain English gloss (a few words, not a full sentence). Call the flashcard_content tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "flashcard_content",
        description: "Record flashcard content for a vocabulary word.",
        input_schema: {
          type: "object",
          properties: {
            example_sentence: { type: "string" },
            gloss: {
              type: "string",
              description:
                "Short, plain English translation of the word as used in the example sentence.",
            },
          },
          required: ["example_sentence", "gloss"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "flashcard_content" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return flashcard content");
  }
  const input = toolUse.input as { example_sentence: string; gloss: string };
  return { exampleSentence: input.example_sentence, gloss: input.gloss };
}

export async function generateFlashcard(
  word: {
    wordId: string;
    lemma: string;
    level: string;
    pos: string;
    gender: string | null;
  },
  options: { allowNewVariant?: boolean } = {},
): Promise<FlashcardContent> {
  await requireUser();
  return getOrCreateContent(
    word.wordId,
    "flashcard",
    () => callFlashcardModel(word),
    options,
  );
}

async function callFillBlankModel(word: {
  lemma: string;
  level: string;
  pos: string;
  gender: string | null;
}): Promise<FillBlankContent> {
  const anthropic = createAnthropicClient();
  const wordDesc = word.gender ? `${word.gender} ${word.lemma}` : word.lemma;
  const response = await createMessage(anthropic, {
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You write fill-in-the-blank exercises for a German vocabulary learning app, calibrated to CEFR levels.",
    messages: [
      {
        role: "user",
        content: `Write a fill-in-the-blank exercise for the German ${word.pos} "${wordDesc}" at CEFR level ${word.level}. Write a natural German sentence at this level that uses the word (inflected/conjugated as natural for the sentence), then replace that word with the exact placeholder "_____". Provide the exact word form that correctly fills the blank.

Then provide exactly three distractor words. These are the whole point of the exercise, so get them right:
- Each distractor must be a real German word at the SAME CEFR level (${word.level}) as the target word -- not simpler, not harder. A distractor that's obviously below or above the learner's level gives it away without any thought.
- Each distractor must be grammatically well-formed in the blank's exact slot: same part of speech, and correctly inflected/conjugated for this sentence's case, gender, number, tense, and person, just like the correct answer. A distractor that merely "sounds wrong" grammatically lets the learner eliminate it without understanding the sentence at all -- the only thing that should be wrong about a distractor is its meaning in context.
- Each distractor should be semantically plausible enough in isolation that only understanding what the sentence actually says rules it out -- not a word so unrelated that it stands out as the odd one out by pure association.

Call the fill_blank_content tool with your answer.`,
      },
    ],
    tools: [
      {
        name: "fill_blank_content",
        description: "Record a fill-in-the-blank exercise.",
        input_schema: {
          type: "object",
          properties: {
            sentence: {
              type: "string",
              description:
                "German sentence with the target word replaced by the placeholder _____.",
            },
            correct_answer: { type: "string" },
            distractors: {
              type: "array",
              items: { type: "string" },
              description:
                "Exactly three same-level, correctly-inflected, grammatically valid-in-context distractors -- wrong only in meaning, not in form or difficulty.",
            },
          },
          required: ["sentence", "correct_answer", "distractors"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "fill_blank_content" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a fill-in-the-blank exercise");
  }
  const input = toolUse.input as {
    sentence: string;
    correct_answer: string;
    distractors: string[];
  };

  return {
    sentence: input.sentence,
    correctAnswer: input.correct_answer,
    options: shuffle([input.correct_answer, ...input.distractors]),
  };
}

export async function generateFillBlank(
  word: {
    wordId: string;
    lemma: string;
    level: string;
    pos: string;
    gender: string | null;
  },
  options: { allowNewVariant?: boolean } = {},
): Promise<FillBlankContent> {
  await requireUser();
  return getOrCreateContent(
    word.wordId,
    "fill_blank",
    () => callFillBlankModel(word),
    options,
  );
}

export async function logExerciseResult(entry: {
  wordId: string;
  type: ExerciseType;
  correct: boolean;
  userResponse: string;
  // False for fill-blank answered in "Level practice" mode -- that pool is
  // random-at-level rather than SRS-driven, so a hit or miss on a word the
  // learner never chose to drill shouldn't move its mastery stage or
  // scheduling. Still logged to exercise_log either way for stats.
  updateMastery?: boolean;
}): Promise<void> {
  const user = await requireUser();

  await db.transaction(async (tx) => {
    await tx.insert(exerciseLog).values({
      userId: user.id,
      wordIds: [entry.wordId],
      exerciseType: entry.type,
      userResponse: entry.userResponse,
      score: entry.correct ? 1 : 0,
    });

    if (entry.updateMastery ?? true) {
      await applyProgressUpdate(tx, user.id, entry.wordId, entry.correct);
    }
  });
}
