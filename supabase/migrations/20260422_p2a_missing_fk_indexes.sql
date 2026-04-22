-- ============================================================================
-- P2-A — Create indexes for every foreign key that doesn't already have one.
-- ============================================================================
--
-- Supabase advisor flagged `unindexed_foreign_keys` on a wide set of tables.
-- Without an index on the FK column, a DELETE or UPDATE of the parent row
-- forces Postgres to seq-scan the child table to enforce the FK; on
-- operations-heavy tables (equipment_logs, equipment_parts, tasks, etc.)
-- that's visibly slow.
--
-- This migration queries pg_constraint for every FK in the public schema,
-- checks if any index on the child table starts with the FK column, and
-- creates a `CREATE INDEX IF NOT EXISTS` if not.
--
-- Safe to run multiple times — IF NOT EXISTS makes it a no-op on re-run.
--
-- For composite FKs (rare in this schema), the auto-generated index covers
-- the leading column only, which matches Postgres's FK planner behavior.
-- If you have a specific composite-FK performance bottleneck, add a manual
-- index for it afterwards.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK — drop every index with name matching ix_fk_<table>_<column>:
--
--   DO $$
--   DECLARE i RECORD;
--   BEGIN
--     FOR i IN SELECT indexname FROM pg_indexes
--              WHERE schemaname = 'public' AND indexname LIKE 'ix_fk_%'
--     LOOP
--       EXECUTE format('DROP INDEX IF EXISTS public.%I', i.indexname);
--     END LOOP;
--   END $$;
-- ============================================================================

DO $$
DECLARE fk RECORD;
DECLARE idx_name TEXT;
BEGIN
  FOR fk IN
    SELECT
      n.nspname                                      AS schema_name,
      c.conname                                      AS constraint_name,
      cls.relname                                    AS table_name,
      att.attname                                    AS column_name
    FROM pg_constraint c
    JOIN pg_namespace n   ON n.oid = c.connamespace
    JOIN pg_class cls     ON cls.oid = c.conrelid
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND k.ord = 1                                  -- leading FK column
      -- skip if any index already leads with this column
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index idx
        JOIN pg_class icls ON icls.oid = idx.indexrelid
        JOIN pg_attribute ia
          ON ia.attrelid = idx.indrelid
         AND ia.attnum = idx.indkey[0]
        WHERE idx.indrelid = c.conrelid
          AND ia.attnum = att.attnum
      )
  LOOP
    idx_name := format('ix_fk_%s_%s', fk.table_name, fk.column_name);
    -- Postgres truncates identifiers at 63 chars; keep names under that.
    IF length(idx_name) > 63 THEN
      idx_name := left(idx_name, 63);
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
      idx_name, fk.table_name, fk.column_name
    );
    RAISE NOTICE 'Created FK index %I on %I(%I)',
                 idx_name, fk.table_name, fk.column_name;
  END LOOP;
END $$;
