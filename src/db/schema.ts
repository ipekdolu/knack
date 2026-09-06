import {
  pgSchema,
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

// Supabase Auth manages this table; we only reference it for foreign keys.
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const levelEnum = pgEnum("level", ["A1", "A2", "B1", "B2", "C1"]);
export const genderEnum = pgEnum("gender", ["der", "die", "das"]);
export const wordSourceEnum = pgEnum("word_source", ["seed", "manual"]);
export const masteryStageEnum = pgEnum("mastery_stage", [
  "new",
  "learning",
  "mastered",
]);
export const exerciseTypeEnum = pgEnum("exercise_type", [
  "flashcard",
  "fill_blank",
  "sentence",
  "scenario",
  "speaking_read",
  "speaking_prompt",
  "reading",
]);

export const words = pgTable("words", {
  id: uuid("id").primaryKey().defaultRandom(),
  lemma: text("lemma").notNull(),
  level: levelEnum("level").notNull(),
  pos: text("pos").notNull(),
  gender: genderEnum("gender"),
  category: text("category"),
  source: wordSourceEnum("source").notNull().default("seed"),
  userId: uuid("user_id").references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userWordProgress = pgTable(
  "user_word_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    wordId: uuid("word_id")
      .notNull()
      .references(() => words.id),
    masteryStage: masteryStageEnum("mastery_stage").notNull().default("new"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    correctStreak: integer("correct_streak").notNull().default(0),
    timesSeen: integer("times_seen").notNull().default(0),
    timesCorrect: integer("times_correct").notNull().default(0),
    // User-starred as difficult; unions with the auto low-accuracy pool.
    isFlagged: boolean("is_flagged").notNull().default(false),
  },
  (table) => [unique().on(table.userId, table.wordId)],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id),
  preferredLevel: levelEnum("preferred_level"),
  cardsPerSession: integer("cards_per_session"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wordContentKindEnum = pgEnum("word_content_kind", [
  "flashcard",
  "fill_blank",
]);

// Generated exercise content, cached per word so repeat reviews don't
// regenerate identical material. Several rows per (word, kind) form a small
// variant pool, so a word you see often doesn't always show the same sentence.
export const wordContent = pgTable(
  "word_content",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wordId: uuid("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    kind: wordContentKindEnum("kind").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("word_content_word_kind_idx").on(table.wordId, table.kind)],
);

export const exerciseLog = pgTable("exercise_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id),
  wordIds: uuid("word_ids").array().notNull(),
  exerciseType: exerciseTypeEnum("exercise_type").notNull(),
  userResponse: text("user_response"),
  score: integer("score"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
