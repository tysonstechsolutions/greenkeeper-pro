-- Add area_path column to green_observations for freehand drawn zones
-- Stores an array of {x, y} points (0-1 relative coords) representing
-- the boundary of the affected area on the green image.
-- pin_x/pin_y become the centroid of the drawn area.

ALTER TABLE green_observations
ADD COLUMN IF NOT EXISTS area_path JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN green_observations.area_path IS 'Array of {x,y} points (0-1 relative) defining the freehand-drawn boundary of the affected area. Null for legacy pin-only observations.';
-- Green Observations System
-- Separate table for putting green-specific issues and tracking
-- Similar structure to hole_observations but with green-specific issue types

-- Create enum for green issue types (shared + green-specific)
CREATE TYPE green_issue_type AS ENUM (
  'fungus_disease',
  'dry_spot',
  'wet_area',
  'bare_spot',
  'weed_pressure',
  'pest_damage',
  'mechanical_damage',
  'irrigation_issue',
  'algae',
  'frost_damage',
  'ball_marks',
  'scalping',
  'compaction',
  'thatch_buildup',
  'aeration_needed',
  'topdressing_needed',
  'moss',
  'shade_stress',
  'traffic_wear',
  'chemical_burn',
  'poor_drainage',
  'uneven_surface',
  'other'
);

-- Reuse existing status enum pattern
CREATE TYPE green_observation_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'monitoring'
);

-- Main table
CREATE TABLE IF NOT EXISTS green_observations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  pin_x REAL NOT NULL CHECK (pin_x BETWEEN 0 AND 1),
  pin_y REAL NOT NULL CHECK (pin_y BETWEEN 0 AND 1),
  issue_type green_issue_type NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status green_observation_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  fix_instructions TEXT,
  photo_url TEXT,
  reported_by UUID NOT NULL REFERENCES profiles(id),
  task_id UUID REFERENCES tasks(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_green_observations_hole ON green_observations(hole_number);
CREATE INDEX IF NOT EXISTS idx_green_observations_status ON green_observations(status);
CREATE INDEX IF NOT EXISTS idx_green_observations_priority ON green_observations(priority);
CREATE INDEX IF NOT EXISTS idx_green_observations_reported_by ON green_observations(reported_by);
CREATE INDEX IF NOT EXISTS idx_green_observations_created ON green_observations(created_at DESC);

-- Enable RLS
ALTER TABLE green_observations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view green observations"
  ON green_observations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create green observations"
  ON green_observations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "Authenticated users can update green observations"
  ON green_observations FOR UPDATE
  TO authenticated
  USING (true);

-- Auto-update trigger for updated_at
CREATE TRIGGER update_green_observations_updated_at
  BEFORE UPDATE ON green_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for green observation photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('green-observations', 'green-observations', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload green observation photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'green-observations');

CREATE POLICY "Anyone can view green observation photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'green-observations');
-- Hole Observations: Pin-on-map issue reporting for each hole
-- Users tap on hole images to drop a pin and report issues

-- Issue type enum
CREATE TYPE hole_issue_type AS ENUM (
  'fungus_disease',
  'dry_spot',
  'wet_area',
  'bare_spot',
  'weed_pressure',
  'pest_damage',
  'mechanical_damage',
  'drainage',
  'bunker_issue',
  'tree_issue',
  'irrigation_issue',
  'turf_thin',
  'algae',
  'frost_damage',
  'other'
);

-- Observation status enum
CREATE TYPE hole_observation_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'monitoring'
);

-- Main table
CREATE TABLE IF NOT EXISTS hole_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  pin_x REAL NOT NULL CHECK (pin_x >= 0 AND pin_x <= 1),
  pin_y REAL NOT NULL CHECK (pin_y >= 0 AND pin_y <= 1),
  issue_type hole_issue_type NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status hole_observation_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  reported_by UUID NOT NULL REFERENCES profiles(id),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hole_obs_hole ON hole_observations(hole_number);
CREATE INDEX IF NOT EXISTS idx_hole_obs_status ON hole_observations(status);
CREATE INDEX IF NOT EXISTS idx_hole_obs_priority ON hole_observations(priority);
CREATE INDEX IF NOT EXISTS idx_hole_obs_reported_by ON hole_observations(reported_by);
CREATE INDEX IF NOT EXISTS idx_hole_obs_created ON hole_observations(created_at DESC);

-- RLS
ALTER TABLE hole_observations ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Anyone can view hole observations"
  ON hole_observations FOR SELECT
  USING (true);

-- Authenticated users can create
CREATE POLICY "Authenticated users can create observations"
  ON hole_observations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Reporter or managers can update
CREATE POLICY "Reporter or managers can update observations"
  ON hole_observations FOR UPDATE
  USING (
    reported_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'foreman')
    )
  );

-- Auto-update updated_at
CREATE TRIGGER hole_observations_updated_at
  BEFORE UPDATE ON hole_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for hole observation photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('hole-observations', 'hole-observations', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view hole observation photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hole-observations');

CREATE POLICY "Authenticated users can upload hole observation photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'hole-observations' AND auth.uid() IS NOT NULL);
-- Add missing fix_instructions column to hole_observations
-- (green_observations already had this column; hole_observations was missing it)
ALTER TABLE hole_observations ADD COLUMN IF NOT EXISTS fix_instructions TEXT DEFAULT NULL;
-- Fix equipment_inspections RLS policies (table existed but had no usable policies)
ALTER TABLE equipment_inspections ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_select_all') THEN
    CREATE POLICY "equipment_inspections_select_all" ON equipment_inspections FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Allow authenticated users to create inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_insert_auth') THEN
    CREATE POLICY "equipment_inspections_insert_auth" ON equipment_inspections FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- Allow authenticated users to update inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_update_auth') THEN
    CREATE POLICY "equipment_inspections_update_auth" ON equipment_inspections FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- Allow managers to delete inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_delete_manager') THEN
    CREATE POLICY "equipment_inspections_delete_manager" ON equipment_inspections FOR DELETE TO authenticated USING (is_manager(auth.uid()));
  END IF;
END $$;
-- Add diagnosis_result JSONB column to both observation tables
-- Stores the full AI diagnosis with treatment plans, products, follow-up schedules

ALTER TABLE green_observations
ADD COLUMN IF NOT EXISTS diagnosis_result JSONB DEFAULT NULL;

ALTER TABLE hole_observations
ADD COLUMN IF NOT EXISTS diagnosis_result JSONB DEFAULT NULL;
