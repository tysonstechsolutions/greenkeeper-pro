-- ============================================================================
-- P0-A — RLS hardening: enable RLS on every public table + replace
--        policies whose USING/WITH CHECK is the literal `true` with
--        authenticated-only baselines that still let the app function.
-- ============================================================================
--
-- What this migration does:
--   1. Enable row level security on every ordinary table in public that
--      currently has it disabled.
--   2. Find every policy in public whose `qual` (USING) AND `with_check`
--      are both the literal boolean true — those are the "anyone can do
--      anything" policies the Supabase advisor flagged — and drop them.
--   3. For any public table that has NO policies after step 2, install a
--      role-scoped baseline:
--        • SELECT  — any authenticated user
--        • INSERT  — any authenticated user (with a non-null session)
--        • UPDATE  — any authenticated user (with a non-null session)
--        • DELETE  — only managers (is_manager(auth.uid()))
--      These use the `(select auth.uid())` pattern so they don't hit the
--      auth_rls_initplan performance bucket.
--
-- Tables with existing fine-grained policies (owner-filter, manager-only
-- writes, etc.) are left alone — only truly "USING (true)" policies get
-- stripped. If you need even tighter rules on specific tables, add them
-- in a follow-up migration.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK — paste this into the SQL editor to undo:
--
--   -- Drop the baseline policies we added. Names follow
--   -- <table>_{select|insert|update}_auth and <table>_delete_mgr.
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT tablename, policyname FROM pg_policies
--       WHERE schemaname = 'public'
--         AND policyname LIKE '%_select_auth'
--          OR policyname LIKE '%_insert_auth'
--          OR policyname LIKE '%_update_auth'
--          OR policyname LIKE '%_delete_mgr'
--     LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
--                      r.policyname, r.tablename);
--     END LOOP;
--   END $$;
--
--   -- Re-disable RLS on whatever you want publicly exposed (DO NOT recommend):
--   -- ALTER TABLE public.<tablename> DISABLE ROW LEVEL SECURITY;
-- ============================================================================

-- Step 1: Enable RLS on every table that has it off.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    RAISE NOTICE 'Enabled RLS on public.%', t.relname;
  END LOOP;
END $$;

-- Step 2: Drop every "USING (true) WITH CHECK (true)" policy in public.
--         These are the ones Supabase flagged as rls_policy_always_true.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        -- "Always allow" in SELECT/DELETE (no with_check)
        (qual = 'true' AND with_check IS NULL)
        -- Or "always allow" in INSERT/UPDATE/ALL with the check also true
        OR (qual = 'true' AND with_check = 'true')
        -- Or pure always-allow INSERT (qual is NULL for INSERT)
        OR (qual IS NULL AND with_check = 'true')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   p.policyname, p.tablename);
    RAISE NOTICE 'Dropped permissive policy %.%  (was USING=%, WITH CHECK=%)',
                 p.tablename, p.policyname, p.qual, p.with_check;
  END LOOP;
END $$;

-- Step 3: For each public table that now has NO policies, install the
--         authenticated-only baseline. If a table still has policies
--         after step 2, leave it alone — its existing rules are more
--         specific than our generic baseline.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = c.relname
      )
  LOOP
    -- SELECT: any signed-in staff member
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL)',
      t.relname || '_select_auth', t.relname);

    -- INSERT: any signed-in staff member
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL)',
      t.relname || '_insert_auth', t.relname);

    -- UPDATE: any signed-in staff member
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL)',
      t.relname || '_update_auth', t.relname);

    -- DELETE: managers only
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_manager((select auth.uid())))',
      t.relname || '_delete_mgr', t.relname);

    RAISE NOTICE 'Installed baseline policies on public.%', t.relname;
  END LOOP;
END $$;

-- Diagnostic: after running, this shows every public table + whether RLS
-- is enabled + how many policies it has. Nothing should have RLS off and
-- nothing should have zero policies.
--
--   SELECT c.relname,
--          c.relrowsecurity AS rls_enabled,
--          (SELECT count(*) FROM pg_policies p
--             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--   ORDER BY c.relname;
