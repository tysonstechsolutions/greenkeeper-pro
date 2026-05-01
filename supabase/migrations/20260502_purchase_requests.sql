-- ============================================================================
-- Non-Appropriated Fund Purchase Requests (NAVMIDLANT)
-- ============================================================================
--
-- Captures the FY2025 NAVMIDLANT NAF purchase-request form. The form is a
-- single-page submission (with optional page-2 overflow for line items > 18
-- entries) that ultimately gets emailed to midlantnafproc@us.navy.mil.
--
-- Fields are stored as discrete columns where they're scalar (vendor info,
-- invoice/delivery addresses, account codes, approvals) and as JSONB where
-- they're variable-length (the line-items table). Storing items as JSONB
-- means the form can grow/shrink rows without schema churn and the audit
-- PDF reads the same shape on render.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   DROP TABLE IF EXISTS purchase_requests;
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Header --------------------------------------------------------------------
  date_prepared               DATE NOT NULL,
  required_delivery_date      DATE,
  request_via                 TEXT NOT NULL DEFAULT 'CONTRACTING OFFICE',
  currency                    TEXT NOT NULL DEFAULT 'US Dollar $',

  -- Requestor (auto-filled from profile)
  requestor_name              TEXT NOT NULL,
  requestor_email             TEXT,
  requestor_phone             TEXT,

  -- Vendor 1 (full)
  vendor1_name                TEXT,
  vendor1_address             TEXT,
  vendor1_line2               TEXT,
  vendor1_city_state_zip      TEXT,
  vendor1_poc                 TEXT,
  vendor1_email               TEXT,
  vendor1_phone               TEXT,
  vendor1_sap_no              TEXT,
  vendor1_gsa_naf_no          TEXT,

  -- Vendor 2/3 (just names — full info per form note goes as separate attachment)
  vendor2_name                TEXT,
  vendor3_name                TEXT,

  -- Invoice address
  invoice_address             TEXT,
  invoice_line2               TEXT,
  invoice_city_state_zip      TEXT,
  invoice_poc                 TEXT,
  invoice_phone               TEXT,
  invoice_email               TEXT,

  -- Delivery address
  delivery_address            TEXT,
  delivery_line2              TEXT,
  delivery_city_state_zip     TEXT,
  delivery_poc                TEXT,
  delivery_phone              TEXT,
  delivery_email              TEXT,

  -- Accounting
  company_code                TEXT,
  requesting_facility_code    TEXT,
  internal_order              TEXT,
  project_no                  TEXT,
  program                     TEXT,

  -- Line items: array of
  --   { item: int, site: text, cost_ctr: text, gl_acct: text,
  --     description: text, qty: number, unit: text, unit_price: number }
  -- extended_price is derived (qty * unit_price), not stored.
  items                       JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- IGE / approvals
  ige_excess_pct              NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- ige_amount is denormalized: sum(items.qty * items.unit_price). We store
  -- it for PDF render speed and so the cardholder ceiling check can index it.
  ige_amount                  NUMERIC(14,2) NOT NULL DEFAULT 0,
  justification               TEXT,
  ige_based_on                TEXT,

  financial_analyst           TEXT,
  approving_authority         TEXT,
  approving_signature_date    DATE,
  second_approval             TEXT,
  second_signature_date       DATE,

  -- Attached-item checkboxes
  attached_ssj                BOOLEAN NOT NULL DEFAULT FALSE,
  attached_bnj                BOOLEAN NOT NULL DEFAULT FALSE,
  attached_pws                BOOLEAN NOT NULL DEFAULT FALSE,
  attached_itpr               BOOLEAN NOT NULL DEFAULT FALSE,
  attached_other              TEXT,
  attached_section_889        BOOLEAN NOT NULL DEFAULT FALSE,

  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'submitted')),

  created_by                  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_date
  ON purchase_requests(date_prepared DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status
  ON purchase_requests(status);

CREATE TRIGGER purchase_requests_touch_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read PRs (commonly reviewed across roles).
CREATE POLICY "purchase_requests_select_auth"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Management can create/update/delete.
CREATE POLICY "purchase_requests_insert_management"
  ON purchase_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

CREATE POLICY "purchase_requests_update_management"
  ON purchase_requests FOR UPDATE
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

CREATE POLICY "purchase_requests_delete_management"
  ON purchase_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_requests TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE purchase_requests IS
  'NAVMIDLANT FY2025 Non-Appropriated Fund Purchase Request form submissions.';
