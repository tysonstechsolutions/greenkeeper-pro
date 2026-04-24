-- ============================================================================
-- Untracked Assets
-- ============================================================================
--
-- Parallel to the fy26_assets table, but for items the facility owns that
-- ARE NOT on the MWRMA FY26 property inventory — printers, TVs,
-- computers, furniture, small engines without tags, anything else.
--
-- Kept separate from `fy26_assets` intentionally:
--   • fy26_assets is the authoritative MWRMA inventory — immutable roster
--   • untracked_assets is locally-managed — staff can add/edit/remove
-- Mixing them in one table would conflate the two data sources and make
-- reporting harder (e.g. "how much property is MWRMA vs locally owned?").
--
-- Kept separate from `equipment` because `equipment` is mower-heavy:
-- current_hours, service_interval_hours, fuel_type all assume mechanical
-- items. A printer has none of those.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   DROP TABLE IF EXISTS untracked_assets;
-- ============================================================================

CREATE TABLE IF NOT EXISTS untracked_assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN (
    'printer',
    'tv',
    'computer',
    'furniture',
    'appliance',
    'mower',
    'trimmer',
    'tool',
    'vehicle',
    'office',
    'other'
  )),
  manufacturer     TEXT,
  model            TEXT,
  serial_number   TEXT,
  location         TEXT,
  notes            TEXT,
  -- JSON array of storage URLs (front / angles / label / other). Keep
  -- simple: callers push to the array via update, no separate photos
  -- table needed because photos are cheap (just URLs).
  photos           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_untracked_assets_category  ON untracked_assets(category);
CREATE INDEX IF NOT EXISTS idx_untracked_assets_created_at ON untracked_assets(created_at DESC);

-- Keep updated_at honest via existing trigger function (update_updated_at).
CREATE TRIGGER untracked_assets_touch_updated_at
  BEFORE UPDATE ON untracked_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE untracked_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "untracked_assets_select_auth"
  ON untracked_assets FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "untracked_assets_insert_auth"
  ON untracked_assets FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "untracked_assets_update_auth"
  ON untracked_assets FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "untracked_assets_delete_mgr"
  ON untracked_assets FOR DELETE
  TO authenticated
  USING (is_manager((select auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON untracked_assets TO authenticated;
