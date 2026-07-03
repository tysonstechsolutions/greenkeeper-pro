-- ============================================================================
-- Phase 2 follow-up: server-side monthly rollups for the per-area P&L.
--
-- Why: the project's PostgREST max_rows is 1000, so any client that fetches
-- RAW revenue/PR rows for a fiscal year silently truncates once volume grows
-- (daily POS uploads produce thousands of revenue rows per FY). These views
-- aggregate in the database — dozens of rows per year, can never truncate.
--
-- pr_spend also honors reconciliation: once a receipt records the ACTUAL
-- cost (purchase_requests.actual_amount), each line's spend is scaled by
-- actual/submitted so the P&L reports what was really paid, allocated
-- pro-rata across the PR's cost centers.
--
-- security_invoker: the views run under the caller's RLS (authenticated
-- full-access on both base tables), not the owner's.
-- ============================================================================

CREATE OR REPLACE VIEW revenue_monthly_rollup
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', entry_date)::date AS month,
  category,
  SUM(amount)::numeric(14,2) AS total
FROM revenue_entries
GROUP BY 1, 2;

CREATE OR REPLACE VIEW pr_spend_monthly_rollup
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', pr.date_prepared)::date AS month,
  line->>'cost_ctr' AS cost_ctr,
  SUM(
    (COALESCE((line->>'qty')::numeric, 0) * COALESCE((line->>'unit_price')::numeric, 0))
    * CASE
        WHEN pr.actual_amount IS NOT NULL AND COALESCE(pr.ige_amount, 0) <> 0
          THEN pr.actual_amount / pr.ige_amount
        ELSE 1
      END
  )::numeric(14,2) AS total
FROM purchase_requests pr
CROSS JOIN LATERAL jsonb_array_elements(pr.items) AS line
WHERE pr.status IN ('sent', 'approved', 'received')
GROUP BY 1, 2;

GRANT SELECT ON revenue_monthly_rollup TO authenticated;
GRANT SELECT ON pr_spend_monthly_rollup TO authenticated;
