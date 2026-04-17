-- Adds a sixth status value to fy26_assets: 'needs_disposed'.
-- Use: the physical asset is there but end-of-life / broken beyond
-- repair / no longer needed. Flagged for upcoming disposal paperwork
-- (NAVCOMPT 2212), but hasn't actually been disposed yet.
--
-- Postgres doesn't support ALTER CONSTRAINT on CHECK constraints —
-- standard dance is DROP + ADD. Only widens the allowed set so no
-- existing rows can violate the new constraint.

ALTER TABLE fy26_assets
  DROP CONSTRAINT IF EXISTS fy26_assets_status_check;

ALTER TABLE fy26_assets
  ADD CONSTRAINT fy26_assets_status_check
  CHECK (status IN (
    'unverified',
    'verified_present',
    'mia',
    'disposed',
    'no_asset_tag',
    'needs_disposed'
  ));
