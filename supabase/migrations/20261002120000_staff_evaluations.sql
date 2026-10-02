-- ============================================================================
-- Yearly performance evaluations.
--
-- One row per employee per rating period. The GM answers a short interview
-- (a tap rating per performance element plus a few short notes); the app
-- pulls in what it already knows about the period (call-outs, sick time,
-- 1:1s, follow-ups, certifications) and drafts the written sections. The row
-- keeps everything needed to re-print the paperwork on any form layout:
--
--   ratings    { element_key: 1..5 }
--   answers    { question_id: text }     — the GM's raw words
--   narrative  { section_key: text, elements: { element_key: text } }
--   facts      snapshot of the period facts the draft was written from
--
-- Same trust boundary as 1:1 sessions: only active managers or the
-- employee's recorded direct supervisor can see or write a row. Rows are
-- never deleted. A finalized evaluation is locked; only a manager can reopen
-- it back to draft (e.g. to correct it before it's signed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.staff_evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  period_label    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'final')),
  ratings         JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_rating  SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  answers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative       JSONB NOT NULL DEFAULT '{}'::jsonb,
  facts           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Which form layout the answers were collected for, so a later layout
  -- change never silently misreads an older evaluation.
  form_version    TEXT NOT NULL DEFAULT 'generic-v1',
  finalized_at    TIMESTAMPTZ,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_evaluations_period_order CHECK (period_end >= period_start),
  CONSTRAINT staff_evaluations_one_per_period UNIQUE (employee_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_staff_evaluations_period
  ON public.staff_evaluations(period_start, employee_id);

-- ── Triggers ────────────────────────────────────────────────────────────────

-- Actor attribution (created_by / updated_by from auth.uid(); employee_id is
-- immutable). Shared with the other private staff tables.
DROP TRIGGER IF EXISTS trg_attribute_staff_evaluations ON public.staff_evaluations;
CREATE TRIGGER trg_attribute_staff_evaluations
  BEFORE INSERT OR UPDATE ON public.staff_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

DROP TRIGGER IF EXISTS trg_staff_evaluations_updated_at ON public.staff_evaluations;
CREATE TRIGGER trg_staff_evaluations_updated_at
  BEFORE UPDATE ON public.staff_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.one_on_one_set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_staff_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Evaluations cannot be deleted; reopen and correct the draft instead';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end THEN
      RAISE EXCEPTION 'An evaluation cannot be moved to another rating period';
    END IF;

    IF OLD.status = 'final' THEN
      IF NEW.status = 'final' THEN
        RAISE EXCEPTION 'Finalized evaluations are locked; reopen it to draft first';
      END IF;
      -- final -> draft: reopening is a manager decision, not a supervisor one.
      IF NOT public.is_manager() THEN
        RAISE EXCEPTION 'Only a manager can reopen a finalized evaluation';
      END IF;
      NEW.finalized_at := NULL;
    END IF;
  END IF;

  -- Reaching here with status 'final' means the row is becoming final now
  -- (an insert, or a draft being finalized): stamp it from the database.
  IF NEW.status = 'final' THEN
    NEW.finalized_at := now();
  ELSE
    NEW.finalized_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.protect_staff_evaluation() IS
  'Evaluations are never deleted, never change period, and are locked once final; only a manager can reopen one.';

DROP TRIGGER IF EXISTS trg_protect_staff_evaluations ON public.staff_evaluations;
CREATE TRIGGER trg_protect_staff_evaluations
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_evaluation();

-- ── Row level security ──────────────────────────────────────────────────────

ALTER TABLE public.staff_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized supervisors view evaluations" ON public.staff_evaluations;
DROP POLICY IF EXISTS "Authorized supervisors create evaluations" ON public.staff_evaluations;
DROP POLICY IF EXISTS "Authorized supervisors update evaluations" ON public.staff_evaluations;

CREATE POLICY "Authorized supervisors view evaluations"
  ON public.staff_evaluations FOR SELECT TO authenticated
  USING (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors create evaluations"
  ON public.staff_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors update evaluations"
  ON public.staff_evaluations FOR UPDATE TO authenticated
  USING (public.can_manage_staff_member(employee_id))
  WITH CHECK (public.can_manage_staff_member(employee_id));

REVOKE ALL ON public.staff_evaluations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_evaluations TO authenticated;

NOTIFY pgrst, 'reload schema';
