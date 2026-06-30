-- My Day - personal daily plan with AI breakdown + rollover.
--
-- daily_goals: the things you add (a task + optional deadline). The AI breaks
--   each into daily_steps. A quick one-off to-do can be a step with no goal.
-- daily_steps: the small, checkable items. target_date is the day it's planned
--   (NULL = rolling backlog). "Today" = not-done steps with target_date <= today,
--   so undone work rolls forward with no nightly job. source/source_ref let app
--   events (e.g. a PR marked received) create steps idempotently + link back.

CREATE TABLE IF NOT EXISTS daily_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  detail TEXT,
  deadline DATE,
  -- Finish this many days BEFORE the deadline (buffer so nothing rushes the
  -- final day). Steps are spread from today to (deadline - buffer_days).
  buffer_days INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','archived')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES daily_goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- Day this step is planned for. NULL = rolling backlog (no fixed day).
  target_date DATE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Time-sensitive flag (e.g. the 24h "paperwork to Building 1" task).
  urgent BOOLEAN NOT NULL DEFAULT FALSE,
  -- Provenance: 'manual' | 'ai' | 'pr_received' | etc. source_ref dedupes
  -- app-generated steps (e.g. the pr_audit id) so re-triggering won't duplicate.
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view daily_goals" ON daily_goals;
DROP POLICY IF EXISTS "Authenticated can manage daily_goals" ON daily_goals;
DROP POLICY IF EXISTS "Authenticated can view daily_steps" ON daily_steps;
DROP POLICY IF EXISTS "Authenticated can manage daily_steps" ON daily_steps;

CREATE POLICY "Authenticated can view daily_goals" ON daily_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage daily_goals" ON daily_goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can view daily_steps" ON daily_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage daily_steps" ON daily_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_steps_open ON daily_steps(done, target_date);
CREATE INDEX IF NOT EXISTS idx_daily_steps_goal ON daily_steps(goal_id);
-- Dedup app-generated steps: at most one open step per (source, source_ref).
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_steps_source
  ON daily_steps(source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_goals_status ON daily_goals(status);
