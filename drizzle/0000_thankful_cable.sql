CREATE TYPE "public"."exercise_type" AS ENUM('flashcard', 'fill_blank', 'sentence', 'scenario');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('der', 'die', 'das');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1');--> statement-breakpoint
CREATE TYPE "public"."mastery_stage" AS ENUM('new', 'learning', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."word_source" AS ENUM('seed', 'manual');--> statement-breakpoint
CREATE TABLE "exercise_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_ids" uuid[] NOT NULL,
	"exercise_type" "exercise_type" NOT NULL,
	"user_response" text,
	"score" integer,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_word_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"mastery_stage" "mastery_stage" DEFAULT 'new' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"next_due_at" timestamp with time zone,
	"correct_streak" integer DEFAULT 0 NOT NULL,
	"times_seen" integer DEFAULT 0 NOT NULL,
	"times_correct" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_word_progress_user_id_word_id_unique" UNIQUE("user_id","word_id")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lemma" text NOT NULL,
	"level" "level" NOT NULL,
	"pos" text NOT NULL,
	"gender" "gender",
	"category" text,
	"source" "word_source" DEFAULT 'seed' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_log" ADD CONSTRAINT "exercise_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_progress" ADD CONSTRAINT "user_word_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_progress" ADD CONSTRAINT "user_word_progress_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;