-- ============================================================================
-- Food and Beverage Manager role (fb_manager).
--
-- Brittany runs Buckleys. She gets everything Buckleys and nothing
-- course-wide:
--   * the schedule (all schedule commands and reads), which the app opens
--     on the Buckleys area for her
--   * her own purchase requests (create, change, delete the ones she made)
--   * the Food and Beverage staff: personnel details, records, documents,
--     1:1s, follow-ups, evaluations, SF-52s. She cannot change any
--     role, department, supervisor, or login email.
-- Revenue, restaurant purchases and inventory, order list, vendors, and
-- created documents are already open to signed-in staff.
--
-- Schedule commands and update_staff_profile are patched from their LIVE
-- definitions (pg_get_functiondef), so this never overwrites a function with
-- an older copy from the repo. If an expected piece of text is missing the
-- whole migration stops and nothing changes.
-- Idempotent. Safe to run again.
-- ============================================================================

-- ── 1. Allow the role ───────────────────────────────────────────────────────
-- NOT VALID keeps existing rows as they are and checks new writes.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super', 'asst_super', 'director', 'gm', 'foreman', 'mechanic',
    'crew', 'seasonal', 'pro', 'fb_manager'
  )) NOT VALID;

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE public.invites
  ADD CONSTRAINT invites_role_check
  CHECK (role IN (
    'asst_super', 'foreman', 'mechanic', 'crew', 'seasonal', 'director',
    'gm', 'pro', 'fb_manager'
  )) NOT VALID;

-- ── 2. Helper checks ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_fb_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'fb_manager'
      AND is_active = TRUE
  );
$function$;

