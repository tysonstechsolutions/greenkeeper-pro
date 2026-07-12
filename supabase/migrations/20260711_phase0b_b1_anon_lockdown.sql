-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 0B / B1 — Anon lockdown (2026-07-11)
--
-- WHY: Phase 0A verification (docs/security/live-db-drift-report-2026-07-11.md
-- §7) found that the PUBLIC anon key — which ships inside every client bundle
-- and APK — could read 18 plaintext PINs (pin_codes) and 17 active staff
-- profiles, and had full CRUD on the three legacy vmgc_* tables. The app never
-- issues unauthenticated PostgREST requests: it auto-signs-in with the shared
-- kiosk account before any table access, and the pin-login / pin-signup edge
-- functions do all their table work through the SERVICE-ROLE client (their
-- anon-key clients only call the /auth token endpoint, which needs no table
-- grants). Therefore the anon role needs NO table access at all.
--
-- WHAT THIS DOES (and nothing else):
--   1. Drops the anon SELECT policy on pin_codes.
--   2. Drops the anon-satisfiable SELECT policy on profiles
--      (authenticated reads continue via the existing profiles_read policy).
--   3. Re-scopes the three vmgc_* "open access" policies to authenticated
--      (data is KEPT and locked down per MD2 — zero rows deleted).
--   4. Re-scopes task_series_select and invites_update_use to authenticated.
--   5. Revokes ALL anon privileges on every public table and sequence, and
--      flips the default privileges (set by 20260419_fix_all_table_grants.sql)
--      so FUTURE tables no longer get anon SELECT automatically.
--
-- WHAT THIS DOES NOT TOUCH: authenticated/service_role grants and policies,
-- the storage schema, auth schema, function EXECUTE grants, any row of data.
--
-- ⚠ Re-running 20260419_fix_all_table_grants.sql would RE-CREATE the anon
--   grants this migration removes. That file now carries a warning header.
--
-- Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. pin_codes: remove anon read of plaintext PINs ─────────────────────────
DROP POLICY IF EXISTS "Anon can verify pins" ON public.pin_codes;

-- ── 2. profiles: remove the anon-satisfiable read ────────────────────────────
-- profiles_read (qual: auth.role() = 'authenticated') remains and serves every
-- authenticated read, so the app sees no change.
DROP POLICY IF EXISTS profiles_select_active ON public.profiles;

-- ── 3. vmgc_* legacy tables: keep data, lock to authenticated ────────────────
DROP POLICY IF EXISTS "vmgc issues open access" ON public.vmgc_issues;
DROP POLICY IF EXISTS "vmgc purchases open access" ON public.vmgc_purchases;
DROP POLICY IF EXISTS "vmgc conversations open access" ON public.vmgc_conversations;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'vmgc_issues' AND policyname = 'vmgc_issues_all_authenticated') THEN
    CREATE POLICY vmgc_issues_all_authenticated ON public.vmgc_issues
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'vmgc_purchases' AND policyname = 'vmgc_purchases_all_authenticated') THEN
    CREATE POLICY vmgc_purchases_all_authenticated ON public.vmgc_purchases
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'vmgc_conversations' AND policyname = 'vmgc_conversations_all_authenticated') THEN
    CREATE POLICY vmgc_conversations_all_authenticated ON public.vmgc_conversations
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 4. task_series / invites: re-scope to authenticated ─────────────────────
DROP POLICY IF EXISTS task_series_select ON public.task_series;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'task_series' AND policyname = 'task_series_select') THEN
    CREATE POLICY task_series_select ON public.task_series
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DROP POLICY IF EXISTS invites_update_use ON public.invites;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'invites' AND policyname = 'invites_update_use') THEN
    CREATE POLICY invites_update_use ON public.invites
      FOR UPDATE TO authenticated
      USING (used_by IS NULL) WITH CHECK (used_by IS NOT NULL);
  END IF;
END $$;

-- ── 5. Revoke every anon table/sequence privilege in public ─────────────────
-- The anon role keeps schema USAGE (clean 42501 errors, PostgREST health) and
-- function EXECUTE (unchanged, out of scope). No unauthenticated app flow uses
-- public-schema tables (verified in Phase 0A + pre-flight code review).
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Stop FUTURE tables from auto-granting anon SELECT (reverses the default set
-- by 20260419_fix_all_table_grants.sql; applies to objects created by the role
-- that runs migrations via the Management API / SQL editor).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (do not run unless deliberately restoring the pre-B1 state)
-- ═══════════════════════════════════════════════════════════════════════════
-- -- 1. pin_codes anon verify (pre-B1 original from 20260419_add_pin_codes.sql):
-- CREATE POLICY "Anon can verify pins" ON public.pin_codes
--   FOR SELECT TO anon USING (is_active = true);
--
-- -- 2. profiles anon-visible select (pre-B1 original from 001_initial_schema.sql):
-- CREATE POLICY profiles_select_active ON public.profiles
--   FOR SELECT USING (is_active = true);
--
-- -- 3. vmgc_* open-access policies (pre-B1 originals, roles=public, qual true):
-- DROP POLICY IF EXISTS vmgc_issues_all_authenticated ON public.vmgc_issues;
-- DROP POLICY IF EXISTS vmgc_purchases_all_authenticated ON public.vmgc_purchases;
-- DROP POLICY IF EXISTS vmgc_conversations_all_authenticated ON public.vmgc_conversations;
-- CREATE POLICY "vmgc issues open access" ON public.vmgc_issues
--   FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "vmgc purchases open access" ON public.vmgc_purchases
--   FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "vmgc conversations open access" ON public.vmgc_conversations
--   FOR ALL USING (true) WITH CHECK (true);
--
-- -- 4. task_series / invites back to role public:
-- DROP POLICY IF EXISTS task_series_select ON public.task_series;
-- CREATE POLICY task_series_select ON public.task_series FOR SELECT USING (true);
-- DROP POLICY IF EXISTS invites_update_use ON public.invites;
-- CREATE POLICY invites_update_use ON public.invites
--   FOR UPDATE USING (used_by IS NULL) WITH CHECK (used_by IS NOT NULL);
--
-- -- 5. Anon grants: the exact pre-B1 per-table grant list is preserved in
-- --    docs/security/baselines/anon-grants-2026-07-11.json and as runnable SQL in
-- --    docs/security/baselines/anon-grants-rollback.sql (112 GRANT statements).
-- --    Default privileges: ALTER DEFAULT PRIVILEGES IN SCHEMA public
-- --      GRANT SELECT ON TABLES TO anon;
-- ═══════════════════════════════════════════════════════════════════════════
