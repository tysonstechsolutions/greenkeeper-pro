-- Rebuild only the days you asked for.
--
-- Regenerate used to be all-or-nothing for the whole month: every unpinned
-- shift in the schedule was retired and restamped. That is the wrong tool once
-- days can be locked, or when the GM only wants next week rebuilt after a
-- call-out — the rest of the month is work he already did by hand.
--
-- p_dates is the scope. NULL (or absent) keeps the old behaviour exactly:
-- the whole schedule. A JSON array of YYYY-MM-DD limits BOTH halves of the
-- operation — nothing outside the scope is retired, and nothing outside the
-- scope may be inserted, so a caller cannot claim one window and write to
-- another. An empty array means "rebuild nothing", which is what a month of
-- entirely locked days amounts to.
--
-- Dropped and recreated rather than overloaded: two candidates with the same
-- name leave PostgREST unable to choose, and every call would start failing.

DROP FUNCTION IF EXISTS public.replace_pro_shop_schedule_shifts(uuid, jsonb, boolean, text);

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
    PERFORM public.assert_allowed_jsonb_keys(v_item,ARRAY['staff_id','shift_date','group','start_time','end_time','source','note']);
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

-- DROP took the grants with it; restore exactly what the 4-arg version had.
REVOKE ALL ON FUNCTION public.replace_pro_shop_schedule_shifts(uuid, jsonb, boolean, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_pro_shop_schedule_shifts(uuid, jsonb, boolean, text, jsonb) TO authenticated;
