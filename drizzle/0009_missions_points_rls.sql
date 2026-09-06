-- Custom SQL migration file, put your code below! --

ALTER TABLE "daily_missions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_missions_all" ON "daily_missions"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE "user_points" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_points_all" ON "user_points"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE "streak_repairs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streak_repairs_all" ON "streak_repairs"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
