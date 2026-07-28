-- A manually added shift inherits its schedule's area.
--
-- Companion to 20260728130000, for the single-shift path. The area is read
-- from the shift's schedule rather than the caller's payload, so the key
-- whitelist needs no change and a shift cannot be placed in the wrong area.

CREATE OR REPLACE FUNCTION public.save_pro_shop_shift(p_shift_id uuid, p_values jsonb, p_reason text DEFAULT NULL::text)
 RETURNS pro_shop_shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE v_current public.pro_shop_shifts%ROWTYPE; v_next public.pro_shop_shifts%ROWTYPE; v_area TEXT;

BEGIN

  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;

  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['schedule_id','staff_id','shift_date','group','start_time','end_time','source','note']);

  IF p_shift_id IS NULL THEN

    v_next:=jsonb_populate_record(NULL::public.pro_shop_shifts,p_values); v_next.id:=gen_random_uuid(); v_next.is_active:=TRUE;

    v_next.source:=COALESCE(v_next.source,'manual'); v_next."group":=COALESCE(v_next."group",'outside');

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

    INSERT INTO public.pro_shop_shifts(id,schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active,area,created_at,updated_at)

    VALUES(v_next.id,v_next.schedule_id,v_next.staff_id,v_next.shift_date,v_next."group",v_next.start_time,v_next.end_time,

      v_next.source,v_next.note,NULL,TRUE,v_next.area,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;

  ELSE

    UPDATE public.pro_shop_shifts SET schedule_id=v_next.schedule_id,staff_id=v_next.staff_id,shift_date=v_next.shift_date,

      "group"=v_next."group",start_time=v_next.start_time,end_time=v_next.end_time,source=v_next.source,note=v_next.note,generation_key=NULL

    WHERE id=p_shift_id RETURNING * INTO v_next;

  END IF;

  RETURN v_next;

END;

$function$

