-- ============================================================================
-- Standard week — the same schedule every week
-- ============================================================================
--
-- Until now each month was rebuilt day by day and the fairness rules rotated
-- who worked which day. The GM wants people on the same days every week, and
-- one place to change it.
--
-- pro_shop_week_templates holds each area's standard week as dated versions:
-- a version applies from its effective_from until the next one starts, so a
-- change can be made "from Oct 12 on" without touching the weeks before it.
-- A version carries:
--   slots — [{id, weekday 0-6, group, staff_id|null, start "HH:MM", end}]
--           staff_id null = the shift exists but nobody holds it yet.
--   hours — {"<weekday>": {"<group>": {"open": "HH:MM", "close": "HH:MM"}}}
--           the operating hours, so a season change can be dated too. They
--           replace the coverage rule's open/close; the rule keeps the counts.
--
-- pro_shop_shifts.slot_id records which slot a stamped shift came from. A
-- hand edit keeps it, so "Mike's Monday, given to Marty this once" is known to
-- BE Mike's Monday and a refill won't put Mike back on top of Marty.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pro_shop_week_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area           TEXT NOT NULL CHECK (area IN ('pro_shop','maintenance','buckleys')),
  effective_from DATE NOT NULL,
  slots          JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slots) = 'array'),
  hours          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(hours) = 'object'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID DEFAULT auth.uid(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID,
  UNIQUE (area, effective_from)
);

ALTER TABLE public.pro_shop_week_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pro_shop_week_templates_manager_read ON public.pro_shop_week_templates;
CREATE POLICY pro_shop_week_templates_manager_read ON public.pro_shop_week_templates
  FOR SELECT TO authenticated USING (public.is_manager());
GRANT SELECT ON public.pro_shop_week_templates TO authenticated;

CREATE OR REPLACE FUNCTION public.save_pro_shop_week_template(
  p_area TEXT, p_effective_from DATE, p_slots JSONB, p_hours JSONB)
