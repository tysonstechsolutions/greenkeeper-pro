-- Expanded sprinkler issue types + reusable isolation valves.
--
-- Layered on top of 20260528_add_sprinkler_issues_and_stations.sql.
--
-- Two things happen here:
--   1. The fixed issue_type CHECK is dropped so the app can own the (now much
--      longer) list of common sprinkler problems without a migration per type.
--   2. A small "valves" concept: a valve feeds a set of sprinkler heads. When an
--      issue forces that valve shut, every head it feeds is considered offline
--      until the issue is resolved. Built to grow into a full valve /
--      quick-connect map later.
--
-- Safe to run more than once.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Drop the old issue_type CHECK (name-agnostic: find whichever CHECK
--    constraint references issue_type and drop it). The app's dropdown is now
--    the source of truth for allowed values.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'irrigation_sprinkler_issues'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%issue_type%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE irrigation_sprinkler_issues DROP CONSTRAINT %I',
      cname
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Reusable isolation valves. member_sprinkler_ids is the set of heads the
--    valve feeds (chosen by the superintendent from the placed heads).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irrigation_valves (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                TEXT NOT NULL,
  member_sprinkler_ids UUID[] NOT NULL DEFAULT '{}',
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE irrigation_valves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth view valves" ON irrigation_valves;
CREATE POLICY "Auth view valves"
  ON irrigation_valves
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Auth manage valves" ON irrigation_valves;
CREATE POLICY "Auth manage valves"
  ON irrigation_valves
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Link an issue to the valve that was shut for it. NULL = no shutoff (a
--    normal issue affecting only its own head). If a valve is deleted, the
--    link is cleared (the issue stays, it just no longer marks heads offline).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE irrigation_sprinkler_issues
  ADD COLUMN IF NOT EXISTS valve_id UUID
    REFERENCES irrigation_valves(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_irrigation_sprinkler_issues_valve
  ON irrigation_sprinkler_issues (valve_id)
  WHERE valve_id IS NOT NULL;
