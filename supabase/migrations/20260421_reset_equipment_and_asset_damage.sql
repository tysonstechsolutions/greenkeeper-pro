-- Reset equipment + asset verification state so every asset flows through
-- the new scan wizard and every equipment record is re-created fresh.
--
-- Run order:
--   1. Add the damage_too_extensive flag (new wizard step 5 option).
--   2. Wipe the equipment table (CASCADE takes care of equipment_logs,
--      equipment_parts, equipment_service_records, asset_disposals, and
--      equipment_inspections; fy26_assets.equipment_id gets SET NULL).
--   3. Wipe fy26_asset_damage_records outright (FK is asset_id, CASCADE
--      from fy26_assets but we're keeping the assets — explicit DELETE).
--   4. Reset per-asset verification state so the scan wizard drives every
--      asset through again from scratch.
--
-- Orphaned photo blobs in Supabase Storage are left behind (cheap, easy to
-- GC later with `storage.objects` cleanup once the scan pass is complete).

-- 1. Flag for assets too damaged to document photo-by-photo. Surfaces as a
--    red "damage unassessed" badge in the asset list.
ALTER TABLE fy26_assets
  ADD COLUMN IF NOT EXISTS damage_too_extensive BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Wipe equipment and every dependent table via cascade.
DELETE FROM equipment;

-- 3. Wipe damage records explicitly (photo URLs live here).
DELETE FROM asset_damage_records;

-- 4. Reset verification state on every asset. After this, status is
--    'unverified' across the board and the scan wizard re-populates
--    barcode_value / condition_photos / status / equipment_id on each pass.
UPDATE fy26_assets
SET
  status = 'unverified',
  barcode_value = NULL,
  condition_photos = '{}'::jsonb,
  photo_url = NULL,
  verified_at = NULL,
  verified_by = NULL,
  notes = NULL,
  equipment_id = NULL,
  damage_too_extensive = FALSE;
