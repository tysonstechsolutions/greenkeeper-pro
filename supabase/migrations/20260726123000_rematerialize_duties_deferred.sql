-- Correct the trigger timing introduced in 20260726120000.
--
-- What was wrong
-- --------------
-- The first version used statement-level AFTER triggers plus a
-- transaction-local "already done" guard. One duty save touches BOTH
-- `operation_duties` and `duty_assignments`, so the guard meant the
-- rematerialization ran on the FIRST of those statements and was skipped for
-- the rest — re-stamping occurrences from a half-applied state and then
-- ignoring the changes that followed.
--
-- Proven on production: updating a duty's role_group re-stamped its
-- occurrences correctly, but changing it back inside the same transaction left
-- the occurrences on the old value while the duty definition read the new one.
--
-- The fix
-- -------
-- Deferrable constraint triggers, INITIALLY DEFERRED, so the work happens once
-- at COMMIT — after every statement in the save has landed. The guard is kept
-- so a bulk change (e.g. seeding 155 duties) still rebuilds the window once
-- rather than once per row.

DROP TRIGGER IF EXISTS operation_duties_rematerialize ON public.operation_duties;
DROP TRIGGER IF EXISTS duty_assignments_rematerialize ON public.duty_assignments;

CREATE CONSTRAINT TRIGGER operation_duties_rematerialize
  AFTER INSERT OR UPDATE OR DELETE ON public.operation_duties
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.rematerialize_duties_after_change();

CREATE CONSTRAINT TRIGGER duty_assignments_rematerialize
  AFTER INSERT OR UPDATE OR DELETE ON public.duty_assignments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.rematerialize_duties_after_change();
