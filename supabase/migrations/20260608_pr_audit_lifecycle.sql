-- ============================================================================
-- PR Audit — fuller review lifecycle + AI fit-check columns
-- ============================================================================
--
-- The boss receives PRs from his team, sends them up to HIS boss for approval,
-- the order gets placed, it comes in, and the signed receipt goes back to
-- Building 1. So the simple pending/approved/sent_back states grow into a
-- full lifecycle:
--
--   pending → sent_up → ordered → received → receipt_signed   (+ sent_back)
--
-- Budget "spent" now counts ordered + received + receipt_signed (order placed
-- = money committed); pending + sent_up are shown as in-pipeline; sent_back is
-- excluded. The old 'approved' state maps to 'sent_up'.
--
-- Also adds columns for the AI cost-center fit-check results.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   ALTER TABLE pr_audits DROP CONSTRAINT IF EXISTS pr_audits_review_status_check;
--   ALTER TABLE pr_audits ADD CONSTRAINT pr_audits_review_status_check
--     CHECK (review_status IN ('pending','approved','sent_back'));
--   ALTER TABLE pr_audits DROP COLUMN IF EXISTS fit_findings;
--   ALTER TABLE pr_audits DROP COLUMN IF EXISTS fit_suggestion_count;
--   ALTER TABLE pr_audits DROP COLUMN IF EXISTS fit_checked_at;
-- ============================================================================

-- 1. Drop the old constraint BEFORE remapping (old one forbids the new values).
ALTER TABLE pr_audits DROP CONSTRAINT IF EXISTS pr_audits_review_status_check;

-- 2. Remap legacy 'approved' rows into the new lifecycle.
UPDATE pr_audits SET review_status = 'sent_up' WHERE review_status = 'approved';

-- 3. Add the new lifecycle constraint.
ALTER TABLE pr_audits ADD CONSTRAINT pr_audits_review_status_check
  CHECK (review_status IN ('pending','sent_up','ordered','received','receipt_signed','sent_back'));

-- 4. AI fit-check result columns.
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS fit_findings JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS fit_suggestion_count INT NOT NULL DEFAULT 0;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS fit_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN pr_audits.fit_findings IS 'AI cost-center fit-check suggestions (advisory): [{ itemIndex, currentCode, suggestedCode, reason }].';
