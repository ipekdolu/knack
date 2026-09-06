CREATE TYPE "public"."word_content_kind" AS ENUM('flashcard', 'fill_blank');--> statement-breakpoint
CREATE TABLE "word_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"kind" "word_content_kind" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "cards_per_session" integer;--> statement-breakpoint
ALTER TABLE "user_word_progress" ADD COLUMN "is_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "word_content" ADD CONSTRAINT "word_content_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_content_word_kind_idx" ON "word_content" USING btree ("word_id","kind");