-- ============================================================================
-- Schedule recurrence — COMBINED migration (run this ONE file, top to bottom)
-- ============================================================================
-- Bundles, in dependency order: schema foundation + new duties, the dedup of
-- all duplicate templates, the 18 superintendent tasks, and the nightly cron.
-- Idempotent and safe to re-run. Category constraints are added NOT VALID so
-- they can never trip on a pre-existing row.
-- ============================================================================

-- ============================================================================
-- Schedule recurrence — Phase 1 foundation
-- ============================================================================
-- Adds the schema the seasonal-recurrence feature builds on:
--   1. task_templates.frequency  — explicit tier (replaces name-guessing)
--   2. 'grounds' + 'tees' categories on task_templates and tasks
--   3. task_series                — remembers a repeating job
--   4. tasks.series_id            — links an occurrence to its series
--   5. four new duty templates    — trash, sticks, pitch marks, tee-box repair
--
-- See docs/plans/2026-06-09-schedule-recurrence-and-task-directions-design.md
--
-- Safe to re-run: guarded with IF [NOT] EXISTS and WHERE NOT EXISTS.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Explicit frequency on templates.
--    Nullable on purpose: existing rows stay NULL and the app falls back to the
--    name-heuristic, so nothing changes visually until a value is chosen.
-- ----------------------------------------------------------------------------
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS frequency TEXT
  CHECK (frequency IN ('daily', 'weekly', 'monthly', 'seasonal', 'projects'));

-- ----------------------------------------------------------------------------
-- 2. Add 'grounds' and 'tees' categories.
--    Drop whatever CHECK currently guards the category column (name may vary by
--    environment) and recreate it with the full set aligned to the TypeScript
--    TaskCategory union plus the two new values.
-- ----------------------------------------------------------------------------

-- task_templates.category
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.task_templates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.task_templates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE task_templates ADD CONSTRAINT task_templates_category_check
  CHECK (category IN (
    'mowing','irrigation','chemical','mechanical','landscaping','construction',
    'bunker','greens','admin','safety','other','pro_shop','events',
    'customer_service','grounds','tees'
  )) NOT VALID;

-- tasks.category
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE tasks ADD CONSTRAINT tasks_category_check
  CHECK (category IN (
    'mowing','irrigation','chemical','mechanical','landscaping','construction',
    'bunker','greens','admin','safety','other','pro_shop','events',
    'customer_service','grounds','tees'
  )) NOT VALID;

-- ----------------------------------------------------------------------------
-- 3. task_series — one row per repeating job. The nightly top-up reads these
--    to materialize future occurrences; deleting "this + all future" flips
--    active = false so they stop coming back.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_series (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES task_templates(id) ON DELETE SET NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('daily', 'weekly', 'monthly')),
  weekday       INT  NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0=Sun..6=Sat
  week_of_month INT  CHECK (week_of_month BETWEEN 1 AND 5),      -- monthly only
  task_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,              -- snapshot for regen
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_series_active ON task_series(active);
CREATE INDEX IF NOT EXISTS idx_task_series_assigned ON task_series(assigned_to);

ALTER TABLE task_series ENABLE ROW LEVEL SECURITY;

