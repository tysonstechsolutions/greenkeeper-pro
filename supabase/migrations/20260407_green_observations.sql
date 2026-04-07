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
CREATE TABLE green_observations (
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
CREATE INDEX idx_green_observations_hole ON green_observations(hole_number);
CREATE INDEX idx_green_observations_status ON green_observations(status);
CREATE INDEX idx_green_observations_priority ON green_observations(priority);
CREATE INDEX idx_green_observations_reported_by ON green_observations(reported_by);
CREATE INDEX idx_green_observations_created ON green_observations(created_at DESC);

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
