-- Daily Operations, Delegation, and Standards Execution — Phase 1A
--
-- Canonicalizes standing duties around the existing task execution system:
--   * explicit department and role groups (golf operations != pro shop)
--   * temporal primary / backup / contractor ownership
--   * duty-backed task_series and materialized task occurrences
--   * immutable occurrence keys so moving one task cannot regenerate it
--   * atomic, manager-approved assignment and bulk-reassignment functions
--
-- Existing duty_completions remain for historical compatibility. No employee
-- ownership, duration, policy, evidence, or equipment facts are fabricated.

BEGIN;

-- ── Workforce classification ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS role_group TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_department_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_check CHECK (
  department IS NULL OR department IN (
    'golf_operations','maintenance','food_and_beverage','pro_shop','administration','external'
  )
) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_group_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_group_check CHECK (
  role_group IS NULL OR role_group IN (
    'recreation_aide','golf_operations_assistant','maintenance_staff',
    'restaurant_staff','pro_shop_staff','general_manager','contractor','unassigned'
  )
) NOT VALID;

-- These mappings come from recorded role / position-title facts. Other staff
-- remain unclassified for the GM to review; no inference from names is used.
UPDATE public.profiles
SET department = COALESCE(department, 'administration'),
    role_group = COALESCE(role_group, 'general_manager')
WHERE role IN ('gm','director');

UPDATE public.profiles
SET department = COALESCE(department, 'golf_operations'),
    role_group = COALESCE(
      role_group,
      CASE personnel_details->>'position_title'
        WHEN 'Recreation Aide' THEN 'recreation_aide'
        WHEN 'Golf Operations Assistant' THEN 'golf_operations_assistant'
      END
    )
WHERE personnel_details->>'position_title' IN ('Recreation Aide','Golf Operations Assistant');

ALTER TABLE public.pro_shop_staff
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_shop_staff_profile
  ON public.pro_shop_staff(profile_id) WHERE profile_id IS NOT NULL;

-- ── Canonical duty definition ──────────────────────────────────────────────

ALTER TABLE public.operation_duties
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS role_group TEXT,
  ADD COLUMN IF NOT EXISTS cadence TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB NOT NULL DEFAULT '{"cadence":"weekly","interval":1}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS equipment_needed TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_document TEXT,
  ADD COLUMN IF NOT EXISTS standard_reference TEXT,
  ADD COLUMN IF NOT EXISTS evidence_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manager_verification_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS task_category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS active_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS active_through DATE,
  ADD COLUMN IF NOT EXISTS legacy_source TEXT,
  ADD COLUMN IF NOT EXISTS legacy_source_id UUID;

ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_area_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_area_check CHECK (
  area IN ('course','restaurant','pro_shop','golf_operations','administration','external','unassigned')
) NOT VALID;
ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_department_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_department_check CHECK (
  department IN ('golf_operations','maintenance','food_and_beverage','pro_shop','administration','external')
) NOT VALID;
ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_role_group_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_role_group_check CHECK (
  role_group IN (
    'recreation_aide','golf_operations_assistant','maintenance_staff',
    'restaurant_staff','pro_shop_staff','general_manager','contractor','unassigned'
  )
) NOT VALID;
ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_cadence_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_cadence_check
  CHECK (cadence IN ('daily','weekly','monthly','quarterly','annual')) NOT VALID;
ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_duration_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_duration_check
  CHECK (estimated_minutes IS NULL OR estimated_minutes > 0) NOT VALID;
ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_dates_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_dates_check
  CHECK (active_through IS NULL OR active_through >= active_from) NOT VALID;
ALTER TABLE public.operation_duties DROP CONSTRAINT IF EXISTS operation_duties_priority_check;
ALTER TABLE public.operation_duties ADD CONSTRAINT operation_duties_priority_check
  CHECK (priority IN ('critical','high','normal','low')) NOT VALID;

