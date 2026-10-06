-- ============================================================================
-- RecTrac sales reports, item by item (2026-10-09).
--
-- A RecTrac Flash Report (Sales Statistics) lists every item rung up. Each
-- imported report keeps its daily totals as revenue entries (so the money
-- pages see them) and its item sales per day (for best sellers, prices, and
-- cost per item). Importing a report again replaces the days it covers.
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again.
-- Run 20261007120000_bar_and_invoice_coding.sql first.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet        TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar', 'pro_shop')),
  title         TEXT,
  category      TEXT,
  begin_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  grand_total   NUMERIC(14,2) NOT NULL,
  transactions  INTEGER,
  source_file   TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_reports_dates CHECK (end_date >= begin_date)
);
CREATE INDEX IF NOT EXISTS idx_sales_reports_outlet_dates
  ON public.sales_reports (outlet, begin_date, end_date);

-- One row per item per day.
CREATE TABLE IF NOT EXISTS public.sales_item_days (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES public.sales_reports(id) ON DELETE CASCADE,
  outlet          TEXT NOT NULL CHECK (outlet IN ('restaurant', 'bar', 'pro_shop')),
  sale_date       DATE NOT NULL,
  inventory_code  TEXT,
  description     TEXT NOT NULL,
  qty             NUMERIC(12,2) NOT NULL,
  gross           NUMERIC(12,2) NOT NULL,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  net             NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_item_days_outlet_date
  ON public.sales_item_days (outlet, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_item_days_report
  ON public.sales_item_days (report_id);

-- Daily revenue entries made from a report go with it.
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS sales_report_id UUID REFERENCES public.sales_reports(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_revenue_entries_sales_report
  ON public.revenue_entries (sales_report_id);

ALTER TABLE public.sales_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_item_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_reports_manage ON public.sales_reports;
CREATE POLICY sales_reports_manage ON public.sales_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sales_item_days_manage ON public.sales_item_days;
CREATE POLICY sales_item_days_manage ON public.sales_item_days
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_item_days TO authenticated;

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261009120000_sales_reports')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
