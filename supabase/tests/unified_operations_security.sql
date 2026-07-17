\set ON_ERROR_STOP on

-- Disposable-local production acceptance matrix for 20260716190000. Fixtures
-- are synthetic and the transaction always rolls back.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES
  (NULL, 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'operations-manager@example.test', '{}', '{"full_name":"Operations Manager","role":"gm"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'fa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'operations-employee@example.test', '{}', '{"full_name":"Operations Employee","role":"crew"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'operations-mechanic@example.test', '{}', '{"full_name":"Operations Mechanic","role":"mechanic"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'fa000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'operations-unrelated@example.test', '{}', '{"full_name":"Operations Unrelated","role":"crew"}', NOW(), NOW(), FALSE, FALSE);

UPDATE public.profiles
SET is_active = TRUE,
    department = CASE WHEN id = 'fa000000-0000-0000-0000-000000000001'
      THEN 'administration' ELSE 'maintenance' END,
    role_group = CASE
      WHEN id = 'fa000000-0000-0000-0000-000000000001' THEN 'general_manager'
      WHEN id = 'fa000000-0000-0000-0000-000000000003' THEN 'maintenance_staff'
      ELSE 'maintenance_staff' END
WHERE id::TEXT LIKE 'fa000000-0000-0000-0000-00000000000%';

INSERT INTO public.tasks (
  id, title, category, priority, status, assigned_by, due_date,
  estimated_minutes, why_it_matters, definition_of_done
) VALUES
  ('fb000000-0000-0000-0000-000000000001', 'Verified blocker task', 'safety', 'critical', 'pending', 'fa000000-0000-0000-0000-000000000001', CURRENT_DATE, 20, 'Safety dependency', 'Manager verifies completion'),
  ('fb000000-0000-0000-0000-000000000002', 'Mechanic position task', 'mechanical', 'high', 'pending', 'fa000000-0000-0000-0000-000000000001', CURRENT_DATE + 1, 45, 'Equipment availability', 'Repair documented'),
  ('fb000000-0000-0000-0000-000000000003', 'Dependent task', 'admin', 'normal', 'pending', 'fa000000-0000-0000-0000-000000000001', CURRENT_DATE + 2, 15, 'Wait for verified blocker', 'Dependency clears automatically'),
  ('fb000000-0000-0000-0000-000000000004', 'Leadership decision task', 'admin', 'high', 'pending', 'fa000000-0000-0000-0000-000000000001', CURRENT_DATE + 3, 30, 'Needs recorded approval', 'Approved outcome recorded');

INSERT INTO public.program_standard_sections(section, name, weight, sort_order)
VALUES ('98', 'Local Operations Acceptance', 0, 98)
ON CONFLICT (section) DO NOTHING;
INSERT INTO public.program_standard_subsections(subsection, section, name)
VALUES ('98.1', '98', 'Local Operations Acceptance')
ON CONFLICT (subsection) DO NOTHING;
INSERT INTO public.program_standards (
  id, code, section, subsection, title, standard_text, possible_score,
  source_type, evaluation_method, verification_required, priority, effort
) VALUES (
  'fc000000-0000-0000-0000-000000000001', '98.1.1', '98', '98.1',
  'Acceptance standard', 'Synthetic local workflow acceptance standard', 1,
  'management_defined', 'manual', TRUE, 'P1', 'Medium'
);

-- Anonymous and authenticated clients have no direct workflow-table writes.
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name LIKE 'operational_work_%'
    AND grantee IN ('PUBLIC','anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF v_count <> 0 THEN RAISE EXCEPTION 'A workflow table exposes a direct client writer'; END IF;
END $$;

-- Manager delegates to a named employee and independently to a position.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE
  v_named public.operational_work_assignments%ROWTYPE;
  v_position public.operational_work_assignments%ROWTYPE;
  v_blocked BOOLEAN := FALSE;
BEGIN
  v_named := public.delegate_operational_work(
    'task:fb000000-0000-0000-0000-000000000001',
    'fa000000-0000-0000-0000-000000000002', NULL,
    'Complete and submit for verification', CURRENT_DATE + 1,
    'Completion note', CURRENT_DATE + 2, TRUE, 'Local acceptance'
  );
  IF v_named.assigned_by <> 'fa000000-0000-0000-0000-000000000001'
     OR v_named.status <> 'awaiting_acceptance' THEN
    RAISE EXCEPTION 'Named employee delegation lost actor or status';
  END IF;

  v_position := public.delegate_operational_work(
    'task:fb000000-0000-0000-0000-000000000002',
    NULL, 'mechanic', 'Inspect the unit', CURRENT_DATE + 2,
    'Repair record', CURRENT_DATE + 3, FALSE, NULL
  );
  IF v_position.position <> 'mechanic'
     OR v_position.resolved_employee_id <> 'fa000000-0000-0000-0000-000000000003' THEN
    RAISE EXCEPTION 'Position delegation did not resolve deterministically';
  END IF;

  BEGIN
    INSERT INTO public.operational_work_events(work_key, event_type, actor_id)
    VALUES ('task:fb000000-0000-0000-0000-000000000001', 'forged',
      'fa000000-0000-0000-0000-000000000004');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Manager bypassed the audited command boundary'; END IF;
END $$;
RESET ROLE;

-- Unrelated employees cannot see or execute another employee's delegation.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', TRUE);
DO $$
DECLARE v_count INTEGER; v_blocked BOOLEAN := FALSE; v_assignment UUID;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.operational_work_assignments
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated employee read private delegation state'; END IF;

  SELECT id INTO v_assignment FROM public.operational_work_assignments
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000001';
  BEGIN
    PERFORM public.transition_operational_assignment(
      COALESCE(v_assignment, '00000000-0000-0000-0000-000000000000'), 'accepted', NULL
    );
  EXCEPTION WHEN OTHERS THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unrelated employee changed a delegation'; END IF;
END $$;
RESET ROLE;

-- Assignee accepts, starts, adds evidence, then submits. The source task and
-- assignment transition atomically; verification keeps dependents blocked.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000002', TRUE);
DO $$
DECLARE v_assignment UUID; v_task_status TEXT; v_event_actor UUID;
BEGIN
  SELECT id INTO v_assignment FROM public.operational_work_assignments
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000001';
  PERFORM public.transition_operational_assignment(v_assignment, 'accepted', 'Accepted locally');
  PERFORM public.transition_operational_assignment(v_assignment, 'in_progress', 'Work started');
  PERFORM public.record_operational_work_evidence(
    'task:fb000000-0000-0000-0000-000000000001', 'note',
    'Completion evidence', 'Synthetic local evidence reference'
  );
  SELECT actor_id INTO v_event_actor FROM public.operational_work_events
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000001'
    AND event_type = 'delegation_in_progress' ORDER BY created_at DESC LIMIT 1;
  IF v_event_actor <> 'fa000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'Assignment transition actor was not server attributed';
  END IF;
  PERFORM public.transition_operational_assignment(
    v_assignment, 'submitted_for_verification', 'Ready for manager verification'
  );
  SELECT status INTO v_task_status FROM public.tasks
  WHERE id = 'fb000000-0000-0000-0000-000000000001';
  IF v_task_status <> 'completed' THEN
    RAISE EXCEPTION 'Submission did not atomically complete the source task';
  END IF;
END $$;
RESET ROLE;

-- Validated postponement, self/circular prevention, and automatic reactivation.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE
  v_blocked BOOLEAN := FALSE;
  v_state TEXT;
  v_active INTEGER;
BEGIN
  BEGIN
    PERFORM public.postpone_operational_work(
      'task:fb000000-0000-0000-0000-000000000003', 'waiting_on_vendor',
      '', NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Postponement accepted no explanation/review date'; END IF;

  v_blocked := FALSE;
  BEGIN
    PERFORM public.add_operational_dependency(
      'task:fb000000-0000-0000-0000-000000000003',
      'task:fb000000-0000-0000-0000-000000000003'
    );
  EXCEPTION WHEN OTHERS THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Self dependency was accepted'; END IF;

  PERFORM public.add_operational_dependency(
    'task:fb000000-0000-0000-0000-000000000003',
    'task:fb000000-0000-0000-0000-000000000002'
  );
  v_blocked := FALSE;
  BEGIN
    PERFORM public.add_operational_dependency(
      'task:fb000000-0000-0000-0000-000000000002',
      'task:fb000000-0000-0000-0000-000000000003'
    );
  EXCEPTION WHEN OTHERS THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Circular dependency was accepted'; END IF;
  PERFORM public.remove_operational_dependency(
    (SELECT id FROM public.operational_work_dependencies
      WHERE blocker_work_key = 'task:fb000000-0000-0000-0000-000000000002'
        AND dependent_work_key = 'task:fb000000-0000-0000-0000-000000000003' AND active),
    'Replace with the verified blocker'
  );

  PERFORM public.postpone_operational_work(
    'task:fb000000-0000-0000-0000-000000000003', 'waiting_on_another_task',
    'Waiting for verified safety work', NULL, CURRENT_DATE + 2,
    'task:fb000000-0000-0000-0000-000000000001'
  );
  SELECT workflow_status INTO v_state FROM public.operational_work_states
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000003';
  IF v_state <> 'blocked' THEN RAISE EXCEPTION 'Dependent was not visibly blocked'; END IF;

  -- Completion alone is insufficient because verification was required.
  SELECT COUNT(*) INTO v_active FROM public.operational_work_dependencies
  WHERE blocker_work_key = 'task:fb000000-0000-0000-0000-000000000001' AND active;
  IF v_active <> 1 THEN RAISE EXCEPTION 'Verification-gated dependency cleared too early'; END IF;

  PERFORM public.transition_operational_work(
    'task:fb000000-0000-0000-0000-000000000001', 'verify', 'Evidence accepted'
  );
  SELECT COUNT(*) INTO v_active FROM public.operational_work_dependencies
  WHERE blocker_work_key = 'task:fb000000-0000-0000-0000-000000000001' AND active;
  IF v_active <> 0 THEN RAISE EXCEPTION 'Verified blocker did not clear dependency'; END IF;
  SELECT workflow_status INTO v_state FROM public.operational_work_states
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000003';
  IF v_state <> 'active' THEN RAISE EXCEPTION 'Dependent did not reactivate automatically'; END IF;
  SELECT COUNT(*) INTO v_active FROM public.operational_work_postponements
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000003' AND active;
  IF v_active <> 0 THEN RAISE EXCEPTION 'Blocker postponement remained active after reactivation'; END IF;
  SELECT COUNT(*) INTO v_active FROM public.operational_work_events
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000003'
    AND event_type = 'automatically_reactivated';
  IF v_active <> 1 THEN RAISE EXCEPTION 'Automatic reactivation was not visible in history'; END IF;
END $$;
RESET ROLE;

-- Leadership handoff keeps the source open while waiting, then an approved
-- recorded outcome completes the source and projection in one transaction.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE v_handoff public.operational_work_leadership_handoffs%ROWTYPE; v_status TEXT;
BEGIN
  v_handoff := public.send_operational_work_to_leadership(
    'task:fb000000-0000-0000-0000-000000000004', 'Club GM', NULL,
    'Approval required', 'Approve the planned operational action', CURRENT_DATE,
    CURRENT_DATE + 2, CURRENT_DATE + 1, 'LOCAL-DECISION-1'
  );
  SELECT status INTO v_status FROM public.tasks
  WHERE id = 'fb000000-0000-0000-0000-000000000004';
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Leadership send prematurely completed source'; END IF;
  PERFORM public.resolve_operational_leadership_handoff(
    v_handoff.id, 'approved', 'Approved', 'Leadership approved the action', 'complete'
  );
  SELECT status INTO v_status FROM public.tasks
  WHERE id = 'fb000000-0000-0000-0000-000000000004';
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'Approved leadership outcome did not complete source'; END IF;
  SELECT workflow_status INTO v_status FROM public.operational_work_states
  WHERE work_key = 'task:fb000000-0000-0000-0000-000000000004';
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'Approved leadership outcome did not complete projection'; END IF;
END $$;
RESET ROLE;

-- Program Standards support partial, complete, not-applicable validation,
-- evidence, independent ordering, and explicit reopen/version history.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE v_standard public.program_standards%ROWTYPE; v_blocked BOOLEAN := FALSE; v_count INTEGER;
BEGIN
  v_standard := public.record_program_standard_progress(
    'fc000000-0000-0000-0000-000000000001', 'partially_complete',
    'Implementation underway', 90, 'critical', CURRENT_DATE + 10,
    NULL, 'Local progress evidence', 'LOCAL-STANDARD-1'
  );
  IF v_standard.operational_status <> 'partially_complete' THEN
    RAISE EXCEPTION 'Partial standard progress was not recorded';
  END IF;
  BEGIN
    PERFORM public.record_program_standard_progress(
      'fc000000-0000-0000-0000-000000000001', 'not_applicable',
      'Missing reason attempt', 90, 'critical', NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Not-applicable standard accepted no reason'; END IF;

  -- Standards are intentionally completable independently of catalog order.
  PERFORM public.record_program_standard_progress(
    'fc000000-0000-0000-0000-000000000001', 'complete',
    'Completed independently with recorded evidence', 90, 'critical', CURRENT_DATE,
    NULL, 'Completion evidence', 'LOCAL-STANDARD-2'
  );
  PERFORM public.reopen_operational_work(
    'standard:fc000000-0000-0000-0000-000000000001',
    'New evidence requires reevaluation'
  );
  SELECT COUNT(*) INTO v_count FROM public.program_standard_versions
  WHERE standard_id = 'fc000000-0000-0000-0000-000000000001';
  IF v_count <> 3 THEN RAISE EXCEPTION 'Standard version history is incomplete'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.operational_work_evidence
  WHERE work_key = 'standard:fc000000-0000-0000-0000-000000000001';
  IF v_count <> 2 THEN RAISE EXCEPTION 'Standard evidence history is incomplete'; END IF;
  SELECT operational_status INTO v_standard.operational_status FROM public.program_standards
  WHERE id = 'fc000000-0000-0000-0000-000000000001';
  IF v_standard.operational_status <> 'not_started' THEN RAISE EXCEPTION 'Reopen did not restore active standard work'; END IF;
END $$;
RESET ROLE;

-- Client role cannot edit standards directly, even when it is the manager.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE v_blocked BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.program_standards SET notes = 'Direct tamper'
    WHERE id = 'fc000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Manager directly edited a Program Standard'; END IF;
END $$;
RESET ROLE;

-- Completed workflow history remains immutable even to a table-owner path.
DO $$
DECLARE v_blocked BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.operational_work_assignments SET notes = 'Tamper attempt'
    WHERE work_key = 'task:fb000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Completed assignment history is immutable' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Completed assignment history was rewritten'; END IF;

  v_blocked := FALSE;
  BEGIN
    DELETE FROM public.operational_work_events
    WHERE work_key = 'task:fb000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'operational_work_events is append-only history' THEN v_blocked := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Append-only operational history was deleted'; END IF;
END $$;

ROLLBACK;

SELECT 'PASS unified Operations workflow, dependency, leadership, standards, and RLS matrix';
