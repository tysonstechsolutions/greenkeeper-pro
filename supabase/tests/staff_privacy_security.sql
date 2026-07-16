\set ON_ERROR_STOP on

-- Disposable-local RLS matrix for 20260716150000. All people and records are
-- synthetic, and the transaction always rolls back.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES
  (NULL, 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'staff-privacy-manager@example.test', '{}', '{"full_name":"Staff Privacy Manager","role":"gm"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'staff-privacy-supervisor@example.test', '{}', '{"full_name":"Staff Privacy Supervisor","role":"foreman"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'staff-privacy-employee@example.test', '{}', '{"full_name":"Staff Privacy Employee","role":"crew"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'staff-privacy-unrelated@example.test', '{}', '{"full_name":"Staff Privacy Unrelated","role":"crew"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'a1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'staff-privacy-other-employee@example.test', '{}', '{"full_name":"Staff Privacy Other Employee","role":"crew"}', NOW(), NOW(), FALSE, FALSE);

UPDATE public.profiles
SET is_active = TRUE,
    role = CASE id
      WHEN 'a1000000-0000-0000-0000-000000000001' THEN 'gm'
      WHEN 'a1000000-0000-0000-0000-000000000002' THEN 'foreman'
      ELSE 'crew'
    END,
    supervisor_id = CASE id
      WHEN 'a1000000-0000-0000-0000-000000000003' THEN 'a1000000-0000-0000-0000-000000000002'::UUID
      ELSE NULL::UUID
    END
WHERE id::TEXT LIKE 'a1000000-0000-0000-0000-00000000000%';

-- Manager creates the fixture while attempting to spoof every actor. The
-- trigger must replace the caller-supplied IDs with auth.uid().
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', TRUE);

INSERT INTO public.staff_one_on_ones (
  id, employee_id, scheduled_on, status, notes, created_by, updated_by
) VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-07-20', 'scheduled', 'Synthetic scheduling note',
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004'
);

INSERT INTO public.staff_concerns (
  id, employee_id, title, updates, created_by, updated_by
) VALUES (
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  'Synthetic private follow-up', '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004'
);

INSERT INTO public.staff_one_on_one_sessions (
  id, employee_id, session_date, template, status, questions, summary,
  created_by, updated_by
) VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-07-16', 'monthly', 'completed', '[]'::jsonb,
  'Synthetic private session',
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004'
);

INSERT INTO public.staff_engagement_profiles (
  employee_id, profile, created_by, updated_by
) VALUES (
  'a1000000-0000-0000-0000-000000000003',
  '{"interests":["synthetic"]}'::jsonb,
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004'
);

INSERT INTO public.staff_records (
  id, employee_id, type, event_date, title, created_by, updated_by
) VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  'note', '2026-07-16', 'Synthetic private HR record',
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000004'
);

INSERT INTO public.staff_documents (
  id, employee_id, name, category, storage_path, uploaded_by
) VALUES (
  'a6000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  'Synthetic private document', 'other',
  'a1000000-0000-0000-0000-000000000003/synthetic.txt',
  'a1000000-0000-0000-0000-000000000004'
);

INSERT INTO storage.objects (bucket_id, name)
VALUES (
  'staff-documents',
  'a1000000-0000-0000-0000-000000000003/synthetic.txt'
);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.staff_one_on_ones
  WHERE id = 'a2000000-0000-0000-0000-000000000001'
    AND created_by = 'a1000000-0000-0000-0000-000000000001'
    AND updated_by = 'a1000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Scheduled 1:1 actors were spoofable'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.staff_concerns
  WHERE id = 'a3000000-0000-0000-0000-000000000001'
    AND created_by = 'a1000000-0000-0000-0000-000000000001'
    AND updated_by = 'a1000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Concern actors were spoofable'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.staff_one_on_one_sessions
  WHERE id = 'a4000000-0000-0000-0000-000000000001'
    AND created_by = 'a1000000-0000-0000-0000-000000000001'
    AND updated_by = 'a1000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Session actors were spoofable'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.staff_records
  WHERE id = 'a5000000-0000-0000-0000-000000000001'
    AND created_by = 'a1000000-0000-0000-0000-000000000001'
    AND updated_by = 'a1000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'HR record actors were spoofable'; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.staff_documents
  WHERE id = 'a6000000-0000-0000-0000-000000000001'
    AND uploaded_by = 'a1000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Document upload actor was spoofable'; END IF;
