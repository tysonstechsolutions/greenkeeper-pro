\set ON_ERROR_STOP on

-- Disposable-local role, actor, history, idempotency, storage, audit, and
-- outbox matrix for 20260720120000. Every synthetic row rolls back.
BEGIN;

INSERT INTO auth.users (
  instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at,is_sso_user,is_anonymous
) VALUES
  (NULL,'b1000000-0000-0000-0000-000000000001','authenticated','authenticated','workforce-manager@example.test','{}','{"full_name":"Workforce Manager","role":"gm"}',NOW(),NOW(),FALSE,FALSE),
  (NULL,'b1000000-0000-0000-0000-000000000002','authenticated','authenticated','workforce-supervisor@example.test','{}','{"full_name":"Workforce Supervisor","role":"foreman"}',NOW(),NOW(),FALSE,FALSE),
  (NULL,'b1000000-0000-0000-0000-000000000003','authenticated','authenticated','workforce-employee@example.test','{}','{"full_name":"Workforce Employee","role":"crew"}',NOW(),NOW(),FALSE,FALSE),
  (NULL,'b1000000-0000-0000-0000-000000000004','authenticated','authenticated','workforce-unrelated@example.test','{}','{"full_name":"Workforce Unrelated","role":"crew"}',NOW(),NOW(),FALSE,FALSE),
  (NULL,'b1000000-0000-0000-0000-000000000005','authenticated','authenticated','workforce-pro@example.test','{}','{"full_name":"Workforce Pro Scheduler","role":"pro"}',NOW(),NOW(),FALSE,FALSE),
  (NULL,'b1000000-0000-0000-0000-000000000006','authenticated','authenticated','workforce-proshop@example.test','{}','{"full_name":"Workforce Pro Shop Employee","role":"crew"}',NOW(),NOW(),FALSE,FALSE);

UPDATE public.profiles SET
  is_active=TRUE,
  role=CASE id
    WHEN 'b1000000-0000-0000-0000-000000000001' THEN 'gm'
    WHEN 'b1000000-0000-0000-0000-000000000002' THEN 'foreman'
    WHEN 'b1000000-0000-0000-0000-000000000005' THEN 'pro'
    ELSE 'crew'
  END,
  department=CASE
    WHEN id='b1000000-0000-0000-0000-000000000006' THEN 'pro_shop'
    ELSE department
  END,
  role_group=CASE
    WHEN id='b1000000-0000-0000-0000-000000000006' THEN 'pro_shop_staff'
    ELSE role_group
  END,
  supervisor_id=CASE id
    WHEN 'b1000000-0000-0000-0000-000000000003' THEN 'b1000000-0000-0000-0000-000000000002'::UUID
    ELSE NULL
  END
WHERE id::TEXT LIKE 'b1000000-0000-0000-0000-00000000000%';

-- Manager creates one record in each domain through the protected commands.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',TRUE);

DO $$
DECLARE
  v_event public.calendar_events;
  v_cert public.certifications;
  v_doc public.onboarding_documents;
  v_schedule public.schedules;
  v_staff public.pro_shop_staff;
  v_month public.pro_shop_schedules;
  v_count INTEGER;
  v_blocked BOOLEAN:=FALSE;
BEGIN
  v_event:=public.save_calendar_event(NULL,jsonb_build_object(
    'title','Synthetic workforce event','category','meeting','event_date','2026-08-01',
    'created_by','b1000000-0000-0000-0000-000000000004'
  ),'Synthetic manager event');
  RAISE EXCEPTION 'Forbidden actor field was accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Field created_by is not client-writable%' THEN RAISE; END IF;
END $$;

SELECT public.save_calendar_event(NULL,jsonb_build_object(
  'title','Synthetic workforce event','category','meeting','event_date','2026-08-01','all_day',TRUE
),'Synthetic manager event');

SELECT public.save_certification(NULL,jsonb_build_object(
  'holder','Synthetic Workforce Employee',
  'profile_id','b1000000-0000-0000-0000-000000000003',
  'cert_name','Synthetic qualification',
  'expires_date','2027-08-01',
  'document_path','b1000000-0000-0000-0000-000000000001/synthetic-cert.pdf',
  'document_bucket','certification-documents'
),'Synthetic qualification created');

