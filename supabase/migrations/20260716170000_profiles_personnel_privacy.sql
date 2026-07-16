-- Split private personnel facts from the authenticated operational directory.
--
-- The profiles table is joined throughout tasks, schedules, messages, and
-- reports, so it must remain a dependable directory. It must not also expose
-- hire dates, emergency contacts, legacy certification/license JSON, or SF-52
-- employment/pay details to every authenticated account. This migration copies
-- those exact values into a restricted one-to-one table, verifies the copy,
-- then removes the sensitive columns from profiles without CASCADE.

BEGIN;

CREATE TABLE public.staff_personnel_private (
  employee_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hire_date DATE,
  certifications JSONB DEFAULT '[]'::JSONB,
  emergency_contact JSONB,
  personnel_details JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_personnel_private_certifications_array CHECK (
    certifications IS NULL OR JSONB_TYPEOF(certifications) = 'array'
  ),
  CONSTRAINT staff_personnel_private_emergency_object CHECK (
    emergency_contact IS NULL OR JSONB_TYPEOF(emergency_contact) = 'object'
  ),
  CONSTRAINT staff_personnel_private_details_object CHECK (
    personnel_details IS NULL OR JSONB_TYPEOF(personnel_details) = 'object'
  )
);

COMMENT ON TABLE public.staff_personnel_private IS
  'Restricted one-to-one personnel facts separated from the operational staff directory. Employees may read their own row; active application managers may read and maintain all rows.';

-- Preserve every profile, including profiles whose private values are all
-- empty. The one-to-one row is therefore an invariant for existing and future
-- employees, and callers never need to fabricate a replacement record.
INSERT INTO public.staff_personnel_private (
  employee_id,
  hire_date,
  certifications,
  emergency_contact,
  personnel_details
)
SELECT
  id,
  hire_date,
  certifications,
  emergency_contact,
  personnel_details
FROM public.profiles;

-- Refuse to drop the source columns unless every value survived exactly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.staff_personnel_private s ON s.employee_id = p.id
    WHERE s.employee_id IS NULL
       OR s.hire_date IS DISTINCT FROM p.hire_date
       OR s.certifications IS DISTINCT FROM p.certifications
       OR s.emergency_contact IS DISTINCT FROM p.emergency_contact
       OR s.personnel_details IS DISTINCT FROM p.personnel_details
  ) THEN
    RAISE EXCEPTION 'Personnel privacy migration refused: copied values did not match profiles';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.attribute_staff_personnel_private()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Private personnel history cannot be moved to another employee';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(v_actor, NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_by := COALESCE(v_actor, NEW.updated_by);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_attribute_staff_personnel_private
  ON public.staff_personnel_private;
CREATE TRIGGER trg_attribute_staff_personnel_private
  BEFORE INSERT OR UPDATE ON public.staff_personnel_private
  FOR EACH ROW EXECUTE FUNCTION public.attribute_staff_personnel_private();

-- A profile created by the trusted auth/provisioning path receives its empty
-- private companion row automatically. Existing values above were copied
-- before this trigger exists, so no source value can be overwritten.
CREATE OR REPLACE FUNCTION public.create_staff_personnel_private_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  INSERT INTO public.staff_personnel_private (employee_id)
  VALUES (NEW.id)
  ON CONFLICT (employee_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_create_staff_personnel_private_row ON public.profiles;
CREATE TRIGGER trg_create_staff_personnel_private_row
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_staff_personnel_private_row();

ALTER TABLE public.staff_personnel_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view their own private personnel row"
  ON public.staff_personnel_private FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
CREATE POLICY "Managers view private personnel rows"
  ON public.staff_personnel_private FOR SELECT TO authenticated
  USING (public.is_manager());
CREATE POLICY "Managers create private personnel rows"
  ON public.staff_personnel_private FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());
CREATE POLICY "Managers update private personnel rows"
  ON public.staff_personnel_private FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

REVOKE ALL ON public.staff_personnel_private FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_personnel_private TO authenticated;

-- Drop without CASCADE. Any forgotten schema dependency must stop deployment
-- rather than being silently removed.
ALTER TABLE public.profiles
  DROP COLUMN hire_date,
  DROP COLUMN certifications,
  DROP COLUMN emergency_contact,
  DROP COLUMN personnel_details;

-- Ordinary users may edit presentation/contact preferences on their own row,
-- but RLS alone cannot prevent a crafted PATCH from changing role, department,
-- supervisor, activation, or identity fields. Enforce that boundary in a
-- trigger while retaining manager and trusted service/database operations.
CREATE OR REPLACE FUNCTION public.protect_profile_authority_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_manager() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.role_group IS DISTINCT FROM OLD.role_group
     OR NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only an active manager may change profile authority fields';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_profile_authority_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_authority_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority_fields();

-- Reset profiles policies so an authenticated account cannot create an
-- arbitrary self-promoted profile through the legacy self-insert branch.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.profiles', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY profiles_authenticated_directory_read
  ON public.profiles FOR SELECT TO authenticated
  USING (is_active = TRUE OR id = auth.uid() OR public.is_manager());
