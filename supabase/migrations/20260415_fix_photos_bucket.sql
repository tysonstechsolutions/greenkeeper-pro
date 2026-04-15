-- ============================================================
-- Fix: allow everyone on the team to read equipment photos,
--      regardless of who uploaded them.
--
-- Symptom: Eric uploaded equipment photos. When anyone else
-- (Tyson, Jim, etc.) runs the equipment report, the images
-- don't render. The default Supabase policy on storage.objects
-- restricts SELECT to the owner, so only Eric could see them.
--
-- Fix:
--   1. Mark the `photos` bucket public so the CDN URL works
--      even for unauthenticated clients (PDF generators, etc.).
--   2. Add an explicit "anyone can read photos" policy on
--      storage.objects so the authenticated download path used
--      by the server-side report also succeeds.
--
-- Safe to re-run. Uses ON CONFLICT / IF NOT EXISTS patterns.
-- ============================================================

-- 1. Ensure the bucket exists and is public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO UPDATE
  SET public = true;

-- 2. Drop any previous policy with the same name so we can re-create it.
DROP POLICY IF EXISTS "Anyone can view equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete equipment photos" ON storage.objects;

-- 3. Public read — anyone (including anon / server-side) can SELECT.
CREATE POLICY "Anyone can view equipment photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

-- 4. Authenticated write — any signed-in staffer can upload.
CREATE POLICY "Authenticated users can upload equipment photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

-- 5. Authenticated update/delete — any signed-in staffer can manage
--    photos. (The app already restricts the UI to managers; this
--    just makes sure RLS doesn't block the legitimate calls.)
CREATE POLICY "Authenticated users can update equipment photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete equipment photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

-- Verify
SELECT id, name, public FROM storage.buckets WHERE id = 'photos';
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%equipment photos%'
ORDER BY cmd;
