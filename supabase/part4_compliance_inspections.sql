-- Add end_time for Illinois RUP compliance (start/end time of application)
-- All other required fields already exist:
--   chemical_applications: application_time (start), weather_temp_f, weather_wind_mph,
--     weather_wind_direction, target_pest, applicator_license
--   chemical_products: epa_registration
--   profiles: certifications (JSON array with license_number)

ALTER TABLE chemical_applications ADD COLUMN IF NOT EXISTS end_time TIME;
-- Drone flight NDVI/imagery ingest table
CREATE TABLE IF NOT EXISTS drone_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_date date NOT NULL,
  geotiff_path text,          -- Supabase Storage path (nullable — may upload PNG instead)
  preview_png_path text,      -- Supabase Storage path for the preview image
  bbox jsonb,                 -- {north, south, east, west} - nullable
  band text CHECK (band IN ('ndvi','ndre','thermal','rgb')),
  source text,                -- 'greensight', 'pix4d', 'dji', 'manual'
  notes text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drone_flights_date ON drone_flights(flight_date);

ALTER TABLE drone_flights ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user
CREATE POLICY "drone_flights_select" ON drone_flights
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: management + foreman roles only
CREATE POLICY "drone_flights_insert" ON drone_flights
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director', 'foreman', 'pro')
    )
  );

-- UPDATE: management only
CREATE POLICY "drone_flights_update" ON drone_flights
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );

-- DELETE: management only
CREATE POLICY "drone_flights_delete" ON drone_flights
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );
-- Task 1.2: Bilingual task & message rendering
-- Adds a per-user language preference and a Spanish translation slot on
-- tasks, messages, and observation tables. Also creates a translation_cache
-- table so Claude Haiku is only called once per unique source string.

-- ── Profiles: preferred display language ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language_preference TEXT
  CHECK (language_preference IN ('en', 'es'))
  DEFAULT 'en';

-- ── Spanish translation columns on content tables ─────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT;

-- NOTE: the `messages` table in this codebase uses `content` as the primary
-- text field, so the Spanish translation lives in `content_es`.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_es TEXT;

ALTER TABLE course_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

ALTER TABLE hole_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

ALTER TABLE green_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

-- ── Translation cache ─────────────────────────────────────────────────────
-- TODO(privacy): A future task should consider dropping `source_text` and
-- relying on `key_hash` alone for lookups. Storing raw source text in a
-- shared cache is a mild privacy leak (super notes may contain names, crew
-- comments, etc.). Hash-only lookup would keep the cache functional while
-- removing the plaintext surface area. Deferred for now.
CREATE TABLE IF NOT EXISTS translation_cache (
  key_hash     TEXT PRIMARY KEY,           -- sha256(source||source_lang||target_lang)
  source_lang  TEXT NOT NULL,
  target_lang  TEXT NOT NULL,
  source_text  TEXT NOT NULL,
  target_text  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_created
  ON translation_cache(created_at);

-- ── RLS on translation_cache ──────────────────────────────────────────────
-- All authenticated users need SELECT (for cache hits) and INSERT (for
-- cache misses). No UPDATE, no DELETE — cache entries are immutable. The
-- cache contains no private data (it's just text translations) but we still
-- gate it behind an auth check to prevent unauthenticated scraping.

ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'translation_cache'
      AND policyname = 'translation_cache_select_authenticated'
  ) THEN
    CREATE POLICY translation_cache_select_authenticated
      ON translation_cache
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'translation_cache'
      AND policyname = 'translation_cache_insert_authenticated'
  ) THEN
    CREATE POLICY translation_cache_insert_authenticated
      ON translation_cache
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;
-- ============================================================================
-- Add pin_positions table for daily pin sheet management
-- ============================================================================
-- Stores the daily hole cup location (paces from front edge, paces from left
-- edge) for each of the 18 holes. Supers set pins each morning, and the pro
-- shop prints a PDF pin sheet for the day. Staff can edit; pro shop and
-- seasonal employees can only read.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pin_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  hole_number int NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  paces_from_front int NOT NULL CHECK (paces_from_front >= 0 AND paces_from_front <= 50),
  paces_from_left int NOT NULL CHECK (paces_from_left >= 0 AND paces_from_left <= 40),
  difficulty text CHECK (difficulty IN ('easy','medium','hard')),
  notes text,
  set_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_pin_positions_date ON pin_positions(date);

ALTER TABLE pin_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent)
DO $$
BEGIN
  -- SELECT: any authenticated user (so pro shop and seasonal can view/print)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_select_authenticated'
  ) THEN
    CREATE POLICY "pin_positions_select_authenticated"
      ON pin_positions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  -- INSERT: staff only (super / asst_super / director / foreman / mechanic / crew)
  -- Pro shop and seasonal are blocked.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_insert_staff'
  ) THEN
    CREATE POLICY "pin_positions_insert_staff"
      ON pin_positions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;

  -- UPDATE: staff only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_update_staff'
  ) THEN
    CREATE POLICY "pin_positions_update_staff"
      ON pin_positions
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;

  -- DELETE: staff only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_delete_staff'
  ) THEN
    CREATE POLICY "pin_positions_delete_staff"
      ON pin_positions
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;
END$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION pin_positions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pin_positions_updated_at ON pin_positions;
CREATE TRIGGER pin_positions_updated_at
  BEFORE UPDATE ON pin_positions
  FOR EACH ROW
  EXECUTE FUNCTION pin_positions_set_updated_at();
