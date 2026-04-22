-- ============================================================================
-- P1 — Pin search_path on every public SQL/PLPGSQL function.
-- ============================================================================
--
-- Supabase advisor flagged `function_search_path_mutable` for a bunch of
-- custom functions. A function with a mutable `search_path` is vulnerable
-- to schema-shadowing attacks: if an attacker can create a table/function
-- in another schema that appears earlier in the search_path than public,
-- calls from the function body resolve to the attacker's object instead.
-- It's especially dangerous for SECURITY DEFINER functions because they
-- execute with the owner's (frequently postgres superuser's) privileges.
--
-- Fix: set `search_path = pg_catalog, public` explicitly on every
-- function in the public schema. pg_catalog first so built-in types and
-- operators always resolve to Postgres's own definitions; public after so
-- the function can reference our own tables unqualified.
--
-- This migration iterates pg_proc, so it catches every function regardless
-- of whether it was added by earlier migrations, manual SQL from the
-- dashboard, or a seed script. Idempotent — safe to re-run.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK (each function reverts to inheriting the session search_path):
--
--   DO $$
--   DECLARE f RECORD;
--   BEGIN
--     FOR f IN
--       SELECT n.nspname, p.proname,
--              pg_get_function_identity_arguments(p.oid) AS args
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.prokind = 'f'
--     LOOP
--       EXECUTE format('ALTER FUNCTION %I.%I(%s) RESET search_path',
--                      f.nspname, f.proname, f.args);
--     END LOOP;
--   END $$;
-- ============================================================================

DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'                         -- plain functions (not procedures/aggregates)
      AND p.prolang IN (                           -- only SQL-ish; skip C funcs
        SELECT oid FROM pg_language WHERE lanname IN ('sql', 'plpgsql')
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = pg_catalog, public',
      f.nspname, f.proname, f.args
    );
    RAISE NOTICE 'Pinned search_path on %.%(%s)', f.nspname, f.proname, f.args;
  END LOOP;
END $$;

-- Diagnostic: show each function's current search_path setting. None
-- should come back NULL after this migration.
--
--   SELECT p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prokind = 'f'
--   ORDER BY p.proname;
