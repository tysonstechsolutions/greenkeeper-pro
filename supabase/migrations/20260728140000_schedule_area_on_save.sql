-- A schedule belongs to an area, fixed at creation.
--
-- 20260728120000 split schedules into pro_shop and maintenance. This RPC
-- creates them, so `area` has to pass the key whitelist and reach the INSERT
-- or every maintenance month would be created as a pro-shop one.
--
-- On UPDATE the existing area is carried over deliberately: moving a month
-- between areas would strand its shifts, so it is not an editable field.

CREATE OR REPLACE FUNCTION public.save_pro_shop_schedule(p_schedule_id uuid, p_values jsonb, p_reason text DEFAULT NULL::text)
 RETURNS pro_shop_schedules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE v_current public.pro_shop_schedules%ROWTYPE; v_next public.pro_shop_schedules%ROWTYPE;

BEGIN

  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;

  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['month','title','notes','dismissed_warnings','area']);

  IF p_schedule_id IS NULL THEN

    v_next:=jsonb_populate_record(NULL::public.pro_shop_schedules,p_values); v_next.id:=gen_random_uuid();

    v_next.status:='draft'; v_next.dismissed_warnings:=COALESCE(v_next.dismissed_warnings,'{}'::JSONB);

    v_next.created_at:=NOW(); v_next.updated_at:=NOW();

  ELSE

    SELECT * INTO v_current FROM public.pro_shop_schedules WHERE id=p_schedule_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;

    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.month:=v_current.month;

    v_next.status:=v_current.status; v_next.created_at:=v_current.created_at; v_next.created_by:=v_current.created_by;

    v_next.published_at:=v_current.published_at; v_next.published_by:=v_current.published_by; v_next.area:=v_current.area;

  END IF;

  IF v_next.month IS NULL OR NULLIF(BTRIM(v_next.title),'') IS NULL THEN RAISE EXCEPTION 'Schedule month and title are required'; END IF;

  IF EXTRACT(DAY FROM v_next.month)<>1 THEN RAISE EXCEPTION 'Schedule month must be the first day of the month'; END IF;

  PERFORM set_config('app.change_action',CASE WHEN p_schedule_id IS NULL THEN 'pro_shop_schedule_created' ELSE 'pro_shop_schedule_updated' END,TRUE);

  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop schedule saved'),TRUE);

  IF p_schedule_id IS NULL THEN

    INSERT INTO public.pro_shop_schedules(id,month,title,status,notes,dismissed_warnings,area,created_at,updated_at)

    VALUES(v_next.id,v_next.month,v_next.title,'draft',v_next.notes,v_next.dismissed_warnings,COALESCE(v_next.area,'pro_shop'),v_next.created_at,v_next.updated_at)

    RETURNING * INTO v_next;

  ELSE

    UPDATE public.pro_shop_schedules SET title=v_next.title,notes=v_next.notes,dismissed_warnings=v_next.dismissed_warnings

    WHERE id=p_schedule_id RETURNING * INTO v_next;

  END IF;

  RETURN v_next;

END;

$function$

