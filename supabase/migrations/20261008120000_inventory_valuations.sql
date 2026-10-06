-- ============================================================================
-- Month-end inventory valuations (2026-10-08).
--
-- The monthly count sheets for Buckleys food (151110), Buckleys bar (151120),
-- and pro shop retail (151130): what was on hand at month end and what it was
-- worth. With purchases they give true cost of goods sold:
--   COGS = starting inventory + purchases - ending inventory.
--
-- One valuation per outlet and month. Importing a month again replaces it.
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_valuations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet        TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar', 'pro_shop')),
  account       TEXT NOT NULL,
  cost_center   TEXT,
  month_end     DATE NOT NULL,
  -- What the item rows add up to (the value used), and what the sheet printed.
  total         NUMERIC(12,2) NOT NULL,
  stated_total  NUMERIC(12,2),
  item_count    INTEGER NOT NULL DEFAULT 0,
  source_file   TEXT,
  counted_by    TEXT,
  notes         TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_valuations_one_per_month UNIQUE (outlet, month_end)
);
CREATE INDEX IF NOT EXISTS idx_inventory_valuations_month
  ON public.inventory_valuations (month_end DESC);

CREATE TABLE IF NOT EXISTS public.inventory_valuation_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id    UUID NOT NULL REFERENCES public.inventory_valuations(id) ON DELETE CASCADE,
  line_no         INTEGER NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT,
  unit            TEXT,
  qty             NUMERIC(12,3) NOT NULL,
  unit_cost       NUMERIC(12,4) NOT NULL,
  value           NUMERIC(12,2) NOT NULL,
  inventory_code  TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_valuation_lines_valuation
  ON public.inventory_valuation_lines (valuation_id, line_no);

ALTER TABLE public.inventory_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_valuation_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_valuations_manage ON public.inventory_valuations;
CREATE POLICY inventory_valuations_manage ON public.inventory_valuations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS inventory_valuation_lines_manage ON public.inventory_valuation_lines;
CREATE POLICY inventory_valuation_lines_manage ON public.inventory_valuation_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_valuations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_valuation_lines TO authenticated;

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261008120000_inventory_valuations')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
