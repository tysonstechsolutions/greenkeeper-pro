-- Irrigation zones (physical areas with sprinkler heads)
CREATE TABLE IF NOT EXISTS irrigation_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone_number INTEGER UNIQUE,
  zone_type TEXT NOT NULL DEFAULT 'rotor' CHECK (zone_type IN ('rotor','spray','drip','bubbler','manual')),
  area TEXT CHECK (area IN ('green','tee','fairway','rough','practice','landscape','clubhouse')),
  hole_numbers INTEGER[],
  gpm NUMERIC(6,1),           -- gallons per minute flow rate
  head_count INTEGER,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Irrigation schedules (when zones run)
CREATE TABLE IF NOT EXISTS irrigation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES irrigation_zones(id) ON DELETE CASCADE,
  day_of_week INTEGER[] NOT NULL,   -- 0=Sun, 1=Mon... 6=Sat
  start_time TIME NOT NULL,
  run_minutes INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT true,
  season TEXT CHECK (season IN ('spring','summer','fall','winter','year_round')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Irrigation run log (actual runs — manual or automatic)
CREATE TABLE IF NOT EXISTS irrigation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES irrigation_zones(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  run_minutes INTEGER,
  gallons_used NUMERIC(10,1),
  run_type TEXT DEFAULT 'scheduled' CHECK (run_type IN ('scheduled','manual','syringe','weather_skip')),
  skipped BOOLEAN DEFAULT false,
  skip_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE irrigation_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view zones" ON irrigation_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage zones" ON irrigation_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view schedules" ON irrigation_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage schedules" ON irrigation_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view runs" ON irrigation_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage runs" ON irrigation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_irrigation_zones_area ON irrigation_zones(area);
CREATE INDEX idx_irrigation_schedules_zone ON irrigation_schedules(zone_id);
CREATE INDEX idx_irrigation_runs_zone ON irrigation_runs(zone_id, started_at DESC);

-- Seed some example zones for Great Lakes
INSERT INTO irrigation_zones (name, zone_number, zone_type, area, hole_numbers, gpm, head_count) VALUES
('Green 1', 1, 'spray', 'green', '{1}', 15.0, 6),
('Green 2', 2, 'spray', 'green', '{2}', 15.0, 6),
('Green 3', 3, 'spray', 'green', '{3}', 15.0, 6),
('Green 4', 4, 'spray', 'green', '{4}', 12.0, 5),
('Green 5', 5, 'spray', 'green', '{5}', 15.0, 6),
('Green 6', 6, 'spray', 'green', '{6}', 15.0, 6),
('Green 7', 7, 'spray', 'green', '{7}', 18.0, 7),
('Green 8', 8, 'spray', 'green', '{8}', 12.0, 5),
('Green 9', 9, 'spray', 'green', '{9}', 15.0, 6),
('Green 10', 10, 'spray', 'green', '{10}', 15.0, 6),
('Green 11', 11, 'spray', 'green', '{11}', 15.0, 6),
('Green 12', 12, 'spray', 'green', '{12}', 12.0, 5),
('Green 13', 13, 'spray', 'green', '{13}', 15.0, 6),
('Green 14', 14, 'spray', 'green', '{14}', 18.0, 7),
('Green 15', 15, 'spray', 'green', '{15}', 15.0, 6),
('Green 16', 16, 'spray', 'green', '{16}', 12.0, 5),
('Green 17', 17, 'spray', 'green', '{17}', 15.0, 6),
('Green 18', 18, 'spray', 'green', '{18}', 15.0, 6),
('Fairway 1', 19, 'rotor', 'fairway', '{1}', 45.0, 12),
('Fairway 5', 20, 'rotor', 'fairway', '{5}', 50.0, 14),
('Fairway 9', 21, 'rotor', 'fairway', '{9}', 42.0, 11),
('Fairway 10', 22, 'rotor', 'fairway', '{10}', 48.0, 13),
('Fairway 14', 23, 'rotor', 'fairway', '{14}', 52.0, 15),
('Fairway 18', 24, 'rotor', 'fairway', '{18}', 46.0, 12),
('Practice Green', 25, 'spray', 'practice', NULL, 20.0, 8),
('Driving Range', 26, 'rotor', 'practice', NULL, 35.0, 10),
('Clubhouse Landscape', 27, 'drip', 'clubhouse', NULL, 8.0, 20);