SELECT public.save_certification(NULL,jsonb_build_object(
  'holder','Unlinked synthetic holder','cert_name','Unlinked synthetic qualification'
),'Synthetic unlinked qualification created');

SELECT public.save_onboarding_document(NULL,jsonb_build_object(
  'slug','synthetic-phase0b5','title','Synthetic onboarding definition','category','sop',
  'roles',jsonb_build_array('all'),'body','Synthetic only','sort_order',9999
),'Synthetic onboarding definition created');

SELECT public.upsert_staff_schedule(
  'b1000000-0000-0000-0000-000000000003','2026-08-03',
  '{"shift_start":"07:00","shift_end":"15:00","shift_type":"full","crew_assignment":"Synthetic"}'::JSONB,
  'Synthetic schedule created'
);

SELECT public.save_pro_shop_staff(NULL,jsonb_build_object(
  'full_name','Synthetic Pro Shop Staff','position','rec_aid','default_group','outside',
  'sort_order',999,'availability',jsonb_build_object('weekly',jsonb_build_object())
),'Synthetic pro-shop staff created');

DO $$
DECLARE v_staff_id UUID; v_schedule_id UUID; v_rows JSONB; v_count INTEGER;
BEGIN
  SELECT id INTO v_staff_id FROM public.pro_shop_staff WHERE full_name='Synthetic Pro Shop Staff';
  SELECT (public.save_pro_shop_schedule(NULL,jsonb_build_object(
    'month','2026-08-01','title','Synthetic August Pro Shop Schedule'
  ),'Synthetic schedule container created')).id INTO v_schedule_id;
  v_rows:=jsonb_build_array(jsonb_build_object(
    'staff_id',v_staff_id,'shift_date','2026-08-03','group','outside',
    'start_time','08:00','end_time','14:00','source','template'
  ));
  PERFORM public.replace_pro_shop_schedule_shifts(v_schedule_id,v_rows,TRUE,'Synthetic generation');
  PERFORM public.replace_pro_shop_schedule_shifts(v_schedule_id,v_rows,TRUE,'Synthetic retry');
  SELECT COUNT(*) INTO v_count FROM public.pro_shop_shifts WHERE schedule_id=v_schedule_id AND is_active;
  IF v_count<>1 THEN RAISE EXCEPTION 'Retry created duplicate active shifts'; END IF;
END $$;

INSERT INTO storage.objects(bucket_id,name)
VALUES('certification-documents','b1000000-0000-0000-0000-000000000001/synthetic-cert.pdf');

INSERT INTO storage.objects(bucket_id,name)
VALUES('certification-documents','b1000000-0000-0000-0000-000000000001/orphan-cleanup.pdf');
-- The Storage API sets this transaction-local guard before issuing its SQL
-- delete. Keeping the guard explicit exercises our DELETE policy without
-- weakening Supabase's built-in protection against ad-hoc object deletion.
SELECT set_config('storage.allow_delete_query','true',TRUE);
DELETE FROM storage.objects
WHERE bucket_id='certification-documents'
  AND name='b1000000-0000-0000-0000-000000000001/orphan-cleanup.pdf';

