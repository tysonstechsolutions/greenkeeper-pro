-- ============================================================================
-- Fix the dead link on the crew schedule duty (2026-10-15).
--
-- The duty Publish next months crew schedule was seeded with link_href
-- /schedule. That page was removed on 2026-07-29 and the staff schedule now
-- lives at /pro-shop-schedule, so tapping the link went nowhere.
--
-- The app already sends /schedule to the right page on its own. This makes
-- the stored value match.
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again.
-- ============================================================================

UPDATE public.obligations
SET link_href = '/pro-shop-schedule',
    updated_at = now()
WHERE link_href = '/schedule';