UPDATE public.operation_duties
SET department = CASE area
      WHEN 'course' THEN 'maintenance'
      WHEN 'restaurant' THEN 'food_and_beverage'
      WHEN 'pro_shop' THEN 'pro_shop'
      ELSE COALESCE(department, 'administration')
    END,
    role_group = CASE area
      WHEN 'course' THEN 'maintenance_staff'
      WHEN 'restaurant' THEN 'restaurant_staff'
      WHEN 'pro_shop' THEN 'pro_shop_staff'
      ELSE COALESCE(role_group, 'unassigned')
    END,
    recurrence_rule = jsonb_build_object(
      'cadence', 'weekly',
      'interval', 1,
      'weekdays', days
    ),
    task_category = CASE area
      WHEN 'course' THEN 'grounds'
      WHEN 'pro_shop' THEN 'pro_shop'
      ELSE 'admin'
    END,
    instructions = COALESCE(instructions, note)
WHERE department IS NULL OR role_group IS NULL OR recurrence_rule = '{"cadence":"weekly","interval":1}'::jsonb;

ALTER TABLE public.operation_duties ALTER COLUMN department SET NOT NULL;
ALTER TABLE public.operation_duties ALTER COLUMN role_group SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_duties_legacy_source
  ON public.operation_duties(legacy_source, legacy_source_id)
  WHERE legacy_source IS NOT NULL AND legacy_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operation_duties_role_group
  ON public.operation_duties(is_active, role_group, sort_order);

-- Migrate the legacy golf-operations duty catalog without relabeling its
-- recreation-aide and golf-operations-assistant groups as pro-shop staff.
INSERT INTO public.operation_duties (
  title, area, department, role_group, days, season, cadence, recurrence_rule,
  instructions, note, is_active, sort_order, legacy_source, legacy_source_id
)
SELECT
  pd.title,
  'golf_operations',
  'golf_operations',
  CASE
    WHEN ps.position = 'rec_aid' OR pd.area = 'outside' THEN 'recreation_aide'
    WHEN ps.position = 'golf_ops_assistant' OR pd.area = 'inside' THEN 'golf_operations_assistant'
    ELSE 'unassigned'
  END,
  pd.days,
  'year_round',
  'weekly',
  jsonb_build_object('cadence','weekly','interval',1,'weekdays',pd.days),
  pd.note,
  pd.note,
  pd.is_active,
  pd.sort_order,
  'pro_shop_duties',
  pd.id
FROM public.pro_shop_duties pd
LEFT JOIN public.pro_shop_staff ps ON ps.id = pd.staff_id
ON CONFLICT (legacy_source, legacy_source_id)
  WHERE legacy_source IS NOT NULL AND legacy_source_id IS NOT NULL
DO NOTHING;

