-- Allow "received" as a valid PR status so the superintendent can mark
-- a submitted PR as purchased and received directly from the history list.
--
-- The CHECK constraint was generated inline in 20260502_purchase_requests.sql;
-- PostgreSQL names it "purchase_requests_status_check" automatically.

ALTER TABLE purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('draft', 'submitted', 'received'));

NOTIFY pgrst, 'reload schema';
