-- Add barcode_value to fy26_assets so scanned barcodes link directly to assets.
-- First scan: "Link Barcode" on the asset detail page saves the barcode string.
-- Future scans: exact match on barcode_value → instant asset lookup.

ALTER TABLE fy26_assets
  ADD COLUMN IF NOT EXISTS barcode_value TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fy26_assets_barcode
  ON fy26_assets(barcode_value)
  WHERE barcode_value IS NOT NULL;