-- ── Temporal assignment history ────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.duty_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id UUID NOT NULL REFERENCES public.operation_duties(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('employee','contractor','unassigned')),
  primary_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  backup_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contractor_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  effective_from DATE NOT NULL,
  effective_through DATE,
  change_reason TEXT NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duty_assignments_dates_check CHECK (
    effective_through IS NULL OR effective_through >= effective_from
  ),
  CONSTRAINT duty_assignments_people_distinct CHECK (
    primary_profile_id IS NULL OR backup_profile_id IS NULL OR primary_profile_id <> backup_profile_id
  ),
  CONSTRAINT duty_assignments_target_check CHECK (
    (assignee_type = 'employee' AND primary_profile_id IS NOT NULL AND contractor_vendor_id IS NULL)
    OR (assignee_type = 'contractor' AND primary_profile_id IS NULL AND backup_profile_id IS NULL AND contractor_vendor_id IS NOT NULL)
    OR (assignee_type = 'unassigned' AND primary_profile_id IS NULL AND backup_profile_id IS NULL AND contractor_vendor_id IS NULL)
  )
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'duty_assignments_no_overlap'
  ) THEN
    ALTER TABLE public.duty_assignments ADD CONSTRAINT duty_assignments_no_overlap
      EXCLUDE USING gist (
        duty_id WITH =,
        daterange(effective_from, COALESCE(effective_through, 'infinity'::date), '[]') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_duty_assignments_primary
  ON public.duty_assignments(primary_profile_id, effective_from, effective_through);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_backup
  ON public.duty_assignments(backup_profile_id, effective_from, effective_through);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_duty
  ON public.duty_assignments(duty_id, effective_from DESC);

-- Explicit unassigned periods are honest: missing ownership is not converted
-- into an invented person or role.
INSERT INTO public.duty_assignments (
  duty_id, assignee_type, primary_profile_id, backup_profile_id,
  contractor_vendor_id, effective_from, change_reason
)
SELECT
  d.id,
  CASE WHEN ps.profile_id IS NOT NULL THEN 'employee' ELSE 'unassigned' END,
  ps.profile_id,
  NULL,
  NULL,
  d.active_from,
  CASE
    WHEN ps.profile_id IS NOT NULL THEN 'Imported from linked golf-operations schedule staff'
    ELSE 'Phase 1A migration: ownership not recorded'
  END
FROM public.operation_duties d
LEFT JOIN public.pro_shop_duties pd
  ON d.legacy_source = 'pro_shop_duties' AND d.legacy_source_id = pd.id
LEFT JOIN public.pro_shop_staff ps ON ps.id = pd.staff_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.duty_assignments a WHERE a.duty_id = d.id
);

-- ── Reuse task_series / tasks for executable occurrences ──────────────────

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.task_series'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tier%'
  LOOP
    EXECUTE format('ALTER TABLE public.task_series DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.task_series ALTER COLUMN weekday DROP NOT NULL;
ALTER TABLE public.task_series
  ADD CONSTRAINT task_series_tier_check
  CHECK (tier IN ('daily','weekly','monthly','quarterly','annual')) NOT VALID;
ALTER TABLE public.task_series
  ADD COLUMN IF NOT EXISTS duty_id UUID REFERENCES public.operation_duties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_through DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_series_duty
  ON public.task_series(duty_id) WHERE duty_id IS NOT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS duty_id UUID REFERENCES public.operation_duties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_assignment_id UUID REFERENCES public.duty_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_key TEXT,
  ADD COLUMN IF NOT EXISTS original_due_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_series_occurrence_key
  ON public.tasks(series_id, occurrence_key)
  WHERE series_id IS NOT NULL AND occurrence_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_duty_due
  ON public.tasks(duty_id, due_date) WHERE duty_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_operation_duty_series()
RETURNS TRIGGER AS $$
DECLARE
  v_weekday INTEGER;
BEGIN
  v_weekday := CASE COALESCE(NEW.days->>0, '')
    WHEN 'sun' THEN 0 WHEN 'mon' THEN 1 WHEN 'tue' THEN 2 WHEN 'wed' THEN 3
    WHEN 'thu' THEN 4 WHEN 'fri' THEN 5 WHEN 'sat' THEN 6 ELSE NULL END;

  INSERT INTO public.task_series (
    assigned_to, template_id, tier, weekday, week_of_month, task_payload,
    active, created_by, duty_id, recurrence_rule, timezone,
    effective_from, effective_through
  ) VALUES (
    NULL,
    NULL,
    NEW.cadence,
    v_weekday,
    NULL,
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
      'requires_photo_after', COALESCE(NEW.evidence_requirements ? 'photo', FALSE),
      'weather_dependent', FALSE,
      'weather_conditions', NULL,
      'template_id', NULL,
      'notes', NEW.instructions
    ),
    NEW.is_active,
    NULL,
    NEW.id,
    NEW.recurrence_rule,
    'America/Chicago',
    NEW.active_from,
    NEW.active_through
  )
  ON CONFLICT (duty_id) WHERE duty_id IS NOT NULL DO UPDATE SET
    tier = EXCLUDED.tier,
    weekday = EXCLUDED.weekday,
    task_payload = EXCLUDED.task_payload,
    active = EXCLUDED.active,
    recurrence_rule = EXCLUDED.recurrence_rule,
    effective_from = EXCLUDED.effective_from,
    effective_through = EXCLUDED.effective_through;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_operation_duty_series ON public.operation_duties;
