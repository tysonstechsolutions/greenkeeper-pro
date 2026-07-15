-- ============================================================================
-- PR completion — mark a purchase DONE once its receipt is in and settled, so
-- the active list only shows what still needs action.
--
-- Deliberately a separate timestamp rather than a 6th `status` value: the
-- spend rollup view (20260702_money_rollups.sql) sums purchase_requests
-- `WHERE status IN ('sent','approved','received')`. A new status would
-- silently drop every completed purchase out of the budget / per-area P&L.
-- Completion is an orthogonal axis; the PR stays `received` and keeps
-- counting as spend.
--
-- Set automatically when a saved receipt total lands at or under the
-- submitted total (to the penny); overages stay open until cleared by hand.
-- See src/lib/pr-reconciliation.ts (prAutoCompletes / prIsComplete).
-- ============================================================================

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN purchase_requests.completed_at IS
  'When the purchase was settled (receipt at/under the submitted total, or cleared by hand). NULL = still open. Independent of status so spend rollups are unaffected.';

-- Partial index: the list filters on "still open", which is the common read.
CREATE INDEX IF NOT EXISTS idx_purchase_requests_open
  ON purchase_requests (status) WHERE completed_at IS NULL;

-- ── Backfill ───────────────────────────────────────────────────────────────
-- PRs reconciled BEFORE this column existed are already settled, but would sit
-- in the active list forever. Apply the same rule retroactively: a receipt at
-- or under the submitted total is complete. Stamped with reconciled_at (when
-- it was actually settled), not now() — completing it doesn't make it "done
-- today".
--
-- Conservative on purpose:
--   • only rows with a real submitted total (ige_amount > 0); anything else is
--     left for a human, since prSubmittedTotal() falls back to summing line
--     items and that logic doesn't belong in a migration.
--   • overages are left open, exactly as a fresh receipt would be.
UPDATE purchase_requests
SET completed_at = reconciled_at
WHERE completed_at IS NULL
  AND reconciled_at IS NOT NULL
  AND actual_amount IS NOT NULL
  AND ige_amount IS NOT NULL
  AND ige_amount > 0
  AND round(actual_amount::numeric, 2) <= round(ige_amount::numeric, 2);

notify pgrst, 'reload schema';
