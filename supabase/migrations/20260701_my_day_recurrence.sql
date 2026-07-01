-- My Day — recurring tasks.
--
-- A recurring task is a daily_goal that regenerates each period. All occurrences
-- of one recurring task share a series_id; each occurrence is its own goal row
-- with its own deadline and its own spread-out steps. When a period's deadline
-- passes, the client materializes the next occurrence (see use-my-day.ts).
--
-- Additive only — existing goals get recurrence 'none' and a NULL series_id.

ALTER TABLE daily_goals
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none','daily','weekly','monthly','quarterly','yearly'));

ALTER TABLE daily_goals
  ADD COLUMN IF NOT EXISTS recurrence_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Groups every occurrence of one recurring task. NULL for one-off goals.
ALTER TABLE daily_goals
  ADD COLUMN IF NOT EXISTS series_id UUID;

-- One occurrence per (series, deadline): a reload or a second device can't
-- create the same period twice. NULL series_id (one-offs) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_goals_series_deadline
  ON daily_goals(series_id, deadline)
  WHERE series_id IS NOT NULL;

-- Fast lookup of the active recurring series during rollover.
CREATE INDEX IF NOT EXISTS idx_daily_goals_recurring
  ON daily_goals(series_id)
  WHERE recurrence <> 'none' AND recurrence_active;
