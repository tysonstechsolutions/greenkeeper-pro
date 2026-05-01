-- ============================================================================
-- Vendor 889 forms + PR quote attachments
-- ============================================================================
--
-- Purpose: every NAVMIDLANT NAF purchase request needs three files emailed
-- to the procurement office:
--   1. The PR (generated PDF)
--   2. The vendor quote (uploaded by user)
--   3. The vendor's Section 889 representations form (uploaded once per
--      vendor, reused on every PR for that vendor)
--
-- This migration:
--   • Extends `vendors` with the address fields the PR form needs and the
--     storage path + expiration date for the 889 form.
--   • Adds `vendor_id` + `quote_storage_path` to `purchase_requests` so the
--     download flow can produce all three files in one zip.
--   • Creates a private `vendor-files` bucket for the 889s and quotes.
--
-- Idempotent: every ALTER uses IF NOT EXISTS, every policy is DROP-then-
-- create, the bucket insert is ON CONFLICT DO NOTHING.
-- ============================================================================

-- ── 1. Vendors: add 889 + address fields ────────────────────────────────────

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address                      TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address_line2                TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city_state_zip               TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS poc                          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS sap_vendor_no                TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gsa_naf_other_no             TEXT;

-- 889 form storage. The path points into the `vendor-files` bucket.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS section_889_path             TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS section_889_filename         TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS section_889_expiration_date  DATE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS section_889_uploaded_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vendors_889_expiration
  ON vendors(section_889_expiration_date)
  WHERE section_889_expiration_date IS NOT NULL;

-- ── 2. Purchase requests: link to vendor + uploaded quote ───────────────────

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS quote_storage_path TEXT;

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS quote_filename TEXT;

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS quote_uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_vendor_id
  ON purchase_requests(vendor_id);

-- ── 3. Storage bucket: vendor-files (private) ───────────────────────────────
--
-- Holds two kinds of files, organized by prefix:
--   889-forms/{vendor_id}/{filename}   — vendor 889 representations
--   quotes/{purchase_request_id}/{filename} — uploaded quote attachments
--
-- Bucket is private; signed URLs are issued at download time.

INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-files', 'vendor-files', false)
ON CONFLICT (id) DO NOTHING;

-- Wipe any prior policies of the same name so this is re-runnable.
DROP POLICY IF EXISTS "vendor_files_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "vendor_files_insert_management"     ON storage.objects;
DROP POLICY IF EXISTS "vendor_files_update_management"     ON storage.objects;
DROP POLICY IF EXISTS "vendor_files_delete_management"     ON storage.objects;

-- All authenticated users can read (the procurement docs are reviewed
-- across roles).
CREATE POLICY "vendor_files_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'vendor-files');

-- Only management can upload/replace/delete files.
CREATE POLICY "vendor_files_insert_management"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-files' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

CREATE POLICY "vendor_files_update_management"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vendor-files' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

CREATE POLICY "vendor_files_delete_management"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vendor-files' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

NOTIFY pgrst, 'reload schema';
