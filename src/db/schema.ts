import {
  pgSchema,
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  unique,
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
  },
  (table) => [unique().on(table.userId, table.wordId)],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id),
  preferredLevel: levelEnum("preferred_level"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
