-- My Day recurring tasks — canonical anchor date per occurrence.
--
-- Rollover advances the recurrence from anchor_deadline (the pattern's true
-- date), NOT from the occurrence's actual deadline. That lets "move just this
-- one" on the calendar shift a single occurrence's deadline without dragging the
-- whole series: the anchor stays put, so the next period still lands on the
-- original schedule. "Move whole series" moves the anchor too.
--
-- Backfill: existing recurring occurrences anchor to their current deadline
-- (no behavior change). One-off goals leave it NULL.

ALTER TABLE daily_goals
  ADD COLUMN IF NOT EXISTS anchor_deadline DATE;

UPDATE daily_goals
  SET anchor_deadline = deadline
  WHERE recurrence <> 'none' AND anchor_deadline IS NULL AND deadline IS NOT NULL;
