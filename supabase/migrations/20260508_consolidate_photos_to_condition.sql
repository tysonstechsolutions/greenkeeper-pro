-- Consolidate "operational" photos onto the linked asset's condition_photos.front.
--
-- Background: assets and equipment had two parallel photo concepts —
--   - fy26_assets.condition_photos (JSONB, fixed angles: front/back/left/right)
--   - equipment.photo_url + equipment.photos[] ("operational" photos)
-- The scan wizard only captures condition photos. The operational fields were
-- rarely (if ever) populated by the current workflow. We're collapsing onto
-- condition_photos as the single source of truth on the asset surface.
--
-- Only writes when the asset doesn't already have a 'front' condition photo,
-- so this never overwrites real condition data. We do NOT null the equipment
-- columns — the standalone /equipment views still read them, and leaving the
-- data in place avoids surprising anything outside the asset surface.

UPDATE fy26_assets a
SET condition_photos = jsonb_set(
  COALESCE(a.condition_photos, '{}'::jsonb),
  '{front}',
  to_jsonb(
    COALESCE(
      e.photos[1],         -- TEXT[] is 1-indexed in PostgreSQL
      e.photo_url
    )
  )
)
FROM equipment e
WHERE a.equipment_id = e.id
  AND NOT (a.condition_photos ? 'front')
  AND (
    (e.photos IS NOT NULL AND array_length(e.photos, 1) > 0)
    OR e.photo_url IS NOT NULL
  );
