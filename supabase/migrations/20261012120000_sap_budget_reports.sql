-- ============================================================================
-- SAP budget performance reports (2026-10-12).
--
-- The SAP Budget Performance Activity Report (ZVK/ZC01B) is the official
-- profit and loss by cost center. Each report is one month of one fiscal
-- year. It keeps every revenue and cost line with the month and the year to
-- date: actual, plan, and prior year. Importing the same month again
-- replaces it.
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again.
-- Run 20261009120000_sales_reports.sql first.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sap_budget_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year   INTEGER NOT NULL,
  period        INTEGER NOT NULL CHECK (period BETWEEN 1 AND 16),
  period_name   TEXT,
  run_date      DATE,
  source_file   TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sap_budget_reports_one_per_period UNIQUE (fiscal_year, period)
);

-- One row per printed line, in report order.
CREATE TABLE IF NOT EXISTS public.sap_budget_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         UUID NOT NULL REFERENCES public.sap_budget_reports(id) ON DELETE CASCADE,
  cost_center       TEXT NOT NULL,
  cost_center_name  TEXT,
  activity          TEXT NOT NULL,
  section           TEXT NOT NULL CHECK (section IN ('revenue', 'cost', 'result')),
  code              TEXT,
  label             TEXT NOT NULL,
  level             INTEGER NOT NULL DEFAULT 0,
  line_no           INTEGER NOT NULL,
  month_actual      NUMERIC(14,2),
  month_plan        NUMERIC(14,2),
  month_prior       NUMERIC(14,2),
  ytd_actual        NUMERIC(14,2),
  ytd_plan          NUMERIC(14,2),
  ytd_prior         NUMERIC(14,2)
);
CREATE INDEX IF NOT EXISTS idx_sap_budget_lines_report
  ON public.sap_budget_lines (report_id, cost_center, activity, line_no);

ALTER TABLE public.sap_budget_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_budget_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sap_budget_reports_manage ON public.sap_budget_reports;
CREATE POLICY sap_budget_reports_manage ON public.sap_budget_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sap_budget_lines_manage ON public.sap_budget_lines;
CREATE POLICY sap_budget_lines_manage ON public.sap_budget_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sap_budget_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sap_budget_lines TO authenticated;

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261012120000_sap_budget_reports')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
