-- ============================================================================
-- Consolidate mowing task templates
-- ============================================================================
-- The schedule board's template library had accumulated 19 different mowing
-- templates: the 3 original seeds, duplicate "Morning Mow" rows (hyphen vs.
-- em-dash), and a pile of height-of-cut (HOC) / seasonal / "Championship"
-- variants ("Mow Greens — Fall HOC 0.140-0.156 inch", etc.).
--
-- The super wants a single, simple, AREA-based set instead — no more multiple
-- mows at different heights:
--   Mow Greens / Mow Rough / Mow Fairways / Mow Teeboxes /
--   Mow Range Tees / Mow Range / Mow Around Clubhouse
--
-- Approach: DEACTIVATE every existing mowing template (is_active = false)
-- rather than delete it. The schedule board (useScheduleBoard) and the task
-- pickers (useTaskTemplates, /tasks/new) all filter on is_active = true, so
-- the retired rows vanish from every UI surface. Nothing is hard-deleted, so
-- historical tasks created from those templates keep their template_id link
-- and no foreign key can break.
--
-- Idempotent: re-running this (e.g. SQL Editor now + `supabase db push`
-- later) deactivates only the non-canonical rows and inserts each of the 7
-- only when an active one with that name does not already exist.
-- ============================================================================

BEGIN;

-- 1. Retire every current mowing template except the canonical 7. On a fresh
--    database this retires the 3 seeded "Morning Mow - …" rows; in production
--    it also retires all the HOC / seasonal / duplicate variants.
UPDATE task_templates
SET is_active = false
WHERE category = 'mowing'
  AND is_active = true
  AND name NOT IN (
    'Mow Greens',
    'Mow Rough',
    'Mow Fairways',
    'Mow Teeboxes',
    'Mow Range Tees',
    'Mow Range',
    'Mow Around Clubhouse'
  );

-- 2. Insert the clean 7. Each insert is guarded so re-running is a no-op.

-- Mow Greens
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Greens',
  'Daily mowing of all putting greens.',
  'mowing', 'high', 120,
  ARRAY['Greens Mower #1', 'Greens Mower #2', 'Greens Mower #3'],
  '[{"id":"1","text":"Inspect reel and bedknife","checked":false},{"id":"2","text":"Mow all greens, alternating direction from yesterday","checked":false},{"id":"3","text":"Clean-up pass around each collar","checked":false},{"id":"4","text":"Remove all clippings","checked":false},{"id":"5","text":"Report any disease, wilt, or damage","checked":false}]'::jsonb,
  false, false, true,
  'Mow all greens plus the practice and putting greens. Alternate the direction from the previous day and make a clean-up lap around every collar. Remove all clippings and report any disease, wilt, or mechanical damage spotted while mowing.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Greens' AND category = 'mowing' AND is_active = true
);

-- Mow Rough
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Rough',
  'Mow the rough on all holes.',
  'mowing', 'normal', 300,
  ARRAY['Rough Mower'],
  '[{"id":"1","text":"Check fuel and fluid levels","checked":false},{"id":"2","text":"Mow rough on all holes","checked":false},{"id":"3","text":"Trim around trees, bunkers, and hazards","checked":false},{"id":"4","text":"Blow clippings off cart paths","checked":false}]'::jsonb,
  false, false, true,
  'Mow the rough across all holes. Work cleanly around trees, bunkers, and hazards. Blow any clippings off cart paths and approaches when finished.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Rough' AND category = 'mowing' AND is_active = true
);

-- Mow Fairways
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Fairways',
  'Mow all fairways.',
  'mowing', 'normal', 180,
  ARRAY['Fairway Mower #1', 'Fairway Mower #2'],
  '[{"id":"1","text":"Confirm striping pattern for today","checked":false},{"id":"2","text":"Check fuel levels","checked":false},{"id":"3","text":"Mow all fairways","checked":false},{"id":"4","text":"Clean up perimeter edges","checked":false}]'::jsonb,
  false, false, true,
  'Mow all fairways following the striping pattern for the day. Overlap passes slightly so no strips are missed. Finish with a clean trim pass around the perimeter edges.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Fairways' AND category = 'mowing' AND is_active = true
);

-- Mow Teeboxes
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Teeboxes',
  'Mow all tee boxes.',
  'mowing', 'normal', 90,
  ARRAY['Tee Mower'],
  '[{"id":"1","text":"Mow all tee boxes","checked":false},{"id":"2","text":"Edge and realign tee markers","checked":false},{"id":"3","text":"Remove clippings","checked":false}]'::jsonb,
  false, false, true,
  'Mow all tee boxes, including the par-3 tees. Keep the lines straight and edges clean, and reset or realign any tee markers that were moved.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Teeboxes' AND category = 'mowing' AND is_active = true
);

-- Mow Range Tees
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Range Tees',
  'Mow the driving range tee line.',
  'mowing', 'normal', 45,
  ARRAY['Tee Mower'],
  '[{"id":"1","text":"Clear baskets and stray balls off the tee","checked":false},{"id":"2","text":"Mow the range tee line","checked":false},{"id":"3","text":"Reset hitting stations and dividers","checked":false}]'::jsonb,
  false, false, true,
  'Clear baskets and stray balls off the tee first. Mow the range tee line, then reset the hitting stations and dividers.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Range Tees' AND category = 'mowing' AND is_active = true
);

-- Mow Range
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Range',
  'Mow the driving range landing field.',
  'mowing', 'normal', 120,
  ARRAY['Rough Mower'],
  '[{"id":"1","text":"Confirm the range has been picked","checked":false},{"id":"2","text":"Mow the range landing field","checked":false},{"id":"3","text":"Watch for missed balls and debris","checked":false}]'::jsonb,
  false, false, true,
  'Make sure the range has been picked before mowing. Mow the landing field on a consistent pattern and keep an eye out for missed balls and debris.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Range' AND category = 'mowing' AND is_active = true
);

-- Mow Around Clubhouse
INSERT INTO task_templates
  (name, description, category, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Mow Around Clubhouse',
  'Mow and trim the clubhouse grounds.',
  'mowing', 'normal', 60,
  ARRAY['Rotary Mower', 'String Trimmer', 'Backpack Blower'],
  '[{"id":"1","text":"Mow clubhouse lawns and surrounds","checked":false},{"id":"2","text":"Trim edges, beds, and obstacles","checked":false},{"id":"3","text":"Blow clippings off walks and parking lot","checked":false}]'::jsonb,
  false, false, true,
  'Mow the lawns and surrounds around the clubhouse, entrance, and parking areas. Trim around beds, signs, and obstacles, then blow all clippings off the sidewalks and parking lot.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Mow Around Clubhouse' AND category = 'mowing' AND is_active = true
);

COMMIT;
