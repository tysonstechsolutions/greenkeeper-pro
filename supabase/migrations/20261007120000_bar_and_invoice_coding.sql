-- ============================================================================
-- Buckleys bar and restaurant kept apart, and US Foods lines coded (2026-10-07).
--
--   1. Revenue: a Bar category next to Food and Beverage (the restaurant), and
--      which RecTrac report a line came from (restaurant, bar, pro shop).
--   2. Invoice lines: bar or restaurant, plus the cost center and G/L each line
--      is charged to (food 151110, alcohol 151120, supplies by type, all 20091).
--   3. Products remembered as bar items, so the next invoice marks them.
--   4. Each invoice keeps its bar cost so food cost works per outlet.
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again.
-- Run 20261006120000_operations_upgrade.sql first.
-- ============================================================================

-- ── 1. Revenue: Bar category and report source ────────────────────────────

ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_category_check;
ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_category_check CHECK (category IN (
    'greens_fees', 'cart_rentals', 'pro_shop', 'food_beverage', 'bar',
    'events', 'memberships', 'driving_range', 'other'
  ));

ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS report_area TEXT;
ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_report_area_check;
ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_report_area_check
  CHECK (report_area IS NULL OR report_area IN ('restaurant', 'bar', 'pro_shop', 'other'));

-- ── 2. Invoice lines: outlet and coding ────────────────────────────────────

ALTER TABLE public.restaurant_purchase_lines
  ADD COLUMN IF NOT EXISTS outlet TEXT NOT NULL DEFAULT 'restaurant',
  ADD COLUMN IF NOT EXISTS cost_ctr TEXT,
  ADD COLUMN IF NOT EXISTS gl_acct TEXT;
ALTER TABLE public.restaurant_purchase_lines
  DROP CONSTRAINT IF EXISTS restaurant_purchase_lines_outlet_check;
ALTER TABLE public.restaurant_purchase_lines
  ADD CONSTRAINT restaurant_purchase_lines_outlet_check CHECK (outlet IN ('restaurant', 'bar'));

-- Lines saved before this update: alcohol is bar, codes filled in.
UPDATE public.restaurant_purchase_lines SET outlet = 'bar'
  WHERE category = 'alcohol' AND outlet <> 'bar';
UPDATE public.restaurant_purchase_lines SET cost_ctr = '20091'
  WHERE cost_ctr IS NULL;
UPDATE public.restaurant_purchase_lines SET gl_acct = CASE category
    WHEN 'food' THEN '151110'
    WHEN 'alcohol' THEN '151120'
    ELSE '701000'
  END
  WHERE gl_acct IS NULL;

-- ── 3. Products remembered as bar or restaurant ────────────────────────────

CREATE TABLE IF NOT EXISTS public.restaurant_product_outlets (
  product_number TEXT PRIMARY KEY,
  outlet         TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar')),
  updated_by     UUID DEFAULT auth.uid(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_product_outlets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurant_product_outlets_manage ON public.restaurant_product_outlets;
CREATE POLICY restaurant_product_outlets_manage ON public.restaurant_product_outlets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_product_outlets TO authenticated;

-- ── 4. Bar cost per invoice ────────────────────────────────────────────────

-- Food and alcohol on the invoice that belong to the bar. The restaurant cost
-- is food_amount plus alcohol_amount minus this.
ALTER TABLE public.restaurant_purchases
  ADD COLUMN IF NOT EXISTS bar_cogs_amount NUMERIC(12,2);

UPDATE public.restaurant_purchases p
   SET bar_cogs_amount = COALESCE((
     SELECT SUM(l.extended) FROM public.restaurant_purchase_lines l
      WHERE l.purchase_id = p.id AND l.outlet = 'bar' AND l.category IN ('food', 'alcohol')
   ), 0)
 WHERE p.bar_cogs_amount IS NULL
   AND p.document_number IS NOT NULL;

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261007120000_bar_and_invoice_coding')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
