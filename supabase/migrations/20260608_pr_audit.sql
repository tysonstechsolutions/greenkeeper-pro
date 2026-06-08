-- ============================================================================
-- PR Audit — team purchase-request inbox, audit log, and per-cost-center budget
-- ============================================================================
--
-- The GM/director receives finished NAVMIDLANT NAF Purchase Requests from the
-- whole team. This feature lets him upload each one (PDF or photo), auto-audit
-- it against the procurement rules (valid Site / Cost Center / G/L codes, the
-- 3% credit-card fee, sales-tax handling, line math, the grand total, and the
-- "Other = Vendor Quote" attachment), and roll spending up by cost center and
-- month so he can see budget vs. remaining per NAF account.
--
-- Two tables:
--   • pr_audits           — one row per uploaded + audited PR.
--   • cost_center_budgets — annual allocation per cost center per federal FY.
--
-- The uploaded source file is stored in the EXISTING private `vendor-files`
-- bucket under a `pr-audit/` path prefix, so no new bucket / storage policies
-- are needed (the vendor-files policies from 20260503 already cover it).
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   DROP TABLE IF EXISTS pr_audits;
--   DROP TABLE IF EXISTS cost_center_budgets;
-- ============================================================================

-- ── 1. pr_audits ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pr_audits (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Uploaded source file (in the private `vendor-files` bucket).
  file_path                   TEXT,
  file_name                   TEXT,
  file_uploaded_at            TIMESTAMPTZ,

  -- Extracted / reviewer-corrected PR header. pr_date drives BOTH the fiscal
  -- year and the month bucket for the budget rollup, so it is NOT NULL.
  pr_date                     DATE NOT NULL,
  vendor_name                 TEXT,
  requestor_name              TEXT,
  internal_order              TEXT,

  -- Line items: array of
  --   { item, site, cost_ctr, gl_acct, description, part_number, qty, unit, unit_price }
  -- (same shape as purchase_requests.items). extended price is derived.
  items                       JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- The "Other" attachment label as written on the form (expected
  -- "Vendor Quote"), and the grand total printed on the PR (for cross-check).
  attached_other              TEXT,
  printed_total               NUMERIC(14,2),

  -- Audit output (computed client-side by lib/pr-audit/audit.ts and frozen
  -- here at save time so the history shows what was found when reviewed).
  audit_findings              JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_error_count           INT  NOT NULL DEFAULT 0,
  audit_warning_count         INT  NOT NULL DEFAULT 0,
  -- Real total = sum(items.qty * items.unit_price), including fee + tax lines.
  computed_total              NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Reviewer workflow. Only 'approved' rows count toward "spent"; 'pending'
  -- rows are surfaced separately as awaiting-review; 'sent_back' are excluded.
  review_status               TEXT NOT NULL DEFAULT 'pending'
                              CHECK (review_status IN ('pending', 'approved', 'sent_back')),
  review_note                 TEXT,
  reviewed_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at                 TIMESTAMPTZ,

  -- "Looked at" tracking: set the first time the reviewer opens the PR, so the
  -- inbox can split uploads into not-looked-at vs. looked-at. NULL = unseen.
  viewed_at                   TIMESTAMPTZ,

  created_by                  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_audits_pr_date
  ON pr_audits(pr_date DESC);

CREATE INDEX IF NOT EXISTS idx_pr_audits_review_status
  ON pr_audits(review_status);

DROP TRIGGER IF EXISTS pr_audits_touch_updated_at ON pr_audits;
CREATE TRIGGER pr_audits_touch_updated_at
  BEFORE UPDATE ON pr_audits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pr_audits ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read (PRs are reviewed across roles).
DROP POLICY IF EXISTS "pr_audits_select_auth" ON pr_audits;
CREATE POLICY "pr_audits_select_auth"
  ON pr_audits FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Management can create/update/delete.
DROP POLICY IF EXISTS "pr_audits_insert_management" ON pr_audits;
CREATE POLICY "pr_audits_insert_management"
  ON pr_audits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

DROP POLICY IF EXISTS "pr_audits_update_management" ON pr_audits;
CREATE POLICY "pr_audits_update_management"
  ON pr_audits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

DROP POLICY IF EXISTS "pr_audits_delete_management" ON pr_audits;
CREATE POLICY "pr_audits_delete_management"
  ON pr_audits FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON pr_audits TO authenticated;

COMMENT ON TABLE pr_audits IS
  'Uploaded + audited team Purchase Requests, with per-line cost-center amounts for budget rollup.';

-- ── 2. cost_center_budgets ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_center_budgets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Federal fiscal year (Oct 1 – Sep 30), 4-digit, e.g. 2026 for FY26.
  fiscal_year                 INT  NOT NULL,
  -- NAF cost-center code (see src/lib/pr-accounting-codes.ts PR_COST_CENTERS).
  cost_ctr                    TEXT NOT NULL,
  annual_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes                       TEXT,

  created_by                  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One budget row per cost center per fiscal year.
  UNIQUE (fiscal_year, cost_ctr)
);

CREATE INDEX IF NOT EXISTS idx_cost_center_budgets_fy
  ON cost_center_budgets(fiscal_year);

DROP TRIGGER IF EXISTS cost_center_budgets_touch_updated_at ON cost_center_budgets;
CREATE TRIGGER cost_center_budgets_touch_updated_at
  BEFORE UPDATE ON cost_center_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE cost_center_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_center_budgets_select_auth" ON cost_center_budgets;
CREATE POLICY "cost_center_budgets_select_auth"
  ON cost_center_budgets FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cost_center_budgets_insert_management" ON cost_center_budgets;
CREATE POLICY "cost_center_budgets_insert_management"
  ON cost_center_budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

DROP POLICY IF EXISTS "cost_center_budgets_update_management" ON cost_center_budgets;
CREATE POLICY "cost_center_budgets_update_management"
  ON cost_center_budgets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

DROP POLICY IF EXISTS "cost_center_budgets_delete_management" ON cost_center_budgets;
CREATE POLICY "cost_center_budgets_delete_management"
  ON cost_center_budgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON cost_center_budgets TO authenticated;

COMMENT ON TABLE cost_center_budgets IS
  'Annual budget allocation per NAF cost center per federal fiscal year (Oct–Sep).';

NOTIFY pgrst, 'reload schema';