RETURNS public.pro_shop_week_templates
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.pro_shop_week_templates%ROWTYPE; v_slot JSONB;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF p_area NOT IN ('pro_shop','maintenance','buckleys') THEN RAISE EXCEPTION 'Unknown schedule area %', p_area; END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'A start date is required'; END IF;
  IF jsonb_typeof(p_slots) <> 'array' THEN RAISE EXCEPTION 'Slots must be a JSON array'; END IF;
  IF p_hours IS NOT NULL AND jsonb_typeof(p_hours) <> 'object' THEN RAISE EXCEPTION 'Hours must be a JSON object'; END IF;
  FOR v_slot IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
    PERFORM public.assert_allowed_jsonb_keys(v_slot, ARRAY['id','weekday','group','staff_id','start','end']);
    IF (v_slot->>'id') IS NULL OR (v_slot->>'weekday') IS NULL OR (v_slot->>'group') IS NULL
       OR (v_slot->>'start') IS NULL OR (v_slot->>'end') IS NULL THEN
      RAISE EXCEPTION 'Every slot needs an id, weekday, group, start and end';
    END IF;
    IF (v_slot->>'weekday')::INT NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'Weekday must be 0-6'; END IF;
    IF (v_slot->>'end')::TIME <= (v_slot->>'start')::TIME THEN
      RAISE EXCEPTION 'A shift must end after it starts (% to %)', v_slot->>'start', v_slot->>'end';
    END IF;
  END LOOP;

  INSERT INTO public.pro_shop_week_templates(area, effective_from, slots, hours, updated_by)
  VALUES (p_area, p_effective_from, p_slots, COALESCE(p_hours, '{}'::jsonb), auth.uid())
  ON CONFLICT (area, effective_from) DO UPDATE
    SET slots = EXCLUDED.slots, hours = EXCLUDED.hours, updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_pro_shop_week_template(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  DELETE FROM public.pro_shop_week_templates WHERE id = p_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_pro_shop_week_template(TEXT, DATE, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pro_shop_week_template(UUID) TO authenticated;

ALTER TABLE public.pro_shop_shifts ADD COLUMN IF NOT EXISTS slot_id TEXT;

-- ── Stamped shifts carry their slot ─────────────────────────────────────────
-- Rebuilt from pg_get_functiondef; the only changes are 'slot_id' in the
-- whitelist, the INSERT, and a matched existing shift picking up its slot.
CREATE OR REPLACE FUNCTION public.replace_pro_shop_schedule_shifts(p_schedule_id uuid, p_rows jsonb, p_replace boolean, p_reason text, p_dates jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_item JSONB; v_keys TEXT[]:=ARRAY[]::TEXT[]; v_key TEXT; v_existing UUID; v_count INTEGER:=0; v_area TEXT; v_dates DATE[];
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Replacement reason is required'; END IF;
  SELECT area INTO v_area FROM public.pro_shop_schedules WHERE id=p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;
  v_area:=COALESCE(v_area,'pro_shop');
  IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Shift rows must be a JSON array'; END IF;
  -- Scope. Left NULL, every date is in scope and this behaves as it always did.
  IF p_dates IS NOT NULL AND jsonb_typeof(p_dates)<>'null' THEN
    IF jsonb_typeof(p_dates)<>'array' THEN RAISE EXCEPTION 'Rebuild dates must be a JSON array'; END IF;
    SELECT COALESCE(array_agg(value::DATE),ARRAY[]::DATE[]) INTO v_dates FROM jsonb_array_elements_text(p_dates) AS d(value);
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    PERFORM public.assert_allowed_jsonb_keys(v_item,ARRAY['staff_id','shift_date','group','start_time','end_time','source','note','slot_id']);
    IF (v_item->>'staff_id') IS NULL OR (v_item->>'shift_date') IS NULL OR (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
      RAISE EXCEPTION 'Generated shifts require staff, date, start, and end';
    END IF;
    IF v_dates IS NOT NULL AND NOT((v_item->>'shift_date')::DATE=ANY(v_dates)) THEN
      RAISE EXCEPTION 'Shift for % is outside the requested rebuild window',(v_item->>'shift_date');
    END IF;
    v_key:=md5(concat_ws('|',p_schedule_id::TEXT,v_item->>'staff_id',v_item->>'shift_date',v_item->>'group',v_item->>'start_time',v_item->>'end_time'));
    v_keys:=array_append(v_keys,v_key);
  END LOOP;
  PERFORM set_config('app.change_action','pro_shop_schedule_regenerated',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  IF p_replace THEN
    UPDATE public.pro_shop_shifts SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),retirement_reason=BTRIM(p_reason)
    WHERE schedule_id=p_schedule_id AND is_active AND NOT locked
      AND (v_dates IS NULL OR shift_date=ANY(v_dates))
      AND (generation_key IS NULL OR NOT(generation_key=ANY(v_keys)));
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_key:=md5(concat_ws('|',p_schedule_id::TEXT,v_item->>'staff_id',v_item->>'shift_date',v_item->>'group',v_item->>'start_time',v_item->>'end_time'));
    SELECT id INTO v_existing FROM public.pro_shop_shifts WHERE schedule_id=p_schedule_id AND generation_key=v_key ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_existing IS NULL THEN
      INSERT INTO public.pro_shop_shifts(schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active,area,slot_id)
      VALUES(p_schedule_id,(v_item->>'staff_id')::UUID,(v_item->>'shift_date')::DATE,COALESCE(v_item->>'group','outside'),
        (v_item->>'start_time')::TIME,(v_item->>'end_time')::TIME,COALESCE(v_item->>'source','template'),NULLIF(v_item->>'note',''),v_key,TRUE,v_area,
        NULLIF(v_item->>'slot_id',''));
    ELSIF EXISTS(SELECT 1 FROM public.pro_shop_shifts WHERE id=v_existing AND is_active=FALSE) THEN
      UPDATE public.pro_shop_shifts SET is_active=TRUE,retired_at=NULL,retired_by=NULL,retirement_reason=NULL,
        source=COALESCE(v_item->>'source','template'),note=NULLIF(v_item->>'note',''),
        slot_id=NULLIF(v_item->>'slot_id','') WHERE id=v_existing;
    ELSIF EXISTS(SELECT 1 FROM public.pro_shop_shifts WHERE id=v_existing
                 AND slot_id IS DISTINCT FROM NULLIF(v_item->>'slot_id','')) THEN
      -- Same person, day and hours already on the schedule: it IS this slot.
      UPDATE public.pro_shop_shifts SET slot_id=NULLIF(v_item->>'slot_id','') WHERE id=v_existing;
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ── Hand edits keep (or set) the slot ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_pro_shop_shift(p_shift_id uuid, p_values jsonb, p_reason text DEFAULT NULL::text)
 RETURNS pro_shop_shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_shifts%ROWTYPE; v_next public.pro_shop_shifts%ROWTYPE; v_area TEXT;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['schedule_id','staff_id','shift_date','group','start_time','end_time','source','note','locked','slot_id']);
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
    INSERT INTO public.pro_shop_shifts(id,schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active,area,locked,created_at,updated_at,slot_id)
    VALUES(v_next.id,v_next.schedule_id,v_next.staff_id,v_next.shift_date,v_next."group",v_next.start_time,v_next.end_time,
      v_next.source,v_next.note,NULL,TRUE,v_next.area,v_next.locked,v_next.created_at,v_next.updated_at,v_next.slot_id) RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_shifts SET schedule_id=v_next.schedule_id,staff_id=v_next.staff_id,shift_date=v_next.shift_date,
      "group"=v_next."group",start_time=v_next.start_time,end_time=v_next.end_time,source=v_next.source,note=v_next.note,
      locked=v_next.locked,generation_key=NULL,slot_id=v_next.slot_id
    WHERE id=p_shift_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

NOTIFY pgrst, 'reload schema';
