-- ============================================================================
-- Golf Program Standards Framework — Phase 1 (schema + honest scoring)
--
-- WHY THIS EXISTS
-- The authoritative standards already existed, but were inert: the FY24 Navy
-- Standards assessment lived in a STATIC file (public/data/standards_plan.json)
-- rendered by /standards-plan, with the GM's status/notes persisted to
-- localStorage only — per-browser, unshared, unauditable, and with `owner` as a
-- free-text string rather than a real person. 93 scored gaps that nothing could
-- act on. See docs/audit/standards-execution-audit-2026-07-15.md.
--
-- This moves that assessment into the database so it can be owned, evaluated,
-- and converted into real work.
--
-- DESIGN DECISIONS
--  1. Corrective actions REUSE the existing task engine (tasks + task_evidence_items
--     + guard_task_mutation + task_required_evidence_satisfied). The app already
--     has a DB-enforced evidence/verification chain; building a parallel work
--     table would be a sixth deficiency system that nothing trusts. A corrective
--     action LINKS a standard to a task.
--  2. Evaluations are append-only history. Reevaluation never overwrites — the
--     current view is the newest row per standard.
--  3. Honest states. `not_evaluated` and `insufficient_data` are distinct from
--     `below_standard`. Missing data is never rendered as a zero or a failure.
--  4. Scoring baselines come from the real assessment (section weights +
--     subsection earned/possible), NOT invented numbers.
-- ============================================================================

