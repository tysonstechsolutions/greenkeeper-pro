-- Automatic watering schedule.
--
-- A single active "plan" holds the per-surface watering config (target depth +
-- precipitation rate + days of week) plus the overnight window and the pump's
-- concurrency cap ("N sprinklers at a time"). The 54 hole-surface run items and
-- their staggered start times are DERIVED at read time from this config by the
-- client-side engine (src/lib/utils/watering-schedule.ts) — only sparse
-- per-item exceptions live in `overrides`.
--
-- This is additive: it does NOT touch irrigation_zones, irrigation_schedules,
-- or the irrigation_sprinklers head/satellite map.

CREATE TABLE IF NOT EXISTS watering_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL DEFAULT 'Summer schedule',
  active              BOOLEAN NOT NULL DEFAULT TRUE,

  hole_count          INTEGER NOT NULL DEFAULT 18 CHECK (hole_count BETWEEN 1 AND 36),
  -- Minutes from midnight: when the cycle begins, and the "must finish by" the
  -- makespan warning checks against (nullable). Watering runs in the EARLY
  -- MORNING (default 04:00) and finishes around sunrise — NOT overnight.
  -- Night watering leaves turf wet for hours and is a primary driver of
  -- fungal disease; early-morning timing lets the canopy dry as the sun rises.
  start_minute        INTEGER NOT NULL DEFAULT 240  CHECK (start_minute BETWEEN 0 AND 1439), -- 04:00
  finish_by_minute    INTEGER DEFAULT 480 CHECK (finish_by_minute BETWEEN 0 AND 1439),       -- 08:00
  concurrency_cap     INTEGER NOT NULL DEFAULT 5 CHECK (concurrency_cap BETWEEN 1 AND 50),

  -- Per-surface config. Run minutes are derived: depth_in / rate_in_hr * 60.
  -- days_of_week: 0 = Sunday … 6 = Saturday.
  greens_depth_in     NUMERIC(4,2) NOT NULL DEFAULT 0.15,
  greens_rate_in_hr   NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  greens_days         INTEGER[]    NOT NULL DEFAULT '{0,1,2,3,4,5,6}',

  tees_depth_in       NUMERIC(4,2) NOT NULL DEFAULT 0.20,
  tees_rate_in_hr     NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  tees_days           INTEGER[]    NOT NULL DEFAULT '{0,2,4,6}',

  fairways_depth_in   NUMERIC(4,2) NOT NULL DEFAULT 0.40,
  fairways_rate_in_hr NUMERIC(4,2) NOT NULL DEFAULT 0.60,
  fairways_days       INTEGER[]    NOT NULL DEFAULT '{1,3,5}',

  -- Sparse per-item exceptions, keyed "{hole}-{surface}":
  -- { "7-green": { "minutes": 22 }, "12-tee": { "enabled": false } }
  overrides           JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: same pattern as the existing irrigation tables.
ALTER TABLE watering_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view watering plans"
  ON watering_plans
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Auth manage watering plans"
  ON watering_plans
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed one active plan with the research-backed defaults so the screen has
-- something to show immediately. Only inserts if no plan exists yet.
INSERT INTO watering_plans (name)
SELECT 'Summer schedule'
WHERE NOT EXISTS (SELECT 1 FROM watering_plans);
