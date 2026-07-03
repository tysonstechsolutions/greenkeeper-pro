-- ============================================================================
-- Operation Blueprint Phase 2 — Money.
--
--   1. PR reconciliation: the business office's receipt amount rarely matches
--      the submitted PR total; capture the ACTUAL amount + receipt photo at
--      the received stage so submitted-vs-actual variance is visible.
--   2. Revenue provenance: entries can now come from an uploaded POS/register
--      report (AI-transcribed, human-verified) — keep the source + file.
--   3. Fuel refills: Reladyne delivery log per tank (gallons, receipt,
--      sent-to-business-office flag) rolling into monthly totals.
--
-- Per-area P&L needs no schema: revenue categories and the 5 NAF cost-center
-- codes map to areas deterministically in src/lib/money/areas.ts.
-- ============================================================================

-- ── 1. PR reconciliation ───────────────────────────────────────────────────
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS receipt_path TEXT,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

COMMENT ON COLUMN purchase_requests.actual_amount IS
  'What the order actually cost per the business-office receipt (often differs from the submitted total).';

-- ── 2. Revenue provenance ──────────────────────────────────────────────────
ALTER TABLE revenue_entries
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS report_path TEXT;

-- Named constraint so a re-run doesn't duplicate it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'revenue_entries_source_check'
  ) THEN
    ALTER TABLE revenue_entries
      ADD CONSTRAINT revenue_entries_source_check
      CHECK (source IN ('manual', 'pos_upload'));
  END IF;
END $$;

-- ── 3. Fuel refills ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_refills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Free text to match how the AST forms name tanks; the UI suggests the
  -- known ones (diesel / gasoline / used cooking oil).
  tank TEXT NOT NULL,
  gallons NUMERIC(10,2),
  cost NUMERIC(12,2),
  vendor TEXT NOT NULL DEFAULT 'Reladyne',
  receipt_path TEXT,
  -- He signs the delivery receipt and forwards it to the business office —
  -- this flag tracks that the paperwork actually went out.
  sent_to_business_office BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fuel_refills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage fuel_refills" ON fuel_refills;
CREATE POLICY "Authenticated manage fuel_refills" ON fuel_refills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fuel_refills_date ON fuel_refills(refill_date DESC);
