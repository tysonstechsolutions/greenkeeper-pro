-- Sprinkler-level map: which Rainbird satellite + station controls each
-- physical sprinkler head on the course. Unlike irrigation_zones (zone-level
-- aggregates with schedules), this is one row per individual head.
--
-- (satellite_num, station_num) is intentionally NOT unique — one station
-- can fire multiple heads, which is a normal Rainbird wiring pattern.

CREATE TABLE IF NOT EXISTS irrigation_sprinklers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_num INTEGER NOT NULL,
  station_num   INTEGER NOT NULL,
  hole_number   INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  area_type     TEXT NOT NULL CHECK (area_type IN ('green','tee','fairway')),
  -- Pin position on the hole image, stored as 0..1 fractions so it works
  -- across any image size or screen.
  x_pct         NUMERIC(7,6) NOT NULL CHECK (x_pct >= 0 AND x_pct <= 1),
  y_pct         NUMERIC(7,6) NOT NULL CHECK (y_pct >= 0 AND y_pct <= 1),
  label         TEXT,        -- optional, e.g. 'back tee', 'front-left'
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_sprinklers_hole
  ON irrigation_sprinklers (hole_number);

CREATE INDEX IF NOT EXISTS idx_irrigation_sprinklers_satstation
  ON irrigation_sprinklers (satellite_num, station_num);

-- RLS: same pattern as the existing irrigation_zones table.
ALTER TABLE irrigation_sprinklers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view sprinklers"
  ON irrigation_sprinklers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Auth manage sprinklers"
  ON irrigation_sprinklers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
