-- ============================================================================
-- PR Audit — split "Approved & Ordered" into Approved + Ordered, + stage dates
-- ============================================================================
--
-- The reviewer needs the real date of each step: a PR can be sent up + approved
-- in May but not actually purchased until June. So the lifecycle grows an
-- "approved" stage between sent_up and ordered, and every stage gets its own
-- editable date. Budget "spent" still starts at ordered (the card is charged at
-- purchase) — approved-but-not-ordered is NOT spent.
--
--   pending(uploaded) → sent_up → approved → ordered → received → receipt_signed
--                                                                    (+ sent_back)
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   ALTER TABLE pr_audits DROP CONSTRAINT IF EXISTS pr_audits_review_status_check;
--   ALTER TABLE pr_audits ADD CONSTRAINT pr_audits_review_status_check
--     CHECK (review_status IN ('pending','sent_up','ordered','received','receipt_signed','sent_back'));
--   ALTER TABLE pr_audits
--     DROP COLUMN IF EXISTS sent_up_date, DROP COLUMN IF EXISTS approved_date,
--     DROP COLUMN IF EXISTS ordered_date, DROP COLUMN IF EXISTS received_date,
--     DROP COLUMN IF EXISTS receipt_signed_date, DROP COLUMN IF EXISTS sent_back_date;
-- ============================================================================

-- 1. Allow the new 'approved' stage.
ALTER TABLE pr_audits DROP CONSTRAINT IF EXISTS pr_audits_review_status_check;
ALTER TABLE pr_audits ADD CONSTRAINT pr_audits_review_status_check
  CHECK (review_status IN
    ('pending','sent_up','approved','ordered','received','receipt_signed','sent_back'));

-- 2. Per-stage dates (uploaded = created_at; pr_date = the date on the PR).
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS sent_up_date        DATE;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS approved_date       DATE;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS ordered_date        DATE;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS received_date       DATE;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS receipt_signed_date DATE;
ALTER TABLE pr_audits ADD COLUMN IF NOT EXISTS sent_back_date      DATE;

NOTIFY pgrst, 'reload schema';
