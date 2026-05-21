-- ============================================================================
-- Reset PR sequence to match actual data
-- ============================================================================
--
-- Over time, PRs that were created (consuming sequence numbers) and then
-- deleted leave the sequence counter ahead of the remaining records.
--
-- This migration resets the sequence so the next PR gets MAX(existing) + 1,
-- closing the gap caused by deleted rows.
--
-- Safe to run multiple times — idempotent.
-- ============================================================================

SELECT setval(
  'pr_sequence_seq',
  GREATEST(
    (SELECT COALESCE(MAX(pr_sequence_number), 0) FROM purchase_requests),
    1
  ),
  true   -- true means the value we pass IS the last used value;
         -- nextval() will return MAX + 1 on the next call
);

NOTIFY pgrst, 'reload schema';