CREATE POLICY profiles_update_own_safe_fields
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_manager
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());
CREATE POLICY profiles_insert_manager
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());

REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- One atomic manager command updates directory and private fields together.
-- Callers cannot smuggle arbitrary profile columns through a generic PATCH.
CREATE OR REPLACE FUNCTION public.update_staff_profile(
  p_employee_id UUID,
  p_directory JSONB DEFAULT '{}'::JSONB,
  p_personnel JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_key TEXT;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Manager access required';
  END IF;
  IF JSONB_TYPEOF(COALESCE(p_directory, '{}'::JSONB)) <> 'object'
     OR JSONB_TYPEOF(COALESCE(p_personnel, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Profile update payloads must be JSON objects';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'Staff profile was not found';
  END IF;

  FOR v_key IN SELECT JSONB_OBJECT_KEYS(COALESCE(p_directory, '{}'::JSONB)) LOOP
    IF v_key <> ALL (ARRAY[
      'full_name', 'display_name', 'email', 'phone', 'role', 'department',
      'role_group', 'is_active', 'supervisor_id'
    ]) THEN
      RAISE EXCEPTION 'Unsupported staff directory field: %', v_key;
    END IF;
  END LOOP;
  FOR v_key IN SELECT JSONB_OBJECT_KEYS(COALESCE(p_personnel, '{}'::JSONB)) LOOP
    IF v_key <> ALL (ARRAY[
      'hire_date', 'certifications', 'emergency_contact', 'personnel_details'
    ]) THEN
      RAISE EXCEPTION 'Unsupported private personnel field: %', v_key;
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET
    full_name = CASE WHEN p_directory ? 'full_name' THEN p_directory->>'full_name' ELSE full_name END,
    display_name = CASE WHEN p_directory ? 'display_name' THEN p_directory->>'display_name' ELSE display_name END,
    email = CASE WHEN p_directory ? 'email' THEN p_directory->>'email' ELSE email END,
    phone = CASE WHEN p_directory ? 'phone' THEN p_directory->>'phone' ELSE phone END,
    role = CASE WHEN p_directory ? 'role' THEN p_directory->>'role' ELSE role END,
    department = CASE WHEN p_directory ? 'department' THEN p_directory->>'department' ELSE department END,
    role_group = CASE WHEN p_directory ? 'role_group' THEN p_directory->>'role_group' ELSE role_group END,
    is_active = CASE WHEN p_directory ? 'is_active' THEN (p_directory->>'is_active')::BOOLEAN ELSE is_active END,
    supervisor_id = CASE
      WHEN p_directory ? 'supervisor_id' THEN NULLIF(p_directory->>'supervisor_id', '')::UUID
      ELSE supervisor_id
    END
  WHERE id = p_employee_id;

  INSERT INTO public.staff_personnel_private (employee_id)
  VALUES (p_employee_id)
  ON CONFLICT (employee_id) DO NOTHING;

  UPDATE public.staff_personnel_private
  SET
    hire_date = CASE
      WHEN p_personnel ? 'hire_date' THEN NULLIF(p_personnel->>'hire_date', '')::DATE
      ELSE hire_date
    END,
    certifications = CASE
      WHEN p_personnel ? 'certifications'
        THEN NULLIF(p_personnel->'certifications', 'null'::JSONB)
      ELSE certifications
    END,
    emergency_contact = CASE
      WHEN p_personnel ? 'emergency_contact'
        THEN NULLIF(p_personnel->'emergency_contact', 'null'::JSONB)
      ELSE emergency_contact
    END,
    personnel_details = CASE
      WHEN p_personnel ? 'personnel_details'
        THEN NULLIF(p_personnel->'personnel_details', 'null'::JSONB)
      ELSE personnel_details
    END
  WHERE employee_id = p_employee_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_staff_profile(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_profile(UUID, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION public.update_staff_profile(UUID, JSONB, JSONB) IS
  'Atomic manager-only command for allowlisted staff-directory and private-personnel updates.';

-- Stable, deliberately narrow contract for staff pickers, task assignment,
-- schedule rosters, and other non-HR consumers. security_invoker keeps the
-- authenticated-only profiles row policy authoritative.
CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = TRUE, security_barrier = TRUE)
AS
SELECT
  id,
  full_name,
  display_name,
  role,
  department,
  role_group,
  phone,
  avatar_url,
  is_active,
  supervisor_id
FROM public.profiles;

REVOKE ALL ON public.staff_directory FROM PUBLIC, anon;
GRANT SELECT ON public.staff_directory TO authenticated;

COMMENT ON VIEW public.staff_directory IS
  'Safe operational staff-directory contract. Private personnel facts are available only from staff_personnel_private under its own RLS.';

COMMENT ON TABLE public.profiles IS
  'Authenticated operational identity and directory record. Private personnel facts are stored in staff_personnel_private.';

NOTIFY pgrst, 'reload schema';

COMMIT;
