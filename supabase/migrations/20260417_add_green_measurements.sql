-- Green area measurements — polygons drawn on the satellite map so the
-- superintendent can measure a green's total square footage AND mark
-- out moss / disease patches that need to be cut and re-sodded.
--
-- One row per polygon. Multiple moss patches per green are fine.
-- area_sq_ft is persisted so list screens don't have to re-run the
-- spherical-excess math on every render.

CREATE TABLE IF NOT EXISTS green_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  measurement_type TEXT NOT NULL
    CHECK (measurement_type IN ('green', 'moss', 'disease', 'damage', 'other')),
  label TEXT,                       -- optional human label, e.g. "front-left moss patch"
  geojson JSONB NOT NULL,           -- GeoJSON Polygon
  area_sq_ft NUMERIC NOT NULL,      -- cached so we don't recompute
  perimeter_ft NUMERIC,             -- informational
  photo_url TEXT,                   -- optional photo of the patch
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_green_measurements_hole
  ON green_measurements(hole_number);
CREATE INDEX IF NOT EXISTS idx_green_measurements_type
  ON green_measurements(measurement_type);

ALTER TABLE green_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view green measurements"
  ON green_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert green measurements"
  ON green_measurements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update green measurements"
  ON green_measurements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete green measurements"
  ON green_measurements FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON green_measurements TO authenticated;
GRANT SELECT ON green_measurements TO anon;

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION update_green_measurements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_green_measurements_updated_at ON green_measurements;
CREATE TRIGGER trg_green_measurements_updated_at
  BEFORE UPDATE ON green_measurements
  FOR EACH ROW
  EXECUTE FUNCTION update_green_measurements_updated_at();
