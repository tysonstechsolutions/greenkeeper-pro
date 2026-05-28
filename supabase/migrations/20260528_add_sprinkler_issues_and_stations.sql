-- Sprinkler issue tracking + per-station status (for stations that exist on
-- a satellite but don't control any sprinkler, or are known-broken).
--
-- These are layered on top of irrigation_sprinklers from
-- 20260528_add_irrigation_sprinklers.sql.

-- ─────────────────────────────────────────────────────────────────────────
-- Per-station status. Only stations that need a NON-default status get a
-- row here. Stations with sprinklers are derived from irrigation_sprinklers.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS irrigation_satellite_stations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  satellite_num INTEGER NOT NULL,
  station_num   INTEGER NOT NULL,
  status        TEXT NOT NULL
                CHECK (status IN ('unused', 'broken', 'note_only')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (satellite_num, station_num)
);

CREATE INDEX IF NOT EXISTS idx_irrigation_satellite_stations_sat
  ON irrigation_satellite_stations (satellite_num);

ALTER TABLE irrigation_satellite_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view sat stations"
  ON irrigation_satellite_stations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Auth manage sat stations"
  ON irrigation_satellite_stations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- Full issue history per sprinkler. A sprinkler with no rows in this table
-- has status 'ok'. Multiple open issues are allowed.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS irrigation_sprinkler_issues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprinkler_id     UUID NOT NULL
                       REFERENCES irrigation_sprinklers(id) ON DELETE CASCADE,
  issue_type       TEXT NOT NULL
                       CHECK (issue_type IN (
                         'low_pressure', 'one_side_only', 'no_spray',
                         'broken', 'leaking', 'clogged',
                         'stuck_on', 'stuck_off', 'other')),
  severity         TEXT NOT NULL DEFAULT 'medium'
                       CHECK (severity IN ('low', 'medium', 'high')),
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'resolved')),
  reported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_sprinkler_issues_sprinkler
  ON irrigation_sprinkler_issues (sprinkler_id);

CREATE INDEX IF NOT EXISTS idx_irrigation_sprinkler_issues_status
  ON irrigation_sprinkler_issues (status)
  WHERE status = 'open';

ALTER TABLE irrigation_sprinkler_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view sprinkler issues"
  ON irrigation_sprinkler_issues
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Auth manage sprinkler issues"
  ON irrigation_sprinkler_issues
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
