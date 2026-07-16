\set ON_ERROR_STOP on

-- Disposable-local matrix for 20260716170000. All people and values are
-- synthetic, and the transaction always rolls back.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES
  (NULL, 'b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'personnel-manager@example.test', '{}', '{"full_name":"Personnel Manager","role":"gm"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'personnel-supervisor@example.test', '{}', '{"full_name":"Personnel Supervisor","role":"foreman"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'b1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'personnel-employee@example.test', '{}', '{"full_name":"Personnel Employee","role":"crew"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'b1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'personnel-unrelated@example.test', '{}', '{"full_name":"Personnel Unrelated","role":"crew"}', NOW(), NOW(), FALSE, FALSE);

UPDATE public.profiles
SET is_active = TRUE,
    role = CASE id
      WHEN 'b1000000-0000-0000-0000-000000000001' THEN 'gm'
      WHEN 'b1000000-0000-0000-0000-000000000002' THEN 'foreman'
      ELSE 'crew'
    END,
    department = 'maintenance',
    supervisor_id = CASE
      WHEN id = 'b1000000-0000-0000-0000-000000000003'
        THEN 'b1000000-0000-0000-0000-000000000002'::UUID
      ELSE NULL
    END
WHERE id::TEXT LIKE 'b1000000-0000-0000-0000-00000000000%';

UPDATE public.staff_personnel_private
SET hire_date = '2026-01-15',
    certifications = '[{"name":"Synthetic License","issued_date":"2026-01-01","expiry_date":"2027-01-01","license_number":"SYN-001"}]'::JSONB,
    emergency_contact = '{"name":"Synthetic Contact","phone":"555-0100","relationship":"test"}'::JSONB,
    personnel_details = '{"position_title":"Synthetic Position","hourly_rate":"1.00"}'::JSONB
WHERE employee_id = 'b1000000-0000-0000-0000-000000000003';

-- The directory schema itself no longer contains the four private fields, and
-- the narrow view cannot accidentally project them.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name IN ('hire_date','certifications','emergency_contact','personnel_details');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Private personnel columns remain on profiles'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'staff_directory'
    AND column_name IN ('email','hire_date','certifications','emergency_contact','personnel_details');
  IF v_count <> 0 THEN RAISE EXCEPTION 'Safe staff directory exposes a private field'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.staff_personnel_private
  WHERE employee_id::TEXT LIKE 'b1000000-0000-0000-0000-00000000000%';
  IF v_count <> 4 THEN RAISE EXCEPTION 'Profile insert trigger did not create one private row per profile'; END IF;
END $$;

-- An employee sees their own private row and the safe active directory, but
-- cannot see or modify another employee's private facts or self-promote.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_rows INTEGER;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_directory
  WHERE id::TEXT LIKE 'b1000000-0000-0000-0000-00000000000%';
  IF v_count <> 4 THEN RAISE EXCEPTION 'Employee could not read the safe active directory'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.staff_personnel_private;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Employee private-row visibility was not self-only'; END IF;

  UPDATE public.staff_personnel_private
  SET hire_date = '2020-01-01'
  WHERE employee_id = 'b1000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'Employee updated manager-owned private personnel facts'; END IF;

  UPDATE public.profiles
  SET display_name = 'Employee Safe Edit', phone = '555-0199'
  WHERE id = 'b1000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Employee could not update safe self-service fields'; END IF;

  BEGIN
    UPDATE public.profiles
    SET role = 'gm'
    WHERE id = 'b1000000-0000-0000-0000-000000000003';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Only an active manager may change profile authority fields' THEN
      v_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Employee self-promoted through profiles'; END IF;

  v_blocked := FALSE;
  BEGIN
    PERFORM public.update_staff_profile(
      'b1000000-0000-0000-0000-000000000003',
      '{"role":"gm"}'::JSONB,
      '{}'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Manager access required' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Employee called the manager profile command'; END IF;
END $$;
RESET ROLE;

-- A recorded direct supervisor has no implied access to emergency, pay, or
-- legacy license data. They see only their own row.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', TRUE);
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_personnel_private;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Direct supervisor read subordinate private personnel facts'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_personnel_private
  WHERE employee_id = 'b1000000-0000-0000-0000-000000000003';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Direct supervisor read employee emergency/pay data'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', TRUE);
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_personnel_private;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Unrelated employee private-row visibility was not self-only'; END IF;
END $$;
RESET ROLE;

-- Manager sees all rows and uses the allowlisted atomic command. Actor fields
-- are database-derived, and unsupported keys are refused.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_actor UUID;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_personnel_private
  WHERE employee_id::TEXT LIKE 'b1000000-0000-0000-0000-00000000000%';
  IF v_count <> 4 THEN RAISE EXCEPTION 'Manager could not read all synthetic private rows'; END IF;

  PERFORM public.update_staff_profile(
    'b1000000-0000-0000-0000-000000000003',
    '{"display_name":"Manager Updated","department":"maintenance"}'::JSONB,
    '{"hire_date":"2026-02-01","personnel_details":{"position_title":"Updated Synthetic Position"}}'::JSONB
  );

  SELECT updated_by INTO v_actor
  FROM public.staff_personnel_private
  WHERE employee_id = 'b1000000-0000-0000-0000-000000000003';
  IF v_actor <> 'b1000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'Private personnel update actor was not database-derived';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = 'b1000000-0000-0000-0000-000000000003'
      AND display_name = 'Manager Updated'
  ) THEN RAISE EXCEPTION 'Atomic command did not update the directory row'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_personnel_private
    WHERE employee_id = 'b1000000-0000-0000-0000-000000000003'
      AND hire_date = '2026-02-01'
      AND personnel_details->>'position_title' = 'Updated Synthetic Position'
  ) THEN RAISE EXCEPTION 'Atomic command did not update the private row'; END IF;

  BEGIN
    PERFORM public.update_staff_profile(
      'b1000000-0000-0000-0000-000000000003',
      '{"created_at":"2000-01-01"}'::JSONB,
      '{}'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Unsupported staff directory field:%' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Manager command accepted a non-allowlisted field'; END IF;
END $$;
RESET ROLE;

ROLLBACK;

SELECT 'PASS personnel privacy, directory compatibility, and profile authority matrix';
