-- Forward-only reconciliation for schema gaps confirmed against the live
-- production catalog on 2026-07-20.
--
-- This migration intentionally supersedes direct production application of:
--   * 004_user_preferences.sql (included here idempotently)
--   * 005_missing_tables.sql (unsafe: collides with live ad-hoc tables)
--   * 20260413_add_asset_disposals.sql
--   * the zone/run/schedule portion of 20260415_add_irrigation.sql
--   * 20260418_add_fcm_to_push_subscriptions.sql
--   * the missing-column portion of 20260420_app_settings.sql
--
-- It preserves existing rows, does not seed synthetic operational data, and
-- is safe for both the confirmed live production shape and the fully replayed
-- repository shape.

BEGIN;

-- ---------------------------------------------------------------------------
-- Profile preferences (004_user_preferences.sql)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{
    "notifications": {
      "push_enabled": true,
      "task_assigned": true,
      "task_completed": true,
      "schedule_changes": true,
      "weather_alerts": true,
      "equipment_issues": true,
      "messages": true
    },
    "course": {}
  }'::JSONB;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::REGCLASS
      AND conname = 'profiles_user_preferences_object_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_preferences_object_check
      CHECK (
        user_preferences IS NULL
        OR JSONB_TYPEOF(user_preferences) = 'object'
      );
  END IF;
END
$migration$;

COMMENT ON COLUMN public.profiles.user_preferences IS
  'User-owned notification and application preferences.';

-- ---------------------------------------------------------------------------
-- Existing platform tables with missing columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS course_id UUID;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_course
  ON public.knowledge_articles(course_id);

