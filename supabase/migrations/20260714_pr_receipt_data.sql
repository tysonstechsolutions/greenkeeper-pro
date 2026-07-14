-- ============================================================================
-- PR receipt AI-match — store the parsed receipt + the deterministic
-- line-by-line match result alongside the existing reconciliation columns
-- (actual_amount / receipt_path / reconciled_at from 20260702_money_phase2).
--
-- When a received PR's receipt is uploaded, the extract-receipt edge function
-- reads it and src/lib/pr/receipt-match.ts compares it against the PR's
-- submitted line items. We persist both so the comparison is recoverable
-- later without re-running the AI.
-- ============================================================================

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS receipt_data JSONB;

COMMENT ON COLUMN purchase_requests.receipt_data IS
  'AI-parsed receipt ({extracted, match, receipt_filename}) captured at reconcile time; see src/lib/pr/receipt-extract.ts + receipt-match.ts.';
