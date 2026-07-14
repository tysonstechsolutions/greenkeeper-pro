-- Daily Operations Phase 1A corrective pass
--
-- This migration hardens the existing Phase 1A model without deleting legacy
-- history or inventing assignments. It establishes server-authorized commands
-- for duty changes, temporary coverage, recurrence revisions, task execution,
-- and legacy roster linking. It also replaces every permissive tasks policy so
-- policy OR-composition cannot accidentally restore authenticated full access.

BEGIN;

-- ---------------------------------------------------------------------------
-- Honest lifecycle and occurrence metadata
-- ---------------------------------------------------------------------------

-- The application and authorization helpers already recognize GM as a real
-- profile role. Align the live constraint so an individual GM account can be
-- represented without impersonating a superintendent.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check,
  ADD CONSTRAINT profiles_role_check CHECK (
    role IN ('super','asst_super','director','foreman','mechanic','crew','seasonal','pro','gm')
  );

ALTER TABLE public.operation_duties
  ADD COLUMN IF NOT EXISTS inactive_reason TEXT,
  ADD COLUMN IF NOT EXISTS seasonal_start_mmdd TEXT,
  ADD COLUMN IF NOT EXISTS seasonal_end_mmdd TEXT,
  ADD COLUMN IF NOT EXISTS evidence_requirement_state TEXT NOT NULL DEFAULT 'not_recorded',
  ADD COLUMN IF NOT EXISTS verification_requirement_state TEXT NOT NULL DEFAULT 'not_recorded',
  ADD COLUMN IF NOT EXISTS equipment_requirement_state TEXT NOT NULL DEFAULT 'not_recorded',
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.operation_duties
  DROP CONSTRAINT IF EXISTS operation_duties_inactive_reason_check,
  ADD CONSTRAINT operation_duties_inactive_reason_check CHECK (
    is_active = TRUE OR NULLIF(BTRIM(inactive_reason), '') IS NOT NULL
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS operation_duties_seasonal_window_check,
  ADD CONSTRAINT operation_duties_seasonal_window_check CHECK (
    (seasonal_start_mmdd IS NULL AND seasonal_end_mmdd IS NULL)
    OR (
      seasonal_start_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      AND seasonal_end_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    )
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS operation_duties_evidence_state_check,
  ADD CONSTRAINT operation_duties_evidence_state_check CHECK (
    evidence_requirement_state IN ('not_recorded','not_required','required')
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS operation_duties_verification_state_check,
  ADD CONSTRAINT operation_duties_verification_state_check CHECK (
    verification_requirement_state IN ('not_recorded','not_required','required')
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS operation_duties_equipment_state_check,
  ADD CONSTRAINT operation_duties_equipment_state_check CHECK (
    equipment_requirement_state IN ('not_recorded','not_required','required')
  ) NOT VALID;

-- Preserve recorded Phase 1A requirements. Empty defaults remain unknown,
-- rather than being rewritten as an explicit statement that nothing is needed.
UPDATE public.operation_duties
SET evidence_requirement_state = 'required'
WHERE jsonb_typeof(evidence_requirements) = 'array'
  AND jsonb_array_length(evidence_requirements) > 0;

UPDATE public.operation_duties
SET verification_requirement_state = 'required'
WHERE manager_verification_required = TRUE;

UPDATE public.operation_duties
SET equipment_requirement_state = 'required'
WHERE COALESCE(array_length(equipment_needed, 1), 0) > 0;

-- Normalize legacy string evidence into structured contract objects. The
-- original label is preserved exactly and no requirement is inferred.
UPDATE public.operation_duties d
SET evidence_requirements = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(item.value) = 'object' THEN item.value
        ELSE jsonb_build_object(
          'key', 'legacy-' || item.ordinality::TEXT,
          'type', CASE
            WHEN LOWER(TRIM(BOTH '"' FROM item.value::TEXT)) LIKE '%before%photo%' THEN 'photo_before'
            WHEN LOWER(TRIM(BOTH '"' FROM item.value::TEXT)) LIKE '%after%photo%'
              OR LOWER(TRIM(BOTH '"' FROM item.value::TEXT)) = 'photo' THEN 'photo_after'
            ELSE 'record'
          END,
          'label', TRIM(BOTH '"' FROM item.value::TEXT)
        )
      END ORDER BY item.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(d.evidence_requirements) WITH ORDINALITY item(value, ordinality)
)
WHERE jsonb_typeof(d.evidence_requirements) = 'array'
  AND jsonb_array_length(d.evidence_requirements) > 0;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS duty_coverage_id UUID,
  ADD COLUMN IF NOT EXISTS duty_recurrence_version_id UUID,
  ADD COLUMN IF NOT EXISTS duty_department TEXT,
  ADD COLUMN IF NOT EXISTS duty_role_group TEXT,
  ADD COLUMN IF NOT EXISTS duty_recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS duty_instructions TEXT,
  ADD COLUMN IF NOT EXISTS duty_evidence_requirements JSONB,
  ADD COLUMN IF NOT EXISTS duty_evidence_requirement_state TEXT,
  ADD COLUMN IF NOT EXISTS duty_verification_requirement_state TEXT,
  ADD COLUMN IF NOT EXISTS duty_equipment_requirement_state TEXT,
  ADD COLUMN IF NOT EXISTS duty_owner_type TEXT,
  ADD COLUMN IF NOT EXISTS duty_primary_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_backup_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_contractor_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_primary_name TEXT,
  ADD COLUMN IF NOT EXISTS duty_backup_name TEXT,
  ADD COLUMN IF NOT EXISTS duty_contractor_name TEXT,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_duty_owner_date
  ON public.tasks(duty_primary_profile_id, due_date) WHERE duty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_duty_contractor_date
  ON public.tasks(duty_contractor_vendor_id, due_date)
  WHERE duty_contractor_vendor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Immutable audit history and recurrence versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.duty_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id UUID REFERENCES public.operation_duties(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  effective_date DATE,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duty_audit_events_duty
  ON public.duty_audit_events(duty_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.duty_recurrence_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id UUID NOT NULL REFERENCES public.operation_duties(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly','monthly','quarterly','annual')),
  recurrence_rule JSONB NOT NULL,
  effective_from DATE NOT NULL,
  effective_through DATE,
  change_reason TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duty_recurrence_versions_dates_check CHECK (
    effective_through IS NULL OR effective_through >= effective_from
  )
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'duty_recurrence_versions_no_overlap'
  ) THEN
    ALTER TABLE public.duty_recurrence_versions
      ADD CONSTRAINT duty_recurrence_versions_no_overlap
      EXCLUDE USING gist (
        duty_id WITH =,
        daterange(effective_from, COALESCE(effective_through, 'infinity'::date), '[]') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_duty_recurrence_versions_lookup
  ON public.duty_recurrence_versions(duty_id, effective_from DESC);

INSERT INTO public.duty_recurrence_versions (
  duty_id, cadence, recurrence_rule, effective_from, effective_through,
  change_reason, changed_by
)
SELECT
  d.id,
  d.cadence,
  d.recurrence_rule,
  d.active_from,
  d.active_through,
  'Phase 1A corrective baseline: preserve recorded recurrence',
  NULL
FROM public.operation_duties d
WHERE NOT EXISTS (
  SELECT 1 FROM public.duty_recurrence_versions v WHERE v.duty_id = d.id
);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_duty_recurrence_version_id_fkey,
  ADD CONSTRAINT tasks_duty_recurrence_version_id_fkey
    FOREIGN KEY (duty_recurrence_version_id)
    REFERENCES public.duty_recurrence_versions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Temporary coverage (kept separate from permanent assignment history)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.duty_temporary_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id UUID NOT NULL REFERENCES public.operation_duties(id) ON DELETE CASCADE,
  permanent_assignment_id UUID NOT NULL REFERENCES public.duty_assignments(id) ON DELETE RESTRICT,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('employee','contractor','unassigned')),
  primary_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  backup_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contractor_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duty_temporary_coverages_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT duty_temporary_coverages_people_distinct CHECK (
    primary_profile_id IS NULL OR backup_profile_id IS NULL OR primary_profile_id <> backup_profile_id
  ),
  CONSTRAINT duty_temporary_coverages_target_check CHECK (
    (assignee_type = 'employee' AND primary_profile_id IS NOT NULL AND contractor_vendor_id IS NULL)
    OR (assignee_type = 'contractor' AND primary_profile_id IS NULL AND backup_profile_id IS NULL AND contractor_vendor_id IS NOT NULL)
    OR (assignee_type = 'unassigned' AND primary_profile_id IS NULL AND backup_profile_id IS NULL AND contractor_vendor_id IS NULL)
  )
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'duty_temporary_coverages_no_overlap'
  ) THEN
    ALTER TABLE public.duty_temporary_coverages
      ADD CONSTRAINT duty_temporary_coverages_no_overlap
      EXCLUDE USING gist (
        duty_id WITH =,
        daterange(starts_on, ends_on, '[]') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_duty_temporary_coverages_lookup
  ON public.duty_temporary_coverages(duty_id, starts_on, ends_on);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_duty_coverage_id_fkey,
  ADD CONSTRAINT tasks_duty_coverage_id_fkey
    FOREIGN KEY (duty_coverage_id)
    REFERENCES public.duty_temporary_coverages(id) ON DELETE SET NULL;

-- Structured evidence satisfaction records. Photos remain in public.photos;
-- this table covers non-photo requirements without overloading task.notes.
CREATE TABLE IF NOT EXISTS public.task_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  requirement_key TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  note TEXT,
  document_url TEXT,
  external_reference TEXT,
  satisfied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  satisfied_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, requirement_key)
);

CREATE INDEX IF NOT EXISTS idx_task_evidence_items_task
  ON public.task_evidence_items(task_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_daily_operations()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('super','asst_super','director','gm')
      AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_manage_tasks()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('super','asst_super','director','gm','pro')
      AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_active_foreman()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'foreman' AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_duty_audit_event(
  p_duty_id UUID,
  p_event_type TEXT,
  p_reason TEXT,
  p_effective_date DATE DEFAULT NULL,
  p_before JSONB DEFAULT NULL,
  p_after JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active GM or operations manager may record duty changes';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  INSERT INTO public.duty_audit_events (
    duty_id, event_type, actor_id, reason, effective_date,
    before_state, after_state, metadata
  ) VALUES (
    p_duty_id, p_event_type, (SELECT auth.uid()), BTRIM(p_reason),
    p_effective_date, p_before, p_after, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Recurrence and seasonal matching
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.duty_date_in_season(
  p_date DATE,
  p_season TEXT,
  p_start_mmdd TEXT,
  p_end_mmdd TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_value TEXT := to_char(p_date, 'MM-DD');
  v_start TEXT := p_start_mmdd;
  v_end TEXT := p_end_mmdd;
BEGIN
  IF p_season = 'year_round' THEN
    RETURN TRUE;
  END IF;
  -- An operating-season label does not establish actual calendar boundaries.
  -- Do not generate occurrences until both recorded boundaries are available.
  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN FALSE;
  END IF;
  IF v_start <= v_end THEN
    RETURN v_value BETWEEN v_start AND v_end;
  END IF;
  -- Winter windows may cross New Year (for example 11-01 through 03-15).
  RETURN v_value >= v_start OR v_value <= v_end;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.duty_rule_matches(
  p_date DATE,
  p_anchor DATE,
  p_rule JSONB,
  p_season TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_cadence TEXT := COALESCE(p_rule->>'cadence', 'weekly');
  v_interval INTEGER := GREATEST(COALESCE((p_rule->>'interval')::INTEGER, 1), 1);
  v_weekday TEXT;
  v_requested_day INTEGER := COALESCE((p_rule->>'day_of_month')::INTEGER, 1);
  v_actual_day INTEGER;
  v_month_distance INTEGER;
  v_has_weekdays BOOLEAN := jsonb_typeof(p_rule->'weekdays') = 'array'
    AND jsonb_array_length(p_rule->'weekdays') > 0;
  v_has_months BOOLEAN := jsonb_typeof(p_rule->'months') = 'array'
    AND jsonb_array_length(p_rule->'months') > 0;
BEGIN
  IF p_season NOT IN ('year_round', 'in_season') THEN RETURN FALSE; END IF;
  IF p_date < p_anchor THEN RETURN FALSE; END IF;

  v_weekday := CASE EXTRACT(DOW FROM p_date)::INTEGER
    WHEN 0 THEN 'sun' WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' ELSE 'sat' END;

  IF v_cadence = 'daily' THEN
    RETURN NOT v_has_weekdays OR (p_rule->'weekdays') ? v_weekday;
  END IF;

  IF v_cadence = 'weekly' THEN
    RETURN (NOT v_has_weekdays OR (p_rule->'weekdays') ? v_weekday)
      AND MOD(FLOOR((p_date - p_anchor)::NUMERIC / 7)::INTEGER, v_interval) = 0;
  END IF;

  v_actual_day := CASE
    WHEN v_requested_day = -1 THEN EXTRACT(DAY FROM (date_trunc('month', p_date) + INTERVAL '1 month - 1 day'))::INTEGER
    ELSE LEAST(v_requested_day, EXTRACT(DAY FROM (date_trunc('month', p_date) + INTERVAL '1 month - 1 day'))::INTEGER)
  END;
  IF EXTRACT(DAY FROM p_date)::INTEGER <> v_actual_day THEN RETURN FALSE; END IF;

  v_month_distance :=
    (EXTRACT(YEAR FROM p_date)::INTEGER - EXTRACT(YEAR FROM p_anchor)::INTEGER) * 12
    + EXTRACT(MONTH FROM p_date)::INTEGER - EXTRACT(MONTH FROM p_anchor)::INTEGER;

  IF v_cadence = 'monthly' THEN
    RETURN MOD(v_month_distance, v_interval) = 0;
  ELSIF v_cadence = 'quarterly' THEN
    RETURN MOD(v_month_distance, 3 * v_interval) = 0
      AND (NOT v_has_months OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_rule->'months') month_value
        WHERE month_value::INTEGER = EXTRACT(MONTH FROM p_date)::INTEGER
      ));
  ELSIF v_cadence = 'annual' THEN
    RETURN MOD(v_month_distance, 12 * v_interval) = 0
      AND (
        (v_has_months AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(p_rule->'months') month_value
          WHERE month_value::INTEGER = EXTRACT(MONTH FROM p_date)::INTEGER
        ))
        OR (NOT v_has_months AND EXTRACT(MONTH FROM p_date) = EXTRACT(MONTH FROM p_anchor))
      );
  END IF;
  RETURN FALSE;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Keep the duty series as a stable container. Recurrence versions, not the
-- mutable series row, decide whether a date is a valid occurrence.
CREATE OR REPLACE FUNCTION public.sync_operation_duty_series()
RETURNS TRIGGER AS $$
DECLARE v_weekday INTEGER;
BEGIN
  v_weekday := CASE COALESCE(NEW.days->>0, '')
    WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2 WHEN 'wed' THEN 3
    WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6 ELSE NULL END;

  INSERT INTO public.task_series (
    assigned_to, template_id, tier, weekday, week_of_month, task_payload,
    active, created_by, duty_id, recurrence_rule, timezone,
    effective_from, effective_through
  ) VALUES (
    NULL, NULL, NEW.cadence, v_weekday, NULL,
    jsonb_build_object(
      'title', NEW.title,
      'description', NEW.note,
      'category', NEW.task_category,
      'priority', NEW.priority,
      'estimated_minutes', NEW.estimated_minutes,
      'equipment_needed', to_jsonb(NEW.equipment_needed),
      'materials_needed', '[]'::jsonb,
      'checklist', '[]'::jsonb,
      'requires_photo_before', FALSE,
      'requires_photo_after', NEW.evidence_requirement_state = 'required'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(NEW.evidence_requirements) r
          WHERE r->>'type' IN ('photo','photo_after')
        ),
      'weather_dependent', FALSE,
      'weather_conditions', NULL,
      'template_id', NULL,
      'notes', NEW.instructions
    ),
    NEW.is_active, NULL, NEW.id, NEW.recurrence_rule,
    'America/Chicago', NEW.active_from, NEW.active_through
  )
  ON CONFLICT (duty_id) WHERE duty_id IS NOT NULL DO UPDATE SET
    tier = EXCLUDED.tier,
    weekday = EXCLUDED.weekday,
    task_payload = EXCLUDED.task_payload,
    active = EXCLUDED.active,
    timezone = EXCLUDED.timezone,
    effective_from = EXCLUDED.effective_from,
    effective_through = EXCLUDED.effective_through;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_operation_duty_series ON public.operation_duties;
CREATE TRIGGER trg_operation_duty_series
AFTER INSERT OR UPDATE OF title, note, cadence, days, estimated_minutes,
  instructions, equipment_needed, evidence_requirements,
  evidence_requirement_state, verification_requirement_state,
  equipment_requirement_state, task_category, priority, is_active,
  active_from, active_through
ON public.operation_duties
FOR EACH ROW EXECUTE FUNCTION public.sync_operation_duty_series();

-- ---------------------------------------------------------------------------
-- Version-aware occurrence materialization (service/cron only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.materialize_duty_occurrences(
  p_from DATE DEFAULT CURRENT_DATE,
  p_through DATE DEFAULT CURRENT_DATE + 45
) RETURNS INTEGER AS $$
DECLARE
  s RECORD;
  d RECORD;
  v RECORD;
  a RECORD;
  c RECORD;
  p_primary_name TEXT;
  p_backup_name TEXT;
  p_contractor_name TEXT;
  v_owner_type TEXT;
  v_primary UUID;
  v_backup UUID;
  v_contractor UUID;
  v_inserted INTEGER := 0;
  v_count INTEGER;
BEGIN
  IF p_through < p_from OR p_through - p_from > 400 THEN
    RAISE EXCEPTION 'Duty materialization range must be between 0 and 400 days';
  END IF;

  FOR s IN
    SELECT ts.id AS duty_series_id, od.*
    FROM public.task_series ts
    JOIN public.operation_duties od ON od.id = ts.duty_id
    WHERE ts.active = TRUE AND od.is_active = TRUE
  LOOP
    FOR d IN
      SELECT g::DATE AS occurrence_date
      FROM generate_series(
        GREATEST(p_from, s.active_from),
        LEAST(p_through, COALESCE(s.active_through, p_through)),
        INTERVAL '1 day'
      ) g
    LOOP
      SELECT rv.* INTO v
      FROM public.duty_recurrence_versions rv
      WHERE rv.duty_id = s.id
        AND rv.effective_from <= d.occurrence_date
        AND (rv.effective_through IS NULL OR rv.effective_through >= d.occurrence_date)
      ORDER BY rv.effective_from DESC
      LIMIT 1;
      IF NOT FOUND THEN CONTINUE; END IF;

      IF NOT public.duty_rule_matches(
        d.occurrence_date, v.effective_from, v.recurrence_rule, s.season
      ) OR NOT public.duty_date_in_season(
        d.occurrence_date, s.season, s.seasonal_start_mmdd, s.seasonal_end_mmdd
      ) THEN
        CONTINUE;
      END IF;

      SELECT da.* INTO a
      FROM public.duty_assignments da
      WHERE da.duty_id = s.id
        AND da.effective_from <= d.occurrence_date
        AND (da.effective_through IS NULL OR da.effective_through >= d.occurrence_date)
      ORDER BY da.effective_from DESC
      LIMIT 1;

      SELECT dc.* INTO c
      FROM public.duty_temporary_coverages dc
      WHERE dc.duty_id = s.id
        AND dc.starts_on <= d.occurrence_date
        AND dc.ends_on >= d.occurrence_date
      ORDER BY dc.starts_on DESC
      LIMIT 1;

      IF c.id IS NOT NULL THEN
        v_owner_type := c.assignee_type;
        v_primary := c.primary_profile_id;
        v_backup := c.backup_profile_id;
        v_contractor := c.contractor_vendor_id;
      ELSE
        v_owner_type := COALESCE(a.assignee_type, 'unassigned');
        v_primary := a.primary_profile_id;
        v_backup := a.backup_profile_id;
        v_contractor := a.contractor_vendor_id;
      END IF;

      SELECT full_name INTO p_primary_name FROM public.profiles WHERE id = v_primary;
      SELECT full_name INTO p_backup_name FROM public.profiles WHERE id = v_backup;
      SELECT COALESCE(company, name) INTO p_contractor_name FROM public.vendors WHERE id = v_contractor;

      INSERT INTO public.tasks (
        title, description, category, priority, status,
        assigned_to, assigned_by, due_date, estimated_minutes,
        equipment_needed, materials_needed, checklist,
        requires_photo_before, requires_photo_after, weather_dependent,
        weather_conditions, template_id, series_id, notes,
        duty_id, duty_assignment_id, duty_coverage_id,
        duty_recurrence_version_id, occurrence_key, original_due_date,
        duty_department, duty_role_group, duty_recurrence_rule,
        duty_instructions, duty_evidence_requirements,
        duty_evidence_requirement_state, duty_verification_requirement_state,
        duty_equipment_requirement_state, duty_owner_type,
        duty_primary_profile_id, duty_backup_profile_id,
        duty_contractor_vendor_id, duty_primary_name, duty_backup_name,
        duty_contractor_name
      ) VALUES (
        s.title, s.note, s.task_category, s.priority, 'pending',
        CASE WHEN v_owner_type = 'employee' THEN v_primary ELSE NULL END,
        COALESCE(c.created_by, a.assigned_by), d.occurrence_date,
        s.estimated_minutes, s.equipment_needed, '[]'::jsonb, '[]'::jsonb,
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.evidence_requirements) r
          WHERE r->>'type' = 'photo_before'
        ),
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.evidence_requirements) r
          WHERE r->>'type' IN ('photo','photo_after')
        ),
        FALSE, NULL, NULL, s.duty_series_id, NULL,
        s.id, a.id, c.id, v.id, d.occurrence_date::TEXT, d.occurrence_date,
        s.department, s.role_group, v.recurrence_rule,
        s.instructions, s.evidence_requirements,
        s.evidence_requirement_state, s.verification_requirement_state,
        s.equipment_requirement_state, v_owner_type,
        v_primary, v_backup, v_contractor,
        p_primary_name, p_backup_name, p_contractor_name
      )
      ON CONFLICT (series_id, occurrence_key)
        WHERE series_id IS NOT NULL AND occurrence_key IS NOT NULL
      DO UPDATE SET
        status = CASE
          WHEN tasks.status = 'cancelled' AND tasks.cancel_reason = 'recurrence_changed'
          THEN 'pending' ELSE tasks.status END,
        cancel_reason = CASE
          WHEN tasks.status = 'cancelled' AND tasks.cancel_reason = 'recurrence_changed'
          THEN NULL ELSE tasks.cancel_reason END,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        priority = EXCLUDED.priority,
        assigned_to = EXCLUDED.assigned_to,
        assigned_by = EXCLUDED.assigned_by,
        estimated_minutes = EXCLUDED.estimated_minutes,
        equipment_needed = EXCLUDED.equipment_needed,
        requires_photo_before = EXCLUDED.requires_photo_before,
        requires_photo_after = EXCLUDED.requires_photo_after,
        notes = EXCLUDED.notes,
        duty_assignment_id = EXCLUDED.duty_assignment_id,
        duty_coverage_id = EXCLUDED.duty_coverage_id,
        duty_recurrence_version_id = EXCLUDED.duty_recurrence_version_id,
        duty_department = EXCLUDED.duty_department,
        duty_role_group = EXCLUDED.duty_role_group,
        duty_recurrence_rule = EXCLUDED.duty_recurrence_rule,
        duty_instructions = EXCLUDED.duty_instructions,
        duty_evidence_requirements = EXCLUDED.duty_evidence_requirements,
        duty_evidence_requirement_state = EXCLUDED.duty_evidence_requirement_state,
        duty_verification_requirement_state = EXCLUDED.duty_verification_requirement_state,
        duty_equipment_requirement_state = EXCLUDED.duty_equipment_requirement_state,
        duty_owner_type = EXCLUDED.duty_owner_type,
        duty_primary_profile_id = EXCLUDED.duty_primary_profile_id,
        duty_backup_profile_id = EXCLUDED.duty_backup_profile_id,
        duty_contractor_vendor_id = EXCLUDED.duty_contractor_vendor_id,
        duty_primary_name = EXCLUDED.duty_primary_name,
        duty_backup_name = EXCLUDED.duty_backup_name,
        duty_contractor_name = EXCLUDED.duty_contractor_name,
        updated_at = NOW()
      WHERE tasks.status = 'pending'
         OR (tasks.status = 'cancelled' AND tasks.cancel_reason = 'recurrence_changed');
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_inserted := v_inserted + v_count;

      p_primary_name := NULL;
      p_backup_name := NULL;
      p_contractor_name := NULL;
    END LOOP;
  END LOOP;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.materialize_duty_occurrences(DATE, DATE) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_duty_occurrences(DATE, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.extend_task_series(INT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_task_series(INT) TO service_role;

-- ---------------------------------------------------------------------------
-- Assignment, atomic duty save, and bulk reassignment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_duty_assignment(
  p_duty_id UUID,
  p_primary_profile_id UUID DEFAULT NULL,
  p_backup_profile_id UUID DEFAULT NULL,
  p_contractor_vendor_id UUID DEFAULT NULL,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_current public.duty_assignments%ROWTYPE;
  v_new public.duty_assignments%ROWTYPE;
  v_type TEXT;
  v_new_through DATE;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active GM or operations manager may change duty ownership';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'An ownership change reason is required';
  END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'An effective date is required'; END IF;
  IF p_primary_profile_id IS NOT NULL AND p_primary_profile_id = p_backup_profile_id THEN
    RAISE EXCEPTION 'Primary and backup employees must be different';
  END IF;
  IF p_contractor_vendor_id IS NOT NULL
     AND (p_primary_profile_id IS NOT NULL OR p_backup_profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Employee and contractor ownership cannot be combined';
  END IF;
  IF p_backup_profile_id IS NOT NULL AND p_primary_profile_id IS NULL THEN
    RAISE EXCEPTION 'A backup employee requires a primary employee';
  END IF;
  IF p_primary_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_primary_profile_id AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'Primary employee must be an active profile'; END IF;
  IF p_backup_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_backup_profile_id AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'Backup employee must be an active profile'; END IF;
  IF p_contractor_vendor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vendors WHERE id = p_contractor_vendor_id
  ) THEN RAISE EXCEPTION 'Contractor vendor was not found'; END IF;

  v_type := CASE
    WHEN p_contractor_vendor_id IS NOT NULL THEN 'contractor'
    WHEN p_primary_profile_id IS NOT NULL THEN 'employee'
    ELSE 'unassigned'
  END;

  SELECT * INTO v_current
  FROM public.duty_assignments
  WHERE duty_id = p_duty_id
    AND effective_from <= p_effective_date
    AND (effective_through IS NULL OR effective_through >= p_effective_date)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;

  IF FOUND
    AND v_current.primary_profile_id IS NOT DISTINCT FROM p_primary_profile_id
    AND v_current.backup_profile_id IS NOT DISTINCT FROM p_backup_profile_id
    AND v_current.contractor_vendor_id IS NOT DISTINCT FROM p_contractor_vendor_id
  THEN
    RETURN v_current.id;
  END IF;

  IF FOUND AND v_current.effective_from = p_effective_date THEN
    -- The exclusion constraint cannot retain two rows beginning the same day.
    -- Preserve the replaced state in the immutable audit stream before the
    -- single same-day row is corrected.
    UPDATE public.duty_assignments SET
      assignee_type = v_type,
      primary_profile_id = CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
      backup_profile_id = CASE WHEN v_type = 'employee' THEN p_backup_profile_id END,
      contractor_vendor_id = CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id END,
      change_reason = BTRIM(p_reason),
      assigned_by = (SELECT auth.uid())
    WHERE id = v_current.id RETURNING * INTO v_new;
  ELSE
    IF FOUND THEN
      v_new_through := v_current.effective_through;
      UPDATE public.duty_assignments
      SET effective_through = p_effective_date - 1
      WHERE id = v_current.id;
    ELSE
      SELECT MIN(effective_from) - 1 INTO v_new_through
      FROM public.duty_assignments
      WHERE duty_id = p_duty_id AND effective_from > p_effective_date;
    END IF;

    INSERT INTO public.duty_assignments (
      duty_id, assignee_type, primary_profile_id, backup_profile_id,
      contractor_vendor_id, effective_from, effective_through,
      change_reason, assigned_by
    ) VALUES (
      p_duty_id, v_type,
      CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
      CASE WHEN v_type = 'employee' THEN p_backup_profile_id END,
      CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id END,
      p_effective_date, v_new_through, BTRIM(p_reason), (SELECT auth.uid())
    ) RETURNING * INTO v_new;
  END IF;

  PERFORM public.record_duty_audit_event(
    p_duty_id, 'ownership_changed', p_reason, p_effective_date,
    CASE WHEN v_current.id IS NULL THEN NULL ELSE to_jsonb(v_current) END,
    to_jsonb(v_new)
  );

  UPDATE public.tasks SET
    assigned_to = CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
    duty_assignment_id = v_new.id,
    duty_coverage_id = NULL,
    assigned_by = (SELECT auth.uid()),
    duty_owner_type = v_type,
    duty_primary_profile_id = CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
    duty_backup_profile_id = CASE WHEN v_type = 'employee' THEN p_backup_profile_id END,
    duty_contractor_vendor_id = CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id END,
    duty_primary_name = (SELECT full_name FROM public.profiles WHERE id = p_primary_profile_id),
    duty_backup_name = (SELECT full_name FROM public.profiles WHERE id = p_backup_profile_id),
    duty_contractor_name = (SELECT COALESCE(company, name) FROM public.vendors WHERE id = p_contractor_vendor_id),
    updated_at = NOW()
  WHERE duty_id = p_duty_id
    AND due_date >= p_effective_date
    AND (v_new.effective_through IS NULL OR due_date <= v_new.effective_through)
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.duty_temporary_coverages tc
      WHERE tc.id = tasks.duty_coverage_id
    );

  RETURN v_new.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.save_operation_duty(
  p_duty_id UUID,
  p_duty JSONB,
  p_primary_profile_id UUID DEFAULT NULL,
  p_backup_profile_id UUID DEFAULT NULL,
  p_contractor_vendor_id UUID DEFAULT NULL,
  p_assignment_effective_date DATE DEFAULT CURRENT_DATE,
  p_assignment_reason TEXT DEFAULT NULL
) RETURNS public.operation_duties AS $$
DECLARE
  v_before public.operation_duties%ROWTYPE;
  v_saved public.operation_duties%ROWTYPE;
  v_current public.duty_assignments%ROWTYPE;
  v_assignment_changed BOOLEAN;
  v_is_active BOOLEAN := COALESCE((p_duty->>'is_active')::BOOLEAN, TRUE);
  v_active_from DATE := (p_duty->>'active_from')::DATE;
  v_active_through DATE := NULLIF(p_duty->>'active_through', '')::DATE;
  v_rule JSONB := COALESCE(p_duty->'recurrence_rule', '{}'::jsonb);
  v_evidence_state TEXT := COALESCE(p_duty->>'evidence_requirement_state', 'not_recorded');
  v_verification_state TEXT := COALESCE(p_duty->>'verification_requirement_state', 'not_recorded');
  v_equipment_state TEXT := COALESCE(p_duty->>'equipment_requirement_state', 'not_recorded');
BEGIN
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active GM or operations manager may save duties';
  END IF;
  IF NULLIF(BTRIM(p_duty->>'title'), '') IS NULL THEN RAISE EXCEPTION 'A duty title is required'; END IF;
  IF v_active_from IS NULL THEN RAISE EXCEPTION 'A duty start date is required'; END IF;
  IF v_active_through IS NOT NULL AND v_active_through < v_active_from THEN
    RAISE EXCEPTION 'Duty end date cannot precede its start date';
  END IF;
  IF COALESCE(p_duty->>'season', 'year_round') = 'year_round'
     AND (NULLIF(p_duty->>'seasonal_start_mmdd','') IS NOT NULL
       OR NULLIF(p_duty->>'seasonal_end_mmdd','') IS NOT NULL) THEN
    RAISE EXCEPTION 'Year-round duties cannot have seasonal boundaries';
  END IF;
  IF NOT v_is_active AND NULLIF(BTRIM(p_duty->>'inactive_reason'), '') IS NULL THEN
    RAISE EXCEPTION 'An inactive reason is required when deactivating a duty';
  END IF;
  IF COALESCE((v_rule->>'interval')::INTEGER, 1) < 1 THEN
    RAISE EXCEPTION 'Recurrence interval must be at least one';
  END IF;
  IF v_evidence_state = 'required' AND jsonb_array_length(COALESCE(p_duty->'evidence_requirements','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one structured evidence requirement is required';
  END IF;
  IF v_evidence_state <> 'required' AND jsonb_array_length(COALESCE(p_duty->'evidence_requirements','[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'Evidence items require the evidence state to be required';
  END IF;

  IF p_duty_id IS NULL THEN
    INSERT INTO public.operation_duties (
      title, area, days, season, department, role_group, cadence,
      recurrence_rule, estimated_minutes, instructions, equipment_needed,
      required_document, standard_reference, evidence_requirements,
      manager_verification_required, task_category, priority,
      active_from, active_through, legacy_source, legacy_source_id,
      note, is_active, sort_order, inactive_reason,
      seasonal_start_mmdd, seasonal_end_mmdd,
      evidence_requirement_state, verification_requirement_state,
      equipment_requirement_state, updated_by
    ) VALUES (
      BTRIM(p_duty->>'title'), p_duty->>'area', COALESCE(p_duty->'days','[]'::jsonb),
      COALESCE(p_duty->>'season','year_round'), p_duty->>'department',
      p_duty->>'role_group', p_duty->>'cadence', v_rule,
      NULLIF(p_duty->>'estimated_minutes','')::INTEGER,
      NULLIF(BTRIM(p_duty->>'instructions'),''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_duty->'equipment_needed','[]'::jsonb))), '{}'),
      NULLIF(BTRIM(p_duty->>'required_document'),''),
      NULLIF(BTRIM(p_duty->>'standard_reference'),''),
      COALESCE(p_duty->'evidence_requirements','[]'::jsonb),
      v_verification_state = 'required',
      COALESCE(p_duty->>'task_category','other'),
      COALESCE(p_duty->>'priority','normal'), v_active_from, v_active_through,
      NULLIF(p_duty->>'legacy_source',''), NULLIF(p_duty->>'legacy_source_id','')::UUID,
      NULLIF(BTRIM(p_duty->>'note'),''), v_is_active,
      COALESCE((p_duty->>'sort_order')::INTEGER,0),
      NULLIF(BTRIM(p_duty->>'inactive_reason'),''),
      NULLIF(p_duty->>'seasonal_start_mmdd',''), NULLIF(p_duty->>'seasonal_end_mmdd',''),
      v_evidence_state, v_verification_state, v_equipment_state, (SELECT auth.uid())
    ) RETURNING * INTO v_saved;

    INSERT INTO public.duty_recurrence_versions (
      duty_id, cadence, recurrence_rule, effective_from, effective_through,
      change_reason, changed_by
    ) VALUES (
      v_saved.id, v_saved.cadence, v_saved.recurrence_rule,
      v_saved.active_from, v_saved.active_through,
      COALESCE(NULLIF(BTRIM(p_assignment_reason),''), 'Initial duty definition'),
      (SELECT auth.uid())
    );
    v_assignment_changed := TRUE;
  ELSE
    SELECT * INTO v_before FROM public.operation_duties WHERE id = p_duty_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Duty was not found'; END IF;
    IF v_before.active_from IS DISTINCT FROM v_active_from THEN
      RAISE EXCEPTION 'A duty start date is immutable after creation';
    END IF;
    IF v_before.recurrence_rule IS DISTINCT FROM v_rule
       OR v_before.cadence IS DISTINCT FROM p_duty->>'cadence' THEN
      RAISE EXCEPTION 'Use Change future occurrences to revise recurrence safely';
    END IF;

    UPDATE public.operation_duties SET
      title = BTRIM(p_duty->>'title'),
      area = p_duty->>'area',
      days = COALESCE(p_duty->'days','[]'::jsonb),
      season = COALESCE(p_duty->>'season','year_round'),
      department = p_duty->>'department', role_group = p_duty->>'role_group',
      estimated_minutes = NULLIF(p_duty->>'estimated_minutes','')::INTEGER,
      instructions = NULLIF(BTRIM(p_duty->>'instructions'),''),
      equipment_needed = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_duty->'equipment_needed','[]'::jsonb))), '{}'),
      required_document = NULLIF(BTRIM(p_duty->>'required_document'),''),
      standard_reference = NULLIF(BTRIM(p_duty->>'standard_reference'),''),
      evidence_requirements = COALESCE(p_duty->'evidence_requirements','[]'::jsonb),
      manager_verification_required = v_verification_state = 'required',
      task_category = COALESCE(p_duty->>'task_category','other'),
      priority = COALESCE(p_duty->>'priority','normal'),
      active_from = v_active_from, active_through = v_active_through,
      note = NULLIF(BTRIM(p_duty->>'note'),''), is_active = v_is_active,
      sort_order = COALESCE((p_duty->>'sort_order')::INTEGER,0),
      inactive_reason = CASE WHEN v_is_active THEN NULL ELSE NULLIF(BTRIM(p_duty->>'inactive_reason'),'') END,
      seasonal_start_mmdd = NULLIF(p_duty->>'seasonal_start_mmdd',''),
      seasonal_end_mmdd = NULLIF(p_duty->>'seasonal_end_mmdd',''),
      evidence_requirement_state = v_evidence_state,
      verification_requirement_state = v_verification_state,
      equipment_requirement_state = v_equipment_state,
      updated_by = (SELECT auth.uid()), updated_at = NOW()
    WHERE id = p_duty_id RETURNING * INTO v_saved;

    PERFORM public.record_duty_audit_event(
      v_saved.id,
      CASE WHEN v_before.is_active AND NOT v_saved.is_active THEN 'duty_deactivated' ELSE 'definition_changed' END,
      COALESCE(NULLIF(BTRIM(p_assignment_reason),''), 'Duty definition updated'),
      CURRENT_DATE, to_jsonb(v_before), to_jsonb(v_saved)
    );
  END IF;

  SELECT * INTO v_current FROM public.duty_assignments
  WHERE duty_id = v_saved.id
    AND effective_from <= p_assignment_effective_date
    AND (effective_through IS NULL OR effective_through >= p_assignment_effective_date)
  ORDER BY effective_from DESC LIMIT 1;

  v_assignment_changed := p_duty_id IS NULL OR v_current.id IS NULL
    OR v_current.primary_profile_id IS DISTINCT FROM p_primary_profile_id
    OR v_current.backup_profile_id IS DISTINCT FROM p_backup_profile_id
    OR v_current.contractor_vendor_id IS DISTINCT FROM p_contractor_vendor_id;

  IF v_assignment_changed THEN
    PERFORM public.set_duty_assignment(
      v_saved.id, p_primary_profile_id, p_backup_profile_id,
      p_contractor_vendor_id, p_assignment_effective_date, p_assignment_reason
    );
  END IF;

  IF NOT v_saved.is_active OR v_saved.active_through IS NOT NULL THEN
    UPDATE public.tasks SET
      status = 'cancelled',
      cancel_reason = 'duty_inactive',
      updated_at = NOW()
    WHERE duty_id = v_saved.id AND status = 'pending'
      AND (
        NOT v_saved.is_active
        OR original_due_date > v_saved.active_through
      );
  END IF;

  RETURN v_saved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reassign_active_duties(
  p_from_profile_id UUID,
  p_replacement_profile_id UUID DEFAULT NULL,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL,
  p_duty_ids UUID[] DEFAULT NULL
) RETURNS TABLE(duty_id UUID, assignment_id UUID, role_changed TEXT) AS $$
DECLARE
  a public.duty_assignments%ROWTYPE;
  v_primary UUID;
  v_backup UUID;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active GM or operations manager may reassign duties';
  END IF;
  IF p_from_profile_id IS NULL OR p_from_profile_id = p_replacement_profile_id THEN
    RAISE EXCEPTION 'Choose a different source and replacement employee';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A reassignment reason is required'; END IF;

  FOR a IN
    SELECT da.* FROM public.duty_assignments da
    JOIN public.operation_duties od ON od.id = da.duty_id AND od.is_active = TRUE
    WHERE da.effective_from <= p_effective_date
      AND (da.effective_through IS NULL OR da.effective_through >= p_effective_date)
      AND (da.primary_profile_id = p_from_profile_id OR da.backup_profile_id = p_from_profile_id)
      AND (p_duty_ids IS NULL OR da.duty_id = ANY(p_duty_ids))
    ORDER BY od.sort_order, od.title FOR UPDATE OF da
  LOOP
    v_primary := a.primary_profile_id;
    v_backup := a.backup_profile_id;
    IF a.primary_profile_id = p_from_profile_id THEN
      v_primary := p_replacement_profile_id;
      IF v_backup = p_replacement_profile_id OR v_primary IS NULL THEN v_backup := NULL; END IF;
      role_changed := 'primary';
    ELSE
      v_backup := p_replacement_profile_id;
      IF v_backup = v_primary THEN v_backup := NULL; END IF;
      role_changed := 'backup';
    END IF;
    assignment_id := public.set_duty_assignment(
      a.duty_id, v_primary, v_backup, NULL, p_effective_date, p_reason
    );
    duty_id := a.duty_id;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Temporary coverage preview and atomic apply
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_temporary_duty_coverage(
  p_duty_id UUID,
  p_starts_on DATE,
  p_ends_on DATE
) RETURNS TABLE(task_id UUID, due_date DATE, status TEXT, will_move BOOLEAN) AS $$
BEGIN
  IF NOT public.can_manage_daily_operations() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF p_ends_on < p_starts_on THEN RAISE EXCEPTION 'Coverage end cannot precede its start'; END IF;
  RETURN QUERY
  SELECT t.id, t.due_date, t.status, t.status = 'pending'
  FROM public.tasks t
  WHERE t.duty_id = p_duty_id AND t.due_date BETWEEN p_starts_on AND p_ends_on
  ORDER BY t.due_date, t.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_temporary_duty_coverage(
  p_duty_id UUID,
  p_primary_profile_id UUID DEFAULT NULL,
  p_backup_profile_id UUID DEFAULT NULL,
  p_contractor_vendor_id UUID DEFAULT NULL,
  p_starts_on DATE DEFAULT CURRENT_DATE,
  p_ends_on DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_permanent public.duty_assignments%ROWTYPE;
  v_coverage public.duty_temporary_coverages%ROWTYPE;
  v_type TEXT;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF p_ends_on < p_starts_on THEN RAISE EXCEPTION 'Coverage end cannot precede its start'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A temporary coverage reason is required'; END IF;
  IF p_primary_profile_id IS NOT NULL AND p_primary_profile_id = p_backup_profile_id THEN
    RAISE EXCEPTION 'Primary and backup employees must be different';
  END IF;
  IF p_contractor_vendor_id IS NOT NULL AND (p_primary_profile_id IS NOT NULL OR p_backup_profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Employee and contractor coverage cannot be combined';
  END IF;
  IF p_backup_profile_id IS NOT NULL AND p_primary_profile_id IS NULL THEN
    RAISE EXCEPTION 'A backup requires a primary employee';
  END IF;
  IF p_primary_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_primary_profile_id AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'Temporary primary employee must be an active profile'; END IF;
  IF p_backup_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_backup_profile_id AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'Temporary backup employee must be an active profile'; END IF;
  IF p_contractor_vendor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vendors WHERE id = p_contractor_vendor_id
  ) THEN RAISE EXCEPTION 'Temporary contractor vendor was not found'; END IF;

  SELECT * INTO v_permanent FROM public.duty_assignments
  WHERE duty_id = p_duty_id
    AND effective_from <= p_starts_on
    AND (effective_through IS NULL OR effective_through >= p_ends_on)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'One permanent assignment must cover the entire temporary period';
  END IF;

  v_type := CASE WHEN p_contractor_vendor_id IS NOT NULL THEN 'contractor'
    WHEN p_primary_profile_id IS NOT NULL THEN 'employee' ELSE 'unassigned' END;

  INSERT INTO public.duty_temporary_coverages (
    duty_id, permanent_assignment_id, assignee_type,
    primary_profile_id, backup_profile_id, contractor_vendor_id,
    starts_on, ends_on, reason, created_by
  ) VALUES (
    p_duty_id, v_permanent.id, v_type,
    CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
    CASE WHEN v_type = 'employee' THEN p_backup_profile_id END,
    CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id END,
    p_starts_on, p_ends_on, BTRIM(p_reason), (SELECT auth.uid())
  ) RETURNING * INTO v_coverage;

  UPDATE public.tasks SET
    assigned_to = CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
    assigned_by = (SELECT auth.uid()),
    duty_assignment_id = v_permanent.id,
    duty_coverage_id = v_coverage.id,
    duty_owner_type = v_type,
    duty_primary_profile_id = CASE WHEN v_type = 'employee' THEN p_primary_profile_id END,
    duty_backup_profile_id = CASE WHEN v_type = 'employee' THEN p_backup_profile_id END,
    duty_contractor_vendor_id = CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id END,
    duty_primary_name = (SELECT full_name FROM public.profiles WHERE id = p_primary_profile_id),
    duty_backup_name = (SELECT full_name FROM public.profiles WHERE id = p_backup_profile_id),
    duty_contractor_name = (SELECT COALESCE(company, name) FROM public.vendors WHERE id = p_contractor_vendor_id),
    updated_at = NOW()
  WHERE duty_id = p_duty_id AND due_date BETWEEN p_starts_on AND p_ends_on
    AND status = 'pending';

  PERFORM public.record_duty_audit_event(
    p_duty_id, 'temporary_coverage_set', p_reason, p_starts_on,
    to_jsonb(v_permanent), to_jsonb(v_coverage),
    jsonb_build_object('ends_on', p_ends_on)
  );
  RETURN v_coverage.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Future recurrence preview and atomic revision
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_duty_recurrence_change(
  p_duty_id UUID,
  p_effective_date DATE,
  p_recurrence_rule JSONB
) RETURNS TABLE(task_id UUID, occurrence_key TEXT, original_due_date DATE, due_date DATE, status TEXT, action TEXT) AS $$
DECLARE v_season TEXT; v_start TEXT; v_end TEXT;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  SELECT season, seasonal_start_mmdd, seasonal_end_mmdd INTO v_season, v_start, v_end
  FROM public.operation_duties WHERE id = p_duty_id;
  RETURN QUERY
  SELECT t.id, t.occurrence_key, t.original_due_date, t.due_date, t.status,
    CASE
      WHEN t.status <> 'pending' THEN 'preserve'
      WHEN t.due_date IS DISTINCT FROM t.original_due_date THEN 'preserve'
      WHEN public.duty_rule_matches(t.original_due_date, p_effective_date, p_recurrence_rule, v_season)
        AND public.duty_date_in_season(t.original_due_date, v_season, v_start, v_end) THEN 'preserve'
      ELSE 'cancel_pending'
    END
  FROM public.tasks t
  WHERE t.duty_id = p_duty_id AND t.original_due_date >= p_effective_date
  ORDER BY t.original_due_date, t.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.change_future_duty_recurrence(
  p_duty_id UUID,
  p_effective_date DATE,
  p_cadence TEXT,
  p_recurrence_rule JSONB,
  p_reason TEXT
) RETURNS UUID AS $$
DECLARE
  v_current public.duty_recurrence_versions%ROWTYPE;
  v_new public.duty_recurrence_versions%ROWTYPE;
  v_duty public.operation_duties%ROWTYPE;
  v_horizon DATE;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'An effective date is required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A recurrence change reason is required'; END IF;
  IF p_cadence NOT IN ('daily','weekly','monthly','quarterly','annual') THEN RAISE EXCEPTION 'Unsupported cadence'; END IF;
  IF COALESCE((p_recurrence_rule->>'interval')::INTEGER,1) < 1 THEN RAISE EXCEPTION 'Recurrence interval must be at least one'; END IF;
  IF p_recurrence_rule->>'cadence' IS DISTINCT FROM p_cadence THEN RAISE EXCEPTION 'Cadence and recurrence rule must agree'; END IF;

  SELECT * INTO v_duty FROM public.operation_duties WHERE id = p_duty_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Duty was not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.duty_recurrence_versions
    WHERE duty_id = p_duty_id AND effective_from > p_effective_date
  ) THEN RAISE EXCEPTION 'A later recurrence revision already exists; revise it explicitly first'; END IF;

  SELECT * INTO v_current FROM public.duty_recurrence_versions
  WHERE duty_id = p_duty_id
    AND effective_from <= p_effective_date
    AND (effective_through IS NULL OR effective_through >= p_effective_date)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active recurrence version covers the effective date'; END IF;
  IF v_current.effective_from = p_effective_date THEN
    RAISE EXCEPTION 'A recurrence version already begins on this date';
  END IF;

  UPDATE public.duty_recurrence_versions
  SET effective_through = p_effective_date - 1
  WHERE id = v_current.id;

  INSERT INTO public.duty_recurrence_versions (
    duty_id, cadence, recurrence_rule, effective_from, effective_through,
    change_reason, changed_by
  ) VALUES (
    p_duty_id, p_cadence, p_recurrence_rule, p_effective_date,
    v_current.effective_through, BTRIM(p_reason), (SELECT auth.uid())
  ) RETURNING * INTO v_new;

  UPDATE public.operation_duties SET
    cadence = p_cadence,
    recurrence_rule = p_recurrence_rule,
    days = CASE WHEN jsonb_typeof(p_recurrence_rule->'weekdays') = 'array'
      THEN p_recurrence_rule->'weekdays' ELSE days END,
    updated_by = (SELECT auth.uid()), updated_at = NOW()
  WHERE id = p_duty_id;

  UPDATE public.tasks t SET
    status = 'cancelled', cancel_reason = 'recurrence_changed', updated_at = NOW()
  WHERE t.duty_id = p_duty_id AND t.original_due_date >= p_effective_date
    AND t.status = 'pending'
    AND t.due_date IS NOT DISTINCT FROM t.original_due_date
    AND NOT (
      public.duty_rule_matches(t.original_due_date, p_effective_date, p_recurrence_rule, v_duty.season)
      AND public.duty_date_in_season(t.original_due_date, v_duty.season, v_duty.seasonal_start_mmdd, v_duty.seasonal_end_mmdd)
    );

  SELECT GREATEST(
    p_effective_date + 60,
    COALESCE(MAX(original_due_date), p_effective_date + 60)
  ) INTO v_horizon FROM public.tasks WHERE duty_id = p_duty_id;
  v_horizon := LEAST(v_horizon, p_effective_date + 400);
  PERFORM public.materialize_duty_occurrences(p_effective_date, v_horizon);

  PERFORM public.record_duty_audit_event(
    p_duty_id, 'future_recurrence_changed', p_reason, p_effective_date,
    to_jsonb(v_current), to_jsonb(v_new)
  );
  RETURN v_new.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.move_duty_occurrence(
  p_task_id UUID,
  p_new_due_date DATE,
  p_reason TEXT
) RETURNS public.tasks AS $$
DECLARE v_before public.tasks%ROWTYPE; v_after public.tasks%ROWTYPE;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF p_new_due_date IS NULL THEN RAISE EXCEPTION 'A new date is required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A move reason is required'; END IF;
  SELECT * INTO v_before FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR v_before.duty_id IS NULL THEN RAISE EXCEPTION 'Duty occurrence was not found'; END IF;
  IF v_before.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending occurrences may be moved; execution history is protected';
  END IF;
  UPDATE public.tasks SET due_date = p_new_due_date, updated_at = NOW()
  WHERE id = p_task_id RETURNING * INTO v_after;
  PERFORM public.record_duty_audit_event(
    v_before.duty_id, 'occurrence_moved', p_reason, p_new_due_date,
    jsonb_build_object('task_id', v_before.id, 'occurrence_key', v_before.occurrence_key,
      'original_due_date', v_before.original_due_date, 'due_date', v_before.due_date),
    jsonb_build_object('task_id', v_after.id, 'occurrence_key', v_after.occurrence_key,
      'original_due_date', v_after.original_due_date, 'due_date', v_after.due_date)
  );
  RETURN v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Explicit legacy roster linking
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_pro_shop_staff_profile(
  p_staff_id UUID,
  p_profile_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE v_before public.pro_shop_staff%ROWTYPE; v_after public.pro_shop_staff%ROWTYPE;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A link confirmation reason is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'The selected authenticated profile is not active';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pro_shop_staff WHERE profile_id = p_profile_id AND id <> p_staff_id) THEN
    RAISE EXCEPTION 'That profile is already linked to another legacy roster record';
  END IF;
  SELECT * INTO v_before FROM public.pro_shop_staff WHERE id = p_staff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy roster record was not found'; END IF;
  UPDATE public.pro_shop_staff SET profile_id = p_profile_id, updated_at = NOW()
  WHERE id = p_staff_id RETURNING * INTO v_after;
  PERFORM public.record_duty_audit_event(
    NULL, 'legacy_roster_linked', p_reason, CURRENT_DATE,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('staff_id', p_staff_id, 'profile_id', p_profile_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Evidence and status-transition enforcement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.task_required_evidence_satisfied(p_task_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_state TEXT; v_requirements JSONB;
BEGIN
  SELECT duty_evidence_requirement_state, duty_evidence_requirements
  INTO v_state, v_requirements FROM public.tasks WHERE id = p_task_id;
  IF v_state IS DISTINCT FROM 'required' THEN RETURN TRUE; END IF;
  IF jsonb_typeof(v_requirements) <> 'array' OR jsonb_array_length(v_requirements) = 0 THEN
    RETURN FALSE;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_requirements) requirement
    WHERE NOT CASE requirement->>'type'
      WHEN 'photo_before' THEN EXISTS (
        SELECT 1 FROM public.photos p WHERE p.task_id = p_task_id AND p.photo_type = 'before'
      )
      WHEN 'photo_after' THEN EXISTS (
        SELECT 1 FROM public.photos p WHERE p.task_id = p_task_id
          AND p.photo_type IN ('after','completed_work')
      )
      WHEN 'photo' THEN EXISTS (
        SELECT 1 FROM public.photos p WHERE p.task_id = p_task_id
      )
      ELSE EXISTS (
        SELECT 1 FROM public.task_evidence_items e
        WHERE e.task_id = p_task_id
          AND e.requirement_key = COALESCE(requirement->>'key', requirement->>'label')
      )
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_task_execution_requirements(p_task_ids UUID[])
RETURNS TABLE(task_id UUID, evidence_satisfied BOOLEAN) AS $$
  SELECT t.id, public.task_required_evidence_satisfied(t.id)
  FROM public.tasks t
  WHERE t.id = ANY(COALESCE(p_task_ids, '{}'::UUID[]))
    AND (
      t.assigned_to = (SELECT auth.uid())
      OR public.can_manage_tasks()
      OR (
        public.is_active_foreman()
        AND t.assigned_crew IS NOT NULL
        AND t.assigned_crew = public.get_user_crew((SELECT auth.uid()))
      )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.guard_task_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_manager BOOLEAN;
  v_foreman BOOLEAN;
  v_authorized BOOLEAN;
  v_allowed_employee_fields TEXT[] := ARRAY[
    'status','actual_minutes','notes','completed_at','completed_by',
    'blocked_reason','updated_at'
  ];
  v_allowed_completed_fields TEXT[] := ARRAY[
    'status','verified_at','verified_by','updated_at'
  ];
BEGIN
  -- Trusted database jobs have no end-user JWT. Browser/API callers always do.
  IF v_actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  v_manager := public.can_manage_tasks();
  v_foreman := public.is_active_foreman();

  IF TG_OP = 'DELETE' THEN
    IF NOT v_manager THEN RAISE EXCEPTION 'Only managers may delete tasks'; END IF;
    IF OLD.status IN ('completed','verified') THEN
      RAISE EXCEPTION 'Completed and verified tasks are protected history';
    END IF;
    RETURN OLD;
  END IF;

  v_authorized := v_manager
    OR OLD.assigned_to = v_actor
    OR (v_foreman AND OLD.assigned_crew IS NOT NULL
      AND OLD.assigned_crew = public.get_user_crew(v_actor));
  IF NOT v_authorized THEN RAISE EXCEPTION 'You may not update this task'; END IF;

  IF OLD.status IN ('completed','verified') THEN
    IF NOT v_manager THEN RAISE EXCEPTION 'Completed and verified tasks are protected history'; END IF;
    IF (to_jsonb(NEW) - v_allowed_completed_fields)
       IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_completed_fields) THEN
      RAISE EXCEPTION 'Completed task facts cannot be rewritten';
    END IF;
    IF OLD.status = 'verified' OR NEW.status <> 'verified' THEN
      RAISE EXCEPTION 'Verified tasks cannot be changed or reopened';
    END IF;
  ELSIF NOT v_manager AND (
    (to_jsonb(NEW) - v_allowed_employee_fields)
      IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_employee_fields)
  ) THEN
    RAISE EXCEPTION 'Employees may update only execution fields on their own tasks';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'verified' THEN
      IF NOT v_manager THEN RAISE EXCEPTION 'Only managers may verify work'; END IF;
      IF OLD.status <> 'completed' THEN RAISE EXCEPTION 'Only completed work can be verified'; END IF;
      IF NEW.duty_id IS NOT NULL
         AND NEW.duty_verification_requirement_state IS DISTINCT FROM 'required' THEN
        RAISE EXCEPTION 'This duty occurrence does not require manager verification';
      END IF;
      NEW.verified_by := v_actor;
      NEW.verified_at := COALESCE(NEW.verified_at, NOW());
    ELSIF NEW.status = 'completed' THEN
      IF OLD.status NOT IN ('pending','in_progress','blocked') THEN
        RAISE EXCEPTION 'This task cannot transition to completed';
      END IF;
      IF NOT public.task_required_evidence_satisfied(OLD.id) THEN
        RAISE EXCEPTION 'Required evidence is missing';
      END IF;
      NEW.completed_by := v_actor;
      NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    ELSIF NEW.status = 'in_progress' THEN
      IF OLD.status NOT IN ('pending','blocked') THEN RAISE EXCEPTION 'This task cannot be started'; END IF;
      NEW.blocked_reason := NULL;
    ELSIF NEW.status = 'blocked' THEN
      IF OLD.status NOT IN ('pending','in_progress') THEN RAISE EXCEPTION 'This task cannot be blocked'; END IF;
      IF NULLIF(BTRIM(NEW.blocked_reason),'') IS NULL THEN RAISE EXCEPTION 'A blocked reason is required'; END IF;
    ELSIF NOT v_manager THEN
      RAISE EXCEPTION 'Employees cannot make that status transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_task_mutation ON public.tasks;
CREATE TRIGGER trg_guard_task_mutation
BEFORE UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_task_mutation();

CREATE OR REPLACE FUNCTION public.transition_task_status(
  p_task_id UUID,
  p_status TEXT,
  p_blocked_reason TEXT DEFAULT NULL
) RETURNS public.tasks AS $$
DECLARE v_task public.tasks%ROWTYPE; v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task was not found or is not visible'; END IF;
  IF NOT (
    public.can_manage_tasks()
    OR v_task.assigned_to = v_actor
    OR (public.is_active_foreman() AND v_task.assigned_crew IS NOT NULL
      AND v_task.assigned_crew = public.get_user_crew(v_actor))
  ) THEN RAISE EXCEPTION 'You may not update this task'; END IF;
  UPDATE public.tasks SET status = p_status, blocked_reason = p_blocked_reason, updated_at = NOW()
  WHERE id = p_task_id RETURNING * INTO v_task;
  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_task_evidence(
  p_task_id UUID,
  p_requirement_key TEXT,
  p_requirement_type TEXT,
  p_note TEXT DEFAULT NULL,
  p_document_url TEXT DEFAULT NULL,
  p_external_reference TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID; v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = p_task_id
      AND (t.assigned_to = v_actor OR public.can_manage_tasks())
  ) THEN RAISE EXCEPTION 'You may not record evidence for this task'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t, jsonb_array_elements(t.duty_evidence_requirements) r
    WHERE t.id = p_task_id
      AND COALESCE(r->>'key', r->>'label') = p_requirement_key
      AND r->>'type' = p_requirement_type
  ) THEN RAISE EXCEPTION 'That evidence requirement is not recorded for this task'; END IF;
  INSERT INTO public.task_evidence_items (
    task_id, requirement_key, requirement_type, note,
    document_url, external_reference, satisfied_by
  ) VALUES (
    p_task_id, p_requirement_key, p_requirement_type,
    NULLIF(BTRIM(p_note),''), NULLIF(BTRIM(p_document_url),''),
    NULLIF(BTRIM(p_external_reference),''), v_actor
  )
  ON CONFLICT (task_id, requirement_key) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type,
    note = EXCLUDED.note,
    document_url = EXCLUDED.document_url,
    external_reference = EXCLUDED.external_reference,
    satisfied_at = NOW(), satisfied_by = EXCLUDED.satisfied_by
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ---------------------------------------------------------------------------
-- RLS: replace, do not add to, permissive task policies
-- ---------------------------------------------------------------------------

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tasks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', p.policyname);
  END LOOP;