-- ── Sections (weights from the FY24 assessment; sum = 100) ──────────────────
CREATE TABLE IF NOT EXISTS public.program_standard_sections (
  section     TEXT PRIMARY KEY,          -- '1'..'5'
  name        TEXT NOT NULL,             -- 'Personnel', 'Equipment', ...
  weight      NUMERIC(6,2) NOT NULL,     -- relative weight toward program score
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Subsection baselines (the scored denominator from the assessment) ───────
-- `entries` in the source file are ONLY the gaps (answer N/Blank). The Y answers
-- survive here as earned/possible, which is what makes an honest percent
-- possible: earned/possible, not "count of gaps".
CREATE TABLE IF NOT EXISTS public.program_standard_subsections (
  subsection  TEXT PRIMARY KEY,          -- '1.1', '4.1', ...
  section     TEXT NOT NULL REFERENCES public.program_standard_sections(section) ON DELETE CASCADE,
  name        TEXT,
  earned      NUMERIC(8,2) NOT NULL DEFAULT 0,
  possible    NUMERIC(8,2) NOT NULL DEFAULT 0,
  count_y     INT NOT NULL DEFAULT 0,
  count_n     INT NOT NULL DEFAULT 0,
  count_na    INT NOT NULL DEFAULT 0,
  count_blank INT NOT NULL DEFAULT 0,
  baseline_as_of DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_std_subsections_section
  ON public.program_standard_subsections(section);

-- ── The standards catalog ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_standards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,    -- '4.1.15' — stable id from the assessment
  section       TEXT NOT NULL REFERENCES public.program_standard_sections(section),
  subsection    TEXT NOT NULL REFERENCES public.program_standard_subsections(subsection),
  title         TEXT NOT NULL,           -- short_title
  standard_text TEXT NOT NULL,           -- the requirement, verbatim from source
  -- What "met" means, and how far off we are.
  expected_condition TEXT,               -- target_state
  current_state TEXT,                    -- as-assessed narrative (baseline)
  possible_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- Recommended remediation from the assessment (jsonb array of strings).
  recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependencies  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ['1.1.1']

  -- Ownership. owner_role is the free-text role from the source assessment
  -- ('GCM', 'Superintendent'); owner_profile_id is the REAL person. NULL owner
  -- is itself a gap the system must surface, never a value to invent.
  owner_role       TEXT,
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  backup_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  priority      TEXT CHECK (priority IN ('P1','P2','P3','P4')),
  effort        TEXT CHECK (effort IN ('Low','Medium','High')),
  timeline      TEXT,
  cost_estimate NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Provenance. Never claim an authority we cannot document.
  source_type   TEXT NOT NULL DEFAULT 'navy_program_standard'
                  CHECK (source_type IN (
                    'navy_program_standard',      -- from the scored Navy assessment
                    'management_defined',         -- Tyson's own operating standard
                    'manufacturer_requirement',
                    'regulatory_requirement',
                    'contract_requirement',
                    'best_practice',
                    'locally_configured'
                  )),
  source_document TEXT,                  -- exact citation
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,  -- placeholder needing GM sign-off

  -- How it gets measured.
  evaluation_method TEXT NOT NULL DEFAULT 'manual'
                  CHECK (evaluation_method IN (
                    'manual','rule','inspection','observation','equipment',
                    'work_order','duty_completion','evidence','compliance_record',
                    'purchase_request','metric'
                  )),
  evaluation_frequency TEXT,             -- 'monthly' | 'annual' | 'continuous' | NULL
  evidence_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_required BOOLEAN NOT NULL DEFAULT FALSE,

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  inactive_reason TEXT,
  effective_date DATE,
  version       INT NOT NULL DEFAULT 1,
  notes         TEXT,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_standards_section ON public.program_standards(section, subsection);
CREATE INDEX IF NOT EXISTS idx_program_standards_priority ON public.program_standards(priority) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_program_standards_owner ON public.program_standards(owner_profile_id) WHERE is_active;
-- Unowned active standards are a first-class gap; make the query cheap.
CREATE INDEX IF NOT EXISTS idx_program_standards_unowned
  ON public.program_standards(priority) WHERE is_active AND owner_profile_id IS NULL;

-- ── Version history (material edits are auditable, never destructive) ───────
CREATE TABLE IF NOT EXISTS public.program_standard_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id  UUID NOT NULL REFERENCES public.program_standards(id) ON DELETE CASCADE,
  version      INT NOT NULL,
  before_state JSONB,
  after_state  JSONB,
  change_reason TEXT,
  changed_by   UUID,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_std_versions_standard ON public.program_standard_versions(standard_id, version DESC);

-- ── Evaluations (append-only; newest row per standard is "current") ─────────
CREATE TABLE IF NOT EXISTS public.standard_evaluations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id  UUID NOT NULL REFERENCES public.program_standards(id) ON DELETE CASCADE,
  -- Honest states. `not_evaluated` / `insufficient_data` are NOT failures.
  status       TEXT NOT NULL CHECK (status IN (
                 'not_evaluated',
                 'insufficient_data',
                 'meets_standard',
                 'at_risk',
                 'below_standard',
                 'critical',
                 'corrective_action_active',
                 'awaiting_verification',
                 'blocked',
                 'not_applicable'
               )),
  score_earned   NUMERIC(6,2),           -- NULL when unscored — never coerce to 0
  score_possible NUMERIC(6,2),
  method       TEXT NOT NULL DEFAULT 'manual',
  -- Where the judgement came from: a rule key, an observation id, a unit, etc.
  source_kind  TEXT,
  source_id    UUID,
  source_ref   TEXT,
  detail       TEXT,
  -- TRUE only for rows written by the deterministic rule engine.
  is_automated BOOLEAN NOT NULL DEFAULT FALSE,
  evaluated_by UUID,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_std_evals_current
  ON public.standard_evaluations(standard_id, evaluated_at DESC);

-- ── Corrective actions: the bridge from a gap to real, enforced work ────────
-- The action itself is a `tasks` row (which already has evidence gates,
-- verification, immutable completed history). This table is the LINK plus the
-- management context the task table doesn't carry.
CREATE TABLE IF NOT EXISTS public.standard_corrective_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id   UUID NOT NULL REFERENCES public.program_standards(id) ON DELETE CASCADE,
  task_id       UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  -- Why this exists, in plain language, for whoever has to do it.
  gap_detail        TEXT NOT NULL,
  why_it_matters    TEXT,
  definition_of_done TEXT,

  -- Which deterministic rule produced it + the record it came from. Together
  -- with the partial unique index below, this is what makes generation
  -- idempotent: the same gap from the same source cannot spawn duplicates.
  rule_key      TEXT,
  source_kind   TEXT,                    -- 'equipment' | 'observation' | 'duty' | 'obligation'
  source_id     UUID,

  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
                  'proposed',              -- recommended, not yet accepted
                  'active',                -- work exists and is assigned
                  'awaiting_verification',
                  'resolved',              -- verified + standard reevaluated
                  'dismissed'              -- management accepted the risk
                )),
  dismissed_reason TEXT,
  priority      TEXT CHECK (priority IN ('critical','high','normal','low')),
  due_date      DATE,
  escalate_on   DATE,
  reevaluate_on DATE,
  created_by    UUID,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corrective_standard ON public.standard_corrective_actions(standard_id);
