-- ============================================================================
-- Obligations: schedule START date (effective_from).
--
-- THE GAP THIS CLOSES
--   The scheduling engine generates occurrences from the period CONTAINING
--   created_at. Obligations seeded in July with a July due_day therefore read
--   as OVERDUE the moment they exist — a July-1 monthly item added Jul 15 shows
--   a missed July occurrence. There is no dishonest way to mark those "done";
--   the honest fix is to say the schedule STARTS in August, so no July (or
--   earlier) occurrence is ever owed.
--
--   effective_from is the local schedule start. The engine excludes any
--   occurrence whose due date falls before it. NULL keeps the legacy behavior
--   (start at created_at), so this column is purely additive — no existing row
--   changes meaning until it is set.
--
-- Additive + idempotent throughout: ADD COLUMN IF NOT EXISTS, and the backfill
-- only touches active rows that don't already have a value, so re-running it
-- never clobbers a manually chosen start date.
-- ============================================================================

ALTER TABLE public.obligations
  ADD COLUMN IF NOT EXISTS effective_from DATE;

COMMENT ON COLUMN public.obligations.effective_from IS
  'Local schedule start (YYYY-MM-DD). Occurrences whose due date is before this are never owed. NULL = start at created_at (legacy).';

-- Reschedule the whole active set to start in August 2026 so the July seed
-- dates stop reading as overdue. Weekly rows start on the first SUNDAY of
-- August (Aug 2 2026) so the first Sun–Sat week doesn't dip back into July;
-- every other cadence starts Aug 1 2026. WHERE effective_from IS NULL keeps
-- this idempotent — a manually set start is left untouched.
UPDATE public.obligations
SET effective_from = CASE cadence
    WHEN 'weekly' THEN DATE '2026-08-02'
    ELSE DATE '2026-08-01'
  END
WHERE is_active AND effective_from IS NULL;

notify pgrst, 'reload schema';
