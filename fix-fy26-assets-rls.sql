-- =========================================================
-- Fix: "permission denied" on FY26 assets
--
-- Symptom: opening /assets or /assets/[id] throws
--   "permission denied for table fy26_assets"
--   (or ...for table asset_damage_records)
--
-- Cause: the 20260415 / 20260416 migrations either didn't
-- fully apply, or the policies exist but the GRANTs were
-- revoked. Re-asserts everything safely. Safe to re-run.
-- =========================================================

-- ---- 1. Sanity check: tables exist --------------------------
-- If either SELECT below returns 0, the CREATE TABLE migration
-- (20260415_add_fy26_assets.sql / 20260416_add_asset_photos_and_damage.sql)
-- was never applied and you need to run that first.
SELECT 'fy26_assets exists: ' || (EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'fy26_assets'
))::text AS check_1;

SELECT 'asset_damage_records exists: ' || (EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'asset_damage_records'
))::text AS check_2;

-- ---- 2. Ensure RLS is on ------------------------------------
ALTER TABLE fy26_assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_damage_records   ENABLE ROW LEVEL SECURITY;

-- ---- 3. Re-create policies (drop first so re-runs are safe) -
DROP POLICY IF EXISTS "Authenticated can view fy26 assets"    ON fy26_assets;
DROP POLICY IF EXISTS "Authenticated can insert fy26 assets"  ON fy26_assets;
DROP POLICY IF EXISTS "Authenticated can update fy26 assets"  ON fy26_assets;
DROP POLICY IF EXISTS "Authenticated can delete fy26 assets"  ON fy26_assets;

CREATE POLICY "Authenticated can view fy26 assets"
  ON fy26_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert fy26 assets"
  ON fy26_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update fy26 assets"
  ON fy26_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete fy26 assets"
  ON fy26_assets FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth view damage records"     ON asset_damage_records;
DROP POLICY IF EXISTS "Auth manage damage records"   ON asset_damage_records;

CREATE POLICY "Auth view damage records"
  ON asset_damage_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage damage records"
  ON asset_damage_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---- 4. Explicit GRANTs (the real fix for "permission denied") --
-- RLS policies only matter if the role first has table-level
-- privileges. Supabase normally grants these automatically, but
-- they can be missing on tables created outside the migration
-- path. Re-asserting is harmless.
GRANT SELECT, INSERT, UPDATE, DELETE ON fy26_assets          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_damage_records TO authenticated;

-- Allow the app to read the table via the anon key at page-load time
-- (the Supabase JS client uses anon + session JWT).
GRANT SELECT ON fy26_assets          TO anon;
GRANT SELECT ON asset_damage_records TO anon;

-- ---- 5. Verify ---------------------------------------------
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('fy26_assets', 'asset_damage_records')
ORDER BY tablename, cmd;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('fy26_assets', 'asset_damage_records')
  AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;