CREATE INDEX IF NOT EXISTS idx_corrective_open
  ON public.standard_corrective_actions(status) WHERE status IN ('proposed','active','awaiting_verification');

-- Idempotency: one OPEN action per (standard, rule, source). Re-running the
-- rule engine must never duplicate work. COALESCE keeps NULL source_id from
-- defeating uniqueness (NULLs are distinct in a plain unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_corrective_open_per_source
  ON public.standard_corrective_actions (
    standard_id,
    COALESCE(rule_key, ''),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status IN ('proposed','active','awaiting_verification');

-- ── Link corrective work back to the standard from the task side ────────────
-- Answers "why am I doing this?" on the surface the employee actually uses.
-- Additive + nullable: every existing task path is unaffected.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS standard_id UUID REFERENCES public.program_standards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS standard_code TEXT,
  ADD COLUMN IF NOT EXISTS why_it_matters TEXT,
  ADD COLUMN IF NOT EXISTS definition_of_done TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_standard ON public.tasks(standard_id) WHERE standard_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.why_it_matters IS
  'Plain-language reason this work exists, shown to the employee. Sourced from the standard it corrects.';
COMMENT ON COLUMN public.tasks.definition_of_done IS
  'What proves this is finished. Distinct from evidence_requirements (what to upload).';

-- ── updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.program_standards_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_program_standards_updated_at ON public.program_standards;
CREATE TRIGGER trg_program_standards_updated_at BEFORE UPDATE ON public.program_standards
  FOR EACH ROW EXECUTE FUNCTION public.program_standards_set_updated_at();

DROP TRIGGER IF EXISTS trg_corrective_updated_at ON public.standard_corrective_actions;
CREATE TRIGGER trg_corrective_updated_at BEFORE UPDATE ON public.standard_corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.program_standards_set_updated_at();

DROP TRIGGER IF EXISTS trg_std_sections_updated_at ON public.program_standard_sections;
CREATE TRIGGER trg_std_sections_updated_at BEFORE UPDATE ON public.program_standard_sections
  FOR EACH ROW EXECUTE FUNCTION public.program_standards_set_updated_at();

DROP TRIGGER IF EXISTS trg_std_subsections_updated_at ON public.program_standard_subsections;
CREATE TRIGGER trg_std_subsections_updated_at BEFORE UPDATE ON public.program_standard_subsections
  FOR EACH ROW EXECUTE FUNCTION public.program_standards_set_updated_at();

-- ── Evaluations are history: no UPDATE, no DELETE ──────────────────────────
CREATE OR REPLACE FUNCTION public.guard_standard_evaluation_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'standard_evaluations is append-only history; record a new evaluation instead of changing an old one';
END $$;

DROP TRIGGER IF EXISTS trg_std_evals_immutable ON public.standard_evaluations;
CREATE TRIGGER trg_std_evals_immutable BEFORE UPDATE OR DELETE ON public.standard_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_standard_evaluation_history();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Read: any authenticated staff member (they must see the standard behind their
-- work). Write: management only, matching can_manage_daily_operations().
-- Anonymous access is denied everywhere (Phase 0B anon lockdown).
ALTER TABLE public.program_standard_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_standard_subsections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_standards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_standard_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_evaluations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_corrective_actions  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'program_standard_sections','program_standard_subsections','program_standards',
    'program_standard_versions','standard_evaluations','standard_corrective_actions'
  ] LOOP
    -- read for authenticated
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t||'_read', t);
    END IF;
    -- write for management
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_write') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_manage_daily_operations()) WITH CHECK (public.can_manage_daily_operations())',
        t||'_write', t);
    END IF;
  END LOOP;
END $$;

notify pgrst, 'reload schema';
