-- ============================================================================
-- PR numbers restart every fiscal year  (FY27-GC-0001, FY27-GC-0002, …)
-- ============================================================================
--
-- Until now one never-resetting sequence (pr_sequence_seq) handed out the
-- NNNN, and the FY prefix was computed from date_prepared. Procurement now
-- numbers PRs per fiscal year, and it opened FY27 before Oct 1 — so the FY
-- can't be derived from the date alone either.
--
-- This migration:
--   1. Stores each PR's fiscal year on the row (pr_fiscal_year, full year:
--      2026, 2027). Existing rows are backfilled from date_prepared, so every
--      PR already issued keeps exactly the number it printed with.
--   2. Adds pr_fiscal_counters — one row per fiscal year holding the last
--      number used. A new PR goes into the LATEST open fiscal year (or the
--      fiscal year of its date, if that is later), so opening a year early
--      is just inserting its counter row.
--   3. Opens FY27 at 1: FY27-GC-0001 was made by hand outside the app, so the
--      first app-made FY27 PR is FY27-GC-0002.
--
-- pr_sequence_seq is left in place but no longer used.
-- ============================================================================

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS pr_fiscal_year INT;

UPDATE purchase_requests
SET pr_fiscal_year =
  EXTRACT(YEAR FROM date_prepared)::INT
  + CASE WHEN EXTRACT(MONTH FROM date_prepared) >= 10 THEN 1 ELSE 0 END
WHERE pr_fiscal_year IS NULL
  AND pr_sequence_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS pr_fiscal_counters (
  fiscal_year INT PRIMARY KEY,
  last_number INT NOT NULL CHECK (last_number >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the trigger (SECURITY DEFINER) writes here; clients read it.
ALTER TABLE pr_fiscal_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_fiscal_counters_read ON pr_fiscal_counters;
CREATE POLICY pr_fiscal_counters_read ON pr_fiscal_counters
  FOR SELECT TO authenticated USING (true);

-- Seed every fiscal year already in use at its current high-water mark.
INSERT INTO pr_fiscal_counters (fiscal_year, last_number)
SELECT pr_fiscal_year, MAX(pr_sequence_number)
FROM purchase_requests
WHERE pr_fiscal_year IS NOT NULL AND pr_sequence_number IS NOT NULL
GROUP BY pr_fiscal_year
ON CONFLICT (fiscal_year) DO UPDATE
  SET last_number = GREATEST(pr_fiscal_counters.last_number, EXCLUDED.last_number);

-- FY27 is open; 0001 is taken by the hand-made PR.
INSERT INTO pr_fiscal_counters (fiscal_year, last_number)
VALUES (2027, 1)
ON CONFLICT (fiscal_year) DO UPDATE
  SET last_number = GREATEST(pr_fiscal_counters.last_number, 1);

CREATE OR REPLACE FUNCTION assign_pr_sequence_number()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE := COALESCE(NEW.date_prepared, CURRENT_DATE);
  v_fy   INT;
BEGIN
  IF NEW.pr_sequence_number IS NULL THEN
    v_fy := GREATEST(
      EXTRACT(YEAR FROM v_date)::INT
        + CASE WHEN EXTRACT(MONTH FROM v_date) >= 10 THEN 1 ELSE 0 END,
      COALESCE((SELECT MAX(fiscal_year) FROM pr_fiscal_counters), 0)
    );
    -- The upsert row-locks the year's counter, so concurrent saves queue
    -- up instead of handing out the same number.
    INSERT INTO pr_fiscal_counters AS c (fiscal_year, last_number)
    VALUES (v_fy, 1)
    ON CONFLICT (fiscal_year) DO UPDATE
      SET last_number = c.last_number + 1, updated_at = now()
    RETURNING c.last_number INTO NEW.pr_sequence_number;
    NEW.pr_fiscal_year := v_fy;
  ELSIF NEW.pr_fiscal_year IS NULL THEN
    NEW.pr_fiscal_year :=
      EXTRACT(YEAR FROM v_date)::INT
      + CASE WHEN EXTRACT(MONTH FROM v_date) >= 10 THEN 1 ELSE 0 END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_fy_sequence
  ON purchase_requests(pr_fiscal_year, pr_sequence_number);

NOTIFY pgrst, 'reload schema';
