-- ============================================================================
-- Purchase Request sequence numbering
-- ============================================================================
--
-- Procurement's filing system keys off a monotonic per-PR number that the
-- app prints into the "Internal Order" field as `FY{YY}-FM-{NNNN}`.
--
-- This migration:
--   1. Adds `pr_sequence_number INT` to purchase_requests
--   2. Creates a Postgres SEQUENCE that hands out the next value on every
--      INSERT via a BEFORE trigger
--   3. Backfills any existing rows so they each get a unique number
--      (existing PRs were typed by hand; we just give them sequential IDs)
--
-- Idempotent: every CREATE / INSERT-style statement uses IF NOT EXISTS or
-- ON CONFLICT.
-- ============================================================================

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS pr_sequence_number INT;

CREATE SEQUENCE IF NOT EXISTS pr_sequence_seq
  START 1
  INCREMENT 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Backfill: any row that doesn't yet have a sequence number gets one,
-- ordered by created_at so the historic timeline is preserved.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM purchase_requests
  WHERE pr_sequence_number IS NULL
),
assigned AS (
  SELECT id, nextval('pr_sequence_seq') AS seq FROM ordered
)
UPDATE purchase_requests pr
SET pr_sequence_number = assigned.seq
FROM assigned
WHERE pr.id = assigned.id;

-- Make sure the sequence is at-or-above the current max so future inserts
-- don't collide with backfilled rows.
SELECT setval(
  'pr_sequence_seq',
  GREATEST(
    (SELECT COALESCE(MAX(pr_sequence_number), 0) FROM purchase_requests),
    1
  ),
  true
);

-- Trigger function that auto-fills pr_sequence_number when the caller
-- omits it. The form layer always omits it, so every new PR gets the
-- next sequence value atomically.
CREATE OR REPLACE FUNCTION assign_pr_sequence_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pr_sequence_number IS NULL THEN
    NEW.pr_sequence_number := nextval('pr_sequence_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS purchase_requests_assign_seq ON purchase_requests;
CREATE TRIGGER purchase_requests_assign_seq
  BEFORE INSERT ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION assign_pr_sequence_number();

-- Index for date-range filters on the sequence (e.g. "show me FY26 PRs").
CREATE INDEX IF NOT EXISTS idx_purchase_requests_sequence
  ON purchase_requests(pr_sequence_number);

NOTIFY pgrst, 'reload schema';
