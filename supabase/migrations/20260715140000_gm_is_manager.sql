-- ============================================================================
-- Let the General Manager actually be a manager.
--
-- THE BUG THIS PREVENTS
-- `is_manager()` and `is_manager(uuid)` gate on role IN ('super','asst_super'[,
-- 'director']) and OMIT 'gm'. 86 live RLS policies call one of them. Tyson's
-- title is General Manager, but his profile role was still 'super' — the moment
-- that role is corrected to 'gm', he would silently lose write access across
-- most of the database (tasks, equipment, assets, activity_log, schedule, ...).
--
-- A General Manager is unambiguously a manager. Adding 'gm' here is the fix;
-- it must land BEFORE any profile role is changed.
--
-- Both overloads are updated. The no-arg form is the modern one used by newer
-- policies; the (user_id uuid) form survives from 001_initial_schema. Neither
-- is dropped — dropping either would cascade into those 86 policies.
-- ============================================================================

-- No-arg form: used by the newer policies. Keeps 'director', adds 'gm'.
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'director', 'gm')
      AND is_active = TRUE
  );
$function$;

-- Legacy (user_id) form from 001_initial_schema. Adds 'director' + 'gm' so the
-- two overloads can't disagree about who is a manager — a mismatch between them
-- is exactly the kind of thing that produces "works here, 403s there".
CREATE OR REPLACE FUNCTION public.is_manager(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
      AND role IN ('super', 'asst_super', 'director', 'gm')
      AND is_active = TRUE
  );
$function$;

COMMENT ON FUNCTION public.is_manager() IS
  'Management check used by RLS. Includes gm — a General Manager is a manager. Keep in sync with is_manager(uuid) and can_manage_daily_operations().';

notify pgrst, 'reload schema';
