-- ============================================================================
-- Obligations: weekly cadence + a real owner.
--
-- TWO GAPS THIS CLOSES
--  1. cadence was CHECK IN ('monthly','quarterly','annual') — there was no
--     WEEKLY. The Kronos timecard fix is a hard weekly deadline (pay period
--     runs Sun–Sat; the fix is due first thing Monday), so it could not be
--     modeled at all.
--  2. obligations had NO owner column — `delegable BOOLEAN` was the only nod to
--     ownership. An obligation could come due and belong to nobody, and it
--     appeared on Today but in no one's My Day. See
--     docs/audit/standards-execution-audit-2026-07-15.md §5.
--
-- Additive throughout: widens the cadence set, adds nullable columns. No
-- existing obligation changes meaning.
-- ============================================================================

-- ── 1. Allow weekly ────────────────────────────────────────────────────────
ALTER TABLE public.obligations DROP CONSTRAINT IF EXISTS obligations_cadence_check;
ALTER TABLE public.obligations
  ADD CONSTRAINT obligations_cadence_check
  CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'annual'));

-- The annual rule must not fire for weekly rows (weekly has no due_month).
ALTER TABLE public.obligations DROP CONSTRAINT IF EXISTS obligations_annual_due_month_check;
ALTER TABLE public.obligations
  ADD CONSTRAINT obligations_annual_due_month_check
  CHECK (cadence <> 'annual' OR due_month IS NOT NULL);

-- ── 2. Weekly due weekday ──────────────────────────────────────────────────
ALTER TABLE public.obligations
  ADD COLUMN IF NOT EXISTS due_weekday INT;

ALTER TABLE public.obligations DROP CONSTRAINT IF EXISTS obligations_due_weekday_check;
ALTER TABLE public.obligations
  ADD CONSTRAINT obligations_due_weekday_check
  CHECK (due_weekday IS NULL OR (due_weekday >= 0 AND due_weekday <= 6));

-- A weekly obligation must say which day it lands on.
ALTER TABLE public.obligations DROP CONSTRAINT IF EXISTS obligations_weekly_needs_weekday;
ALTER TABLE public.obligations
  ADD CONSTRAINT obligations_weekly_needs_weekday
  CHECK (cadence <> 'weekly' OR due_weekday IS NOT NULL);

COMMENT ON COLUMN public.obligations.due_weekday IS
  'weekly only: 0=Sunday .. 6=Saturday. Pay periods run Sun–Sat, so a Monday (1) deadline closes the week that just ended.';

-- ── 3. Ownership ───────────────────────────────────────────────────────────
-- NULL is meaningful: nobody owns it. That is a gap to surface, never to guess.
ALTER TABLE public.obligations
  ADD COLUMN IF NOT EXISTS owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS backup_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- What proves it was done. Mirrors operation_duties.evidence_requirements.
  ADD COLUMN IF NOT EXISTS evidence_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_it_matters TEXT;

CREATE INDEX IF NOT EXISTS idx_obligations_owner
  ON public.obligations(owner_profile_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_obligations_unowned
  ON public.obligations(cadence) WHERE is_active AND owner_profile_id IS NULL;

COMMENT ON COLUMN public.obligations.owner_profile_id IS
  'Who is accountable. NULL = nobody — surfaced as an ownership gap, never auto-assigned.';

notify pgrst, 'reload schema';