END $$;

CREATE POLICY tasks_select_authorized ON public.tasks
  FOR SELECT TO authenticated USING (
    assigned_to = (SELECT auth.uid())
    OR assigned_by = (SELECT auth.uid())
    OR public.can_manage_tasks()
    OR (
      public.is_active_foreman()
      AND assigned_crew IS NOT NULL
      AND assigned_crew = public.get_user_crew((SELECT auth.uid()))
    )
  );

CREATE POLICY tasks_insert_supervisor ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (
    (public.can_manage_tasks() OR public.is_active_foreman())
    AND assigned_by = (SELECT auth.uid())
    AND status = 'pending'
    AND completed_at IS NULL
    AND completed_by IS NULL
    AND verified_at IS NULL
    AND verified_by IS NULL
    AND duty_id IS NULL
    AND occurrence_key IS NULL
  );

CREATE POLICY tasks_update_authorized ON public.tasks
  FOR UPDATE TO authenticated USING (
    assigned_to = (SELECT auth.uid())
    OR public.can_manage_tasks()
    OR (
      public.is_active_foreman()
      AND assigned_crew IS NOT NULL
      AND assigned_crew = public.get_user_crew((SELECT auth.uid()))
    )
  ) WITH CHECK (
    assigned_to = (SELECT auth.uid())
    OR public.can_manage_tasks()
    OR (
      public.is_active_foreman()
      AND assigned_crew IS NOT NULL
      AND assigned_crew = public.get_user_crew((SELECT auth.uid()))
    )
  );

