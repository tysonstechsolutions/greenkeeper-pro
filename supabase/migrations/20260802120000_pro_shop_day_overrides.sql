-- Per-day coverage overrides and day locks.
--
-- The coverage rules say what a WEEKDAY requires. That is right almost all of
-- the time, and wrong on the one Saturday the course is half shut. This column
-- lets a single date say something different without touching the rule that
-- governs every other Saturday.
--
-- Shape, keyed by YYYY-MM-DD (same idea as dismissed_warnings above it):
--
--   { "2026-08-15": { "locked": true,
--                     "groups": { "outside": { "base": 2, "extra": 0 },
--                                 "inside":  { "base": 1, "extra": 0 } } } }
--
-- A date that is absent, or a group that is absent within a date, falls back
-- to the weekday rule — so days nobody has touched behave exactly as before.
-- "locked" means a rebuild skips that day entirely and keeps its shifts.

ALTER TABLE public.pro_shop_schedules
  ADD COLUMN IF NOT EXISTS day_overrides JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.pro_shop_schedules.day_overrides IS
  'Per-date coverage overrides and day locks, keyed YYYY-MM-DD. Absent date = use the weekday coverage rule.';

-- save_pro_shop_schedule rebuilt from pg_get_functiondef with two changes:
-- day_overrides added to the allowed-key whitelist, and — the part that would
-- otherwise fail silently — added to the INSERT and UPDATE column lists. The
-- old body wrote only title/notes/dismissed_warnings, so a whitelisted-but-
-- unwritten key would be accepted and then dropped on the floor.
CREATE OR REPLACE FUNCTION public.save_pro_shop_schedule(p_schedule_id uuid, p_values jsonb, p_reason text DEFAULT NULL::text)
 RETURNS pro_shop_schedules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_schedules%ROWTYPE; v_next public.pro_shop_schedules%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['month','title','notes','dismissed_warnings','day_overrides','area']);
  IF p_schedule_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.pro_shop_schedules,p_values); v_next.id:=gen_random_uuid();
    v_next.status:='draft'; v_next.dismissed_warnings:=COALESCE(v_next.dismissed_warnings,'{}'::JSONB);
    v_next.day_overrides:=COALESCE(v_next.day_overrides,'{}'::JSONB);
    v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.pro_shop_schedules WHERE id=p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.month:=v_current.month;
    v_next.status:=v_current.status; v_next.created_at:=v_current.created_at; v_next.created_by:=v_current.created_by;
    v_next.published_at:=v_current.published_at; v_next.published_by:=v_current.published_by; v_next.area:=v_current.area;
    v_next.day_overrides:=COALESCE(v_next.day_overrides,'{}'::JSONB);
  END IF;
  IF v_next.month IS NULL OR NULLIF(BTRIM(v_next.title),'') IS NULL THEN RAISE EXCEPTION 'Schedule month and title are required'; END IF;
  IF EXTRACT(DAY FROM v_next.month)<>1 THEN RAISE EXCEPTION 'Schedule month must be the first day of the month'; END IF;
  IF jsonb_typeof(v_next.day_overrides)<>'object' THEN RAISE EXCEPTION 'Day overrides must be a JSON object keyed by date'; END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_schedule_id IS NULL THEN 'pro_shop_schedule_created' ELSE 'pro_shop_schedule_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop schedule saved'),TRUE);
  IF p_schedule_id IS NULL THEN
    INSERT INTO public.pro_shop_schedules(id,month,title,status,notes,dismissed_warnings,day_overrides,area,created_at,updated_at)
    VALUES(v_next.id,v_next.month,v_next.title,'draft',v_next.notes,v_next.dismissed_warnings,v_next.day_overrides,COALESCE(v_next.area,'pro_shop'),v_next.created_at,v_next.updated_at)
    RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_schedules SET title=v_next.title,notes=v_next.notes,dismissed_warnings=v_next.dismissed_warnings,
      day_overrides=v_next.day_overrides
    WHERE id=p_schedule_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;
