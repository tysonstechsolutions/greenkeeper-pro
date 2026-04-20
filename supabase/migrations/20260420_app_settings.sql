-- ============================================================
-- app_settings — key/value store for app-wide configuration
-- ============================================================
-- Used by:
--   - useCourseStatus (key = 'course_status')        — course open/closed state
--   - settings/briefing page (key = briefing config) — daily briefing cron
--   - generate-briefing util (same keys)             — server-side read/write
--
-- Previously this table only existed if someone had created it manually in
-- the dashboard; the debug log showed 406 responses because the .single()
-- lookups were hitting a non-existent row (and in some environments a
-- non-existent table). This migration guarantees the schema, permissions,
-- and the default 'course_status' row exist on every fresh install.

CREATE TABLE IF NOT EXISTS app_settings (
  key          TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at DESC);

-- Auto-update `updated_at` on every write.
CREATE OR REPLACE FUNCTION app_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_settings_updated_trg ON app_settings;
CREATE TRIGGER app_settings_updated_trg
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION app_settings_touch_updated_at();

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read settings (the dashboard renders course
-- status for everyone; the briefing config is only written by managers but
-- still read by the briefing renderer).
DROP POLICY IF EXISTS "app_settings_select_authenticated" ON app_settings;
CREATE POLICY "app_settings_select_authenticated" ON app_settings
  FOR SELECT TO authenticated
  USING (true);

-- Only super / asst_super can write. Matches the role gate in the UI.
DROP POLICY IF EXISTS "app_settings_write_manager" ON app_settings;
CREATE POLICY "app_settings_write_manager" ON app_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'director')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );

GRANT SELECT ON app_settings TO authenticated;
GRANT ALL    ON app_settings TO service_role;

-- Seed the default course-status row so useCourseStatus's .single() query
-- returns a row on a fresh DB instead of 406-ing.
INSERT INTO app_settings (key, value)
VALUES (
  'course_status',
  jsonb_build_object(
    'status', 'open',
    'message', '',
    'updated_at', NOW(),
    'updated_by', ''
  )
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE app_settings IS
  'Key/value store for app-wide configuration. Values are JSONB so each key can have its own schema — e.g. course_status stores { status, message, updated_at, updated_by }.';
