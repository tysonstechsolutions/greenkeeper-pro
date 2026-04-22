-- ============================================================================
-- P0-A fix-up — restore missing INSERT/UPDATE baselines.
-- ============================================================================
--
-- The P0-A migration (20260422_p0a_rls_hardening.sql) did two things:
--   1. Dropped every policy with USING(true) WITH CHECK(true). That's
--      correct — the advisor flagged them as "rls_policy_always_true".
--   2. Added baseline auth-only policies to any table with ZERO policies
--      remaining.
--
-- Bug: some tables had multiple policies — e.g. `equipment` had SELECT,
-- INSERT(true), UPDATE(true), DELETE policies. Step 1 dropped the
-- INSERT+UPDATE. Step 2 looked at policy count and said "still has
-- policies, skip baseline." Result: `equipment` ended up with SELECT
-- and DELETE but no INSERT/UPDATE. Every insert returned 403
-- "new row violates row-level security policy".
--
-- Symptom surfaced via the scan wizard's step 2 (Link): creating a
-- fresh equipment record failed with 403 on every asset scan.
--
-- This migration:
--   • Finds every table in public with RLS on that has a SELECT policy
--     but no INSERT policy, and attaches `<table>_insert_auth`.
--   • Same for UPDATE — if a table has any policy but no UPDATE policy,
--     attach `<table>_update_auth`.
--
-- Safe to re-run; `CREATE POLICY IF NOT EXISTS` doesn't exist in Postgres
-- so we guard with pg_policies inspection.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK — just drop the added baselines:
--
--   DO $$
--   DECLARE r RECORD;
--   BEGIN
--     FOR r IN SELECT tablename, policyname FROM pg_policies
--              WHERE schemaname = 'public'
--                AND (policyname LIKE '%_insert_auth' OR policyname LIKE '%_update_auth')
--     LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
--                      r.policyname, r.tablename);
--     END LOOP;
--   END $$;
-- ============================================================================

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
      AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = c.relname
      )
  LOOP
    -- INSERT: missing?
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.relname
        AND cmd IN ('INSERT', 'ALL')
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL)',
        t.relname || '_insert_auth', t.relname
      );
      RAISE NOTICE 'Added missing INSERT policy to public.%', t.relname;
    END IF;

    -- UPDATE: missing?
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.relname
        AND cmd IN ('UPDATE', 'ALL')
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL)',
        t.relname || '_update_auth', t.relname
      );
      RAISE NOTICE 'Added missing UPDATE policy to public.%', t.relname;
    END IF;

    -- DELETE: missing?
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.relname
        AND cmd IN ('DELETE', 'ALL')
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_manager((select auth.uid())))',
        t.relname || '_delete_mgr', t.relname
      );
      RAISE NOTICE 'Added missing DELETE policy to public.%', t.relname;
    END IF;

    -- SELECT: missing?
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.relname
        AND cmd IN ('SELECT', 'ALL')
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL)',
        t.relname || '_select_auth', t.relname
      );
      RAISE NOTICE 'Added missing SELECT policy to public.%', t.relname;
    END IF;
  END LOOP;
END $$;

-- Diagnostic: any table with RLS on and fewer than 4 command types
-- covered is still missing something. Expect zero rows after this runs.
--
--   SELECT c.relname,
--          array_agg(DISTINCT p.cmd ORDER BY p.cmd) AS covered_cmds
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
--   GROUP BY c.relname
--   HAVING NOT ('SELECT' = ANY(array_agg(DISTINCT p.cmd)) OR 'ALL' = ANY(array_agg(DISTINCT p.cmd)))
--       OR NOT ('INSERT' = ANY(array_agg(DISTINCT p.cmd)) OR 'ALL' = ANY(array_agg(DISTINCT p.cmd)))
--       OR NOT ('UPDATE' = ANY(array_agg(DISTINCT p.cmd)) OR 'ALL' = ANY(array_agg(DISTINCT p.cmd)))
--       OR NOT ('DELETE' = ANY(array_agg(DISTINCT p.cmd)) OR 'ALL' = ANY(array_agg(DISTINCT p.cmd)))
--   ORDER BY c.relname;
