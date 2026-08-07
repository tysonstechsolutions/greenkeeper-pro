-- ============================================================================
-- A third schedule (Buckley's Restaurant), the longest-shift cap, and a roster
-- that matches the three real crews (2026-08-07).
--
-- Three separate things, one migration because they are one change from the
-- GM's side: "there are three schedules, here is who is on each, and stop
-- cutting people's days in half."
--
--   1. `buckleys` joins pro_shop and maintenance as a schedule area, with one
--      group — `restaurant` — and one position, `restaurant_staff`. Buckley's
--      runs off coverage rules like the pro shop, seeded 11:00-20:00 with two
--      people every day.
--
--   2. `max_shift_minutes` replaces `max_shift_hours` as the longest shift the
--      generator will build. The real cap is 8h30 on site (8h paid, after the
--      unpaid lunch) and the old column is a SMALLINT that cannot hold 8.5.
--      The old column stays for old rows and is no longer read.
--
--   3. The roster is corrected to the three crews the GM actually has. Half of
--      Buckley's was sitting in the maintenance area, six people were filed
--      under a first name only, and Bart Diaz existed twice.
--
-- Idempotent: every constraint is dropped before it is re-added, every insert
-- is guarded, and every roster update is keyed on the name it is fixing.
-- ============================================================================

-- ── 1. Widen the CHECK constraints for the third area ───────────────────────
ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_area_check;
ALTER TABLE public.pro_shop_staff
  ADD CONSTRAINT pro_shop_staff_area_check
  CHECK (area IN ('pro_shop','maintenance','buckleys'));

ALTER TABLE public.pro_shop_schedules DROP CONSTRAINT IF EXISTS pro_shop_schedules_area_check;
ALTER TABLE public.pro_shop_schedules
  ADD CONSTRAINT pro_shop_schedules_area_check
  CHECK (area IN ('pro_shop','maintenance','buckleys'));

ALTER TABLE public.pro_shop_shifts DROP CONSTRAINT IF EXISTS pro_shop_shifts_area_check;
ALTER TABLE public.pro_shop_shifts
  ADD CONSTRAINT pro_shop_shifts_area_check
  CHECK (area IN ('pro_shop','maintenance','buckleys'));

ALTER TABLE public.pro_shop_coverage_rules DROP CONSTRAINT IF EXISTS pro_shop_coverage_rules_area_check;
ALTER TABLE public.pro_shop_coverage_rules
  ADD CONSTRAINT pro_shop_coverage_rules_area_check
  CHECK (area IN ('pro_shop','maintenance','buckleys'));

ALTER TABLE public.pro_shop_schedule_settings DROP CONSTRAINT IF EXISTS pro_shop_schedule_settings_area_check;
ALTER TABLE public.pro_shop_schedule_settings
  ADD CONSTRAINT pro_shop_schedule_settings_area_check
  CHECK (area IN ('pro_shop','maintenance','buckleys'));

-- ── 2. The restaurant position and the restaurant group ─────────────────────
ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_position_check;
ALTER TABLE public.pro_shop_staff
  ADD CONSTRAINT pro_shop_staff_position_check
  CHECK (position IN ('rec_aid','golf_ops_assistant','maintenance_crew','mechanic','restaurant_staff'));

ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_default_group_check;
ALTER TABLE public.pro_shop_staff
  ADD CONSTRAINT pro_shop_staff_default_group_check
  CHECK (default_group IN ('inside','outside','grounds','shop','restaurant'));

ALTER TABLE public.pro_shop_shifts DROP CONSTRAINT IF EXISTS pro_shop_shifts_group_check;
ALTER TABLE public.pro_shop_shifts
  ADD CONSTRAINT pro_shop_shifts_group_check
  CHECK ("group" IN ('inside','outside','grounds','shop','restaurant'));

ALTER TABLE public.pro_shop_coverage_rules DROP CONSTRAINT IF EXISTS pro_shop_coverage_rules_group_check;
ALTER TABLE public.pro_shop_coverage_rules
  ADD CONSTRAINT pro_shop_coverage_rules_group_check
  CHECK ("group" IN ('inside','outside','grounds','shop','restaurant'));

-- ── 3. The longest shift, in minutes ────────────────────────────────────────
-- 510 = 8h30 on site = 8h paid once the unpaid lunch comes out. Hours could
-- not express it: max_shift_hours is a SMALLINT and 8.5 is not one.
ALTER TABLE public.pro_shop_schedule_settings
  ADD COLUMN IF NOT EXISTS max_shift_minutes SMALLINT;

UPDATE public.pro_shop_schedule_settings
   SET max_shift_minutes = 510
 WHERE max_shift_minutes IS NULL;

ALTER TABLE public.pro_shop_schedule_settings
  ALTER COLUMN max_shift_minutes SET DEFAULT 510,
  ALTER COLUMN max_shift_minutes SET NOT NULL;

ALTER TABLE public.pro_shop_schedule_settings
  DROP CONSTRAINT IF EXISTS pro_shop_schedule_settings_max_shift_minutes_check;
ALTER TABLE public.pro_shop_schedule_settings
  ADD CONSTRAINT pro_shop_schedule_settings_max_shift_minutes_check
  CHECK (max_shift_minutes BETWEEN 60 AND 1440);

COMMENT ON COLUMN public.pro_shop_schedule_settings.max_shift_minutes IS
  'Longest single shift the generator will build, in minutes ON SITE (510 = 8h30 = 8h paid). Replaces max_shift_hours, which is a SMALLINT and cannot hold 8.5.';
COMMENT ON COLUMN public.pro_shop_schedule_settings.max_shift_hours IS
  'DEPRECATED 2026-08-07 — superseded by max_shift_minutes and no longer read. Kept so old rows still satisfy NOT NULL.';

-- Every area gets a settings row, so the Coverage panel has something to edit.
INSERT INTO public.pro_shop_schedule_settings (area)
SELECT a.area FROM (VALUES ('pro_shop'),('maintenance'),('buckleys')) AS a(area)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pro_shop_schedule_settings s WHERE s.area = a.area);

