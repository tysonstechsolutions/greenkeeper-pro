-- One-shot data migration: every asset currently sitting at
-- status='unverified' gets reclassified as 'no_asset_tag' so the
-- superintendent has a single clean list of items that need a
-- replacement MWRMA sticker.
--
-- PREREQUISITE: the 20260417_add_no_asset_tag_status.sql migration
-- MUST have run first, otherwise this UPDATE will fail the CHECK
-- constraint. Run that migration file before this script.
--
-- Safe to re-run: the second pass just updates zero rows.

-- Preview the rows that will change (run first to sanity-check count)
SELECT
  site,
  asset_number,
  sub_number,
  description,
  status AS current_status
FROM fy26_assets
WHERE status = 'unverified'
ORDER BY site, asset_number;

-- Apply the change
UPDATE fy26_assets
SET
  status = 'no_asset_tag',
  verified_at = NOW()
WHERE status = 'unverified';

-- Confirm the result
SELECT
  status,
  COUNT(*) AS asset_count
FROM fy26_assets
GROUP BY status
ORDER BY status;
