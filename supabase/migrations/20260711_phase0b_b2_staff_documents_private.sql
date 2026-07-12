-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 0B / B2 — Privatize the staff-documents storage bucket (2026-07-11)
--
-- WHY: Phase 0A (docs/security/storage-posture-report-2026-07-11.md §2) found
-- staff-documents is a PUBLIC bucket with a `to public` SELECT policy, and the
-- app stored permanent unsigned public URLs for each file. The moment an HR
-- document (ID, food-handler card, etc.) is uploaded it would be world-readable.
-- The bucket currently holds ZERO objects and the staff_documents table holds
-- ZERO rows (verified immediately before applying), so this is a pure config +
-- code change with NO data migration.
--
-- WHAT THIS DOES:
--   1. Flips storage.buckets.staff-documents to private.
--   2. Replaces the `to public` SELECT policy with a `to authenticated` one.
--   INSERT and DELETE policies are already authenticated-only — left untouched.
--
-- The app reads staff documents via short-lived signed URLs
-- (directCreateSignedUrl, src/lib/supabase/rest.ts) and stores only the storage
-- PATH, never a public URL (src/lib/staff/use-employee.ts).
--
-- Scope guard: this migration touches ONLY the staff-documents bucket. The
-- `documents` and `photos` buckets are deliberately NOT changed (deferred per
-- MD1 and accepted-kiosk-behavior respectively).
--
-- Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets SET public = false WHERE id = 'staff-documents';

DROP POLICY IF EXISTS staff_docs_select ON storage.objects;
CREATE POLICY staff_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-documents');

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (do not run unless deliberately restoring the pre-B2 public state)
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE storage.buckets SET public = true WHERE id = 'staff-documents';
-- DROP POLICY IF EXISTS staff_docs_select ON storage.objects;
-- CREATE POLICY staff_docs_select ON storage.objects
--   FOR SELECT TO public
--   USING (bucket_id = 'staff-documents');
-- -- (App code rollback: revert the B2 commit so uploads store publicStorageUrl again.)
-- ═══════════════════════════════════════════════════════════════════════════
