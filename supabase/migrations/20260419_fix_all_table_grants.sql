-- =====================================================================
-- ⚠⚠ SUPERSEDED FOR THE anon ROLE — DO NOT RE-RUN AS-IS (2026-07-11) ⚠⚠
-- 20260711_phase0b_b1_anon_lockdown.sql deliberately REVOKES every anon
-- table grant and anon default privilege this file creates (Phase 0A found
-- the anon key could read plaintext PINs and staff profiles). If this file
-- is ever re-applied, re-apply the B1 lockdown immediately afterwards.
-- =====================================================================
-- Nuclear fix: grant sensible default privileges on every public table
-- for the three Supabase roles (anon / authenticated / service_role).
--
-- Symptom this fixes: pages that query tables show no data, scanner
-- hangs on "Searching inventory", tasks/schedule/messages blank, etc.
-- Root cause: tables were created without the GRANT statements Supabase
-- normally adds, so PostgREST queries come back empty-or-permission-denied.
--
-- Safe to re-run. Idempotent. Does NOT touch RLS policies — those are
-- handled per-table in the respective migrations.
-- =====================================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    -- authenticated users (signed-in via Supabase auth) — full CRUD subject to RLS
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.tablename);

    -- anon (public un-authenticated) — read-only. RLS decides what's visible.
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t.tablename);

    -- service_role (edge functions with admin client) — bypasses RLS entirely
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.tablename);
  END LOOP;
END $$;

-- Default privileges so any future CREATE TABLE in this schema inherits them
-- automatically and we don't have to chase this bug table-by-table again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- Sequences (needed so INSERT statements that use DEFAULT id / serial
-- columns can actually increment them). Without this, inserts fail even
-- when table-level GRANT INSERT is in place.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- Verify — should show every table with multiple rows per role.
SELECT table_name, grantee, COUNT(*) AS privilege_count
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('authenticated', 'anon', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
