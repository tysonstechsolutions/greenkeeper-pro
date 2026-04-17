-- Adds a fifth status value to fy26_assets: 'no_asset_tag'.
-- Use: the physical asset exists and is present, but the MWRMA
-- property tag has been peeled off / worn off / never applied, so
-- there's no way to scan it. Supervisor needs to order a new tag.
--
-- Postgres doesn't support ALTER CONSTRAINT on CHECK constraints —
-- the standard dance is DROP + ADD. Safe: we're only widening the
-- allowed set, no existing rows can violate the new constraint.

ALTER TABLE fy26_assets
  DROP CONSTRAINT IF EXISTS fy26_assets_status_check;

ALTER TABLE fy26_assets
  ADD CONSTRAINT fy26_assets_status_check
  CHECK (status IN (
    'unverified',
    'verified_present',
    'mia',
    'disposed',
    'no_asset_tag'
  ));