CREATE POLICY tasks_delete_manager ON public.tasks
  FOR DELETE TO authenticated USING (public.can_manage_tasks());

ALTER TABLE public.duty_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_recurrence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_temporary_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_evidence_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY duty_audit_events_select_authenticated ON public.duty_audit_events
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY duty_recurrence_versions_select_authenticated ON public.duty_recurrence_versions
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY duty_temporary_coverages_select_authenticated ON public.duty_temporary_coverages
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY task_evidence_items_select_authorized ON public.task_evidence_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_id
        AND (t.assigned_to = (SELECT auth.uid()) OR public.can_manage_tasks())
    )
  );
CREATE POLICY task_evidence_items_insert_authorized ON public.task_evidence_items
  FOR INSERT TO authenticated WITH CHECK (
    satisfied_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_id
        AND (t.assigned_to = (SELECT auth.uid()) OR public.can_manage_tasks())
    )
  );
CREATE POLICY task_evidence_items_update_authorized ON public.task_evidence_items
  FOR UPDATE TO authenticated USING (
    satisfied_by = (SELECT auth.uid()) OR public.can_manage_tasks()
  ) WITH CHECK (
    satisfied_by = (SELECT auth.uid()) OR public.can_manage_tasks()
  );

-- Canonical duties and assignments are writable only through the atomic RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.operation_duties FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.duty_assignments FROM authenticated;
GRANT SELECT ON public.operation_duties, public.duty_assignments TO authenticated;
GRANT SELECT ON public.duty_audit_events, public.duty_recurrence_versions,
  public.duty_temporary_coverages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.task_evidence_items TO authenticated;

