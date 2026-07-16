\set ON_ERROR_STOP on

-- Disposable-local integration matrix for 20260716010000. Every fixture is
-- synthetic and the transaction always rolls back.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES
  (NULL, 'f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'command-center-manager@example.test', '{}', '{"full_name":"Command Center Manager","role":"gm"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'command-center-owner@example.test', '{}', '{"full_name":"Command Center Owner","role":"crew"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'f1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'command-center-backup@example.test', '{}', '{"full_name":"Command Center Backup","role":"crew"}', NOW(), NOW(), FALSE, FALSE),
  (NULL, 'f1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'command-center-other@example.test', '{}', '{"full_name":"Command Center Other","role":"crew"}', NOW(), NOW(), FALSE, FALSE);

UPDATE public.profiles
SET is_active = TRUE,
    department = CASE WHEN id = 'f1000000-0000-0000-0000-000000000001' THEN 'administration' ELSE 'maintenance' END,
    role_group = CASE WHEN id = 'f1000000-0000-0000-0000-000000000001' THEN 'general_manager' ELSE 'maintenance_staff' END
WHERE id::TEXT LIKE 'f1000000-0000-0000-0000-00000000000%';

INSERT INTO public.obligations (
  id, slug, title, workspace, cadence, due_day, due_weekday, due_month,
  lead_days, delegable, is_active, owner_profile_id, backup_profile_id
) VALUES (
  'f2000000-0000-0000-0000-000000000001',
  'command-center-local-test',
  'Command center local integration obligation',
  'general',
  'weekly',
  1,
  1,
  NULL,
  1,
  TRUE,
  TRUE,
  'f1000000-0000-0000-0000-000000000002',
  'f1000000-0000-0000-0000-000000000003'
);

INSERT INTO public.daily_goals (id, title, created_by)
VALUES (
  'f3000000-0000-0000-0000-000000000001',
  'Owner private local goal',
  'f1000000-0000-0000-0000-000000000002'
);
INSERT INTO public.daily_steps (id, goal_id, title, created_by)
VALUES (
  'f4000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000001',
  'Owner private local step',
  'f1000000-0000-0000-0000-000000000002'
);

-- Unrelated employee: obligation/My Day rows are hidden and both direct and
-- command writes outside their responsibility are rejected.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000004', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.obligations
  WHERE id = 'f2000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated employee read an obligation'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.daily_goals
  WHERE id = 'f3000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated employee read another My Day goal'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.daily_steps
  WHERE id = 'f4000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Unrelated employee read another My Day step'; END IF;

  BEGIN
    INSERT INTO public.obligation_completions (obligation_id, period, completed_by)
    VALUES (
      'f2000000-0000-0000-0000-000000000001',
      'W2026-07-12',
      'f1000000-0000-0000-0000-000000000004'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Direct completion insert was not blocked'; END IF;

  v_blocked := FALSE;
  BEGIN
    PERFORM public.complete_operational_obligation(
      'f2000000-0000-0000-0000-000000000001',
      'W2026-07-12',
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Only the primary owner, backup owner,%' THEN
      v_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unrelated employee completed an obligation'; END IF;

  v_blocked := FALSE;
  BEGIN
    INSERT INTO public.daily_steps (goal_id, title, created_by)
    VALUES (
      'f3000000-0000-0000-0000-000000000001',
      'Foreign child attempt',
      'f1000000-0000-0000-0000-000000000004'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unrelated employee attached a step to a foreign goal'; END IF;
END $$;
RESET ROLE;

-- Primary owner can read and complete. The database supplies the actor, and a
-- malformed period cannot enter history.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', TRUE);
DO $$
DECLARE
  v_completion public.obligation_completions%ROWTYPE;
  v_count INTEGER;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.obligations
  WHERE id = 'f2000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Primary owner could not read obligation'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.daily_steps
  WHERE id = 'f4000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Creator could not read own My Day step'; END IF;

  BEGIN
    PERFORM public.complete_operational_obligation(
      'f2000000-0000-0000-0000-000000000001',
      '2026-07',
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Period key does not match the obligation cadence' THEN
      v_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Mismatched period key was accepted'; END IF;

  v_completion := public.complete_operational_obligation(
    'f2000000-0000-0000-0000-000000000001',
    'W2026-07-12',
    'Local integration completion'
  );
  IF v_completion.completed_by <> 'f1000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'Completion actor was not server-attributed';
  END IF;
END $$;
RESET ROLE;

-- Backup can execute the same occurrence idempotently; the original actor and
-- single completion row remain intact.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000003', TRUE);
DO $$
DECLARE
  v_completion public.obligation_completions%ROWTYPE;
  v_count INTEGER;
BEGIN
  v_completion := public.complete_operational_obligation(
    'f2000000-0000-0000-0000-000000000001',
    'W2026-07-12',
    'Idempotent backup retry'
  );
  SELECT COUNT(*) INTO v_count FROM public.obligation_completions
  WHERE obligation_id = 'f2000000-0000-0000-0000-000000000001'
    AND period = 'W2026-07-12';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Idempotent completion produced duplicate history'; END IF;
  IF v_completion.completed_by <> 'f1000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'Idempotent retry rewrote the original actor';
  END IF;
END $$;
RESET ROLE;

-- Manager sees the obligation but not private My Day rows, cannot mutate the
-- completion table directly, and can correct only through a reasoned command.
SET LOCAL ROLE authenticated;
SELECT SET_CONFIG('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', TRUE);
DO $$
DECLARE
  v_count INTEGER;
  v_voided UUID;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.obligations
  WHERE id = 'f2000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Manager could not read obligation'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.daily_goals
  WHERE id = 'f3000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Manager bypassed private My Day scope'; END IF;

  BEGIN
    DELETE FROM public.obligation_completions
    WHERE obligation_id = 'f2000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Manager directly deleted completion history'; END IF;

  v_voided := public.void_operational_obligation_completion(
    'f2000000-0000-0000-0000-000000000001',
    'W2026-07-12',
    'Local integration correction reason'
  );
  IF v_voided IS NULL THEN RAISE EXCEPTION 'Audited correction returned no completion id'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.obligation_completions
  WHERE id = v_voided;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Correction left active completion row'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.obligation_completion_audit_events
  WHERE obligation_id = 'f2000000-0000-0000-0000-000000000001'
    AND event_type IN ('completed', 'voided');
  IF v_count <> 2 THEN RAISE EXCEPTION 'Completion/correction audit pair was not preserved'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.obligation_completion_audit_events
  WHERE obligation_id = 'f2000000-0000-0000-0000-000000000001'
    AND event_type = 'voided'
    AND actor_id = 'f1000000-0000-0000-0000-000000000001'
    AND reason = 'Local integration correction reason';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Correction audit actor or reason is wrong'; END IF;
END $$;
RESET ROLE;

-- The append-only trigger is defense in depth even for a table owner path.
DO $$
DECLARE
  v_blocked BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.obligation_completion_audit_events
    SET reason = 'Tamper attempt'
    WHERE obligation_id = 'f2000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Obligation completion audit events are append-only' THEN
      v_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Table owner rewrote append-only audit history'; END IF;
END $$;

ROLLBACK;

SELECT 'PASS command-center obligation and My Day RLS matrix';
