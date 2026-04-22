-- ============================================================================
-- P0-B — Tighten the `photos` storage bucket policies.
-- ============================================================================
--
-- Supabase advisor flagged `public_bucket_allows_listing` for the photos
-- bucket. There are two parts to fully resolve that finding:
--
--   (a) Clean up overly permissive RLS policies on storage.objects — any
--       "public" or "authenticated anything goes" policies.        [THIS FILE]
--   (b) Flip `storage.buckets.public` from true → false so listing via
--       the unauth'd public endpoint stops.                        [DEFERRED]
--
-- Part (b) is deferred because every existing photo URL in the app is a
-- `getPublicUrl` result, stored directly in `fy26_assets.condition_photos`,
-- `asset_damage_records.photos[]`, `tasks.photos`, etc. Flipping the bucket
-- to private makes every one of those URLs 404. To actually flip it we need
-- to:
--   1. Switch storage.ts callers from `getPublicUrl(path)` to `createSignedUrl(path, ttl)`.
--   2. Decide whether to STORE the storage path (not URL) in the DB and
--      generate signed URLs at render time, OR regenerate signed URLs on
--      upload with a long TTL.
--   3. Backfill: regenerate every stored URL.
-- That's a P3 follow-up worth its own migration + code change. This file
-- gets us the RLS cleanup without breaking existing photo displays.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   -- Put the permissive policies back (not recommended):
--   CREATE POLICY "Public read access" ON storage.objects
--     FOR SELECT TO public USING (bucket_id = 'photos');
--   -- And drop the authenticated-scoped replacements:
--   DROP POLICY IF EXISTS "photos_select_authenticated" ON storage.objects;
--   DROP POLICY IF EXISTS "photos_insert_own_folder"    ON storage.objects;
--   DROP POLICY IF EXISTS "photos_update_own_folder"    ON storage.objects;
--   DROP POLICY IF EXISTS "photos_delete_own_folder"    ON storage.objects;
-- ============================================================================

-- 1. Drop every existing public-role SELECT policy that references the
--    photos bucket. Don't know the exact name(s), so match on the predicate.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND 'public' = ANY(roles)
      AND qual LIKE '%photos%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
    RAISE NOTICE 'Dropped public storage policy %', p.policyname;
  END LOOP;
END $$;

-- 2. Drop named policies from the original setup so we can recreate them
--    consistently. Idempotent — fine if some don't exist.
DROP POLICY IF EXISTS "Users can upload photos"     ON storage.objects;
DROP POLICY IF EXISTS "Users can read photos"       ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "photos_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "photos_insert_own_folder"    ON storage.objects;
DROP POLICY IF EXISTS "photos_update_own_folder"    ON storage.objects;
DROP POLICY IF EXISTS "photos_delete_own_folder"    ON storage.objects;

-- 3. Install the replacements. SELECT stays broad-but-authenticated so
--    any staff member can see any asset photo in-app. Writes are
--    restricted to the uploader's own UID folder.

CREATE POLICY "photos_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'photos');

CREATE POLICY "photos_insert_own_folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "photos_update_own_folder"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "photos_delete_own_folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Note: bucket `public` flag is intentionally left true here. The advisor
-- will still flag public_bucket_allows_listing until we complete the
-- signed-URL migration (P3). See file header.