-- An employee in the Food and Beverage department, other than herself.
CREATE OR REPLACE FUNCTION public.fb_manages_employee(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p_employee_id IS NOT NULL
    AND p_employee_id IS DISTINCT FROM auth.uid()
    AND public.is_fb_manager()
    AND EXISTS (
      SELECT 1 FROM public.profiles e
      WHERE e.id = p_employee_id
        AND e.department = 'food_and_beverage'
    );
$function$;

-- Who may run the schedule: managers and the F&B Manager.
CREATE OR REPLACE FUNCTION public.is_schedule_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.is_manager() OR public.is_fb_manager();
$function$;

-- A storage path that starts with an employee id, read safely.
CREATE OR REPLACE FUNCTION public.uuid_or_null(p_text TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN p_text::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_fb_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fb_manages_employee(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_schedule_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_fb_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fb_manages_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_schedule_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.uuid_or_null(TEXT) TO authenticated;

-- ── 3. Patch live functions ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.patch_function(
  p_name TEXT,
  p_find TEXT,
  p_replace TEXT,
  p_done_marker TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $patch$
DECLARE
  r RECORD;
  v_def TEXT;
  v_new TEXT;
  v_found BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = p_name
  LOOP
    v_found := TRUE;
    v_def := pg_get_functiondef(r.oid);
    IF position(p_done_marker IN v_def) > 0 THEN
      CONTINUE; -- already patched
    END IF;
    v_new := regexp_replace(v_def, p_find, p_replace, 'g');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'fb_manager migration: expected text not found in %', p_name;
    END IF;
    EXECUTE v_new;
  END LOOP;
  IF NOT v_found THEN
    RAISE EXCEPTION 'fb_manager migration: function % does not exist', p_name;
  END IF;
END;
$patch$;

-- The schedule commands: is_manager() becomes is_schedule_manager().
SELECT pg_temp.patch_function(fn, '(public\.)?is_manager\(\)', 'public.is_schedule_manager()', 'is_schedule_manager()')
FROM unnest(ARRAY[
  'save_pro_shop_staff',
  'save_pro_shop_shift',
  'retire_pro_shop_shift',
  'retire_pro_shop_time_off',
  'save_pro_shop_schedule',
  'publish_pro_shop_schedule',
  'replace_pro_shop_schedule_shifts',
  'save_pro_shop_schedule_settings',
  'save_pro_shop_coverage_rule',
  'save_pro_shop_week_template',
  'delete_pro_shop_week_template'
]) AS fn;

-- Managing an employee (1:1s, follow-ups, engagement, evaluations) and
-- scheduling them: add the F&B Manager for Food and Beverage staff.
SELECT pg_temp.patch_function(
  'can_manage_staff_member',
  '(public\.)?is_manager\(\)',
  'public.is_manager() OR public.fb_manages_employee(p_employee_id)',
  'fb_manages_employee'
);
SELECT pg_temp.patch_function(
  'can_manage_schedule_for',
  '(public\.)?is_manager\(\)',
  'public.is_manager() OR public.fb_manages_employee(p_employee_id)',
  'fb_manages_employee'
);

-- Editing a staff profile: the F&B Manager, for her staff, without touching
-- role, department, role group, supervisor, or login email.
SELECT pg_temp.patch_function(
  'update_staff_profile',
  'IF NOT (public\.)?is_manager\(\) THEN',
  'IF NOT (public.is_manager() OR (public.fb_manages_employee(p_employee_id) AND NOT (COALESCE(p_directory, ''{}''::JSONB) ?| ARRAY[''role'', ''department'', ''role_group'', ''supervisor_id'', ''email'']))) THEN',
  'fb_manages_employee'
);

-- ── 4. Read and write rules ─────────────────────────────────────────────────

-- Her staff profiles, including people who have left.
DROP POLICY IF EXISTS profiles_fb_manager_read ON public.profiles;
CREATE POLICY profiles_fb_manager_read ON public.profiles
  FOR SELECT TO authenticated USING (public.fb_manages_employee(id));

-- Personnel details (SF-52, evaluations, hire dates).
DROP POLICY IF EXISTS personnel_fb_manager_read ON public.staff_personnel_private;
CREATE POLICY personnel_fb_manager_read ON public.staff_personnel_private
  FOR SELECT TO authenticated USING (public.fb_manages_employee(employee_id));

-- Private staff records (call-outs, sick time, disciplinary).
DROP POLICY IF EXISTS staff_records_fb_manager_read ON public.staff_records;
CREATE POLICY staff_records_fb_manager_read ON public.staff_records
  FOR SELECT TO authenticated USING (public.fb_manages_employee(employee_id));
DROP POLICY IF EXISTS staff_records_fb_manager_insert ON public.staff_records;
CREATE POLICY staff_records_fb_manager_insert ON public.staff_records
  FOR INSERT TO authenticated WITH CHECK (public.fb_manages_employee(employee_id));
DROP POLICY IF EXISTS staff_records_fb_manager_update ON public.staff_records;
CREATE POLICY staff_records_fb_manager_update ON public.staff_records
  FOR UPDATE TO authenticated
  USING (public.fb_manages_employee(employee_id))
  WITH CHECK (public.fb_manages_employee(employee_id));

-- Staff documents (filed evaluations, uploads) and their files.
DROP POLICY IF EXISTS staff_documents_fb_manager_read ON public.staff_documents;
CREATE POLICY staff_documents_fb_manager_read ON public.staff_documents
  FOR SELECT TO authenticated USING (public.fb_manages_employee(employee_id));
DROP POLICY IF EXISTS staff_documents_fb_manager_insert ON public.staff_documents;
CREATE POLICY staff_documents_fb_manager_insert ON public.staff_documents
  FOR INSERT TO authenticated WITH CHECK (public.fb_manages_employee(employee_id));
DROP POLICY IF EXISTS staff_documents_fb_manager_delete ON public.staff_documents;
CREATE POLICY staff_documents_fb_manager_delete ON public.staff_documents
  FOR DELETE TO authenticated USING (public.fb_manages_employee(employee_id));

DROP POLICY IF EXISTS staff_docs_fb_manager_select ON storage.objects;
CREATE POLICY staff_docs_fb_manager_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-documents' AND public.fb_manages_employee(public.uuid_or_null(split_part(name, '/', 1))));
DROP POLICY IF EXISTS staff_docs_fb_manager_insert ON storage.objects;
CREATE POLICY staff_docs_fb_manager_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-documents' AND public.fb_manages_employee(public.uuid_or_null(split_part(name, '/', 1))));
DROP POLICY IF EXISTS staff_docs_fb_manager_delete ON storage.objects;
CREATE POLICY staff_docs_fb_manager_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'staff-documents' AND public.fb_manages_employee(public.uuid_or_null(split_part(name, '/', 1))));

-- The schedule tables.
DROP POLICY IF EXISTS pro_shop_staff_schedule_manager_read ON public.pro_shop_staff;
CREATE POLICY pro_shop_staff_schedule_manager_read ON public.pro_shop_staff
  FOR SELECT TO authenticated USING (public.is_schedule_manager());
DROP POLICY IF EXISTS pro_shop_schedules_schedule_manager_read ON public.pro_shop_schedules;
CREATE POLICY pro_shop_schedules_schedule_manager_read ON public.pro_shop_schedules
  FOR SELECT TO authenticated USING (public.is_schedule_manager());
DROP POLICY IF EXISTS pro_shop_shifts_schedule_manager_read ON public.pro_shop_shifts;
CREATE POLICY pro_shop_shifts_schedule_manager_read ON public.pro_shop_shifts
  FOR SELECT TO authenticated USING (public.is_schedule_manager());
DROP POLICY IF EXISTS pro_shop_time_off_schedule_manager_read ON public.pro_shop_time_off;
CREATE POLICY pro_shop_time_off_schedule_manager_read ON public.pro_shop_time_off
  FOR SELECT TO authenticated USING (public.is_schedule_manager());
DROP POLICY IF EXISTS pro_shop_week_templates_schedule_manager_read ON public.pro_shop_week_templates;
CREATE POLICY pro_shop_week_templates_schedule_manager_read ON public.pro_shop_week_templates
  FOR SELECT TO authenticated USING (public.is_schedule_manager());

-- Purchase requests: her own.
DROP POLICY IF EXISTS purchase_requests_fb_manager_insert ON public.purchase_requests;
CREATE POLICY purchase_requests_fb_manager_insert ON public.purchase_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_fb_manager() AND created_by = auth.uid());
DROP POLICY IF EXISTS purchase_requests_fb_manager_update ON public.purchase_requests;
CREATE POLICY purchase_requests_fb_manager_update ON public.purchase_requests
  FOR UPDATE TO authenticated
  USING (public.is_fb_manager() AND created_by = auth.uid())
  WITH CHECK (public.is_fb_manager() AND created_by = auth.uid());
DROP POLICY IF EXISTS purchase_requests_fb_manager_delete ON public.purchase_requests;
CREATE POLICY purchase_requests_fb_manager_delete ON public.purchase_requests
  FOR DELETE TO authenticated
  USING (public.is_fb_manager() AND created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
