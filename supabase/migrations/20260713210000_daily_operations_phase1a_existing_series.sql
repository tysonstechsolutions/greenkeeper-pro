-- Phase 1A production follow-up: materialize series for duties that existed
-- before the Phase 1A trigger was installed.
--
-- The original backfill updated only updated_at, but the trigger is declared
-- as UPDATE OF title/days/recurrence fields. Updating title to its existing
-- value deliberately fires that trigger without changing recorded duty data.

BEGIN;

UPDATE public.operation_duties od
SET
  title = od.title,
  updated_at = COALESCE(od.updated_at, NOW());

SELECT public.materialize_duty_occurrences(CURRENT_DATE, CURRENT_DATE + 60);

NOTIFY pgrst, 'reload schema';

COMMIT;
