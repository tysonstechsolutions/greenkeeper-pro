-- ============================================================================
-- PR Audit — monthly cost-center budgets
-- ============================================================================
--
-- Budgets become MONTHLY: one amount per cost center per month, so the
-- dashboard can track spending month-by-month (primary) with an annual roll-up
-- (secondary). `month` is the calendar month 1-12 (the FY view orders them
-- Oct→Sep). A row with month = NULL is a legacy whole-year amount, still
-- honored as a fallback (spread evenly) so nothing already entered breaks.
--
-- `annual_amount` now holds "the amount for this period" — the month's budget
-- on a monthly row, or the whole-year amount on a legacy NULL-month row.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS cost_center_budgets_fy_cc_month_uidx;
--   ALTER TABLE cost_center_budgets DROP CONSTRAINT IF EXISTS cost_center_budgets_month_check;
--   ALTER TABLE cost_center_budgets DROP COLUMN IF EXISTS month;
--   ALTER TABLE cost_center_budgets ADD CONSTRAINT cost_center_budgets_fiscal_year_cost_ctr_key UNIQUE (fiscal_year, cost_ctr);
-- ============================================================================

ALTER TABLE cost_center_budgets ADD COLUMN IF NOT EXISTS month INT;

ALTER TABLE cost_center_budgets DROP CONSTRAINT IF EXISTS cost_center_budgets_month_check;
ALTER TABLE cost_center_budgets ADD CONSTRAINT cost_center_budgets_month_check
  CHECK (month IS NULL OR (month BETWEEN 1 AND 12));

-- The old per-(fy,cost_ctr) uniqueness would block 12 monthly rows — replace it
-- with uniqueness per (fy, cost_ctr, month). (NULL months remain distinct, so a
-- legacy annual row can coexist; the app uses delete-then-insert to avoid dupes.)
ALTER TABLE cost_center_budgets
  DROP CONSTRAINT IF EXISTS cost_center_budgets_fiscal_year_cost_ctr_key;
CREATE UNIQUE INDEX IF NOT EXISTS cost_center_budgets_fy_cc_month_uidx
  ON cost_center_budgets (fiscal_year, cost_ctr, month);

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN cost_center_budgets.month IS
  'Calendar month 1-12 for a monthly budget row; NULL = legacy whole-year amount.';
