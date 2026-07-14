-- LOCAL FIXTURE ONLY — never place this file in supabase/migrations or apply it
-- to a linked/cloud project. scripts/prepare-phase1a-local-fixture.mjs copies it
-- into an unlinked temporary migration fixture for clean local replay.
--
-- Why this exists:
--   * equipment_checkouts had an authentic CREATE TABLE definition in the
--     deleted docs/archived-sql/crew-features-tables.sql source (commit
--     8dfee168), but no migration was retained when historical SQL was split.
--   * equipment_inspections was already live when its first retained migration
--     (20260408_fix_equipment_inspections_rls.sql) was written. Git history has
--     no creation migration. Its foundational columns below are limited to the
--     repository's generated types and active inspection workflows.
--   * course_observations and its two improvement-plan relations had authentic
--     definitions in the deleted docs/archived-sql/observations-tables.sql
--     source (commit 3fe7b4d), but none were retained as migrations.
--
-- Existing compatible local data is intentionally left untouched. Existing
-- partial or incompatible tables fail before this bootstrap creates or alters
-- anything, so a clean replay never silently "repairs" an unknown schema.

DO $$
DECLARE
  mismatch text;
BEGIN
  IF to_regclass('public.equipment') IS NULL THEN
    RAISE EXCEPTION 'Historical local bootstrap requires public.equipment from 001_initial_schema.sql';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Historical local bootstrap requires public.profiles from 001_initial_schema.sql';
  END IF;

  SELECT string_agg(format('%s.%s must be %s', table_name, column_name, expected_type::text), ', ')
  INTO mismatch
  FROM (
    VALUES
      ('equipment_checkouts', 'id', 'uuid'::regtype),
      ('equipment_checkouts', 'equipment_id', 'uuid'::regtype),
      ('equipment_checkouts', 'checked_out_by', 'uuid'::regtype),
      ('equipment_checkouts', 'checked_out_at', 'timestamp with time zone'::regtype),
      ('equipment_checkouts', 'expected_return', 'timestamp with time zone'::regtype),
      ('equipment_checkouts', 'returned_at', 'timestamp with time zone'::regtype),
      ('equipment_checkouts', 'condition_out', 'text'::regtype),
      ('equipment_checkouts', 'condition_in', 'text'::regtype),
      ('equipment_checkouts', 'notes_out', 'text'::regtype),
      ('equipment_checkouts', 'notes_in', 'text'::regtype),
      ('equipment_checkouts', 'created_at', 'timestamp with time zone'::regtype),
      ('equipment_inspections', 'id', 'uuid'::regtype),
      ('equipment_inspections', 'equipment_id', 'uuid'::regtype),
      ('equipment_inspections', 'inspection_type', 'text'::regtype),
      ('equipment_inspections', 'inspected_by', 'uuid'::regtype),
      ('equipment_inspections', 'checkout_id', 'uuid'::regtype),
      ('equipment_inspections', 'checklist_items', 'jsonb'::regtype),
      ('equipment_inspections', 'overall_status', 'text'::regtype),
      ('equipment_inspections', 'notes', 'text'::regtype),
      ('equipment_inspections', 'photos', 'text[]'::regtype),
      ('equipment_inspections', 'engine_hours', 'numeric'::regtype),
      ('equipment_inspections', 'fuel_level', 'text'::regtype),
      ('equipment_inspections', 'oil_level', 'text'::regtype),
      ('equipment_inspections', 'created_at', 'timestamp with time zone'::regtype),
      ('equipment_inspections', 'updated_at', 'timestamp with time zone'::regtype),
      ('course_observations', 'id', 'uuid'::regtype),
      ('course_observations', 'created_by', 'uuid'::regtype),
      ('course_observations', 'category', 'text'::regtype),
      ('course_observations', 'sentiment', 'text'::regtype),
      ('course_observations', 'title', 'text'::regtype),
      ('course_observations', 'description', 'text'::regtype),
      ('course_observations', 'location', 'text'::regtype),
      ('course_observations', 'hole_number', 'integer'::regtype),
      ('course_observations', 'zone_id', 'uuid'::regtype),
      ('course_observations', 'photo_ids', 'text[]'::regtype),
      ('course_observations', 'tags', 'text[]'::regtype),
      ('course_observations', 'is_addressed', 'boolean'::regtype),
      ('course_observations', 'linked_plan_item_id', 'uuid'::regtype),
      ('course_observations', 'created_at', 'timestamp with time zone'::regtype),
      ('course_observations', 'updated_at', 'timestamp with time zone'::regtype),
      ('improvement_plans', 'id', 'uuid'::regtype),
      ('improvement_plans', 'title', 'text'::regtype),
      ('improvement_plans', 'description', 'text'::regtype),
      ('improvement_plans', 'version', 'integer'::regtype),
      ('improvement_plans', 'is_current', 'boolean'::regtype),
      ('improvement_plans', 'generated_at', 'timestamp with time zone'::regtype),
      ('improvement_plans', 'ai_summary', 'text'::regtype),
      ('improvement_plans', 'created_by', 'uuid'::regtype),
      ('improvement_plans', 'created_at', 'timestamp with time zone'::regtype),
      ('improvement_plans', 'updated_at', 'timestamp with time zone'::regtype),
      ('improvement_plan_items', 'id', 'uuid'::regtype),
      ('improvement_plan_items', 'title', 'text'::regtype),
      ('improvement_plan_items', 'description', 'text'::regtype),
      ('improvement_plan_items', 'phase', 'text'::regtype),
      ('improvement_plan_items', 'priority', 'text'::regtype),
      ('improvement_plan_items', 'status', 'text'::regtype),
      ('improvement_plan_items', 'category', 'text'::regtype),
      ('improvement_plan_items', 'effort_level', 'text'::regtype),
      ('improvement_plan_items', 'impact_level', 'text'::regtype),
      ('improvement_plan_items', 'estimated_cost', 'numeric'::regtype),
      ('improvement_plan_items', 'linked_observation_ids', 'text[]'::regtype),
      ('improvement_plan_items', 'assigned_to', 'uuid'::regtype),
      ('improvement_plan_items', 'target_date', 'date'::regtype),
      ('improvement_plan_items', 'completed_date', 'timestamp with time zone'::regtype),
      ('improvement_plan_items', 'ai_reasoning', 'text'::regtype),
      ('improvement_plan_items', 'notes', 'text'::regtype),
      ('improvement_plan_items', 'sort_order', 'integer'::regtype),
      ('improvement_plan_items', 'created_by', 'uuid'::regtype),
      ('improvement_plan_items', 'created_at', 'timestamp with time zone'::regtype),
      ('improvement_plan_items', 'updated_at', 'timestamp with time zone'::regtype)
  ) AS required(table_name, column_name, expected_type)
  WHERE to_regclass(format('public.%I', table_name)) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_attribute attribute
      WHERE attribute.attrelid = to_regclass(format('public.%I', table_name))
        AND attribute.attname = column_name
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND attribute.atttypid = expected_type
    );

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'Historical local bootstrap refused incompatible existing schema: %', mismatch;
  END IF;
