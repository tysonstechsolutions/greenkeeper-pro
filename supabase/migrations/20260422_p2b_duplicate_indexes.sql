-- ============================================================================
-- P2-B — Drop duplicate indexes on public.diagnostics.
-- ============================================================================
--
-- Supabase advisor flagged two duplicate index pairs on diagnostics:
--   • idx_diagnostics_created_at  ≈  idx_diagnostics_date
--   • idx_diagnostics_zone        ≈  idx_diagnostics_zone_id
--
-- We keep the more descriptive name in each pair (idx_diagnostics_created_at
-- is the standard naming convention used elsewhere in the schema;
-- idx_diagnostics_zone_id explicitly names the column). The others get
-- dropped. Duplicate indexes waste storage, double every write, and
-- confuse the planner into occasionally picking the slower copy.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   CREATE INDEX idx_diagnostics_date ON public.diagnostics(created_at);
--   CREATE INDEX idx_diagnostics_zone ON public.diagnostics(zone_id);
-- ============================================================================

DROP INDEX IF EXISTS public.idx_diagnostics_date;
DROP INDEX IF EXISTS public.idx_diagnostics_zone;

-- If the advisor later flags other duplicate pairs, find them with:
--
--   SELECT n.nspname, c.relname AS table_name,
--          array_agg(i.relname) AS duplicate_indexes
--   FROM pg_index idx
--   JOIN pg_class i ON i.oid = idx.indexrelid
--   JOIN pg_class c ON c.oid = idx.indrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--   GROUP BY n.nspname, c.relname, idx.indkey, idx.indpred, idx.indisunique
--   HAVING count(*) > 1;
