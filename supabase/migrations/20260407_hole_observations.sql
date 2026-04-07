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
CREATE TABLE hole_observations (
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
CREATE INDEX idx_hole_obs_hole ON hole_observations(hole_number);
CREATE INDEX idx_hole_obs_status ON hole_observations(status);
CREATE INDEX idx_hole_obs_priority ON hole_observations(priority);
CREATE INDEX idx_hole_obs_reported_by ON hole_observations(reported_by);
CREATE INDEX idx_hole_obs_created ON hole_observations(created_at DESC);

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
