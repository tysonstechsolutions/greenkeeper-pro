-- ===========================================================
-- Diagnose why a scanned barcode isn't matching a linked asset.
--
-- Run in Supabase SQL Editor. It lists every asset that has a
-- barcode_value linked, with BOTH the raw text and a hex dump
-- of the bytes, so you can spot hidden chars (NUL, CR, LF, zero-
-- width spaces, weird Unicode normalization, etc.) that make a
-- visual match fail the actual DB comparison.
-- ===========================================================

SELECT
  id,
  asset_number,
  description,
  barcode_value,
  length(barcode_value)                            AS char_count,
  octet_length(barcode_value)                      AS byte_count,
  -- First 64 bytes as hex so you can see control chars
  encode(convert_to(barcode_value, 'UTF8'), 'hex') AS hex_bytes
FROM fy26_assets
WHERE barcode_value IS NOT NULL
ORDER BY asset_number;

-- ---- OPTIONAL: search for assets whose barcode CONTAINS a string ----
-- Uncomment + replace YOUR_SCAN_VALUE with the value the scan page
-- logged to the browser console.
--
-- SELECT id, asset_number, description, barcode_value
-- FROM fy26_assets
-- WHERE barcode_value ILIKE '%YOUR_SCAN_VALUE%'
--    OR 'YOUR_SCAN_VALUE' ILIKE '%' || barcode_value || '%';
