-- SOW lifecycle status, parallel to the PR's own status. Tracks the
-- Statement of Work as it flows from "filled out but not sent" through
-- FRSC approval and signature.
--
-- Values mirror the PR status:
--   submitted   → "Not Sent"
--   sent        → "Sent for Approval"
--   approved    → "Approved"
--   received    → "Received and Signed"   (terminal)
--
-- NULL means no SOW lifecycle to track (i.e. attached_sow=false). Existing
-- rows with attached_sow=true are backfilled to 'submitted' so the
-- history page can show a baseline status for them immediately.

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS sow_status TEXT
  CHECK (sow_status IS NULL OR sow_status IN ('draft', 'submitted', 'sent', 'approved', 'received'));

UPDATE purchase_requests
   SET sow_status = 'submitted'
 WHERE attached_sow = true
   AND sow_status IS NULL;

NOTIFY pgrst, 'reload schema';
