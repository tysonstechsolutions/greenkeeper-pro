-- ============================================================================
-- PR Audit — quote + 889 bundle attachments, cross-check results, resubmission
-- ============================================================================
--
-- A purchase request is sent up to procurement as THREE files: the PR itself,
-- the vendor quote, and the vendor's Section 889 representation. This lets the
-- reviewer upload all three together (a zip, or the loose files), have the AI
-- cross-check the quote against the PR and validate the 889, and keep the files
-- attached to the audited PR.
--
-- Also adds `revision` so a PR that's sent back, corrected, and re-uploaded is
-- recognized as the SAME PR (matched on internal_order / file name) and updated
-- in place — never counted twice in the budget.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   ALTER TABLE pr_audits
--     DROP COLUMN IF EXISTS quote_path,
--     DROP COLUMN IF EXISTS quote_filename,
--     DROP COLUMN IF EXISTS quote_total,
--     DROP COLUMN IF EXISTS section_889_path,
--     DROP COLUMN IF EXISTS section_889_filename,
--     DROP COLUMN IF EXISTS section_889_expiration_date,
--     DROP COLUMN IF EXISTS section_889_compliant,
--     DROP COLUMN IF EXISTS bundle_findings,
--     DROP COLUMN IF EXISTS bundle_checked_at,
--     DROP COLUMN IF EXISTS revision;
-- ============================================================================

-- Vendor quote attachment (stored in vendor-files under pr-audit/{id}/).
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS quote_path     TEXT;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS quote_filename TEXT;
-- Sum of the quote's line items, for the quote-vs-PR cross-check + display.
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS quote_total    NUMERIC(14,2);

-- Vendor Section 889 attachment + the facts extract-889 read off it.
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS section_889_path            TEXT;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS section_889_filename        TEXT;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS section_889_expiration_date DATE;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS section_889_compliant       BOOLEAN;

-- Cross-check output (quote-vs-PR + 889 validity). Kept SEPARATE from
-- audit_findings so re-running the deterministic audit never wipes it.
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS bundle_findings   JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS bundle_checked_at TIMESTAMPTZ;

-- Re-submission counter: 1 on first upload, bumped each time a corrected
-- version of the same PR is re-uploaded and the record is updated in place.
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN pr_audits.revision IS
  'Bumped when a sent-back PR is corrected and re-uploaded; the row is updated in place so the budget never double-counts it.';
