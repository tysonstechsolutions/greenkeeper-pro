-- ============================================================================
-- 90-day evaluations live next to yearly ones.
--
-- New hires get a 90-day evaluation dated from their hire date through the
-- 90-day mark. Someone hired on October 1 has a 90-day evaluation and a
-- yearly evaluation that both start on October 1, which the old rule of one
-- row per employee per start date did not allow.
--
-- Now there is one yearly-style row (annual, interim, separation) per
-- employee per start date, and separately one 90-day row per employee per
-- start date. Existing rows already satisfy both rules.
-- Idempotent.
-- ============================================================================

ALTER TABLE public.staff_evaluations
  DROP CONSTRAINT IF EXISTS staff_evaluations_one_per_period;

CREATE UNIQUE INDEX IF NOT EXISTS staff_evaluations_one_per_period
  ON public.staff_evaluations(employee_id, period_start)
  WHERE rating_reason <> 'ninety_day';

CREATE UNIQUE INDEX IF NOT EXISTS staff_evaluations_one_ninety_day_per_period
  ON public.staff_evaluations(employee_id, period_start)
  WHERE rating_reason = 'ninety_day';

NOTIFY pgrst, 'reload schema';