CREATE TRIGGER trg_operation_duty_series
AFTER INSERT OR UPDATE OF title, note, cadence, days, recurrence_rule,
  estimated_minutes, instructions, equipment_needed, evidence_requirements,
  task_category, priority, is_active, active_from, active_through
ON public.operation_duties
FOR EACH ROW EXECUTE FUNCTION public.sync_operation_duty_series();

-- Fire the sync trigger for existing and newly migrated duty definitions.
UPDATE public.operation_duties SET updated_at = COALESCE(updated_at, NOW());

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
  IF p_date < p_anchor THEN RETURN FALSE; END IF;
  IF p_season = 'in_season'
    AND to_char(p_date, 'MM-DD') NOT BETWEEN '03-20' AND '10-15'
  THEN RETURN FALSE; END IF;

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
      AND (
        NOT v_has_months OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(p_rule->'months') month_value
          WHERE month_value::INTEGER = EXTRACT(MONTH FROM p_date)::INTEGER
        )
      );
  ELSE
    RETURN MOD(v_month_distance, 12 * v_interval) = 0
      AND (
        (v_has_months AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(p_rule->'months') month_value
          WHERE month_value::INTEGER = EXTRACT(MONTH FROM p_date)::INTEGER
        ))
        OR (NOT v_has_months AND EXTRACT(MONTH FROM p_date) = EXTRACT(MONTH FROM p_anchor))
      );
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.materialize_duty_occurrences(
  p_from DATE DEFAULT CURRENT_DATE,
  p_through DATE DEFAULT CURRENT_DATE + 45
) RETURNS INTEGER AS $$
DECLARE
  s RECORD;
  d RECORD;
  a RECORD;
  v_inserted INTEGER := 0;
  v_count INTEGER;
