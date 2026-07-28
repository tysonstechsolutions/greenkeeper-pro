-- Allow `employed_through` through the pro-shop staff save RPC.
--
-- `save_pro_shop_staff` validates its JSONB payload against an explicit key
-- whitelist (assert_allowed_jsonb_keys). The last-working-day column added in
-- 20260728100000 is not on that list, so saving it would be rejected as a
-- disallowed key, and the UPDATE branch would not persist it either.
--
-- This is the function exactly as it exists in production (pg_get_functiondef)
-- with only those two additions, so nothing else can drift.

CREATE OR REPLACE FUNCTION public.save_pro_shop_staff(p_staff_id uuid, p_values jsonb, p_reason text DEFAULT NULL::text)
 RETURNS pro_shop_staff
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE v_current public.pro_shop_staff%ROWTYPE; v_next public.pro_shop_staff%ROWTYPE;

BEGIN

  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;

  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY[

    'full_name','position','default_group','availability_text','availability','phone','is_active','sort_order','notes','flex','employed_through'

  ]);

  IF p_staff_id IS NULL THEN

    v_next:=jsonb_populate_record(NULL::public.pro_shop_staff,p_values); v_next.id:=gen_random_uuid();

    v_next.position:=COALESCE(v_next.position,'rec_aid'); v_next.default_group:=COALESCE(v_next.default_group,'outside');

    v_next.availability:=COALESCE(v_next.availability,'{}'::JSONB); v_next.is_active:=COALESCE(v_next.is_active,TRUE);

    v_next.sort_order:=COALESCE(v_next.sort_order,0); v_next.flex:=COALESCE(v_next.flex,TRUE);

    v_next.created_at:=NOW(); v_next.updated_at:=NOW();

  ELSE

    SELECT * INTO v_current FROM public.pro_shop_staff WHERE id=p_staff_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop staff record not found'; END IF;

    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.profile_id:=v_current.profile_id;

    v_next.created_at:=v_current.created_at; v_next.created_by:=v_current.created_by;

  END IF;

  IF NULLIF(BTRIM(v_next.full_name),'') IS NULL THEN RAISE EXCEPTION 'Staff name is required'; END IF;

  PERFORM set_config('app.change_action',CASE WHEN p_staff_id IS NULL THEN 'pro_shop_staff_created' ELSE 'pro_shop_staff_updated' END,TRUE);

  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop staff saved'),TRUE);

  IF p_staff_id IS NULL THEN

    INSERT INTO public.pro_shop_staff(id,full_name,position,default_group,availability_text,availability,phone,is_active,sort_order,notes,flex,employed_through,created_at,updated_at)

    VALUES(v_next.id,v_next.full_name,v_next.position,v_next.default_group,v_next.availability_text,v_next.availability,v_next.phone,

      v_next.is_active,v_next.sort_order,v_next.notes,v_next.flex,v_next.employed_through,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;

  ELSE

    UPDATE public.pro_shop_staff SET full_name=v_next.full_name,position=v_next.position,default_group=v_next.default_group,

      availability_text=v_next.availability_text,availability=v_next.availability,phone=v_next.phone,is_active=v_next.is_active,

      sort_order=v_next.sort_order,notes=v_next.notes,flex=v_next.flex,employed_through=v_next.employed_through WHERE id=p_staff_id RETURNING * INTO v_next;

  END IF;

  RETURN v_next;

END;

$function$

