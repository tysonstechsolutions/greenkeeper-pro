-- Task 1.2: Bilingual task & message rendering
-- Adds a per-user language preference and a Spanish translation slot on
-- tasks, messages, and observation tables. Also creates a translation_cache
-- table so Claude Haiku is only called once per unique source string.

-- ── Profiles: preferred display language ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language_preference TEXT
  CHECK (language_preference IN ('en', 'es'))
  DEFAULT 'en';

-- ── Spanish translation columns on content tables ─────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS body_es TEXT;

-- NOTE: the `messages` table in this codebase uses `content` as the primary
-- text field. We add `body_es` per the plan spec, but hooks/display code
-- should read/write `content_es` or `body_es` consistently. See migration
-- follow-up in the README if a rename is needed.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_es TEXT;

ALTER TABLE course_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

ALTER TABLE hole_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

ALTER TABLE green_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

-- ── Translation cache ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translation_cache (
  key_hash     TEXT PRIMARY KEY,           -- sha256(source||source_lang||target_lang)
  source_lang  TEXT NOT NULL,
  target_lang  TEXT NOT NULL,
  source_text  TEXT NOT NULL,
  target_text  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_created
  ON translation_cache(created_at);

-- ── RLS on translation_cache ──────────────────────────────────────────────
-- All authenticated users need SELECT (for cache hits) and INSERT (for
-- cache misses). No UPDATE, no DELETE — cache entries are immutable. The
-- cache contains no private data (it's just text translations) but we still
-- gate it behind an auth check to prevent unauthenticated scraping.

ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'translation_cache'
      AND policyname = 'translation_cache_select_authenticated'
  ) THEN
    CREATE POLICY translation_cache_select_authenticated
      ON translation_cache
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'translation_cache'
      AND policyname = 'translation_cache_insert_authenticated'
  ) THEN
    CREATE POLICY translation_cache_insert_authenticated
      ON translation_cache
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;