-- Retire the competing legacy writer while retaining read/provenance access.
DROP POLICY IF EXISTS "Authenticated can manage pro_shop_duties" ON public.pro_shop_duties;
REVOKE INSERT, UPDATE, DELETE ON public.pro_shop_duties FROM authenticated;
GRANT SELECT ON public.pro_shop_duties TO authenticated;

REVOKE ALL ON FUNCTION public.can_manage_daily_operations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_tasks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_foreman() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_duty_audit_event(UUID,TEXT,TEXT,DATE,JSONB,JSONB,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_duty_assignment(UUID,UUID,UUID,UUID,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_operation_duty(UUID,JSONB,UUID,UUID,UUID,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_active_duties(UUID,UUID,DATE,TEXT,UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_temporary_duty_coverage(UUID,DATE,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_temporary_duty_coverage(UUID,UUID,UUID,UUID,DATE,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_duty_recurrence_change(UUID,DATE,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_future_duty_recurrence(UUID,DATE,TEXT,JSONB,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_duty_occurrence(UUID,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_pro_shop_staff_profile(UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.task_required_evidence_satisfied(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_task_execution_requirements(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_task_status(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_task_evidence(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_manage_daily_operations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_foreman() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_duty_assignment(UUID,UUID,UUID,UUID,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_operation_duty(UUID,JSONB,UUID,UUID,UUID,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_active_duties(UUID,UUID,DATE,TEXT,UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_temporary_duty_coverage(UUID,DATE,DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_temporary_duty_coverage(UUID,UUID,UUID,UUID,DATE,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_duty_recurrence_change(UUID,DATE,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_future_duty_recurrence(UUID,DATE,TEXT,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_duty_occurrence(UUID,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_pro_shop_staff_profile(UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_execution_requirements(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_task_status(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_task_evidence(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