DO $$
DECLARE v_count INTEGER; v_blocked BOOLEAN:=FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.domain_audit_events
  WHERE actor_id='b1000000-0000-0000-0000-000000000001';
  IF v_count<8 THEN RAISE EXCEPTION 'Protected commands did not append audit events'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.operational_outbox_events
  WHERE actor_id='b1000000-0000-0000-0000-000000000001';
  IF v_count<8 THEN RAISE EXCEPTION 'Protected commands did not enqueue outbox events'; END IF;
  SELECT COUNT(*) INTO v_count FROM storage.objects
  WHERE bucket_id='certification-documents' AND name LIKE '%orphan-cleanup.pdf';
  IF v_count<>0 THEN RAISE EXCEPTION 'Manager could not clean an unlinked failed upload'; END IF;
  DELETE FROM storage.objects
  WHERE bucket_id='certification-documents'
    AND name='b1000000-0000-0000-0000-000000000001/synthetic-cert.pdf';
  SELECT COUNT(*) INTO v_count FROM storage.objects
  WHERE bucket_id='certification-documents' AND name LIKE '%synthetic-cert.pdf';
  IF v_count<>1 THEN RAISE EXCEPTION 'Linked qualification evidence was deletable'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.domain_audit_events e
    WHERE e.created_at>=transaction_timestamp()
      AND e.actor_id<>'b1000000-0000-0000-0000-000000000001'
      AND e.record_type IN ('calendar_events','certifications','onboarding_documents','schedules','pro_shop_staff','pro_shop_schedules','pro_shop_shifts')
  ) THEN RAISE EXCEPTION 'Command actor attribution was spoofable'; END IF;

  BEGIN
    UPDATE public.schedules SET notes='Direct manager rewrite' WHERE schedule_date='2026-08-03';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Manager retained direct protected-table writes'; END IF;
END $$;
RESET ROLE;

-- Employee can read their scoped qualification/schedule/file, create their own
-- calendar item and time-off request, but cannot read unlinked qualifications,
-- private pro-shop scheduling, or write protected tables directly.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000003',TRUE);
DO $$
DECLARE v_count INTEGER; v_request public.time_off_requests; v_event public.calendar_events; v_blocked BOOLEAN:=FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.certifications;
  IF v_count<>1 THEN RAISE EXCEPTION 'Employee qualification scope is incorrect'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.schedules WHERE schedule_date='2026-08-03';
  IF v_count<>1 THEN RAISE EXCEPTION 'Employee could not read own schedule'; END IF;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id='certification-documents';
  IF v_count<>1 THEN RAISE EXCEPTION 'Employee could not read own certification document'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.pro_shop_shifts;
  IF v_count<>0 THEN RAISE EXCEPTION 'Employee read private draft pro-shop shifts'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.domain_audit_events;
  IF v_count<>0 THEN RAISE EXCEPTION 'Employee read management audit stream'; END IF;

  v_event:=public.save_calendar_event(NULL,jsonb_build_object(
    'title','Employee-owned synthetic event','event_date','2026-08-02'
  ),'Employee created own event');
  IF v_event.created_by<>auth.uid() OR v_event.updated_by<>auth.uid() THEN
    RAISE EXCEPTION 'Calendar actor was not server-attributed';
  END IF;

  v_request:=public.submit_time_off_request('2026-08-10','2026-08-11','personal','Synthetic self-service request');
  IF v_request.user_id<>auth.uid() OR v_request.submitted_by<>auth.uid() OR v_request.status<>'pending' THEN
    RAISE EXCEPTION 'Time-off submit actor or state was not server-controlled';
  END IF;

  BEGIN
    INSERT INTO public.calendar_events(title,event_date) VALUES('Direct write','2026-08-09');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Employee directly inserted a calendar event'; END IF;

  v_blocked:=FALSE;
  BEGIN
    PERFORM public.upsert_staff_schedule('b1000000-0000-0000-0000-000000000005','2026-08-03','{}'::JSONB,'Unauthorized scheduling');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Not authorized to schedule this employee' THEN v_blocked:=TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Employee scheduled another employee'; END IF;
END $$;
RESET ROLE;