UPDATE public.pro_shop_schedule_settings SET max_shift_minutes = 510, updated_at = NOW();

-- ── 4. Teach the settings command about the new column ──────────────────────
-- Rebuilt from pg_get_functiondef, not from memory: it whitelists its JSONB
-- keys, and a key left out is silently dropped rather than rejected.
CREATE OR REPLACE FUNCTION public.save_pro_shop_schedule_settings(p_values JSONB)
RETURNS public.pro_shop_schedule_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_row public.pro_shop_schedule_settings%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,
    ARRAY['area','lunch_threshold_minutes','lunch_minutes','max_shift_hours','max_shift_minutes']);

  INSERT INTO public.pro_shop_schedule_settings(
    area,lunch_threshold_minutes,lunch_minutes,max_shift_hours,max_shift_minutes,updated_by)
  VALUES(
    COALESCE(p_values->>'area','pro_shop'),
    COALESCE((p_values->>'lunch_threshold_minutes')::SMALLINT,360),
    COALESCE((p_values->>'lunch_minutes')::SMALLINT,30),
    COALESCE((p_values->>'max_shift_hours')::SMALLINT,9),
    COALESCE((p_values->>'max_shift_minutes')::SMALLINT,510),
    auth.uid())
  ON CONFLICT (area) DO UPDATE SET
    lunch_threshold_minutes=EXCLUDED.lunch_threshold_minutes,
    lunch_minutes=EXCLUDED.lunch_minutes,
    max_shift_minutes=EXCLUDED.max_shift_minutes,
    updated_at=NOW(), updated_by=auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_pro_shop_schedule_settings(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pro_shop_schedule_settings(JSONB) TO authenticated;

-- ── 5. Buckley's coverage: 11:00-20:00, two people, every day ───────────────
-- Two people over a nine-hour window comes out as 11:00-19:30 and 11:30-20:00
-- under the 8h30 cap: two near-full days that overlap the dinner rush, rather
-- than a four-hour shift nobody wants to drive in for.
INSERT INTO public.pro_shop_coverage_rules
  (area, weekday, "group", open_time, close_time, base_staff, extra_staff, extra_start)
SELECT 'buckleys', d.weekday, 'restaurant', TIME '11:00', TIME '20:00', 2, 0, NULL
  FROM generate_series(0,6) AS d(weekday)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pro_shop_coverage_rules
    WHERE area='buckleys' AND weekday=d.weekday AND "group"='restaurant');

-- ── 6. The roster, as the three crews actually are ──────────────────────────
-- Order matters only for Bart: the pro-shop duplicate is stood down while it
-- is still the only row called "Bart Diaz", so the rename below cannot be
-- mistaken for it.

-- Every roster and shift row is audited, and the attribution trigger refuses a
-- mutation with no authenticated actor — which is every mutation run from a
-- migration. Borrow the account the app itself signs in as, so these changes
-- land in domain_audit_events attributed to a real person rather than failing.
DO $$
DECLARE v_actor UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN RETURN; END IF;
  SELECT id INTO v_actor FROM auth.users
   ORDER BY (email = 'kiosk@vmgc.app') DESC, created_at ASC LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No user account to attribute the roster changes to';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor::TEXT)::TEXT, FALSE);
  PERFORM set_config('app.change_reason', 'Roster split into pro shop, maintenance and Buckley''s', FALSE);
END $$;

-- 6a. Two people who are not on any of the three crews.
UPDATE public.pro_shop_staff
   SET is_active = FALSE, updated_at = NOW()
 WHERE area = 'pro_shop' AND full_name IN ('Devin Martinez','Bart Diaz');

