-- Generated shifts inherit their schedule's area.
--
-- 20260728120000 split the schedule into pro_shop and maintenance areas.
-- This RPC bulk-inserts a generated month, and its key whitelist does not
-- include `area`, so every generated maintenance shift would have landed on
-- the pro-shop default and shown up in the wrong schedule.
--
-- The area is read FROM THE SCHEDULE ROW rather than accepted from the
-- client, so it cannot be spoofed and the caller needs no change.
--
-- Taken from pg_get_functiondef as it exists in production with only those
-- additions.

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

    WHERE schedule_id=p_schedule_id AND is_active AND (generation_key IS NULL OR NOT(generation_key=ANY(v_keys)));

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

$function$

