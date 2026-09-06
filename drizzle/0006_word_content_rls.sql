-- Custom SQL migration file, put your code below! --

-- Cached exercise content is derived from the globally-shared `words` table,
-- so it carries no user_id and is readable by any signed-in user. Writes only
-- ever happen server-side through the app's own connection (which bypasses
-- RLS as superuser), so no write policy is granted here.

ALTER TABLE "word_content" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "word_content_select" ON "word_content"
  FOR SELECT TO authenticated
  USING (true);
