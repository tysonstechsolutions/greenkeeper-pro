-- Add intermediate lifecycle statuses to purchase_requests so the
-- superintendent can track a PR from "finished but not sent" all the
-- way to "received and signed" without leaving the history page.
--
-- Lifecycle (in order):
--   draft       → still being filled out
--   submitted   → finished, displayed as "Not Sent"
--   sent        → "Sent up for Approval"
--   approved    → "Approved"
--   received    → "Received and Signed" (terminal)

ALTER TABLE purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('draft', 'submitted', 'sent', 'approved', 'received'));

NOTIFY pgrst, 'reload schema';