BEGIN
  IF p_through < p_from OR p_through - p_from > 400 THEN
    RAISE EXCEPTION 'Duty materialization range must be between 0 and 400 days';
  END IF;

  FOR s IN
    SELECT
      ts.id AS duty_series_id,
      ts.recurrence_rule AS series_rule,
      COALESCE(ts.effective_from, od.active_from) AS series_effective_from,
      COALESCE(ts.effective_through, od.active_through) AS series_effective_through,
      od.id AS operation_duty_id,
      od.title,
      od.note,
      od.task_category,
      od.priority,
      od.estimated_minutes,
      od.equipment_needed,
      od.evidence_requirements,
      od.instructions,
      od.season
    FROM public.task_series ts
    JOIN public.operation_duties od ON od.id = ts.duty_id
    WHERE ts.active = TRUE AND od.is_active = TRUE
  LOOP
    FOR d IN
      SELECT g::DATE AS occurrence_date
      FROM generate_series(
        GREATEST(p_from, s.series_effective_from),
        LEAST(p_through, COALESCE(s.series_effective_through, p_through)),
        INTERVAL '1 day'
      ) g
      WHERE public.duty_rule_matches(
        g::DATE,
        s.series_effective_from,
        COALESCE(s.series_rule, '{}'::jsonb),
        s.season
      )
    LOOP
      SELECT da.* INTO a
      FROM public.duty_assignments da
      WHERE da.duty_id = s.operation_duty_id
        AND da.effective_from <= d.occurrence_date
        AND (da.effective_through IS NULL OR da.effective_through >= d.occurrence_date)
      ORDER BY da.effective_from DESC
      LIMIT 1;

      INSERT INTO public.tasks (
        title, description, category, priority, status,
        assigned_to, assigned_by, due_date, estimated_minutes,
        equipment_needed, materials_needed, checklist,
        requires_photo_before, requires_photo_after, weather_dependent,
        weather_conditions, template_id, series_id, notes,
        duty_id, duty_assignment_id, occurrence_key, original_due_date
      ) VALUES (
        s.title,
        s.note,
        s.task_category,
        s.priority,
        'pending',
        a.primary_profile_id,
        a.assigned_by,
        d.occurrence_date,
        s.estimated_minutes,
        s.equipment_needed,
        '[]'::jsonb,
        '[]'::jsonb,
        FALSE,
        COALESCE(s.evidence_requirements ? 'photo', FALSE),
        FALSE,
        NULL,
        NULL,
        s.duty_series_id,
        s.instructions,
        s.operation_duty_id,
        a.id,
        d.occurrence_date::TEXT,
        d.occurrence_date
      )
      ON CONFLICT (series_id, occurrence_key)
        WHERE series_id IS NOT NULL AND occurrence_key IS NOT NULL
      DO NOTHING;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_inserted := v_inserted + v_count;
    END LOOP;
  END LOOP;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.materialize_duty_occurrences(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_duty_occurrences(DATE, DATE) TO authenticated, service_role;

-- Keep the existing nightly task-series job. Legacy series use the original
-- weekday/season logic; duty series use the richer recurrence rule above.
CREATE OR REPLACE FUNCTION public.extend_task_series(p_horizon_days INT DEFAULT 365)
RETURNS VOID AS $$
DECLARE
  s RECORD;
  p JSONB;
BEGIN
  FOR s IN SELECT * FROM public.task_series WHERE active = TRUE AND duty_id IS NULL LOOP
    p := s.task_payload;
    IF p IS NULL OR (p->>'title') IS NULL THEN CONTINUE; END IF;
    IF s.tier = 'monthly' AND s.week_of_month IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.tasks (
      title, description, category, priority, status,
      assigned_to, assigned_by, due_date, estimated_minutes,
      equipment_needed, materials_needed, checklist,
      requires_photo_before, requires_photo_after, weather_dependent,
      weather_conditions, template_id, series_id, notes
    )
    SELECT
      p->>'title', p->>'description', p->>'category',
      COALESCE(p->>'priority', 'normal'), 'pending',
      s.assigned_to, s.created_by, g.d::DATE,
      NULLIF(p->>'estimated_minutes', '')::INT,
      CASE WHEN jsonb_typeof(p->'equipment_needed') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(p->'equipment_needed'))
           ELSE '{}'::TEXT[] END,
      CASE WHEN jsonb_typeof(p->'materials_needed') = 'array'
           THEN p->'materials_needed' ELSE '[]'::jsonb END,
      CASE WHEN jsonb_typeof(p->'checklist') = 'array'
           THEN p->'checklist' ELSE '[]'::jsonb END,
      COALESCE((p->>'requires_photo_before')::BOOLEAN, FALSE),
      COALESCE((p->>'requires_photo_after')::BOOLEAN, FALSE),
      COALESCE((p->>'weather_dependent')::BOOLEAN, FALSE),
      CASE WHEN p->'weather_conditions' IS NULL OR p->'weather_conditions' = 'null'::jsonb
           THEN NULL ELSE p->'weather_conditions' END,
      NULLIF(p->>'template_id', '')::UUID,
      s.id,
      p->>'notes'
    FROM generate_series(CURRENT_DATE, CURRENT_DATE + p_horizon_days, INTERVAL '1 day') g(d)
    WHERE EXTRACT(DOW FROM g.d) = s.weekday
      AND g.d::DATE >= make_date(EXTRACT(YEAR FROM g.d)::INT, 4, 1)
      AND g.d::DATE <= make_date(EXTRACT(YEAR FROM g.d)::INT, 11, 1)
      AND (s.tier <> 'monthly'
           OR (((EXTRACT(DAY FROM g.d)::INT - 1) / 7) + 1) = s.week_of_month)
    ON CONFLICT (series_id, due_date) WHERE series_id IS NOT NULL DO NOTHING;
  END LOOP;

  PERFORM public.materialize_duty_occurrences(CURRENT_DATE, CURRENT_DATE + p_horizon_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Manager-only assignment commands ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_daily_operations()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('super','asst_super','director','gm')
      AND is_active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
  v_new_id UUID;
  v_type TEXT;
  v_new_through DATE;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active GM or operations manager may change duty ownership';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reassignment reason is required';
  END IF;
  IF p_primary_profile_id IS NOT NULL AND p_primary_profile_id = p_backup_profile_id THEN
    RAISE EXCEPTION 'Primary and backup employees must be different';
  END IF;

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
  ORDER BY effective_from DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND
    AND v_current.primary_profile_id IS NOT DISTINCT FROM p_primary_profile_id
    AND v_current.backup_profile_id IS NOT DISTINCT FROM p_backup_profile_id
    AND v_current.contractor_vendor_id IS NOT DISTINCT FROM p_contractor_vendor_id
  THEN
    RETURN v_current.id;
  END IF;

  IF FOUND AND v_current.effective_from = p_effective_date THEN
    v_new_through := v_current.effective_through;
    UPDATE public.duty_assignments SET
      assignee_type = v_type,
      primary_profile_id = CASE WHEN v_type = 'employee' THEN p_primary_profile_id ELSE NULL END,
      backup_profile_id = CASE WHEN v_type = 'employee' THEN p_backup_profile_id ELSE NULL END,
      contractor_vendor_id = CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id ELSE NULL END,
      change_reason = BTRIM(p_reason),
      assigned_by = (SELECT auth.uid())
    WHERE id = v_current.id
    RETURNING id INTO v_new_id;
  ELSE
    IF FOUND THEN
      v_new_through := v_current.effective_through;
      UPDATE public.duty_assignments
      SET effective_through = p_effective_date - 1
      WHERE id = v_current.id;
    ELSE
      SELECT MIN(effective_from) - 1 INTO v_new_through
      FROM public.duty_assignments
      WHERE duty_id = p_duty_id
        AND effective_from > p_effective_date;
    END IF;

    INSERT INTO public.duty_assignments (
      duty_id, assignee_type, primary_profile_id, backup_profile_id,
      contractor_vendor_id, effective_from, effective_through,
      change_reason, assigned_by
    ) VALUES (
      p_duty_id,
      v_type,
      CASE WHEN v_type = 'employee' THEN p_primary_profile_id ELSE NULL END,
      CASE WHEN v_type = 'employee' THEN p_backup_profile_id ELSE NULL END,
      CASE WHEN v_type = 'contractor' THEN p_contractor_vendor_id ELSE NULL END,
      p_effective_date,
      v_new_through,
      BTRIM(p_reason),
      (SELECT auth.uid())
    ) RETURNING id INTO v_new_id;
  END IF;

  UPDATE public.tasks SET
    assigned_to = CASE WHEN v_type = 'employee' THEN p_primary_profile_id ELSE NULL END,
    duty_assignment_id = v_new_id,
    assigned_by = (SELECT auth.uid()),
    updated_at = NOW()
  WHERE duty_id = p_duty_id
    AND due_date >= p_effective_date
    AND (v_new_through IS NULL OR due_date <= v_new_through)
    AND status = 'pending';

  RETURN v_new_id;
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
  v_id UUID;
BEGIN
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active GM or operations manager may reassign duties';
  END IF;
  IF p_from_profile_id IS NULL OR p_from_profile_id = p_replacement_profile_id THEN
    RAISE EXCEPTION 'Choose a different source and replacement employee';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reassignment reason is required';
  END IF;

  FOR a IN
    SELECT da.*
    FROM public.duty_assignments da
    JOIN public.operation_duties od ON od.id = da.duty_id AND od.is_active = TRUE
    WHERE da.effective_from <= p_effective_date
      AND (da.effective_through IS NULL OR da.effective_through >= p_effective_date)
      AND (da.primary_profile_id = p_from_profile_id OR da.backup_profile_id = p_from_profile_id)
      AND (p_duty_ids IS NULL OR da.duty_id = ANY(p_duty_ids))
    ORDER BY od.sort_order, od.title
  LOOP
    v_primary := a.primary_profile_id;
    v_backup := a.backup_profile_id;
    IF a.primary_profile_id = p_from_profile_id THEN
      v_primary := p_replacement_profile_id;
      IF v_backup = p_replacement_profile_id THEN v_backup := NULL; END IF;
      IF v_primary IS NULL THEN v_backup := NULL; END IF;
      role_changed := 'primary';
    ELSE
      v_backup := p_replacement_profile_id;
      IF v_backup = v_primary THEN v_backup := NULL; END IF;
      role_changed := 'backup';
    END IF;

    v_id := public.set_duty_assignment(
      a.duty_id, v_primary, v_backup, NULL, p_effective_date, p_reason
    );
    duty_id := a.duty_id;
    assignment_id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.can_manage_daily_operations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_duty_assignment(UUID,UUID,UUID,UUID,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_active_duties(UUID,UUID,DATE,TEXT,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_daily_operations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_duty_assignment(UUID,UUID,UUID,UUID,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_active_duties(UUID,UUID,DATE,TEXT,UUID[]) TO authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.duty_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view duty assignments" ON public.duty_assignments;
CREATE POLICY "Authenticated view duty assignments" ON public.duty_assignments
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "Managers insert duty assignments" ON public.duty_assignments;
CREATE POLICY "Managers insert duty assignments" ON public.duty_assignments
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_daily_operations());
DROP POLICY IF EXISTS "Managers update duty assignments" ON public.duty_assignments;
CREATE POLICY "Managers update duty assignments" ON public.duty_assignments
  FOR UPDATE TO authenticated USING (public.can_manage_daily_operations())
  WITH CHECK (public.can_manage_daily_operations());

DROP POLICY IF EXISTS "Authenticated manage operation_duties" ON public.operation_duties;
DROP POLICY IF EXISTS "Authenticated view operation duties" ON public.operation_duties;
CREATE POLICY "Authenticated view operation duties" ON public.operation_duties
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "Managers insert operation duties" ON public.operation_duties;
CREATE POLICY "Managers insert operation duties" ON public.operation_duties
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_daily_operations());
DROP POLICY IF EXISTS "Managers update operation duties" ON public.operation_duties;
CREATE POLICY "Managers update operation duties" ON public.operation_duties
  FOR UPDATE TO authenticated USING (public.can_manage_daily_operations())
  WITH CHECK (public.can_manage_daily_operations());

-- The legacy tasks policies predate GM/director roles. These narrow additive
-- policies grant operations managers visibility and update rights only for
-- duty-backed occurrences; unrelated task behavior is unchanged.
DROP POLICY IF EXISTS "Daily operations managers view duty tasks" ON public.tasks;
CREATE POLICY "Daily operations managers view duty tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (duty_id IS NOT NULL AND public.can_manage_daily_operations());
DROP POLICY IF EXISTS "Daily operations managers update duty tasks" ON public.tasks;
CREATE POLICY "Daily operations managers update duty tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (duty_id IS NOT NULL AND public.can_manage_daily_operations())
  WITH CHECK (duty_id IS NOT NULL AND public.can_manage_daily_operations());

GRANT SELECT, INSERT, UPDATE ON public.duty_assignments TO authenticated;

-- Materialize a short initial horizon. The existing nightly cron extends it.
SELECT public.materialize_duty_occurrences(CURRENT_DATE, CURRENT_DATE + 60);

-- Carry any same-day legacy check-off into its task occurrence.
UPDATE public.tasks t SET
  status = 'completed',
  completed_at = dc.completed_at,
  completed_by = dc.completed_by,
  updated_at = NOW()
FROM public.duty_completions dc
WHERE t.duty_id = dc.duty_id
  AND t.original_due_date = dc.duty_date
  AND t.status = 'pending';

NOTIFY pgrst, 'reload schema';

COMMIT;
