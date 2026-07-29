-- ============================================================================
-- Schedule coverage rules, shift locking, and the unpaid-lunch setting
-- (2026-07-29).
--
-- The generator used to stamp each person's standing weekly pattern across the
-- month. That produced whatever the patterns happened to add up to — days with
-- one rec aid, days with five, and gaps in the middle of the afternoon. These
-- tables state the REQUIREMENT instead ("cover 08:00-20:00 with 2 people, 3 on
-- Thu-Sun"), so the generator can fill the day rather than replay a pattern.
--
-- Seeded from the hours the existing 640 shifts actually run:
--   inside  06:00-20:00 Mon-Fri, 05:30-20:00 Sat/Sun, 2 people (open + close)
--   outside 08:00-20:00 every day, 2 people, plus a 3rd from 15:00 Thu-Sun
--
-- The maintenance area is deliberately left WITHOUT rules: no rules means the
-- generator falls back to stamping weekly patterns, which is exactly how the
-- maintenance crew's schedule works today and must keep working.
--
-- Idempotent: guarded inserts, IF NOT EXISTS everywhere.
-- ============================================================================

-- ── 1. Coverage requirement, per area / weekday / group ─────────────────────
CREATE TABLE IF NOT EXISTS public.pro_shop_coverage_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area         TEXT NOT NULL CHECK (area IN ('pro_shop','maintenance')),
  -- 0 = Sunday .. 6 = Saturday, matching JS getDay() and WEEKDAY_KEYS.
  weekday      SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  "group"      TEXT NOT NULL CHECK ("group" IN ('inside','outside','grounds','shop')),
  open_time    TIME NOT NULL,
  close_time   TIME NOT NULL,
  -- People who SPLIT the open..close window back-to-back. This is what makes
  -- the day gap-free: base_staff = 2 means two shifts meeting in the middle.
  base_staff   SMALLINT NOT NULL DEFAULT 2 CHECK (base_staff BETWEEN 0 AND 12),
  -- Additional people layered ON TOP of the base cover, all starting at
  -- extra_start and working to close (the Thu-Sun afternoon rec aid).
  extra_staff  SMALLINT NOT NULL DEFAULT 0 CHECK (extra_staff BETWEEN 0 AND 12),
  extra_start  TIME,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID,
  CONSTRAINT pro_shop_coverage_rules_window CHECK (close_time > open_time),
  CONSTRAINT pro_shop_coverage_rules_extra CHECK (
    extra_staff = 0 OR extra_start IS NOT NULL
  ),
  CONSTRAINT pro_shop_coverage_rules_unique UNIQUE (area, weekday, "group")
);

COMMENT ON TABLE public.pro_shop_coverage_rules IS
  'What each day REQUIRES: the window to cover, how many people split it, and how many extra afternoon staff. An area with no rows falls back to stamping weekly patterns.';

-- ── 2. Per-area schedule settings (the unpaid lunch) ────────────────────────
CREATE TABLE IF NOT EXISTS public.pro_shop_schedule_settings (
  area                     TEXT PRIMARY KEY CHECK (area IN ('pro_shop','maintenance')),
  -- Beyond this much time on shift, the shift carries an unpaid lunch.
  lunch_threshold_minutes  SMALLINT NOT NULL DEFAULT 360 CHECK (lunch_threshold_minutes BETWEEN 0 AND 1440),
  -- How long that unpaid lunch is. Paid hours = elapsed - this, past the
  -- threshold. 06:00-14:30 = 8h30 elapsed = 8h00 paid.
  lunch_minutes            SMALLINT NOT NULL DEFAULT 30 CHECK (lunch_minutes BETWEEN 0 AND 240),
  -- Longest single shift the generator will build before splitting the window
  -- across more people.
  max_shift_hours          SMALLINT NOT NULL DEFAULT 9 CHECK (max_shift_hours BETWEEN 1 AND 24),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by               UUID
);