END;
$$;

-- Restored verbatim in structure from the archived crew-features source. The
-- IF NOT EXISTS form lets production-shaped local fixtures retain existing rows.
CREATE TABLE IF NOT EXISTS public.equipment_checkouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid REFERENCES public.equipment(id) NOT NULL,
  checked_out_by uuid REFERENCES public.profiles(id) NOT NULL,
  checked_out_at timestamptz DEFAULT now(),
  expected_return timestamptz,
  returned_at timestamptz,
  condition_out text CHECK (condition_out IN ('good', 'fair', 'needs_attention')) DEFAULT 'good',
  condition_in text CHECK (condition_in IN ('good', 'fair', 'needs_attention', 'damaged')),
  notes_out text,
  notes_in text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equip_checkout_equipment ON public.equipment_checkouts(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_checkout_user ON public.equipment_checkouts(checked_out_by);
CREATE INDEX IF NOT EXISTS idx_equip_checkout_returned ON public.equipment_checkouts(returned_at);
CREATE INDEX IF NOT EXISTS idx_equip_checkout_active ON public.equipment_checkouts(equipment_id) WHERE returned_at IS NULL;

-- No historical CREATE TABLE source exists for this relation. The contract is
-- deliberately limited to src/types/database.ts and active inspection writes.
CREATE TABLE IF NOT EXISTS public.equipment_inspections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  inspection_type text NOT NULL CHECK (inspection_type IN ('pre', 'post', 'cleaning')),
  inspected_by uuid NOT NULL REFERENCES public.profiles(id),
  checkout_id uuid REFERENCES public.equipment_checkouts(id) ON DELETE SET NULL,
  checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_status text NOT NULL DEFAULT 'pass' CHECK (overall_status IN ('pass', 'fail', 'needs_attention')),
  notes text,
  photos text[] NOT NULL DEFAULT '{}',
  engine_hours numeric(10,1),
  fuel_level text CHECK (fuel_level IN ('full', 'three_quarter', 'half', 'quarter', 'empty', 'na')),
  oil_level text CHECK (oil_level IN ('full', 'ok', 'low', 'critical', 'na')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_inspections_equipment ON public.equipment_inspections(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_inspections_created_at ON public.equipment_inspections(created_at DESC);

-- Restored from the archived observations source. The policy and trigger guards
-- are the only adaptation: they preserve production-shaped fixture data instead
-- of failing because those objects already exist.
CREATE TABLE IF NOT EXISTS public.course_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  sentiment text NOT NULL DEFAULT 'neutral',
  title text NOT NULL,
  description text NOT NULL,
  location text,
  hole_number integer CHECK (hole_number >= 1 AND hole_number <= 18),
  zone_id uuid REFERENCES public.course_zones(id) ON DELETE SET NULL,
  photo_ids text[],
  tags text[],
  is_addressed boolean NOT NULL DEFAULT false,
  linked_plan_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.improvement_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  generated_at timestamptz NOT NULL DEFAULT now(),
  ai_summary text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.improvement_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  phase text NOT NULL DEFAULT 'ongoing',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'not_started',
  category text NOT NULL DEFAULT 'other',
  effort_level text NOT NULL DEFAULT 'medium',
  impact_level text NOT NULL DEFAULT 'medium',
  estimated_cost numeric(10,2),
  linked_observation_ids text[],
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_date date,
  completed_date timestamptz,
  ai_reasoning text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.course_observations'::regclass
      AND conname = 'fk_linked_plan_item'
  ) THEN
    ALTER TABLE public.course_observations
      ADD CONSTRAINT fk_linked_plan_item
      FOREIGN KEY (linked_plan_item_id)
      REFERENCES public.improvement_plan_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 20260415_add_irrigation.sql tried to create a second, incompatible shape for
-- a table already created by 001_initial_schema.sql. Its later index and seed
-- statements require these columns, so a temporary bridge restores precisely
-- the missing pieces from that retained migration without renaming, deleting,
-- or populating any existing row. The combined zone-type check admits both
-- historically retained vocabularies; it is needed because the original
-- migration's CREATE TABLE IF NOT EXISTS never replaced 001's check.
ALTER TABLE public.irrigation_zones
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS zone_number integer,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS hole_numbers integer[],
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.irrigation_zones'::regclass
      AND conname = 'irrigation_zones_zone_type_check'
  ) THEN
    ALTER TABLE public.irrigation_zones DROP CONSTRAINT irrigation_zones_zone_type_check;
  END IF;
  ALTER TABLE public.irrigation_zones
    ADD CONSTRAINT irrigation_zones_zone_type_check
    CHECK (zone_type IN ('green', 'tee', 'fairway', 'rough', 'landscape', 'other', 'rotor', 'spray', 'drip', 'bubbler', 'manual'));
END $$;

-- 001 still requires zone_name for every row, while the retained 20260415 seed
-- supplies only its replacement name. Preserve the source values without
-- inventing a fallback by mirroring a supplied name only when zone_name is
-- absent. Existing rows are not updated.
CREATE OR REPLACE FUNCTION public.local_fixture_sync_irrigation_zone_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.zone_name IS NULL AND NEW.name IS NOT NULL THEN
    NEW.zone_name = NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_fixture_sync_irrigation_zone_name ON public.irrigation_zones;
CREATE TRIGGER local_fixture_sync_irrigation_zone_name
  BEFORE INSERT OR UPDATE ON public.irrigation_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.local_fixture_sync_irrigation_zone_name();

-- 20260508_consolidate_photos_to_condition.sql reads this nullable operational
-- gallery field, but the creation migration was never retained. Its name, array
-- type, and nullable handling are proven by that migration and the Equipment
-- contract; no row is populated here.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS photos text[];

-- Phase 0B/B1 is a retained security migration that explicitly locks these
-- three live-only legacy staging tables. No historical schema definition or
-- application query exists; the only repository-proven contract is an id field
-- (the security probe selects it) and RLS enabled before B1 replaces the open
-- policies. These empty local compatibility shells are intentionally not a
-- reconstruction of their unknown production data model.
CREATE TABLE IF NOT EXISTS public.vmgc_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS public.vmgc_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS public.vmgc_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE public.vmgc_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmgc_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmgc_conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_observations_created_by ON public.course_observations(created_by);
CREATE INDEX IF NOT EXISTS idx_observations_category ON public.course_observations(category);
CREATE INDEX IF NOT EXISTS idx_observations_sentiment ON public.course_observations(sentiment);
CREATE INDEX IF NOT EXISTS idx_observations_is_addressed ON public.course_observations(is_addressed);
CREATE INDEX IF NOT EXISTS idx_observations_created_at ON public.course_observations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_items_phase ON public.improvement_plan_items(phase);
CREATE INDEX IF NOT EXISTS idx_plan_items_status ON public.improvement_plan_items(status);
CREATE INDEX IF NOT EXISTS idx_plan_items_priority ON public.improvement_plan_items(priority);
CREATE INDEX IF NOT EXISTS idx_plan_items_sort_order ON public.improvement_plan_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_plans_is_current ON public.improvement_plans(is_current);

ALTER TABLE public.course_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_plan_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_observations' AND policyname = 'observations_select') THEN
    CREATE POLICY observations_select ON public.course_observations FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_observations' AND policyname = 'observations_insert') THEN
    CREATE POLICY observations_insert ON public.course_observations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_observations' AND policyname = 'observations_update') THEN
    CREATE POLICY observations_update ON public.course_observations FOR UPDATE TO authenticated USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_observations' AND policyname = 'observations_delete') THEN
    CREATE POLICY observations_delete ON public.course_observations FOR DELETE TO authenticated USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plans' AND policyname = 'plans_select') THEN
    CREATE POLICY plans_select ON public.improvement_plans FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plans' AND policyname = 'plans_insert') THEN
    CREATE POLICY plans_insert ON public.improvement_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plans' AND policyname = 'plans_update') THEN
    CREATE POLICY plans_update ON public.improvement_plans FOR UPDATE TO authenticated USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plans' AND policyname = 'plans_delete') THEN
    CREATE POLICY plans_delete ON public.improvement_plans FOR DELETE TO authenticated USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plan_items' AND policyname = 'plan_items_select') THEN
    CREATE POLICY plan_items_select ON public.improvement_plan_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plan_items' AND policyname = 'plan_items_insert') THEN
    CREATE POLICY plan_items_insert ON public.improvement_plan_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plan_items' AND policyname = 'plan_items_update') THEN
    CREATE POLICY plan_items_update ON public.improvement_plan_items FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'improvement_plan_items' AND policyname = 'plan_items_delete') THEN
    CREATE POLICY plan_items_delete ON public.improvement_plan_items FOR DELETE TO authenticated USING (auth.uid() = created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.course_observations'::regclass AND tgname = 'update_observations_updated_at' AND NOT tgisinternal) THEN
    CREATE TRIGGER update_observations_updated_at BEFORE UPDATE ON public.course_observations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.improvement_plans'::regclass AND tgname = 'update_plans_updated_at' AND NOT tgisinternal) THEN
    CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.improvement_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.improvement_plan_items'::regclass AND tgname = 'update_plan_items_updated_at' AND NOT tgisinternal) THEN
    CREATE TRIGGER update_plan_items_updated_at BEFORE UPDATE ON public.improvement_plan_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
