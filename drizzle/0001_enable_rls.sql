-- Custom SQL migration file, put your code below! --

-- Defense-in-depth: the app's own DATABASE_URL connection runs as the
-- `postgres` role and bypasses RLS entirely (superusers always do), so the
-- real access control lives in server-side query code. These policies exist
-- to lock things down if a client ever queries Supabase directly with a
-- user JWT (e.g. via supabase-js/PostgREST) instead of going through Drizzle.

ALTER TABLE "words" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_word_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercise_log" ENABLE ROW LEVEL SECURITY;

-- words: seeded vocab is globally readable; manually-added words are
-- only visible/editable by the user who added them.
CREATE POLICY "words_select" ON "words"
  FOR SELECT TO authenticated
  USING (source = 'seed' OR user_id = auth.uid());

CREATE POLICY "words_insert" ON "words"
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "words_update" ON "words"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "words_delete" ON "words"
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- user_word_progress: fully private to the owning user.
CREATE POLICY "user_word_progress_all" ON "user_word_progress"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- exercise_log: fully private to the owning user.
CREATE POLICY "exercise_log_all" ON "exercise_log"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
