-- Custom SQL migration file, put your code below! --

ALTER TABLE "generation_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generation_log_all" ON "generation_log"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
