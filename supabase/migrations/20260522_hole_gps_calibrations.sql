-- ============================================================================
-- Per-hole GPS calibration table
-- ============================================================================
--
-- Stores two reference points per (hole_number, surface_type) so that real
-- world (lat, lng) coordinates from a phone's GPS can be mapped onto the
-- 0–1 image-relative coordinate system used by hole_observations.pin_x/y
-- and green_observations.pin_x/y.
--
-- Two reference points are enough to derive a similarity transform
-- (uniform scale + rotation + translation). The setup UI captures these by
-- letting an admin tap the same landmark (typically tee + green flag) on
-- both the hole image AND a satellite map.
--
-- One row per (hole_number, surface_type) — upsert pattern on conflict.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hole_gps_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  -- Surface type ties this calibration to either the fairway image (/holes/hole-N.png)
  -- or the green image (/greens/green-N.svg). They have independent coordinate
  -- systems, so each gets its own calibration row.
  surface_type TEXT NOT NULL CHECK (surface_type IN ('hole', 'green')),

  -- Reference point 1 — typically the TEE
  p1_lat DOUBLE PRECISION NOT NULL,
  p1_lng DOUBLE PRECISION NOT NULL,
  p1_x REAL NOT NULL CHECK (p1_x >= 0 AND p1_x <= 1),
  p1_y REAL NOT NULL CHECK (p1_y >= 0 AND p1_y <= 1),

  -- Reference point 2 — typically the GREEN FLAG
  p2_lat DOUBLE PRECISION NOT NULL,
  p2_lng DOUBLE PRECISION NOT NULL,
  p2_x REAL NOT NULL CHECK (p2_x >= 0 AND p2_x <= 1),
  p2_y REAL NOT NULL CHECK (p2_y >= 0 AND p2_y <= 1),

  calibrated_by UUID REFERENCES profiles(id),
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One calibration per (hole, surface) — recalibrating overwrites.
  UNIQUE (hole_number, surface_type)
);

-- Fast lookup by hole + surface
CREATE INDEX IF NOT EXISTS idx_hole_gps_cal_lookup
  ON hole_gps_calibrations(hole_number, surface_type);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE hole_gps_calibrations ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read — needed so all roles' "Use My Location"
-- buttons work, not just the admins who set up the calibration.
CREATE POLICY "auth users can read hole_gps_calibrations"
  ON hole_gps_calibrations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only management roles can create / update / delete calibrations.
CREATE POLICY "management can insert hole_gps_calibrations"
  ON hole_gps_calibrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  );

CREATE POLICY "management can update hole_gps_calibrations"
  ON hole_gps_calibrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  );

CREATE POLICY "management can delete hole_gps_calibrations"
  ON hole_gps_calibrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  );

-- Auto-update updated_at on any change.
CREATE TRIGGER hole_gps_calibrations_updated_at
  BEFORE UPDATE ON hole_gps_calibrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tell PostgREST to reload its schema cache so the new table is visible
-- to the client immediately.
NOTIFY pgrst, 'reload schema';