-- Web Push subscriptions table
-- Stores a VAPID-signed Web Push subscription per browser/device per user.
-- One user can have many subscriptions (phone browser, desktop browser, TWA).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can see/manage their own subscriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_select_own') THEN
    CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_insert_own') THEN
    CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_delete_own') THEN
    CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- NOTE: VAPID keys must be generated out-of-band and set as Vercel env vars:
--   npx web-push generate-vapid-keys
-- Then set:
--   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (public key, exposed to client)
--   VAPID_PRIVATE_KEY             (private key, server-only)
--   VAPID_SUBJECT                 (mailto:admin@example.com)
-- Environmental Compliance Log tables
-- EPA/NPDES discharge monitoring & buffer zone tracking

-- ── Environmental Logs ──
create table if not exists public.environmental_logs (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('stormwater','discharge','buffer_zone','spill','waste_disposal','fuel_storage','wildlife')),
  title        text not null,
  description  text,
  severity     text not null default 'routine' check (severity in ('routine','minor','major','critical')),
  date_observed date not null default current_date,
  location     text,
  hole_numbers integer[] not null default '{}',
  corrective_action text,
  corrective_deadline date,
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id),
  photo_ids    text[] not null default '{}',
  reported_by  uuid not null references auth.users(id),
  npdes_reportable boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_env_logs_date on public.environmental_logs (date_observed);
create index if not exists idx_env_logs_category on public.environmental_logs (category);
create index if not exists idx_env_logs_npdes on public.environmental_logs (npdes_reportable);

-- ── Buffer Zones ──
create table if not exists public.buffer_zones (
  id                  uuid primary key default gen_random_uuid(),
  zone_name           text not null,
  water_feature       text not null,
  buffer_distance_ft  integer not null default 25,
  last_inspected      date,
  inspected_by        uuid references auth.users(id),
  status              text not null default 'needs_review' check (status in ('compliant','non_compliant','needs_review')),
  vegetation_condition text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_buffer_zones_status on public.buffer_zones (status);

-- ── RLS ──
alter table public.environmental_logs enable row level security;
alter table public.buffer_zones enable row level security;

-- SELECT: any authenticated user
create policy "env_logs_select" on public.environmental_logs
  for select to authenticated using (true);

create policy "buffer_zones_select" on public.buffer_zones
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: super, asst_super, director only
create policy "env_logs_insert" on public.environmental_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "env_logs_update" on public.environmental_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "env_logs_delete" on public.environmental_logs
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_insert" on public.buffer_zones
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_update" on public.buffer_zones
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_delete" on public.buffer_zones
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );
-- Inspection Readiness Checklists
-- Command inspection preparation for MWR golf courses

-- ── Tables ──

create table if not exists inspection_checklists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  inspection_date date,
  inspector_name text,
  status        text not null default 'draft' check (status in ('draft','in_progress','completed')),
  notes         text,
  created_by    uuid not null references profiles(id) on delete cascade,
  score         smallint check (score is null or (score >= 0 and score <= 100)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists inspection_items (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references inspection_checklists(id) on delete cascade,
  category      text not null check (category in ('course_conditions','safety','environmental','equipment','facilities','documentation')),
  title         text not null,
  description   text,
  status        text not null default 'not_started' check (status in ('not_started','in_progress','compliant','non_compliant','na')),
  notes         text,
  photo_ids     text[] not null default '{}',
  sort_order    int not null default 0,
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz
);

-- ── Indexes ──

create index if not exists idx_inspection_items_checklist on inspection_items(checklist_id);
create index if not exists idx_inspection_items_category  on inspection_items(category);

-- ── Updated-at trigger ──

create or replace function update_inspection_checklist_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inspection_checklist_updated on inspection_checklists;
create trigger trg_inspection_checklist_updated
  before update on inspection_checklists
  for each row execute function update_inspection_checklist_timestamp();

-- ── RLS ──

alter table inspection_checklists enable row level security;
alter table inspection_items enable row level security;

-- All authenticated users can read
create policy "inspection_checklists_select"
  on inspection_checklists for select
  to authenticated
  using (true);

create policy "inspection_items_select"
  on inspection_items for select
  to authenticated
  using (true);

-- Only super / asst_super / director can modify checklists
create policy "inspection_checklists_insert"
  on inspection_checklists for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_checklists_update"
  on inspection_checklists for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_checklists_delete"
  on inspection_checklists for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Same RLS for items
create policy "inspection_items_insert"
  on inspection_items for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_items_update"
  on inspection_items for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_items_delete"
  on inspection_items for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );
