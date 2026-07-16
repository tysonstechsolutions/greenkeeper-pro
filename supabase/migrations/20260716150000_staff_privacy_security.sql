-- Private people-record trust boundary.
--
-- This migration is a forward-only correction for the broad authenticated
-- policies introduced with the staff, calendar, concern, and dynamic 1:1
-- tables. It does not infer HR policy or change any employee data. It limits
-- operational 1:1 records to active managers and the employee's recorded
-- direct supervisor, limits HR/pay/document records to active managers, forces
-- actor attribution, and protects completed/history rows from deletion.

-- ---------------------------------------------------------------------------
-- Authorization helpers and actor columns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_staff_member(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p_employee_id IS NOT NULL
    AND (
      public.is_manager()
      OR EXISTS (
        SELECT 1
        FROM public.profiles actor
        JOIN public.profiles employee ON employee.id = p_employee_id
        WHERE actor.id = auth.uid()
          AND actor.is_active = TRUE
          AND employee.supervisor_id = actor.id
      )
    );
$function$;

COMMENT ON FUNCTION public.can_manage_staff_member(UUID) IS
  'True for an active application manager or the employee direct supervisor recorded on profiles.supervisor_id.';

REVOKE ALL ON FUNCTION public.can_manage_staff_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_staff_member(UUID) TO authenticated;

ALTER TABLE public.staff_one_on_ones
  ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.staff_concerns
  ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.staff_one_on_one_sessions
  ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.staff_engagement_profiles
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS updated_by UUID;

CREATE OR REPLACE FUNCTION public.attribute_private_staff_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Private staff mutations require an authenticated actor';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Private staff history cannot be moved to another employee';
  END IF;

  IF TG_TABLE_NAME = 'staff_documents' THEN
    NEW.uploaded_by := CASE WHEN TG_OP = 'INSERT' THEN v_actor ELSE OLD.uploaded_by END;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_actor;
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_by := v_actor;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.attribute_private_staff_mutation() IS
  'Database-derived created/updated actor attribution for private staff records; employee identity is immutable.';

-- Actor triggers run before the existing updated_at triggers.
DROP TRIGGER IF EXISTS trg_attribute_staff_one_on_ones ON public.staff_one_on_ones;
CREATE TRIGGER trg_attribute_staff_one_on_ones
  BEFORE INSERT OR UPDATE ON public.staff_one_on_ones
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

DROP TRIGGER IF EXISTS trg_attribute_staff_concerns ON public.staff_concerns;
CREATE TRIGGER trg_attribute_staff_concerns
  BEFORE INSERT OR UPDATE ON public.staff_concerns
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

DROP TRIGGER IF EXISTS trg_attribute_staff_one_on_one_sessions ON public.staff_one_on_one_sessions;
CREATE TRIGGER trg_attribute_staff_one_on_one_sessions
  BEFORE INSERT OR UPDATE ON public.staff_one_on_one_sessions
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

DROP TRIGGER IF EXISTS trg_attribute_staff_engagement_profiles ON public.staff_engagement_profiles;
CREATE TRIGGER trg_attribute_staff_engagement_profiles
  BEFORE INSERT OR UPDATE ON public.staff_engagement_profiles
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

DROP TRIGGER IF EXISTS trg_attribute_staff_records ON public.staff_records;
CREATE TRIGGER trg_attribute_staff_records
  BEFORE INSERT OR UPDATE ON public.staff_records
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

DROP TRIGGER IF EXISTS trg_attribute_staff_documents ON public.staff_documents;
CREATE TRIGGER trg_attribute_staff_documents
  BEFORE INSERT OR UPDATE ON public.staff_documents
  FOR EACH ROW EXECUTE FUNCTION public.attribute_private_staff_mutation();

-- ---------------------------------------------------------------------------
-- History protection
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_private_staff_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'staff_one_on_one_sessions'
     AND TG_OP = 'UPDATE'
     AND OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Completed one-on-one sessions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Private staff history cannot be deleted; use the record status instead';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_staff_one_on_ones_history ON public.staff_one_on_ones;
CREATE TRIGGER trg_protect_staff_one_on_ones_history
  BEFORE DELETE ON public.staff_one_on_ones
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_staff_history();

DROP TRIGGER IF EXISTS trg_protect_staff_concerns_history ON public.staff_concerns;
CREATE TRIGGER trg_protect_staff_concerns_history
  BEFORE DELETE ON public.staff_concerns
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_staff_history();

DROP TRIGGER IF EXISTS trg_protect_staff_one_on_one_sessions_history ON public.staff_one_on_one_sessions;
CREATE TRIGGER trg_protect_staff_one_on_one_sessions_history
  BEFORE UPDATE OR DELETE ON public.staff_one_on_one_sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_staff_history();

DROP TRIGGER IF EXISTS trg_protect_staff_engagement_profiles_history ON public.staff_engagement_profiles;
CREATE TRIGGER trg_protect_staff_engagement_profiles_history
  BEFORE DELETE ON public.staff_engagement_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_staff_history();

DROP TRIGGER IF EXISTS trg_protect_staff_records_history ON public.staff_records;
CREATE TRIGGER trg_protect_staff_records_history
  BEFORE DELETE ON public.staff_records
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_staff_history();

-- ---------------------------------------------------------------------------
-- Replace permissive table policies with least-privilege policies
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table TEXT;
  v_policy RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'staff_one_on_ones',
    'staff_concerns',
    'staff_one_on_one_sessions',
    'staff_engagement_profiles',
    'staff_records',
    'staff_documents'
  ] LOOP
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
    LOOP
      EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.staff_one_on_ones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_one_on_one_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_engagement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized supervisors view scheduled one-on-ones"
  ON public.staff_one_on_ones FOR SELECT TO authenticated
  USING (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors create scheduled one-on-ones"
  ON public.staff_one_on_ones FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors update scheduled one-on-ones"
  ON public.staff_one_on_ones FOR UPDATE TO authenticated
  USING (public.can_manage_staff_member(employee_id))
  WITH CHECK (public.can_manage_staff_member(employee_id));

CREATE POLICY "Authorized supervisors view staff concerns"
  ON public.staff_concerns FOR SELECT TO authenticated
  USING (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors create staff concerns"
  ON public.staff_concerns FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors update staff concerns"
  ON public.staff_concerns FOR UPDATE TO authenticated
  USING (public.can_manage_staff_member(employee_id))
  WITH CHECK (public.can_manage_staff_member(employee_id));

CREATE POLICY "Authorized supervisors view one-on-one sessions"
  ON public.staff_one_on_one_sessions FOR SELECT TO authenticated
  USING (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors create one-on-one sessions"
  ON public.staff_one_on_one_sessions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors update draft one-on-one sessions"
  ON public.staff_one_on_one_sessions FOR UPDATE TO authenticated
  USING (public.can_manage_staff_member(employee_id) AND status = 'draft')
  WITH CHECK (public.can_manage_staff_member(employee_id));

CREATE POLICY "Authorized supervisors view engagement profiles"
  ON public.staff_engagement_profiles FOR SELECT TO authenticated
  USING (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors create engagement profiles"
  ON public.staff_engagement_profiles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_staff_member(employee_id));
CREATE POLICY "Authorized supervisors update engagement profiles"
  ON public.staff_engagement_profiles FOR UPDATE TO authenticated
  USING (public.can_manage_staff_member(employee_id))
  WITH CHECK (public.can_manage_staff_member(employee_id));

CREATE POLICY "Managers view private staff records"
  ON public.staff_records FOR SELECT TO authenticated
  USING (public.is_manager());
CREATE POLICY "Managers create private staff records"
  ON public.staff_records FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());
CREATE POLICY "Managers update private staff records"
  ON public.staff_records FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers view private staff documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (public.is_manager());
CREATE POLICY "Managers create private staff documents"
  ON public.staff_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());
CREATE POLICY "Managers delete private staff documents"
  ON public.staff_documents FOR DELETE TO authenticated
  USING (public.is_manager());

REVOKE ALL ON public.staff_one_on_ones FROM authenticated;
REVOKE ALL ON public.staff_concerns FROM authenticated;
REVOKE ALL ON public.staff_one_on_one_sessions FROM authenticated;
REVOKE ALL ON public.staff_engagement_profiles FROM authenticated;
REVOKE ALL ON public.staff_records FROM authenticated;
REVOKE ALL ON public.staff_documents FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.staff_one_on_ones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_concerns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_one_on_one_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_engagement_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_records TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.staff_documents TO authenticated;

-- ---------------------------------------------------------------------------
-- Keep the private bucket private and limit object access to active managers.
-- Table-row privacy alone is not enough when an authenticated user knows a
-- storage path.
-- ---------------------------------------------------------------------------

UPDATE storage.buckets SET public = FALSE WHERE id = 'staff-documents';

DROP POLICY IF EXISTS staff_docs_insert ON storage.objects;
DROP POLICY IF EXISTS staff_docs_select ON storage.objects;
DROP POLICY IF EXISTS staff_docs_delete ON storage.objects;

CREATE POLICY staff_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-documents' AND public.is_manager());
CREATE POLICY staff_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-documents' AND public.is_manager());
CREATE POLICY staff_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'staff-documents' AND public.is_manager());

COMMENT ON TABLE public.staff_one_on_one_sessions IS
  'Private structured one-on-one history. Active managers and the recorded direct supervisor may access rows; completed sessions are immutable.';
COMMENT ON TABLE public.staff_records IS
  'Private HR/pay/disciplinary employee timeline. Active managers only; rows cannot be deleted.';
COMMENT ON TABLE public.staff_documents IS
  'Private employee-document metadata. Active managers only; matching storage objects are also manager-scoped.';

NOTIFY pgrst, 'reload schema';