-- Open read (mirrors task_templates' permissive select); manager/foreman writes.
DROP POLICY IF EXISTS "task_series_select" ON task_series;
CREATE POLICY "task_series_select" ON task_series
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "task_series_insert" ON task_series;
CREATE POLICY "task_series_insert" ON task_series
  FOR INSERT WITH CHECK (is_manager(auth.uid()) OR is_foreman(auth.uid()));

DROP POLICY IF EXISTS "task_series_update" ON task_series;
CREATE POLICY "task_series_update" ON task_series
  FOR UPDATE USING (is_manager(auth.uid()) OR is_foreman(auth.uid()));

DROP POLICY IF EXISTS "task_series_delete" ON task_series;
CREATE POLICY "task_series_delete" ON task_series
  FOR DELETE USING (is_manager(auth.uid()) OR is_foreman(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON task_series TO authenticated;
GRANT SELECT ON task_series TO anon;
GRANT ALL ON task_series TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Link occurrences to their series. Partial unique index keeps generation
--    idempotent (one occurrence per series per day).
-- ----------------------------------------------------------------------------
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES task_series(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_series_date
  ON tasks (series_id, due_date) WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks (series_id);

-- ----------------------------------------------------------------------------
-- 5. New duty templates. Guarded so re-running inserts nothing.
-- ----------------------------------------------------------------------------

-- Pick Up Trash
INSERT INTO task_templates
  (name, description, category, frequency, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Pick Up Trash', 'Empty bins and clear litter across the course.',
  'grounds', 'daily', 'normal', 45,
  ARRAY['Utility Cart', 'Trash Bags', 'Litter Picker'],
  '[{"id":"1","text":"Empty every trash and recycling bin tee-to-green","checked":false},{"id":"2","text":"Pick up loose litter on holes and paths","checked":false},{"id":"3","text":"Replace bin liners","checked":false},{"id":"4","text":"Haul bags to the dumpster","checked":false}]'::jsonb,
  false, false, false,
  'Run the full course emptying every bin and clearing loose litter. Replace liners and haul all bags to the dumpster.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates WHERE name = 'Pick Up Trash' AND is_active = true
);

-- Pick Up Sticks / Debris
INSERT INTO task_templates
  (name, description, category, frequency, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Pick Up Sticks / Debris', 'Clear fallen sticks and limbs from play areas.',
  'grounds', 'daily', 'normal', 60,
  ARRAY['Utility Cart'],
  '[{"id":"1","text":"Walk holes and clear fallen sticks and limbs","checked":false},{"id":"2","text":"Check fairways, rough, and around trees","checked":false},{"id":"3","text":"Haul debris off to the dump pile","checked":false}]'::jsonb,
  false, false, false,
  'Clear fallen sticks and limbs from fairways, rough, and around trees — especially after wind. Haul everything to the debris pile.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates WHERE name = 'Pick Up Sticks / Debris' AND is_active = true
);

-- Fix Pitch Marks on Greens
INSERT INTO task_templates
  (name, description, category, frequency, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Fix Pitch Marks on Greens', 'Repair ball marks on all greens.',
  'greens', 'daily', 'high', 60,
  ARRAY['Ball Mark Repair Tool'],
  '[{"id":"1","text":"Walk every green and repair ball marks","checked":false},{"id":"2","text":"Push edges in toward the center, then tap level","checked":false},{"id":"3","text":"Note greens with heavy marking","checked":false}]'::jsonb,
  false, false, false,
  'Walk every green and repair ball marks: work the edges in toward the center (do not lift), then tap level with the putter or roller. Flag any green taking heavy traffic damage.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates WHERE name = 'Fix Pitch Marks on Greens' AND is_active = true
);

-- Repair Tee Boxes
INSERT INTO task_templates
  (name, description, category, frequency, default_priority, estimated_minutes,
   equipment_needed, checklist, requires_photo_before, requires_photo_after,
   weather_dependent, instructions)
SELECT
  'Repair Tee Boxes', 'Fill divots and level the tee boxes.',
  'tees', 'weekly', 'normal', 90,
  ARRAY['Divot Mix', 'Bucket', 'Rake'],
  '[{"id":"1","text":"Fill divots with divot mix","checked":false},{"id":"2","text":"Level and firm the fill","checked":false},{"id":"3","text":"Seed where needed","checked":false},{"id":"4","text":"Straighten tee markers","checked":false}]'::jsonb,
  false, false, false,
  'Fill divots on all tee boxes with mix, level and firm, and seed bare spots. Straighten tee markers before leaving.'
WHERE NOT EXISTS (
  SELECT 1 FROM task_templates WHERE name = 'Repair Tee Boxes' AND is_active = true
);

COMMIT;


-- ============================================================================
-- Consolidate ALL duplicate task templates (beyond mowing)
-- ============================================================================
-- The template library accumulated duplicates and seasonal/variant splits in
-- every category — 4 aerification variants, 3 pin-placement variants, 3
-- topdressing variants, duplicate "Spring Opening" rows, etc. This collapses
-- each cluster to ONE canonical template (keeping the earliest row, renaming
-- it clean, tagging its tier) and deactivates the rest.
--
-- REQUIRES 20260609b first (adds the `frequency` column and the 'grounds'
-- category this migration writes to). Apply order: …b then …c.
--
-- Fuzzy + idempotent: each cluster is matched by a category-scoped ILIKE
-- pattern. Re-running collapses nothing new and only no-op renames the
-- survivors. Deactivation (not deletion) keeps history and FKs intact.
--
-- See docs/plans/2026-06-09-schedule-recurrence-and-task-directions-design.md
-- ============================================================================

BEGIN;

-- Helper: within p_match_cat, keep the earliest active template matching
-- p_pattern, rename it to p_canonical, move it to p_new_cat, set p_freq, and
-- deactivate every other match. Session-local (pg_temp) — gone at session end.
CREATE OR REPLACE FUNCTION pg_temp.consolidate_tpl(
  p_match_cat text,
  p_pattern   text,
  p_canonical text,
  p_new_cat   text,
  p_freq      text
) RETURNS void AS $$
DECLARE
  survivor uuid;
BEGIN
  SELECT id INTO survivor
    FROM task_templates
   WHERE is_active = true
     AND category = p_match_cat
     AND name ILIKE p_pattern
   ORDER BY created_at NULLS FIRST, id
   LIMIT 1;

  IF survivor IS NULL THEN
    RETURN;  -- nothing matches (e.g. already consolidated)
  END IF;

  UPDATE task_templates
     SET is_active = false
   WHERE is_active = true
     AND category = p_match_cat
     AND name ILIKE p_pattern
     AND id <> survivor;

  UPDATE task_templates
     SET name = p_canonical,
         category = p_new_cat,
         frequency = p_freq
   WHERE id = survivor;
END;
$$ LANGUAGE plpgsql;

-- ── GREENS ───────────────────────────────────────────────────────────────
SELECT pg_temp.consolidate_tpl('greens', '%pin%',      'Change Pin Placements',   'greens', 'daily');
SELECT pg_temp.consolidate_tpl('greens', '%aer%',      'Core Aeration',           'greens', 'seasonal');
SELECT pg_temp.consolidate_tpl('greens', '%topdress%', 'Topdress Greens',         'greens', 'monthly');
SELECT pg_temp.consolidate_tpl('greens', '%scout%',    'Disease & Pest Scouting', 'greens', 'weekly');
SELECT pg_temp.consolidate_tpl('greens', '%roll%',     'Roll Greens',             'greens', 'daily');

-- ── ADMIN ────────────────────────────────────────────────────────────────
SELECT pg_temp.consolidate_tpl('admin', '%morning%', 'Morning Course Setup',      'admin', 'daily');
SELECT pg_temp.consolidate_tpl('admin', '%spring%',  'Spring Opening Procedures', 'admin', 'seasonal');
SELECT pg_temp.consolidate_tpl('admin', '%winter%',  'Winterization Procedures',  'admin', 'seasonal');

-- ── BUNKER (all three are the same daily rake job) ───────────────────────
SELECT pg_temp.consolidate_tpl('bunker', '%bunker%', 'Rake Bunkers', 'bunker', 'daily');

-- ── MECHANICAL ───────────────────────────────────────────────────────────
SELECT pg_temp.consolidate_tpl('mechanical', '%pre-operation%',    'Equipment Pre-Operation Check', 'mechanical', 'daily');
SELECT pg_temp.consolidate_tpl('mechanical', '%seasonal service%', 'Mower Seasonal Service',        'mechanical', 'seasonal');
SELECT pg_temp.consolidate_tpl('mechanical', '%winter%',           'Equipment Winterization',       'mechanical', 'seasonal');

-- ── LANDSCAPING (grounds cleanup moves to the new Grounds category) ───────
SELECT pg_temp.consolidate_tpl('landscaping', '%overseed%', 'Overseed Fairways & Tees',     'landscaping', 'seasonal');
SELECT pg_temp.consolidate_tpl('landscaping', '%tree%',     'Tree & Shrub Maintenance',     'landscaping', 'monthly');
SELECT pg_temp.consolidate_tpl('landscaping', '%grounds%',  'Grounds & Appearance Cleanup', 'grounds',     'weekly');

-- ── CONSTRUCTION (drainage kept as two distinct jobs) ────────────────────
SELECT pg_temp.consolidate_tpl('construction', '%cart path%',           'Cart Path Repair',     'construction', 'projects');
SELECT pg_temp.consolidate_tpl('construction', '%drainage%inspection%', 'Drainage Maintenance', 'construction', 'projects');
SELECT pg_temp.consolidate_tpl('construction', '%installation%',        'Drainage Repair',      'construction', 'projects');

-- ── SAFETY ───────────────────────────────────────────────────────────────
SELECT pg_temp.consolidate_tpl('safety', '%lightning%', 'Lightning Safety Protocol', 'safety', 'projects');

-- ── MOWING (already clean from 20260609 — just set the explicit tier) ─────
UPDATE task_templates
   SET frequency = 'daily'
 WHERE is_active = true AND category = 'mowing' AND frequency IS NULL;

DROP FUNCTION pg_temp.consolidate_tpl(text, text, text, text, text);

COMMIT;


-- ============================================================================
-- Seed superintendent / admin task templates
-- ============================================================================
-- Adds the management-level work a super does that the crew templates do not
-- cover: scheduling, payroll, purchasing, inventory, interviews, agronomic
-- monitoring (moisture / green speed / HOC / sampling), spray planning and
-- pesticide recordkeeping, and the weekly safety meeting.
--
-- REQUIRES 20260609b first (the `frequency` column). Apply order: b, c, d
-- (c and d are independent — either order after b is fine).
--
-- Idempotent: each insert is skipped if an active template with that name
-- already exists.
-- ============================================================================

BEGIN;

-- Helper keeps the 18 inserts readable: insert the row only if no active
-- template already has that name. Session-local (pg_temp).
CREATE OR REPLACE FUNCTION pg_temp.seed_tpl(
  p_name text, p_desc text, p_category text, p_frequency text,
  p_priority text, p_minutes int, p_equipment text[], p_checklist jsonb,
  p_instructions text
) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM task_templates WHERE name = p_name AND is_active = true) THEN
    RETURN;
  END IF;
  INSERT INTO task_templates
    (name, description, category, frequency, default_priority, estimated_minutes,
     equipment_needed, checklist, requires_photo_before, requires_photo_after,
     weather_dependent, instructions)
  VALUES
    (p_name, p_desc, p_category, p_frequency, p_priority, p_minutes,
     p_equipment, p_checklist, false, false, false, p_instructions);
END;
$$ LANGUAGE plpgsql;

-- ── Admin & office ────────────────────────────────────────────────────────
SELECT pg_temp.seed_tpl(
  'Morning Crew Briefing & Job Assignments',
  'Short start-of-shift huddle to hand out the day''s work.',
  'admin', 'daily', 'normal', 20, ARRAY[]::text[],
  '[{"id":"1","text":"Review weather and course conditions","checked":false},{"id":"2","text":"Assign jobs to each crew member","checked":false},{"id":"3","text":"Cover safety notes for the day","checked":false},{"id":"4","text":"Confirm equipment is ready","checked":false}]'::jsonb,
  'Gather the crew at shift start. Go over weather and priorities, assign each person their jobs, flag safety concerns, and confirm equipment is available.');

SELECT pg_temp.seed_tpl(
  'Build Weekly Crew Schedule',
  'Plan shifts and assignments for the coming week.',
  'admin', 'weekly', 'high', 60, ARRAY[]::text[],
  '[{"id":"1","text":"Review approved time-off requests","checked":false},{"id":"2","text":"Balance workload across the crew","checked":false},{"id":"3","text":"Set shifts for the week","checked":false},{"id":"4","text":"Post the schedule and notify the crew","checked":false}]'::jsonb,
  'Build next week''s schedule around approved time off, expected weather, and course events. Balance the workload, then post it and notify the crew.');

SELECT pg_temp.seed_tpl(
  'Review Timecards & Payroll',
  'Verify hours and approve payroll.',
  'admin', 'weekly', 'high', 45, ARRAY[]::text[],
  '[{"id":"1","text":"Verify clock-in and clock-out hours","checked":false},{"id":"2","text":"Check overtime","checked":false},{"id":"3","text":"Correct any errors","checked":false},{"id":"4","text":"Approve and submit payroll","checked":false}]'::jsonb,
  'Review each crew member''s hours for accuracy, resolve discrepancies, then approve and submit payroll on time.');

SELECT pg_temp.seed_tpl(
  'Submit Purchase Requests',
  'Prepare and submit purchase requests for needed items.',
  'admin', 'weekly', 'normal', 45, ARRAY[]::text[],
  '[{"id":"1","text":"Gather purchase needs from the crew","checked":false},{"id":"2","text":"Get vendor quotes","checked":false},{"id":"3","text":"Complete the purchase request","checked":false},{"id":"4","text":"Submit for approval","checked":false}]'::jsonb,
  'Collect the week''s purchasing needs, obtain quotes, complete each purchase request, and submit for approval.');

SELECT pg_temp.seed_tpl(
  'Order Parts & Supplies',
  'Restock parts, supplies, and consumables.',
  'admin', 'weekly', 'normal', 30, ARRAY[]::text[],
  '[{"id":"1","text":"Review inventory levels","checked":false},{"id":"2","text":"Identify low-stock items","checked":false},{"id":"3","text":"Place orders","checked":false},{"id":"4","text":"Log expected delivery dates","checked":false}]'::jsonb,
  'Check inventory, order anything running low, and record expected delivery dates so jobs are not held up waiting on parts.');

SELECT pg_temp.seed_tpl(
  'Monthly Budget Review',
  'Reconcile spending against the budget.',
  'admin', 'monthly', 'high', 90, ARRAY[]::text[],
  '[{"id":"1","text":"Pull the month''s expenses","checked":false},{"id":"2","text":"Compare actuals to budget","checked":false},{"id":"3","text":"Note variances and reasons","checked":false},{"id":"4","text":"Forecast next month","checked":false}]'::jsonb,
  'Reconcile the month''s spending against the budget, explain any variances, and forecast the next month.');

SELECT pg_temp.seed_tpl(
  'Chemical & Fertilizer Inventory',
  'Count and log chemical and fertilizer stock.',
  'admin', 'monthly', 'normal', 60, ARRAY['Inventory Sheet'],
  '[{"id":"1","text":"Count chemicals and fertilizer on hand","checked":false},{"id":"2","text":"Check expiration dates","checked":false},{"id":"3","text":"Update the inventory log","checked":false},{"id":"4","text":"Flag items to reorder","checked":false}]'::jsonb,
  'Count all chemical and fertilizer stock, check dates, update the log, and flag reorders. Keep the storage area organized and labeled.');

SELECT pg_temp.seed_tpl(
  'Conduct Staff Interview',
  'Interview a candidate for an open position.',
  'admin', 'projects', 'normal', 60, ARRAY[]::text[],
  '[{"id":"1","text":"Review the application and resume","checked":false},{"id":"2","text":"Prepare interview questions","checked":false},{"id":"3","text":"Conduct the interview","checked":false},{"id":"4","text":"Record notes and follow up","checked":false}]'::jsonb,
  'Review the candidate ahead of time, run a consistent set of questions, take notes, and follow up with a decision promptly.');

SELECT pg_temp.seed_tpl(
  'Vendor / Sales Rep Meeting',
  'Meet with a vendor or sales rep.',
  'admin', 'monthly', 'low', 45, ARRAY[]::text[],
  '[{"id":"1","text":"Review current needs","checked":false},{"id":"2","text":"Meet with the rep","checked":false},{"id":"3","text":"Review products and pricing","checked":false},{"id":"4","text":"Note follow-up items","checked":false}]'::jsonb,
  'Meet with the rep to review products, pricing, and programs that fit current needs. Capture any follow-up items.');

-- ── Agronomy & monitoring ─────────────────────────────────────────────────
SELECT pg_temp.seed_tpl(
  'Daily Course Walk — Conditions & Disease Check',
  'Walk the course scanning for disease, stress, and trouble spots.',
  'greens', 'daily', 'high', 60, ARRAY['Utility Cart', 'Moisture Meter'],
  '[{"id":"1","text":"Walk greens, tees, and fairways","checked":false},{"id":"2","text":"Scan for disease and turf stress","checked":false},{"id":"3","text":"Check wet and dry spots","checked":false},{"id":"4","text":"Log problem areas and action items","checked":false}]'::jsonb,
  'Walk the course early and look for disease, wilt, and trouble spots. Note anything that needs treatment or a closer scout and log it.');

SELECT pg_temp.seed_tpl(
  'Greens Moisture & Firmness Check',
  'Take moisture readings and set the hand-water plan.',
  'greens', 'daily', 'normal', 45, ARRAY['Moisture Meter'],
  '[{"id":"1","text":"Take moisture readings on each green","checked":false},{"id":"2","text":"Note dry and wet spots","checked":false},{"id":"3","text":"Set the hand-watering plan","checked":false},{"id":"4","text":"Log readings","checked":false}]'::jsonb,
  'Read moisture across each green, mark the dry and wet areas, and set the hand-watering plan for the crew.');

SELECT pg_temp.seed_tpl(
  'Green Speed Check (Stimpmeter)',
  'Measure green speed against the target.',
  'greens', 'weekly', 'normal', 60, ARRAY['Stimpmeter'],
  '[{"id":"1","text":"Roll the stimpmeter on sample greens","checked":false},{"id":"2","text":"Record speeds","checked":false},{"id":"3","text":"Compare to the target","checked":false},{"id":"4","text":"Adjust mowing or rolling plan","checked":false}]'::jsonb,
  'Take stimpmeter readings on a representative set of greens, compare to target, and adjust the mowing or rolling plan to hold speed consistent.');

SELECT pg_temp.seed_tpl(
  'Verify Mowing Heights (Bench Set)',
  'Confirm reel bench settings match target heights of cut.',
  'greens', 'weekly', 'normal', 30, ARRAY['Bench Height Gauge'],
  '[{"id":"1","text":"Check bench setting on each reel","checked":false},{"id":"2","text":"Verify against the target height of cut","checked":false},{"id":"3","text":"Adjust as needed","checked":false},{"id":"4","text":"Log the settings","checked":false}]'::jsonb,
  'Bench-check each reel against the target height of cut, adjust any that have drifted, and log the settings.');

SELECT pg_temp.seed_tpl(
  'Soil & Tissue Sampling',
  'Pull soil and tissue samples for lab analysis.',
  'greens', 'seasonal', 'normal', 90, ARRAY['Soil Probe', 'Sample Bags'],
  '[{"id":"1","text":"Pull soil cores from greens","checked":false},{"id":"2","text":"Collect tissue samples","checked":false},{"id":"3","text":"Label and bag samples","checked":false},{"id":"4","text":"Ship to the lab and log the submission","checked":false}]'::jsonb,
  'Collect soil and tissue samples on a consistent pattern, label and ship to the lab, and log the submission so results can guide the fertility program.');

-- ── Spray & compliance ────────────────────────────────────────────────────
SELECT pg_temp.seed_tpl(
  'Plan Weekly Spray Program',
  'Build the spray plan for the week.',
  'chemical', 'weekly', 'high', 60, ARRAY[]::text[],
  '[{"id":"1","text":"Review disease pressure and forecast","checked":false},{"id":"2","text":"Select products and rates","checked":false},{"id":"3","text":"Check inventory","checked":false},{"id":"4","text":"Schedule applications and prep spray sheets","checked":false}]'::jsonb,
  'Set the week''s spray plan around disease pressure and weather. Pick products and rates, confirm inventory, schedule the applications, and prep the spray sheets.');

SELECT pg_temp.seed_tpl(
  'Update Pesticide Application Records',
  'Log applications for regulatory compliance.',
  'chemical', 'weekly', 'high', 30, ARRAY[]::text[],
  '[{"id":"1","text":"Log product, rate, and area","checked":false},{"id":"2","text":"Record applicator and weather","checked":false},{"id":"3","text":"File REI and PHI notes","checked":false},{"id":"4","text":"Update the compliance binder","checked":false}]'::jsonb,
  'Record every application with product, rate, area, applicator, and weather. Keep REI and PHI notes current so the compliance records are audit-ready.');

SELECT pg_temp.seed_tpl(
  'Calibrate Sprayer',
  'Calibrate the sprayer for accurate output.',
  'chemical', 'monthly', 'normal', 60, ARRAY['Sprayer', 'Calibration Kit'],
  '[{"id":"1","text":"Check nozzles for wear","checked":false},{"id":"2","text":"Measure output","checked":false},{"id":"3","text":"Adjust speed and pressure","checked":false},{"id":"4","text":"Verify gallons per acre and log calibration","checked":false}]'::jsonb,
  'Inspect nozzles, measure output, and dial in speed and pressure until the sprayer hits the target gallons per acre. Log the calibration.');

-- ── Safety ─────────────────────────────────────────────────────────────────
SELECT pg_temp.seed_tpl(
  'Weekly Safety Meeting / Toolbox Talk',
  'Run a short crew safety meeting.',
  'safety', 'weekly', 'normal', 30, ARRAY[]::text[],
  '[{"id":"1","text":"Pick a safety topic","checked":false},{"id":"2","text":"Review recent incidents or near-misses","checked":false},{"id":"3","text":"Cover PPE and procedures","checked":false},{"id":"4","text":"Record attendance","checked":false}]'::jsonb,
  'Run a short toolbox talk on one safety topic, review any recent incidents, reinforce PPE and procedures, and record attendance.');

DROP FUNCTION pg_temp.seed_tpl(text, text, text, text, text, int, text[], jsonb, text);

COMMIT;


-- ============================================================================
-- Recurring-task nightly top-up (pure SQL — no edge function needed)
-- ============================================================================
-- Keeps every active task_series materialized ~1 year ahead, season after
-- season, so repeating jobs continue indefinitely ("…and so on and so forth")
-- without anyone re-dropping them.
--
-- REQUIRES 20260609b first (task_series, tasks.series_id, and the partial
-- unique index idx_tasks_series_date). Apply order: b, then this.
--
-- How it works: for each active series, generate every candidate day in
-- [today, today + horizon] that (a) lands on the series' weekday, (b) is in
-- season (Apr 1 – Nov 1), and (c) for monthly series, sits in the right
-- week-of-month slot. Insert the ones that don't exist yet; the partial unique
-- index turns any race/overlap into a no-op (ON CONFLICT DO NOTHING), so it can
-- never create a duplicate occurrence. This mirrors src/lib/utils/season.ts.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

-- ----------------------------------------------------------------------------
-- Generator. SECURITY DEFINER so the scheduled job can insert regardless of
-- the caller; search_path pinned per the project's function-hardening rule.
-- ----------------------------------------------------------------------------
create or replace function public.extend_task_series(p_horizon_days int default 365)
returns void as $$
declare
  s record;
  p jsonb;
begin
  for s in select * from task_series where active = true loop
    p := s.task_payload;
    -- Skip malformed series (no snapshot / no title) and monthly series with
    -- no slot — nothing valid to generate.
    if p is null or (p->>'title') is null then
      continue;
    end if;
    if s.tier = 'monthly' and s.week_of_month is null then
      continue;
    end if;

    insert into tasks (
      title, description, category, priority, status,
      assigned_to, assigned_by, due_date, estimated_minutes,
      equipment_needed, materials_needed, checklist,
      requires_photo_before, requires_photo_after, weather_dependent,
      weather_conditions, template_id, series_id, notes
    )
    select
      p->>'title',
      p->>'description',
      p->>'category',
      coalesce(p->>'priority', 'normal'),
      'pending',
      s.assigned_to,
      s.created_by,
      g.d::date,
      nullif(p->>'estimated_minutes', '')::int,
      case when jsonb_typeof(p->'equipment_needed') = 'array'
           then array(select jsonb_array_elements_text(p->'equipment_needed'))
           else '{}'::text[] end,
      case when jsonb_typeof(p->'materials_needed') = 'array'
           then p->'materials_needed' else '[]'::jsonb end,
      case when jsonb_typeof(p->'checklist') = 'array'
           then p->'checklist' else '[]'::jsonb end,
      coalesce((p->>'requires_photo_before')::boolean, false),
      coalesce((p->>'requires_photo_after')::boolean, false),
      coalesce((p->>'weather_dependent')::boolean, false),
      case when p->'weather_conditions' is null or p->'weather_conditions' = 'null'::jsonb
           then null else p->'weather_conditions' end,
      nullif(p->>'template_id', '')::uuid,
      s.id,
      p->>'notes'
    from generate_series(current_date, current_date + p_horizon_days, interval '1 day') g(d)
    where extract(dow from g.d) = s.weekday
      -- in season: Apr 1 … Nov 1 of that date's year
      and g.d::date >= make_date(extract(year from g.d)::int, 4, 1)
      and g.d::date <= make_date(extract(year from g.d)::int, 11, 1)
      -- monthly series only fire in their nth-weekday slot
      and (s.tier <> 'monthly'
           or (((extract(day from g.d)::int - 1) / 7) + 1) = s.week_of_month)
    on conflict (series_id, due_date) where series_id is not null do nothing;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- Schedule it daily (07:00 UTC ≈ 01:00–02:00 CT). Idempotent re-schedule.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'extend_task_series') then
    perform cron.unschedule('extend_task_series');
  end if;
end
$$;

select cron.schedule(
  'extend_task_series',
  '0 7 * * *',
  $cron$ select public.extend_task_series(365); $cron$
);

-- Backfill once on apply (no-op until series exist).
select public.extend_task_series(365);

-- ─── Operational helpers ────────────────────────────────────────────────
--   View the job:      select jobid, jobname, schedule, active from cron.job;
--   View recent runs:  select * from cron.job_run_details
--                        where jobid = (select jobid from cron.job where jobname='extend_task_series')
--                        order by start_time desc limit 20;
--   Run manually now:  select public.extend_task_series(365);
--   Disable:           update cron.job set active=false where jobname='extend_task_series';
--   Remove:            select cron.unschedule('extend_task_series');