COMMENT ON COLUMN public.pro_shop_schedule_settings.lunch_minutes IS
  'Unpaid lunch deducted from any shift longer than lunch_threshold_minutes. Staff are not paid for lunch, so displayed hours are always paid hours.';

-- ── 3. Locked shifts survive a regenerate ───────────────────────────────────
ALTER TABLE public.pro_shop_shifts
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pro_shop_shifts.locked IS
  'A hand-placed shift the GM pinned. Regenerate rebuilds the month AROUND it instead of retiring it.';

CREATE INDEX IF NOT EXISTS pro_shop_shifts_locked_idx
  ON public.pro_shop_shifts (schedule_id, locked) WHERE is_active;

-- ── 4. Seed the pro-shop requirement from the hours actually worked ─────────
INSERT INTO public.pro_shop_coverage_rules (area, weekday, "group", open_time, close_time, base_staff, extra_staff, extra_start)
SELECT 'pro_shop', d.weekday, 'inside',
       CASE WHEN d.weekday IN (0,6) THEN TIME '05:30' ELSE TIME '06:00' END,
       TIME '20:00', 2, 0, NULL
  FROM generate_series(0,6) AS d(weekday)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pro_shop_coverage_rules
    WHERE area='pro_shop' AND weekday=d.weekday AND "group"='inside');

INSERT INTO public.pro_shop_coverage_rules (area, weekday, "group", open_time, close_time, base_staff, extra_staff, extra_start)
SELECT 'pro_shop', d.weekday, 'outside',
       TIME '08:00', TIME '20:00', 2,
       -- Thu(4), Fri(5), Sat(6), Sun(0) get a third rec aid from 15:00.
       CASE WHEN d.weekday IN (0,4,5,6) THEN 1 ELSE 0 END,
       CASE WHEN d.weekday IN (0,4,5,6) THEN TIME '15:00' ELSE NULL END
  FROM generate_series(0,6) AS d(weekday)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pro_shop_coverage_rules
    WHERE area='pro_shop' AND weekday=d.weekday AND "group"='outside');

INSERT INTO public.pro_shop_schedule_settings (area)
SELECT 'pro_shop'
 WHERE NOT EXISTS (SELECT 1 FROM public.pro_shop_schedule_settings WHERE area='pro_shop');

-- ── 5. Lock the tables down the same way as the rest of the domain ──────────
ALTER TABLE public.pro_shop_coverage_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_shop_schedule_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pro_shop_coverage_rules    FROM anon, authenticated;
REVOKE ALL ON public.pro_shop_schedule_settings FROM anon, authenticated;
GRANT SELECT ON public.pro_shop_coverage_rules    TO authenticated;
GRANT SELECT ON public.pro_shop_schedule_settings TO authenticated;

DROP POLICY IF EXISTS pro_shop_coverage_rules_read ON public.pro_shop_coverage_rules;
CREATE POLICY pro_shop_coverage_rules_read ON public.pro_shop_coverage_rules
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS pro_shop_schedule_settings_read ON public.pro_shop_schedule_settings;
CREATE POLICY pro_shop_schedule_settings_read ON public.pro_shop_schedule_settings
  FOR SELECT TO authenticated USING (TRUE);

-- ── 6. Manager-only writes, through commands like every other domain ────────
CREATE OR REPLACE FUNCTION public.save_pro_shop_coverage_rule(p_values JSONB)
RETURNS public.pro_shop_coverage_rules
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_row public.pro_shop_coverage_rules%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,
    ARRAY['area','weekday','group','open_time','close_time','base_staff','extra_staff','extra_start']);

  INSERT INTO public.pro_shop_coverage_rules(area,weekday,"group",open_time,close_time,base_staff,extra_staff,extra_start,updated_by)
  VALUES(
    COALESCE(p_values->>'area','pro_shop'),
    (p_values->>'weekday')::SMALLINT,
    COALESCE(p_values->>'group','outside'),
    (p_values->>'open_time')::TIME,
    (p_values->>'close_time')::TIME,
    COALESCE((p_values->>'base_staff')::SMALLINT,2),
    COALESCE((p_values->>'extra_staff')::SMALLINT,0),
    NULLIF(p_values->>'extra_start','')::TIME,
    auth.uid())
  ON CONFLICT (area,weekday,"group") DO UPDATE SET
    open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time,
    base_staff=EXCLUDED.base_staff, extra_staff=EXCLUDED.extra_staff,
    extra_start=EXCLUDED.extra_start, updated_at=NOW(), updated_by=auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_pro_shop_schedule_settings(p_values JSONB)