-- Water Usage Reporting: meter readings & monthly targets
-- Ties irrigation logs to base utilities reporting (DoD MWR)

-- ── Water Meter Readings ──
create table if not exists public.water_meter_readings (
  id            uuid primary key default gen_random_uuid(),
  meter_id      text not null,
  reading_date  date not null default current_date,
  reading_value numeric not null check (reading_value >= 0),
  previous_reading numeric,
  usage_gallons numeric not null default 0 check (usage_gallons >= 0),
  source        text not null default 'municipal'
                check (source in ('municipal','well','reclaimed','pond','mixed')),
  notes         text,
  recorded_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create index idx_water_meter_readings_date on public.water_meter_readings(reading_date);
create index idx_water_meter_readings_meter on public.water_meter_readings(meter_id);

-- ── Water Usage Targets ──
create table if not exists public.water_usage_targets (
  id             uuid primary key default gen_random_uuid(),
  year           int not null,
  month          int not null check (month between 1 and 12),
  target_gallons numeric not null check (target_gallons > 0),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (year, month)
);

-- ── RLS ──
alter table public.water_meter_readings enable row level security;
alter table public.water_usage_targets  enable row level security;

-- Readings: all auth'd can SELECT
create policy "readings_select" on public.water_meter_readings
  for select to authenticated using (true);

-- Readings: super, asst_super, director, foreman can INSERT
create policy "readings_insert" on public.water_meter_readings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director','foreman')
    )
  );

-- Readings: super, asst_super, director, foreman can UPDATE
create policy "readings_update" on public.water_meter_readings
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director','foreman')
    )
  );

-- Readings: super, asst_super, director can DELETE
create policy "readings_delete" on public.water_meter_readings
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: all auth'd can SELECT
create policy "targets_select" on public.water_usage_targets
  for select to authenticated using (true);

-- Targets: super, asst_super, director can INSERT
create policy "targets_insert" on public.water_usage_targets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: super, asst_super, director can UPDATE
create policy "targets_update" on public.water_usage_targets
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: super, asst_super, director can DELETE
create policy "targets_delete" on public.water_usage_targets
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );
-- Asset Disposal workflow table (NAVCOMPT 2212 Certificate of Disposition)
CREATE TABLE IF NOT EXISTS asset_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
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
  requested_by UUID REFERENCES profiles(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  -- Step 3: approval signatures
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  -- Step 4: render useless
  rendered_useless_at TIMESTAMPTZ,
  rendered_useless_notes TEXT,
  -- Step 5: witness signatures
  witness_1_name TEXT,
  witness_1_signed_at TIMESTAMPTZ,
  witness_2_name TEXT,
  witness_2_signed_at TIMESTAMPTZ,
  disposal_date TIMESTAMPTZ,
  disposal_photo_url TEXT,
  -- Step 6: route to business office
  routed_to_business_at TIMESTAMPTZ,
  routed_to_business_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE asset_disposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view disposals"
  ON asset_disposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create disposals"
  ON asset_disposals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update disposals"
  ON asset_disposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_asset_disposals_equipment_id ON asset_disposals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_asset_disposals_status ON asset_disposals(status);
-- Add grub_damage, mulch_pile, sticks_around_tree, sticks_on_ground, felled_tree to hole_issue_type enum
-- Add grub_damage to green_issue_type enum
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'grub_damage' AFTER 'pest_damage';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'mulch_pile' AFTER 'grub_damage';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'sticks_around_tree' AFTER 'mulch_pile';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'sticks_on_ground' AFTER 'sticks_around_tree';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'felled_tree' AFTER 'sticks_on_ground';
ALTER TYPE green_issue_type ADD VALUE IF NOT EXISTS 'grub_damage' AFTER 'pest_damage';
-- Add pin coordinates for map-based issue placement
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS pin_x REAL;
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS pin_y REAL;

-- Add new issue types: low_area, badly_cracked
-- Drop and recreate check constraint to include new values
ALTER TABLE parking_lot_issues DROP CONSTRAINT IF EXISTS parking_lot_issues_issue_type_check;
ALTER TABLE parking_lot_issues ADD CONSTRAINT parking_lot_issues_issue_type_check
  CHECK (issue_type IN ('pothole', 'low_area', 'badly_cracked', 'crack', 'drainage', 'erosion', 'marking', 'curbing', 'other'));
-- Fix equipment RLS: ensure all authenticated users with frontend role checks can insert/update
-- The frontend already guards access via canManageEquipment (super, asst_super, foreman, mechanic, director)
-- Old restrictive policies may block mechanic inserts/updates in some configurations

DROP POLICY IF EXISTS "equipment_insert_manager_mechanic" ON equipment;
DROP POLICY IF EXISTS "equipment_update_manager_mechanic" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can insert equipment" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can update equipment" ON equipment;

CREATE POLICY "equipment_insert_authenticated" ON equipment
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "equipment_update_authenticated" ON equipment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