END $$;
RESET ROLE;

-- The employee, an unrelated employee, and any other authenticated account
-- cannot read or write these private rows simply because they are signed in.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_one_on_ones;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private 1:1 scheduling notes'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_concerns;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private concerns'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_one_on_one_sessions;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private session answers'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_engagement_profiles;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private engagement facts'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_records;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private HR records'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_documents;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private document metadata'; END IF;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'staff-documents';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Employee read private document objects'; END IF;

  BEGIN
    INSERT INTO public.staff_concerns (employee_id, title)
    VALUES ('a1000000-0000-0000-0000-000000000003', 'Unauthorized self-write');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Employee wrote a private concern'; END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000004', TRUE);
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_one_on_one_sessions;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated employee read a private session'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_records;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated employee read a private HR record'; END IF;
END $$;
RESET ROLE;

-- The recorded direct supervisor can run 1:1s for that employee, but cannot
-- read HR/pay records, document metadata, or storage objects.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_created UUID;
  v_created_by UUID;
  v_updated_by UUID;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_one_on_ones;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Direct supervisor could not view scheduled 1:1'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_concerns;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Direct supervisor could not view concerns'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_one_on_one_sessions;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Direct supervisor could not view sessions'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_engagement_profiles;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Direct supervisor could not view engagement profile'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_records;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Direct supervisor read manager-only HR records'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_documents;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Direct supervisor read manager-only document metadata'; END IF;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'staff-documents';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Direct supervisor read manager-only document object'; END IF;

  INSERT INTO public.staff_concerns (employee_id, title, created_by, updated_by)
  VALUES (
    'a1000000-0000-0000-0000-000000000003',
    'Supervisor-created synthetic follow-up',
    'a1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000004'
  ) RETURNING id, created_by INTO v_created, v_created_by;
  IF v_created_by <> 'a1000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'Direct supervisor insert actor was not server-attributed';
  END IF;

  UPDATE public.staff_concerns
  SET title = 'Supervisor-updated synthetic follow-up',
      updated_by = 'a1000000-0000-0000-0000-000000000004'
  WHERE id = v_created
  RETURNING updated_by INTO v_updated_by;
  IF v_updated_by <> 'a1000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'Direct supervisor update actor was not server-attributed';
  END IF;

  BEGIN
    INSERT INTO public.staff_concerns (employee_id, title)
    VALUES (
      'a1000000-0000-0000-0000-000000000005',
      'Unauthorized other-employee follow-up'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Supervisor managed a non-report'; END IF;
END $$;
RESET ROLE;

-- Manager can read every protected domain, but grants still prevent direct
-- deletion of durable staff history.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.staff_one_on_one_sessions;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Manager could not read private sessions'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_records;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Manager could not read private HR records'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.staff_documents;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Manager could not read document metadata'; END IF;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'staff-documents';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Manager could not read document object'; END IF;

  BEGIN
    DELETE FROM public.staff_records
    WHERE id = 'a5000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Manager directly deleted staff history'; END IF;
END $$;
RESET ROLE;

-- Trigger defense also protects completed/history rows from a table-owner path.
DO $$
DECLARE
  v_blocked BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.staff_one_on_one_sessions
    SET summary = 'Table-owner rewrite attempt'
    WHERE id = 'a4000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Completed one-on-one sessions are immutable' THEN
      v_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Completed session was rewritten'; END IF;

  v_blocked := FALSE;
  BEGIN
    DELETE FROM public.staff_concerns
    WHERE id = 'a3000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Private staff history cannot be deleted%' THEN
      v_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Concern history was deleted'; END IF;
END $$;

ROLLBACK;

SELECT 'PASS private staff and one-on-one RLS matrix';
