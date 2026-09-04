-- Custom SQL migration file, put your code below! --

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_all" ON "user_settings"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
