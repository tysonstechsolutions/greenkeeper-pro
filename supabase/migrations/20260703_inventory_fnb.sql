-- ============================================================================
-- Operation Blueprint Phase 4 — Restaurant & Pro Shop modules.
--
--   inventory_items        — the countable stock per area (restaurant food &
--                            supplies, pro-shop merchandise) with optional
--                            par levels for low-stock flags.
--   inventory_counts       — one row per hand-count session (the monthly
--                            count the obligations already nag about).
--   inventory_count_lines  — the quantities entered during a count.
--   restaurant_purchases   — US Foods (etc.) invoices; restaurant spend has
--                            no PR trail, so this feeds the per-area P&L.
--   restaurant_spend_monthly_rollup — server-side aggregate for the P&L
--                            (same max_rows-proof pattern as money_rollups).
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL CHECK (area IN ('restaurant', 'pro_shop')),
  name TEXT NOT NULL,
  unit TEXT, -- 'each', 'case', 'box', 'lbs'...
  -- Reorder threshold: counting below this flags the item for the order list.
  par_level NUMERIC(10,2),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL CHECK (area IN ('restaurant', 'pro_shop')),
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  qty NUMERIC(10,2) NOT NULL,
  UNIQUE (count_id, item_id)
);

CREATE TABLE IF NOT EXISTS restaurant_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor TEXT NOT NULL DEFAULT 'US Foods',
  amount NUMERIC(12,2) NOT NULL,
  invoice_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS (authenticated full access, same as the rest of the app) ──────────
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage inventory_items" ON inventory_items;
CREATE POLICY "Authenticated manage inventory_items" ON inventory_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated manage inventory_counts" ON inventory_counts;
CREATE POLICY "Authenticated manage inventory_counts" ON inventory_counts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated manage inventory_count_lines" ON inventory_count_lines;
CREATE POLICY "Authenticated manage inventory_count_lines" ON inventory_count_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated manage restaurant_purchases" ON restaurant_purchases;
CREATE POLICY "Authenticated manage restaurant_purchases" ON restaurant_purchases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inventory_items_area ON inventory_items(area, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_area ON inventory_counts(area, count_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_count ON inventory_count_lines(count_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_purchases_date ON restaurant_purchases(purchase_date DESC);

-- ── Restaurant spend rollup for the per-area P&L ───────────────────────────
CREATE OR REPLACE VIEW restaurant_spend_monthly_rollup
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', purchase_date)::date AS month,
  SUM(amount)::numeric(14,2) AS total
FROM restaurant_purchases
GROUP BY 1;

GRANT SELECT ON restaurant_spend_monthly_rollup TO authenticated;