-- Their future shifts go with them. Past ones are history and stay put; a
-- future shift for somebody who is not on the crew would print on the wall.
UPDATE public.pro_shop_shifts f
   SET is_active = FALSE, retired_at = NOW(), retired_by = auth.uid(),
       retirement_reason = 'No longer on the pro shop roster'
  FROM public.pro_shop_staff s
 WHERE f.staff_id = s.id AND f.is_active
   AND s.is_active = FALSE AND s.area = 'pro_shop'
   AND s.full_name IN ('Devin Martinez','Bart Diaz')
   AND f.shift_date > CURRENT_DATE;

-- 6b. Maintenance crew — full names, and the grounds position for all six.
UPDATE public.pro_shop_staff SET
  full_name = v.full_name, position = 'maintenance_crew', default_group = 'grounds',
  sort_order = v.sort_order, updated_at = NOW()
 FROM (VALUES
   ('George',         'Jorge Rosales',    1),
   ('Peyton',         'Payton Rodriguez', 2),
   ('Jahrvier',       'Jahrvier Hood',    3),
   ('Cornelio',       'Cornelio Herrera', 4),
   ('Oscar Gonzolez', 'Oscar Gonzalez',   5),
   ('Bart',           'Bart Diaz',        6)
 ) AS v(was, full_name, sort_order)
 WHERE public.pro_shop_staff.area = 'maintenance'
   AND public.pro_shop_staff.full_name = v.was;

-- 6c. Buckley's — three people who were parked in the maintenance area.
UPDATE public.pro_shop_staff SET
  full_name = v.full_name, area = 'buckleys', position = 'restaurant_staff',
  default_group = 'restaurant', flex = TRUE, is_active = TRUE,
  sort_order = v.sort_order, updated_at = NOW()
 FROM (VALUES
   ('Rosie Lloyd', 'Rosie Lloyd',       2),
   ('Patrice',     'Patrice McDermand', 3),
   ('Ruben',       'Ruben Villalobos',  4)
 ) AS v(was, full_name, sort_order)
 WHERE public.pro_shop_staff.area = 'maintenance'
   AND public.pro_shop_staff.full_name = v.was;

-- Nathan Dupont is new to the app. No availability yet, which the generator
-- reads as "nothing ruled out" — set his hours on the schedule screen.
INSERT INTO public.pro_shop_staff
  (full_name, position, default_group, area, flex, is_active, sort_order, availability)
SELECT 'Nathan Dupont','restaurant_staff','restaurant','buckleys',TRUE,TRUE,1,'{"weekly":{},"notes":""}'::JSONB
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pro_shop_staff WHERE area='buckleys' AND full_name='Nathan Dupont');

-- 6d. Pro shop — Aniya is the one person who works both jobs, so she is the
-- one rec aid cleared to cover golf ops.
UPDATE public.pro_shop_staff
   SET flex = (full_name = 'Aniya Brackett'), updated_at = NOW()
 WHERE area = 'pro_shop' AND is_active;

-- 6e. Any live shift still carrying the old area of somebody who moved.
-- Retired shifts are deliberately left alone: they are history, and the
-- attribution trigger refuses to touch an already-retired row anyway.
UPDATE public.pro_shop_shifts f
   SET area = s.area
  FROM public.pro_shop_staff s
 WHERE f.staff_id = s.id AND f.is_active AND f.area <> s.area;

-- 6f. Maintenance shifts filed under the pro shop's `outside` group.
--
-- positionGroup() used to return "outside" for anything that was not a golf
-- ops assistant, and sanitizeWeekly only ever wrote "inside" or "outside", so
-- every grounds shift landed in a group the maintenance schedule does not
-- have. The day editor renders its area's groups, so those shifts showed on
-- the month grid and then vanished when you opened the day. Both halves are
-- fixed here: the shifts already stamped, and the stored weekly patterns that
-- would stamp the same thing again on the next rebuild.
UPDATE public.pro_shop_shifts f
   SET "group" = s.default_group
  FROM public.pro_shop_staff s
 WHERE f.staff_id = s.id AND f.is_active
   AND f."group" <> s.default_group
   AND f.area IN ('maintenance','buckleys');

UPDATE public.pro_shop_staff s
   SET availability = jsonb_set(
         s.availability,
         '{weekly}',
         (SELECT COALESCE(jsonb_object_agg(day, pattern - 'group'), '{}'::JSONB)
            FROM jsonb_each(s.availability->'weekly') AS e(day, pattern))
       )
 WHERE s.area IN ('maintenance','buckleys')
   AND jsonb_typeof(s.availability->'weekly') = 'object'
   AND EXISTS (
     SELECT 1 FROM jsonb_each(s.availability->'weekly') AS e(day, pattern)
      WHERE pattern ? 'group');

SELECT set_config('request.jwt.claims', '', FALSE);
SELECT set_config('app.change_reason', '', FALSE);

notify pgrst, 'reload schema';