-- Recorded supervisor sees and manages only the direct report.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',TRUE);
DO $$
DECLARE v_count INTEGER; v_request_id UUID; v_review public.time_off_requests; v_blocked BOOLEAN:=FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.certifications;
  IF v_count<>1 THEN RAISE EXCEPTION 'Supervisor qualification scope is incorrect'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.schedules;
  IF v_count<>1 THEN RAISE EXCEPTION 'Supervisor schedule scope is incorrect'; END IF;
  SELECT id INTO v_request_id FROM public.time_off_requests
  WHERE user_id='b1000000-0000-0000-0000-000000000003' AND status='pending';
  v_review:=public.review_time_off_request(v_request_id,'approved','Synthetic supervisor approval');
  IF v_review.reviewed_by<>auth.uid() OR v_review.status<>'approved' THEN
    RAISE EXCEPTION 'Supervisor review actor/state was not server-controlled';
  END IF;
  BEGIN
    PERFORM public.create_time_off_request_for_employee(
      'b1000000-0000-0000-0000-000000000005','2026-08-12','2026-08-12','personal','approved','Unauthorized other employee'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Not authorized to create time off for this employee' THEN v_blocked:=TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Supervisor managed a non-report'; END IF;
END $$;
RESET ROLE;

-- The established pro role may schedule only the explicit pro-shop workforce
-- scope; it receives no general manager authority over maintenance employees.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000005',TRUE);
DO $$
DECLARE v_row public.schedules; v_count INTEGER; v_blocked BOOLEAN:=FALSE;
BEGIN
  v_row:=public.upsert_staff_schedule(
    'b1000000-0000-0000-0000-000000000006','2026-08-04',
    '{"shift_start":"08:00","shift_end":"16:00","shift_type":"full"}'::JSONB,
    'Synthetic scoped pro scheduling'
  );
  IF v_row.updated_by<>auth.uid() THEN RAISE EXCEPTION 'Pro scheduler actor was not attributed'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.schedules;
  IF v_count<>1 THEN RAISE EXCEPTION 'Pro scheduler read outside the scoped pro-shop workforce'; END IF;
  BEGIN
    PERFORM public.upsert_staff_schedule(
      'b1000000-0000-0000-0000-000000000003','2026-08-04','{}'::JSONB,
      'Unauthorized maintenance scheduling'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Not authorized to schedule this employee' THEN v_blocked:=TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Pro scheduler managed a non-pro-shop employee'; END IF;
END $$;
RESET ROLE;

-- Unrelated employee sees neither the qualification, schedule, request, file,
-- nor management-only pro-shop rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000004',TRUE);
DO $$
DECLARE v_count INTEGER; v_blocked BOOLEAN:=FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.certifications;
  IF v_count<>0 THEN RAISE EXCEPTION 'Unrelated employee read qualification records'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.schedules;
  IF v_count<>0 THEN RAISE EXCEPTION 'Unrelated employee read schedule records'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.time_off_requests;
  IF v_count<>0 THEN RAISE EXCEPTION 'Unrelated employee read time-off records'; END IF;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id='certification-documents';
  IF v_count<>0 THEN RAISE EXCEPTION 'Unrelated employee read qualification objects'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.pro_shop_staff;
  IF v_count<>0 THEN RAISE EXCEPTION 'Unrelated employee read pro-shop roster'; END IF;
  BEGIN
    PERFORM public.save_certification(NULL,'{"holder":"Unauthorized","cert_name":"Unauthorized"}'::JSONB,'Unauthorized');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Manager access required' THEN v_blocked:=TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unrelated employee created qualification record'; END IF;
END $$;
RESET ROLE;

-- Terminal history and audit events resist even a table-owner rewrite.
DO $$
DECLARE v_cert_id UUID; v_audit_id UUID; v_blocked BOOLEAN:=FALSE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',TRUE);
  SELECT id INTO v_cert_id FROM public.certifications WHERE holder='Unlinked synthetic holder';
  PERFORM public.retire_certification(v_cert_id,'Synthetic retirement');
  BEGIN
    UPDATE public.certifications SET notes='Owner rewrite attempt' WHERE id=v_cert_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Retired certifications are immutable' THEN v_blocked:=TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Retired qualification history was rewritten'; END IF;

  SELECT id INTO v_audit_id FROM public.domain_audit_events ORDER BY created_at LIMIT 1;
  v_blocked:=FALSE;
  BEGIN
    DELETE FROM public.domain_audit_events WHERE id=v_audit_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='domain_audit_events is append-only' THEN v_blocked:=TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Audit history was deleted'; END IF;
END $$;

ROLLBACK;

SELECT 'PASS Phase 0B.5 workforce authorization, actor, history, storage, audit, outbox, and idempotency matrix';
