-- ============================================================================
-- PR Audit — link to the built purchase_requests row it was imported from
-- ============================================================================
--
-- Lets an audited PR reference the Purchase Request it came from, so an imported
-- PR carries the builder's full data (contacts, addresses, justification, IGE)
-- by reference, and "Download to sign" can regenerate the real builder zip.
-- ON DELETE SET NULL so deleting a built PR doesn't drop its audit row.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_pr_audits_purchase_request_id;
--   ALTER TABLE pr_audits DROP COLUMN IF EXISTS purchase_request_id;
-- ============================================================================

ALTER TABLE pr_audits
  ADD COLUMN IF NOT EXISTS purchase_request_id UUID
  REFERENCES purchase_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_audits_purchase_request_id
  ON pr_audits(purchase_request_id);

NOTIFY pgrst, 'reload schema';
