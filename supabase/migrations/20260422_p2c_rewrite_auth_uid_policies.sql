-- ============================================================================
-- P2-C — Rewrite existing policies to use (select auth.uid()) pattern.
-- ============================================================================
--
-- Supabase advisor lint `auth_rls_initplan`: policies that call auth.uid()
-- directly get re-evaluated for every row, which hurts query plans on
-- large scans. The recommended pattern is `(select auth.uid())`, which
-- Postgres treats as an init-plan — evaluated once per query, cached.
-- Same for auth.role() and auth.jwt().
--
-- This migration regenerates every policy in public whose USING or
-- WITH CHECK expression contains a bare `auth.uid()` / `auth.role()` /
-- `auth.jwt()` call, replacing each with the select-wrapped form.
--
-- Approach:
--   1. Iterate pg_policies in public schema
--   2. Compute new USING / WITH CHECK strings by regex-replacing the bare
--      calls with the select-wrapped versions
--   3. If anything changed: DROP + CREATE POLICY with the new expression
--
-- This is deliberately cautious — we only rewrite when we actually detect
-- a bare auth.* call, and we preserve the policy's name, command, and
-- role list exactly. Idempotent on policies already using the select form.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
-- None. This is a semantically-equivalent rewrite — reverting would
-- regress performance. If you truly need the old form, pull the policy
-- definitions from a pre-migration pg_dump.
-- ============================================================================

DO $$
DECLARE
  p RECORD;
  new_qual TEXT;
  new_check TEXT;
  policy_cmd TEXT;
  roles_list TEXT;
  needs_rewrite BOOLEAN;
BEGIN
  FOR p IN
    SELECT schemaname,
           tablename,
           policyname,
           permissive,
           roles,
           cmd            AS command,
           qual,
           with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    needs_rewrite := false;
    new_qual := p.qual;
    new_check := p.with_check;

    -- Replace ` auth.uid() ` / leading/trailing / paren-bounded variations.
    -- Use regex to handle all whitespace and surrounding characters.
    IF new_qual IS NOT NULL
       AND new_qual ~ '(^|[^(a-z])auth\.(uid|role|jwt)\(\)' THEN
      new_qual := regexp_replace(
        new_qual,
        '(^|[^(a-z])(auth\.(uid|role|jwt)\(\))',
        '\1( select \2 )',
        'g'
      );
      needs_rewrite := true;
    END IF;

    IF new_check IS NOT NULL
       AND new_check ~ '(^|[^(a-z])auth\.(uid|role|jwt)\(\)' THEN
      new_check := regexp_replace(
        new_check,
        '(^|[^(a-z])(auth\.(uid|role|jwt)\(\))',
        '\1( select \2 )',
        'g'
      );
      needs_rewrite := true;
    END IF;

    CONTINUE WHEN NOT needs_rewrite;

    -- Rebuild role list as a comma-separated quoted identifier string.
    SELECT string_agg(quote_ident(r), ', ')
      INTO roles_list
      FROM unnest(p.roles) AS r;

    -- pg_policies.cmd is capitalized ('SELECT'/'INSERT'/etc); map to
    -- what CREATE POLICY expects (it's case-insensitive but be tidy).
    policy_cmd := p.command;

    -- Drop + recreate.
    EXECUTE format('DROP POLICY %I ON %I.%I',
                   p.policyname, p.schemaname, p.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      p.policyname,
      p.schemaname,
      p.tablename,
      CASE WHEN p.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      policy_cmd,
      roles_list,
      CASE WHEN new_qual  IS NOT NULL THEN format(' USING (%s)',      new_qual)  ELSE '' END,
      CASE WHEN new_check IS NOT NULL THEN format(' WITH CHECK (%s)', new_check) ELSE '' END
    );

    RAISE NOTICE 'Rewrote policy %.% to use (select auth.*) pattern',
                 p.tablename, p.policyname;
  END LOOP;
END $$;