COMMENT ON COLUMN public.knowledge_articles.course_id IS
  'Optional single-tenant compatibility key. It is deliberately not a foreign key until course tenancy is canonicalized.';

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS updated_by UUID;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.app_settings'::REGCLASS
      AND conname = 'app_settings_updated_by_fkey'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_updated_by_fkey
      FOREIGN KEY (updated_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END
$migration$;

UPDATE public.app_settings
SET updated_at = NOW()
WHERE updated_at IS NULL;

ALTER TABLE public.app_settings
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.app_settings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  NEW.updated_at := NOW();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS app_settings_updated_trg ON public.app_settings;
CREATE TRIGGER app_settings_updated_trg
  BEFORE INSERT OR UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.app_settings_touch_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_settings'
  LOOP
    EXECUTE FORMAT(
      'DROP POLICY IF EXISTS %I ON public.app_settings',
      v_policy.policyname
    );
  END LOOP;
END
$migration$;

CREATE POLICY app_settings_select_authenticated
  ON public.app_settings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY app_settings_write_manager
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

INSERT INTO public.app_settings (key, value)
VALUES (
  'course_status',
  JSONB_BUILD_OBJECT(
    'status', 'open',
    'message', '',
    'updated_at', NOW(),
    'updated_by', ''
  )
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Native and web push subscriptions
-- ---------------------------------------------------------------------------

ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS fcm_token TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'web';

UPDATE public.push_subscriptions
SET platform = 'web'
WHERE platform IS NULL;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN platform SET DEFAULT 'web',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key,
  DROP CONSTRAINT IF EXISTS push_subscriptions_platform_check,
  DROP CONSTRAINT IF EXISTS push_subscriptions_shape_chk;

DROP INDEX IF EXISTS public.push_subscriptions_web_endpoint_key;
DROP INDEX IF EXISTS public.push_subscriptions_fcm_token_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_check
    CHECK (platform IN ('web', 'android', 'ios')),
  ADD CONSTRAINT push_subscriptions_shape_chk
    CHECK (
      (
        platform = 'web'
        AND endpoint IS NOT NULL
        AND p256dh IS NOT NULL
        AND auth IS NOT NULL
      )
      OR
      (
        platform IN ('android', 'ios')
        AND fcm_token IS NOT NULL
      )
    );

-- Full unique indexes are intentional. PostgreSQL permits multiple NULLs,
-- while PostgREST can infer these indexes for ON CONFLICT(column) upserts.
CREATE UNIQUE INDEX push_subscriptions_web_endpoint_key
  ON public.push_subscriptions(endpoint);

CREATE UNIQUE INDEX push_subscriptions_fcm_token_key
  ON public.push_subscriptions(fcm_token);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_platform
  ON public.push_subscriptions(platform);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
  LOOP
    EXECUTE FORMAT(
      'DROP POLICY IF EXISTS %I ON public.push_subscriptions',
      v_policy.policyname
    );
  END LOOP;
END
$migration$;

CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- ---------------------------------------------------------------------------
-- Asset disposal workflow
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.asset_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_request'
    CHECK (status IN (
      'pending_request',
      'pending_approval',
      'approved',
      'rendering_useless',
      'pending_witness',
      'disposed',
      'routed_to_business',
      'completed'
    )),
  reason TEXT NOT NULL,
  requested_by UUID REFERENCES public.profiles(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rendered_useless_at TIMESTAMPTZ,
  rendered_useless_notes TEXT,
  witness_1_name TEXT,
  witness_1_signed_at TIMESTAMPTZ,
  witness_2_name TEXT,
  witness_2_signed_at TIMESTAMPTZ,
  disposal_date TIMESTAMPTZ,
  disposal_photo_url TEXT,
  routed_to_business_at TIMESTAMPTZ,
  routed_to_business_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_disposals_equipment_id
  ON public.asset_disposals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_asset_disposals_status
  ON public.asset_disposals(status);

CREATE OR REPLACE FUNCTION public.asset_disposals_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS asset_disposals_updated_trg
  ON public.asset_disposals;
CREATE TRIGGER asset_disposals_updated_trg
  BEFORE UPDATE ON public.asset_disposals
  FOR EACH ROW EXECUTE FUNCTION public.asset_disposals_touch_updated_at();

ALTER TABLE public.asset_disposals ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'asset_disposals'
  LOOP
    EXECUTE FORMAT(
      'DROP POLICY IF EXISTS %I ON public.asset_disposals',
      v_policy.policyname
    );
  END LOOP;
END
$migration$;

CREATE POLICY asset_disposals_select_authenticated
  ON public.asset_disposals FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY asset_disposals_insert_authenticated
  ON public.asset_disposals FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT auth.uid())
    OR public.is_manager()
  );

CREATE POLICY asset_disposals_update_authenticated
  ON public.asset_disposals FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY asset_disposals_delete_manager
  ON public.asset_disposals FOR DELETE TO authenticated
  USING (public.is_manager());

REVOKE ALL ON public.asset_disposals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_disposals TO authenticated;
GRANT ALL ON public.asset_disposals TO service_role;

COMMENT ON TABLE public.asset_disposals IS
  'NAVCOMPT 2212 equipment-disposal workflow and disposition evidence.';

-- ---------------------------------------------------------------------------
-- Irrigation compatibility and live run/schedule records
-- ---------------------------------------------------------------------------

-- The live irrigation_zones table retained the original zone_name/controller
-- shape. The later migration expected name/zone_number/area fields. Keep both
-- contracts and synchronize the two names so neither current nor legacy rows
-- are discarded.
CREATE TABLE IF NOT EXISTS public.irrigation_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name TEXT NOT NULL,
  controller_id TEXT,
  station_number INTEGER,
  zone_type TEXT,
  head_count INTEGER,
  head_type TEXT,
  gpm NUMERIC(6,1),
  course_zone_id UUID REFERENCES public.course_zones(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT,
  zone_number INTEGER,
  area TEXT,
  hole_numbers INTEGER[],
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.irrigation_zones
  ADD COLUMN IF NOT EXISTS zone_name TEXT,
  ADD COLUMN IF NOT EXISTS controller_id TEXT,
  ADD COLUMN IF NOT EXISTS station_number INTEGER,
  ADD COLUMN IF NOT EXISTS head_type TEXT,
  ADD COLUMN IF NOT EXISTS course_zone_id UUID,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS zone_number INTEGER,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS hole_numbers INTEGER[],
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.irrigation_zones
SET name = zone_name
WHERE name IS NULL AND zone_name IS NOT NULL;

UPDATE public.irrigation_zones
SET zone_name = name
WHERE zone_name IS NULL AND name IS NOT NULL;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.irrigation_zones
    WHERE name IS NULL OR zone_name IS NULL
  ) THEN
    RAISE EXCEPTION
      'Irrigation reconciliation refused: an existing zone has neither a canonical name nor a legacy zone_name';
  END IF;
END
$migration$;

UPDATE public.irrigation_zones
SET active = TRUE
WHERE active IS NULL;

UPDATE public.irrigation_zones
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.irrigation_zones
  ALTER COLUMN zone_name SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN active SET DEFAULT TRUE,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.irrigation_zones
  DROP CONSTRAINT IF EXISTS irrigation_zones_zone_type_check;

ALTER TABLE public.irrigation_zones
  ADD CONSTRAINT irrigation_zones_zone_type_check
  CHECK (zone_type IS NULL OR zone_type IN (
    'green', 'tee', 'fairway', 'rough', 'landscape', 'other',
    'rotor', 'spray', 'drip', 'bubbler', 'manual'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS irrigation_zones_zone_number_key
  ON public.irrigation_zones(zone_number);
CREATE INDEX IF NOT EXISTS idx_irrigation_zones_area
  ON public.irrigation_zones(area);

CREATE OR REPLACE FUNCTION public.sync_irrigation_zone_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.name IS NULL THEN
      NEW.name := NEW.zone_name;
    ELSIF NEW.zone_name IS NULL THEN
      NEW.zone_name := NEW.name;
    ELSIF NEW.name IS DISTINCT FROM NEW.zone_name THEN
      RAISE EXCEPTION 'irrigation zone name and zone_name must match';
    END IF;
  ELSE
    IF NEW.name IS DISTINCT FROM OLD.name
       AND NEW.zone_name IS NOT DISTINCT FROM OLD.zone_name THEN
      NEW.zone_name := NEW.name;
    ELSIF NEW.zone_name IS DISTINCT FROM OLD.zone_name
       AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
      NEW.name := NEW.zone_name;
    ELSIF NEW.name IS NULL THEN
      NEW.name := NEW.zone_name;
    ELSIF NEW.zone_name IS NULL THEN
      NEW.zone_name := NEW.name;
    ELSIF NEW.name IS DISTINCT FROM NEW.zone_name THEN
      RAISE EXCEPTION 'irrigation zone name and zone_name must match';
    END IF;
  END IF;

  IF NEW.name IS NULL OR NEW.zone_name IS NULL THEN
    RAISE EXCEPTION 'irrigation zone name is required';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS irrigation_zones_sync_names_trg
  ON public.irrigation_zones;
CREATE TRIGGER irrigation_zones_sync_names_trg
  BEFORE INSERT OR UPDATE ON public.irrigation_zones
  FOR EACH ROW EXECUTE FUNCTION public.sync_irrigation_zone_names();

CREATE TABLE IF NOT EXISTS public.irrigation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.irrigation_zones(id) ON DELETE CASCADE,
  day_of_week INTEGER[] NOT NULL,
  start_time TIME NOT NULL,
  run_minutes INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  season TEXT CHECK (season IN ('spring','summer','fall','winter','year_round')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.irrigation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.irrigation_zones(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  run_minutes INTEGER,
  gallons_used NUMERIC(10,1),
  run_type TEXT DEFAULT 'scheduled'
    CHECK (run_type IN ('scheduled','manual','syringe','weather_skip')),
  skipped BOOLEAN DEFAULT FALSE,
  skip_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_schedules_zone
  ON public.irrigation_schedules(zone_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_runs_zone
  ON public.irrigation_runs(zone_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.attribute_irrigation_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF TG_TABLE_NAME = 'irrigation_schedules' AND TG_OP = 'UPDATE' THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS irrigation_schedules_attribute_trg
  ON public.irrigation_schedules;
CREATE TRIGGER irrigation_schedules_attribute_trg
  BEFORE INSERT OR UPDATE ON public.irrigation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.attribute_irrigation_record();

DROP TRIGGER IF EXISTS irrigation_runs_attribute_trg
  ON public.irrigation_runs;
CREATE TRIGGER irrigation_runs_attribute_trg
  BEFORE INSERT ON public.irrigation_runs
  FOR EACH ROW EXECUTE FUNCTION public.attribute_irrigation_record();

DO $migration$
DECLARE
  v_table TEXT;
  v_policy RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'irrigation_zones',
    'irrigation_schedules',
    'irrigation_runs'
  ] LOOP
    EXECUTE FORMAT('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE FORMAT(
        'DROP POLICY IF EXISTS %I ON public.%I',
        v_policy.policyname,
        v_table
      );
    END LOOP;

    EXECUTE FORMAT(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL)',
      v_table || '_select_authenticated',
      v_table
    );
    EXECUTE FORMAT(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL)',
      v_table || '_insert_authenticated',
      v_table
    );
    EXECUTE FORMAT(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL)',
      v_table || '_update_authenticated',
      v_table
    );
    EXECUTE FORMAT(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_manager())',
      v_table || '_delete_manager',
      v_table
    );

    EXECUTE FORMAT(
      'REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',
      v_table
    );
    EXECUTE FORMAT(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      v_table
    );
    EXECUTE FORMAT(
      'GRANT ALL ON public.%I TO service_role',
      v_table
    );
  END LOOP;
END
$migration$;

COMMENT ON TABLE public.irrigation_schedules IS
  'Configured recurring irrigation windows by zone.';
COMMENT ON TABLE public.irrigation_runs IS
  'Recorded scheduled, manual, syringe, and weather-skipped irrigation runs.';

NOTIFY pgrst, 'reload schema';

COMMIT;