RETURNS public.pro_shop_schedule_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_row public.pro_shop_schedule_settings%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,
    ARRAY['area','lunch_threshold_minutes','lunch_minutes','max_shift_hours']);

  INSERT INTO public.pro_shop_schedule_settings(area,lunch_threshold_minutes,lunch_minutes,max_shift_hours,updated_by)
  VALUES(
    COALESCE(p_values->>'area','pro_shop'),
    COALESCE((p_values->>'lunch_threshold_minutes')::SMALLINT,360),
    COALESCE((p_values->>'lunch_minutes')::SMALLINT,30),
    COALESCE((p_values->>'max_shift_hours')::SMALLINT,9),
    auth.uid())
  ON CONFLICT (area) DO UPDATE SET
    lunch_threshold_minutes=EXCLUDED.lunch_threshold_minutes,
    lunch_minutes=EXCLUDED.lunch_minutes,
    max_shift_hours=EXCLUDED.max_shift_hours,
    updated_at=NOW(), updated_by=auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_pro_shop_coverage_rule(JSONB)    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.save_pro_shop_schedule_settings(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pro_shop_coverage_rule(JSONB)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_pro_shop_schedule_settings(JSONB) TO authenticated;

-- ── 7. Teach the shift commands about `locked` ──────────────────────────────
-- Rebuilt from pg_get_functiondef, not from memory: these whitelist their
-- JSONB keys, and a key rebuilt from guesswork silently drops a field.
CREATE OR REPLACE FUNCTION public.save_pro_shop_shift(p_shift_id uuid, p_values jsonb, p_reason text DEFAULT NULL::text)
 RETURNS pro_shop_shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_shifts%ROWTYPE; v_next public.pro_shop_shifts%ROWTYPE; v_area TEXT;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['schedule_id','staff_id','shift_date','group','start_time','end_time','source','note','locked']);
  IF p_shift_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.pro_shop_shifts,p_values); v_next.id:=gen_random_uuid(); v_next.is_active:=TRUE;
    v_next.source:=COALESCE(v_next.source,'manual'); v_next."group":=COALESCE(v_next."group",'outside');
    v_next.locked:=COALESCE(v_next.locked,FALSE);
    v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.pro_shop_shifts WHERE id=p_shift_id FOR UPDATE;
    IF NOT FOUND OR NOT v_current.is_active THEN RAISE EXCEPTION 'Active pro-shop shift not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.created_at:=v_current.created_at;
    v_next.created_by:=v_current.created_by; v_next.generation_key:=NULL;
  END IF;
  IF v_next.staff_id IS NULL OR v_next.shift_date IS NULL OR v_next.start_time IS NULL OR v_next.end_time IS NULL THEN
    RAISE EXCEPTION 'Shift staff, date, start, and end are required';
  END IF;
  IF v_next.end_time<=v_next.start_time THEN RAISE EXCEPTION 'Shift end must be after start'; END IF;
  -- A shift always belongs to the same area as its schedule. Derived, never
  -- taken from the caller, so a manual shift cannot land in the wrong one.
  SELECT area INTO v_area FROM public.pro_shop_schedules WHERE id=v_next.schedule_id;
  v_next.area:=COALESCE(v_area,v_next.area,'pro_shop');
  PERFORM set_config('app.change_action',CASE WHEN p_shift_id IS NULL THEN 'pro_shop_shift_created' ELSE 'pro_shop_shift_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop shift saved'),TRUE);
  IF p_shift_id IS NULL THEN
    INSERT INTO public.pro_shop_shifts(id,schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active,area,locked,created_at,updated_at)
    VALUES(v_next.id,v_next.schedule_id,v_next.staff_id,v_next.shift_date,v_next."group",v_next.start_time,v_next.end_time,
      v_next.source,v_next.note,NULL,TRUE,v_next.area,v_next.locked,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_shifts SET schedule_id=v_next.schedule_id,staff_id=v_next.staff_id,shift_date=v_next.shift_date,
      "group"=v_next."group",start_time=v_next.start_time,end_time=v_next.end_time,source=v_next.source,note=v_next.note,
      locked=v_next.locked,generation_key=NULL
    WHERE id=p_shift_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

-- Regenerate must rebuild AROUND a locked shift. Same body as the deployed
-- version except the retire step now spares locked rows.
CREATE OR REPLACE FUNCTION public.replace_pro_shop_schedule_shifts(p_schedule_id uuid, p_rows jsonb, p_replace boolean, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_item JSONB; v_keys TEXT[]:=ARRAY[]::TEXT[]; v_key TEXT; v_existing UUID; v_count INTEGER:=0; v_area TEXT;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Replacement reason is required'; END IF;
  SELECT area INTO v_area FROM public.pro_shop_schedules WHERE id=p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;
  v_area:=COALESCE(v_area,'pro_shop');
  IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Shift rows must be a JSON array'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    PERFORM public.assert_allowed_jsonb_keys(v_item,ARRAY['staff_id','shift_date','group','start_time','end_time','source','note']);
    IF (v_item->>'staff_id') IS NULL OR (v_item->>'shift_date') IS NULL OR (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
      RAISE EXCEPTION 'Generated shifts require staff, date, start, and end';
    END IF;
    v_key:=md5(concat_ws('|',p_schedule_id::TEXT,v_item->>'staff_id',v_item->>'shift_date',v_item->>'group',v_item->>'start_time',v_item->>'end_time'));
    v_keys:=array_append(v_keys,v_key);
  END LOOP;
  PERFORM set_config('app.change_action','pro_shop_schedule_regenerated',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  IF p_replace THEN
    UPDATE public.pro_shop_shifts SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),retirement_reason=BTRIM(p_reason)
    WHERE schedule_id=p_schedule_id AND is_active AND NOT locked
      AND (generation_key IS NULL OR NOT(generation_key=ANY(v_keys)));
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_key:=md5(concat_ws('|',p_schedule_id::TEXT,v_item->>'staff_id',v_item->>'shift_date',v_item->>'group',v_item->>'start_time',v_item->>'end_time'));
    SELECT id INTO v_existing FROM public.pro_shop_shifts WHERE schedule_id=p_schedule_id AND generation_key=v_key ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_existing IS NULL THEN
      INSERT INTO public.pro_shop_shifts(schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active,area)
      VALUES(p_schedule_id,(v_item->>'staff_id')::UUID,(v_item->>'shift_date')::DATE,COALESCE(v_item->>'group','outside'),
        (v_item->>'start_time')::TIME,(v_item->>'end_time')::TIME,COALESCE(v_item->>'source','template'),NULLIF(v_item->>'note',''),v_key,TRUE,v_area);
    ELSIF EXISTS(SELECT 1 FROM public.pro_shop_shifts WHERE id=v_existing AND is_active=FALSE) THEN
      UPDATE public.pro_shop_shifts SET is_active=TRUE,retired_at=NULL,retired_by=NULL,retirement_reason=NULL,
        source=COALESCE(v_item->>'source','template'),note=NULLIF(v_item->>'note','') WHERE id=v_existing;
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$function$;

notify pgrst, 'reload schema';
