-- Re-stamp scheduled occurrences when a duty's role or ownership changes.
--
-- Problem
-- -------
-- `save_operation_duty` and `set_duty_assignment` write the duty definition and
-- its dated assignment, but neither re-runs `materialize_duty_occurrences`.
-- The already-materialized rows in `tasks` therefore keep the OLD
-- `duty_role_group`, `duty_primary_profile_id`, `duty_primary_name` and
-- `assigned_to` forever.
--
-- Visible effect: changing which role owns a duty, or naming the person
-- responsible, appeared to do nothing. The command center kept filtering and
-- the crew sheets kept printing under the old role, with no owner name.
--
-- Fix
-- ---
-- Statement-level triggers that re-materialize the forward window whenever a
-- duty definition or a duty assignment changes. The materializer's
-- ON CONFLICT DO UPDATE only touches rows still `pending` (or cancelled by a
-- recurrence change), so completed, verified and in-progress history is
-- preserved exactly as it was.
--
-- Horizon
-- -------
-- 90 days. Measured on production: 90 days re-stamps ~6,300 occurrences in
-- ~2.6 s, which is acceptable inside an interactive save; a full 365-day pass
-- is roughly four times that and would make saving a duty feel broken. Nothing
-- the GM can see reaches past 90 days — the command center loads a 30-day
-- window and the crew sheets print at most 7 days — and occurrences beyond the
-- window are re-stamped by the next save or scheduled materialization.

CREATE OR REPLACE FUNCTION public.rematerialize_duties_after_change()
RETURNS TRIGGER AS $$
BEGIN
  -- One save touches operation_duties AND duty_assignments. Without this
  -- transaction-local guard the same window would be rebuilt twice per save.
  IF COALESCE(current_setting('app.duty_rematerialized', TRUE), '') = '1' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.duty_rematerialized', '1', TRUE);

  PERFORM public.materialize_duty_occurrences(CURRENT_DATE, CURRENT_DATE + 90);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rematerialize_duties_after_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS operation_duties_rematerialize ON public.operation_duties;
CREATE TRIGGER operation_duties_rematerialize
  AFTER INSERT OR UPDATE OR DELETE ON public.operation_duties
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.rematerialize_duties_after_change();

DROP TRIGGER IF EXISTS duty_assignments_rematerialize ON public.duty_assignments;
CREATE TRIGGER duty_assignments_rematerialize
  AFTER INSERT OR UPDATE OR DELETE ON public.duty_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.rematerialize_duties_after_change();

COMMENT ON FUNCTION public.rematerialize_duties_after_change() IS
  'Re-stamps pending duty occurrences (90-day window) after a duty definition '
  'or assignment changes, so role and owner changes reach tasks.duty_role_group '
  'and tasks.duty_primary_name. Completed history is never rewritten.';
