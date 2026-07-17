BEGIN;

-- Unified Operations Command Center
--
-- Actionable domain records remain in their existing source tables. These
-- tables hold only the cross-cutting workflow facts (delegation, waiting,
-- dependencies, leadership, evidence, and activity) needed to project those
-- records through one operational-work contract. The existing `tasks` table
-- remains the canonical execution path for task and duty work.

-- ---------------------------------------------------------------------------
-- Program Standards operational planning fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.program_standards
  ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS impact_level TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS manager_target_date DATE,
  ADD COLUMN IF NOT EXISTS not_applicable_reason TEXT;

ALTER TABLE public.program_standards
  DROP CONSTRAINT IF EXISTS program_standards_operational_status_check,
  ADD CONSTRAINT program_standards_operational_status_check CHECK (
    operational_status IN ('not_started','partially_complete','complete','not_applicable')
  ),
  DROP CONSTRAINT IF EXISTS program_standards_estimated_minutes_check,
  ADD CONSTRAINT program_standards_estimated_minutes_check CHECK (estimated_minutes > 0),
  DROP CONSTRAINT IF EXISTS program_standards_impact_level_check,
  ADD CONSTRAINT program_standards_impact_level_check CHECK (
    impact_level IN ('low','medium','high','critical')
  ),
  DROP CONSTRAINT IF EXISTS program_standards_na_reason_check,
  ADD CONSTRAINT program_standards_na_reason_check CHECK (
    operational_status <> 'not_applicable'
    OR NULLIF(BTRIM(not_applicable_reason), '') IS NOT NULL
  );

-- These are local planning estimates, never official deadlines. Existing
-- source effort/priority values provide a deterministic first estimate which
-- management can edit and confirm in the standards workflow.
UPDATE public.program_standards
SET estimated_minutes = CASE effort
      WHEN 'Low' THEN 30
      WHEN 'Medium' THEN 120
      WHEN 'High' THEN 480
      ELSE estimated_minutes
    END,
    impact_level = CASE priority
      WHEN 'P1' THEN 'critical'
      WHEN 'P2' THEN 'high'
      WHEN 'P3' THEN 'medium'
      WHEN 'P4' THEN 'low'
      ELSE impact_level
    END
WHERE operational_status IN ('not_started','partially_complete');

-- ---------------------------------------------------------------------------
-- Cross-source workflow state and immutable history
-- ---------------------------------------------------------------------------

CREATE TABLE public.operational_work_states (
  work_key TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'task','standard','obligation','goal','step','calendar','equipment','purchase_request','inspection'
  )),
  source_record_id TEXT NOT NULL,
  responsible_employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsible_position TEXT,
  accountable_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  workflow_status TEXT NOT NULL DEFAULT 'active' CHECK (workflow_status IN (
    'active','awaiting_acceptance','in_progress','postponed','blocked',
    'waiting_leadership','needs_verification','completed'
  )),
  verification_required BOOLEAN NOT NULL DEFAULT FALSE,
  manager_priority_override INTEGER CHECK (manager_priority_override BETWEEN -500 AND 500),
  safety_flag BOOLEAN NOT NULL DEFAULT FALSE,
  compliance_flag BOOLEAN NOT NULL DEFAULT FALSE,
  payroll_deadline_flag BOOLEAN NOT NULL DEFAULT FALSE,
  financial_deadline_flag BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  last_transition_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (work_key = source_type || ':' || source_record_id OR source_type = 'obligation')
);

CREATE TABLE public.operational_work_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  position TEXT,
  resolved_employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  instructions TEXT,
  due_date DATE NOT NULL,
  expected_evidence TEXT,
  follow_up_date DATE,
  verification_required BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_acceptance' CHECK (status IN (
    'awaiting_acceptance','accepted','in_progress','needs_clarification',
    'submitted_for_verification','completed','reassigned','overdue'
  )),
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NUM_NONNULLS(employee_id, position) = 1),
  CHECK (NULLIF(BTRIM(position), '') IS NOT NULL OR position IS NULL)
);

CREATE UNIQUE INDEX operational_work_assignments_one_current
  ON public.operational_work_assignments(work_key)
  WHERE status NOT IN ('completed','reassigned');
CREATE INDEX operational_work_assignments_employee
  ON public.operational_work_assignments(COALESCE(resolved_employee_id, employee_id), status);

CREATE TABLE public.operational_work_postponements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'waiting_on_another_task','waiting_on_leadership','waiting_on_employee',
    'waiting_on_vendor','waiting_on_contractor','waiting_on_parts','waiting_on_funding',
    'waiting_on_approval','waiting_on_weather','equipment_unavailable','staffing_unavailable',
    'higher_priority_emergency','scheduled_operational_window','other'
  )),
  explanation TEXT NOT NULL CHECK (NULLIF(BTRIM(explanation), '') IS NOT NULL),
  resume_date DATE,
  review_date DATE,
  blocking_work_key TEXT,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (resume_date IS NOT NULL OR review_date IS NOT NULL)
);

CREATE UNIQUE INDEX operational_work_postponements_one_active
  ON public.operational_work_postponements(work_key) WHERE active;

CREATE TABLE public.operational_work_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_work_key TEXT NOT NULL,
  dependent_work_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_reason TEXT,
  CHECK (blocker_work_key <> dependent_work_key)
);

CREATE UNIQUE INDEX operational_work_dependencies_one_active
  ON public.operational_work_dependencies(blocker_work_key, dependent_work_key)
  WHERE active;
CREATE INDEX operational_work_dependencies_dependent
  ON public.operational_work_dependencies(dependent_work_key) WHERE active;

CREATE TABLE public.operational_work_leadership_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,
  recipient TEXT,
  leadership_group TEXT,
  reason TEXT NOT NULL CHECK (NULLIF(BTRIM(reason), '') IS NOT NULL),
  request_or_decision_needed TEXT NOT NULL CHECK (
    NULLIF(BTRIM(request_or_decision_needed), '') IS NOT NULL
  ),
  date_sent DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_response_date DATE,
  follow_up_date DATE NOT NULL,
  related_reference TEXT,
  status TEXT NOT NULL DEFAULT 'preparing_submission' CHECK (status IN (
    'preparing_submission','sent_to_leadership','awaiting_response',
    'additional_information_requested','approved','denied','deferred',
    'leadership_completing_action','returned_to_local_management','completed',
    'closed_without_action'
  )),
  response TEXT,
  outcome TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NUM_NONNULLS(recipient, leadership_group) >= 1)
);

CREATE UNIQUE INDEX operational_work_leadership_one_active
  ON public.operational_work_leadership_handoffs(work_key)
  WHERE status IN (
    'preparing_submission','sent_to_leadership','awaiting_response',
    'additional_information_requested','deferred','leadership_completing_action'
  );

CREATE TABLE public.operational_work_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'photo','document','record','external_reference','note'
  )),
  label TEXT NOT NULL CHECK (NULLIF(BTRIM(label), '') IS NOT NULL),
  reference TEXT NOT NULL CHECK (NULLIF(BTRIM(reference), '') IS NOT NULL),
  added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.operational_work_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  detail TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX operational_work_events_work_key
  ON public.operational_work_events(work_key, created_at DESC);

-- ---------------------------------------------------------------------------
-- Validation, visibility, and immutable-history guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.operational_work_key_exists(p_work_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
  v_id UUID;
BEGIN
  IF p_work_key IS NULL OR p_work_key !~
    '^(task|standard|obligation|goal|step|calendar|equipment|purchase_request):[0-9a-fA-F-]{36}(:[^:]+)?$'
  THEN
    RETURN FALSE;
  END IF;
  v_id := SPLIT_PART(p_work_key, ':', 2)::UUID;
  CASE v_kind
    WHEN 'task' THEN RETURN EXISTS (SELECT 1 FROM public.tasks WHERE id = v_id);
    WHEN 'standard' THEN RETURN EXISTS (SELECT 1 FROM public.program_standards WHERE id = v_id);
    WHEN 'obligation' THEN RETURN EXISTS (SELECT 1 FROM public.obligations WHERE id = v_id);
    WHEN 'goal' THEN RETURN EXISTS (SELECT 1 FROM public.daily_goals WHERE id = v_id);
    WHEN 'step' THEN RETURN EXISTS (SELECT 1 FROM public.daily_steps WHERE id = v_id);
    WHEN 'calendar' THEN RETURN EXISTS (SELECT 1 FROM public.calendar_events WHERE id = v_id);
    WHEN 'equipment' THEN RETURN EXISTS (SELECT 1 FROM public.equipment WHERE id = v_id);
    WHEN 'purchase_request' THEN RETURN EXISTS (SELECT 1 FROM public.purchase_requests WHERE id = v_id);
    ELSE RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_operational_work(p_work_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
  v_id UUID;
BEGIN
  IF v_actor IS NULL THEN RETURN FALSE; END IF;
  IF public.can_manage_daily_operations() THEN RETURN TRUE; END IF;
  IF NOT public.operational_work_key_exists(p_work_key) THEN RETURN FALSE; END IF;
  v_id := SPLIT_PART(p_work_key, ':', 2)::UUID;

  IF EXISTS (
    SELECT 1 FROM public.operational_work_states s
    WHERE s.work_key = p_work_key
      AND v_actor IN (s.responsible_employee_id, s.accountable_manager_id)
  ) OR EXISTS (
    SELECT 1 FROM public.operational_work_assignments a
    WHERE a.work_key = p_work_key
      AND v_actor IN (a.employee_id, a.resolved_employee_id)
  ) THEN
    RETURN TRUE;
  END IF;

  CASE v_kind
    WHEN 'task' THEN RETURN EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = v_id AND t.assigned_to = v_actor
    );
    WHEN 'standard' THEN RETURN EXISTS (
      SELECT 1 FROM public.program_standards s
      WHERE s.id = v_id AND v_actor IN (s.owner_profile_id, s.backup_profile_id)
    );
    WHEN 'obligation' THEN RETURN EXISTS (
      SELECT 1 FROM public.obligations o
      WHERE o.id = v_id AND v_actor IN (o.owner_profile_id, o.backup_profile_id)
    );
    WHEN 'goal' THEN RETURN EXISTS (
      SELECT 1 FROM public.daily_goals g WHERE g.id = v_id AND g.created_by = v_actor
    );
    WHEN 'step' THEN RETURN EXISTS (
      SELECT 1 FROM public.daily_steps s WHERE s.id = v_id AND s.created_by = v_actor
    );
    WHEN 'calendar' THEN RETURN EXISTS (
      SELECT 1 FROM public.calendar_events e WHERE e.id = v_id AND e.created_by = v_actor
    );
    WHEN 'purchase_request' THEN RETURN EXISTS (
      SELECT 1 FROM public.purchase_requests p WHERE p.id = v_id AND p.created_by = v_actor
    );
    ELSE RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.operational_work_actor_can_execute(p_work_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT public.can_manage_daily_operations() OR public.can_read_operational_work(p_work_key);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.append_operational_work_event(
  p_work_key TEXT,
  p_event_type TEXT,
  p_detail TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.operational_work_events(
    work_key, event_type, actor_id, detail, metadata
  ) VALUES (
    p_work_key, p_event_type, (SELECT auth.uid()), NULLIF(BTRIM(p_detail), ''),
    COALESCE(p_metadata, '{}'::JSONB)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_operational_work_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE TRIGGER trg_operational_work_state_updated_at
  BEFORE UPDATE ON public.operational_work_states
  FOR EACH ROW EXECUTE FUNCTION public.set_operational_work_updated_at();
CREATE TRIGGER trg_operational_assignment_updated_at
  BEFORE UPDATE ON public.operational_work_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_operational_work_updated_at();
CREATE TRIGGER trg_operational_leadership_updated_at
  BEFORE UPDATE ON public.operational_work_leadership_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.set_operational_work_updated_at();

CREATE OR REPLACE FUNCTION public.protect_operational_work_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME IN ('operational_work_events','operational_work_evidence') THEN
    RAISE EXCEPTION '% is append-only history', TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% records cannot be deleted', TG_TABLE_NAME;
  END IF;
  IF TG_TABLE_NAME = 'operational_work_dependencies' THEN
    IF OLD.active = FALSE THEN
      RAISE EXCEPTION 'Resolved dependency history is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'operational_work_postponements' THEN
    IF OLD.active = FALSE THEN
      RAISE EXCEPTION 'Ended postponement history is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'operational_work_assignments' THEN
    IF OLD.status IN ('completed','reassigned') THEN
      RAISE EXCEPTION 'Completed assignment history is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_operational_events_immutable
  BEFORE UPDATE OR DELETE ON public.operational_work_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_work_history();
CREATE TRIGGER trg_operational_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.operational_work_evidence
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_work_history();
CREATE TRIGGER trg_operational_dependencies_protected
  BEFORE UPDATE OR DELETE ON public.operational_work_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_work_history();
CREATE TRIGGER trg_operational_postponements_protected
  BEFORE UPDATE OR DELETE ON public.operational_work_postponements
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_work_history();
CREATE TRIGGER trg_operational_assignments_protected
  BEFORE UPDATE OR DELETE ON public.operational_work_assignments
  FOR EACH ROW EXECUTE FUNCTION public.protect_operational_work_history();

-- ---------------------------------------------------------------------------
-- Server-authoritative workflow commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delegate_operational_work(
  p_work_key TEXT,
  p_employee_id UUID,
  p_position TEXT,
  p_instructions TEXT,
  p_due_date DATE,
  p_expected_evidence TEXT,
  p_follow_up_date DATE,
  p_verification_required BOOLEAN,
  p_notes TEXT
)
RETURNS public.operational_work_assignments AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_resolved UUID;
  v_assignment public.operational_work_assignments%ROWTYPE;
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
  v_source_id UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may delegate work';
  END IF;
  IF NOT public.operational_work_key_exists(p_work_key) THEN
    RAISE EXCEPTION 'Operational work item was not found';
  END IF;
  IF NUM_NONNULLS(p_employee_id, NULLIF(BTRIM(p_position), '')) <> 1 THEN
    RAISE EXCEPTION 'Choose either one active employee or one position';
  END IF;
  IF p_due_date IS NULL THEN RAISE EXCEPTION 'A delegation due date is required'; END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT id INTO v_resolved FROM public.profiles
    WHERE id = p_employee_id AND is_active;
    IF v_resolved IS NULL THEN RAISE EXCEPTION 'The selected employee is not active'; END IF;
  ELSE
    SELECT id INTO v_resolved
    FROM public.profiles
    WHERE is_active
      AND (LOWER(role::TEXT) = LOWER(BTRIM(p_position))
        OR LOWER(COALESCE(role_group::TEXT, '')) = LOWER(BTRIM(p_position)))
    ORDER BY full_name, id
    LIMIT 1;
  END IF;

  UPDATE public.operational_work_assignments
  SET status = 'reassigned', ended_at = NOW()
  WHERE work_key = p_work_key
    AND status NOT IN ('completed','reassigned');

  INSERT INTO public.operational_work_assignments(
    work_key, employee_id, position, resolved_employee_id, instructions,
    due_date, expected_evidence, follow_up_date, verification_required,
    notes, assigned_by
  ) VALUES (
    p_work_key, p_employee_id, NULLIF(BTRIM(p_position), ''), v_resolved,
    NULLIF(BTRIM(p_instructions), ''), p_due_date,
    NULLIF(BTRIM(p_expected_evidence), ''), p_follow_up_date,
    COALESCE(p_verification_required, FALSE), NULLIF(BTRIM(p_notes), ''), v_actor
  ) RETURNING * INTO v_assignment;

  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, responsible_employee_id,
    responsible_position, accountable_manager_id, workflow_status,
    verification_required, created_by, updated_by
  ) VALUES (
    p_work_key, v_kind, SPLIT_PART(p_work_key, ':', 2), v_resolved,
    NULLIF(BTRIM(p_position), ''), v_actor, 'awaiting_acceptance',
    COALESCE(p_verification_required, FALSE), v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    responsible_employee_id = EXCLUDED.responsible_employee_id,
    responsible_position = EXCLUDED.responsible_position,
    accountable_manager_id = EXCLUDED.accountable_manager_id,
    workflow_status = EXCLUDED.workflow_status,
    verification_required = EXCLUDED.verification_required,
    updated_by = v_actor,
    last_transition_at = NOW();

  v_source_id := SPLIT_PART(p_work_key, ':', 2)::UUID;
  IF v_kind = 'task' THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = v_source_id AND status IN ('completed','verified','cancelled')) THEN
      RAISE EXCEPTION 'Completed, verified, or cancelled task history cannot be delegated';
    END IF;
    UPDATE public.tasks
    SET assigned_to = v_resolved, assigned_by = v_actor, updated_at = NOW()
    WHERE id = v_source_id;
  ELSIF v_kind = 'standard' THEN
    UPDATE public.program_standards
    SET owner_profile_id = v_resolved, updated_by = v_actor
    WHERE id = v_source_id;
  END IF;

  PERFORM public.append_operational_work_event(
    p_work_key, 'delegated', p_instructions,
    JSONB_BUILD_OBJECT(
      'assignment_id', v_assignment.id,
      'employee_id', p_employee_id,
      'position', NULLIF(BTRIM(p_position), ''),
      'resolved_employee_id', v_resolved,
      'due_date', p_due_date
    )
  );
  RETURN v_assignment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.transition_operational_assignment(
  p_assignment_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.operational_work_assignments AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_assignment public.operational_work_assignments%ROWTYPE;
  v_workflow_status TEXT;
  v_kind TEXT;
  v_source_id UUID;
  v_source_status TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  SELECT * INTO v_assignment FROM public.operational_work_assignments
  WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delegation was not found'; END IF;
  IF NOT (public.can_manage_daily_operations()
    OR v_actor IN (v_assignment.employee_id, v_assignment.resolved_employee_id)) THEN
    RAISE EXCEPTION 'You may not update this delegation';
  END IF;
  IF p_status NOT IN (
    'accepted','in_progress','needs_clarification','submitted_for_verification',
    'completed','reassigned','overdue'
  ) THEN RAISE EXCEPTION 'Unsupported delegation status'; END IF;
  IF NOT public.can_manage_daily_operations() AND p_status IN ('reassigned','overdue') THEN
    RAISE EXCEPTION 'Only an operations manager may reassign or mark delegated work overdue';
  END IF;

  UPDATE public.operational_work_assignments
  SET status = p_status,
      notes = COALESCE(NULLIF(BTRIM(p_note), ''), notes),
      accepted_at = CASE WHEN p_status IN ('accepted','in_progress')
        THEN COALESCE(accepted_at, NOW()) ELSE accepted_at END,
      ended_at = CASE WHEN p_status IN ('completed','reassigned') THEN NOW() ELSE ended_at END
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  -- Submission/completion is one transaction with the strongest existing
  -- source lifecycle. If task evidence is missing, the whole assignment
  -- transition rolls back rather than creating split-brain history.
  IF p_status IN ('submitted_for_verification','completed') THEN
    IF p_status = 'completed' AND v_assignment.verification_required THEN
      RAISE EXCEPTION 'This delegation requires submission for verification before completion';
    END IF;
    v_kind := SPLIT_PART(v_assignment.work_key, ':', 1);
    v_source_id := SPLIT_PART(v_assignment.work_key, ':', 2)::UUID;
    IF v_kind = 'task' THEN
      SELECT status INTO v_source_status FROM public.tasks WHERE id = v_source_id;
      IF v_source_status NOT IN ('completed','verified') THEN
        PERFORM public.transition_task_status(v_source_id, 'completed', NULL);
      END IF;
    ELSIF v_kind = 'step' THEN
      UPDATE public.daily_steps
      SET done = TRUE, done_at = COALESCE(done_at, NOW()), updated_at = NOW()
      WHERE id = v_source_id;
    ELSIF v_kind = 'obligation' THEN
      PERFORM public.complete_operational_obligation(
        v_source_id, SPLIT_PART(v_assignment.work_key, ':', 3), p_note
      );
    ELSIF v_kind = 'standard' THEN
      RAISE EXCEPTION 'Program Standard completion must use the audited progress workflow';
    END IF;
  END IF;

  v_workflow_status := CASE p_status
    WHEN 'awaiting_acceptance' THEN 'awaiting_acceptance'
    WHEN 'accepted' THEN 'active'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'needs_clarification' THEN 'blocked'
    WHEN 'submitted_for_verification' THEN 'needs_verification'
    WHEN 'completed' THEN CASE WHEN v_assignment.verification_required
      THEN 'needs_verification' ELSE 'completed' END
    WHEN 'overdue' THEN 'active'
    ELSE 'active'
  END;

  UPDATE public.operational_work_states
  SET workflow_status = v_workflow_status,
      updated_by = v_actor,
      last_transition_at = NOW()
  WHERE work_key = v_assignment.work_key;

  PERFORM public.append_operational_work_event(
    v_assignment.work_key, 'delegation_' || p_status, p_note,
    JSONB_BUILD_OBJECT('assignment_id', p_assignment_id)
  );
  RETURN v_assignment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.add_operational_dependency(
  p_dependent_work_key TEXT,
  p_blocker_work_key TEXT
)
RETURNS public.operational_work_dependencies AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_dependency public.operational_work_dependencies%ROWTYPE;
  v_kind TEXT := SPLIT_PART(p_dependent_work_key, ':', 1);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may add dependencies';
  END IF;
  IF p_dependent_work_key = p_blocker_work_key THEN
    RAISE EXCEPTION 'A work item cannot depend on itself';
  END IF;
  IF NOT public.operational_work_key_exists(p_dependent_work_key)
     OR NOT public.operational_work_key_exists(p_blocker_work_key) THEN
    RAISE EXCEPTION 'Both work items must exist';
  END IF;
  IF EXISTS (
    WITH RECURSIVE downstream(work_key) AS (
      SELECT p_dependent_work_key
      UNION
      SELECT d.dependent_work_key
      FROM public.operational_work_dependencies d
      JOIN downstream path ON d.blocker_work_key = path.work_key
      WHERE d.active
    )
    SELECT 1 FROM downstream WHERE work_key = p_blocker_work_key
  ) THEN
    RAISE EXCEPTION 'This dependency would create a circular chain';
  END IF;

  INSERT INTO public.operational_work_dependencies(
    blocker_work_key, dependent_work_key, created_by
  ) VALUES (p_blocker_work_key, p_dependent_work_key, v_actor)
  RETURNING * INTO v_dependency;

  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, workflow_status, created_by, updated_by
  ) VALUES (
    p_dependent_work_key, v_kind, SPLIT_PART(p_dependent_work_key, ':', 2),
    'blocked', v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    workflow_status = 'blocked', updated_by = v_actor, last_transition_at = NOW();

  PERFORM public.append_operational_work_event(
    p_dependent_work_key, 'dependency_added', 'Waiting on another work item',
    JSONB_BUILD_OBJECT('dependency_id', v_dependency.id, 'blocker_work_key', p_blocker_work_key)
  );
  RETURN v_dependency;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.remove_operational_dependency(
  p_dependency_id UUID,
  p_reason TEXT
)
RETURNS public.operational_work_dependencies AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_dependency public.operational_work_dependencies%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may remove dependencies';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A removal reason is required'; END IF;
  UPDATE public.operational_work_dependencies
  SET active = FALSE, resolved_at = NOW(), resolved_by = v_actor,
      resolution_reason = BTRIM(p_reason)
  WHERE id = p_dependency_id AND active
  RETURNING * INTO v_dependency;
  IF v_dependency.id IS NULL THEN RAISE EXCEPTION 'Active dependency was not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.operational_work_dependencies
    WHERE dependent_work_key = v_dependency.dependent_work_key AND active
  ) AND NOT EXISTS (
    SELECT 1 FROM public.operational_work_postponements
    WHERE work_key = v_dependency.dependent_work_key AND active
  ) AND NOT EXISTS (
    SELECT 1 FROM public.operational_work_leadership_handoffs
    WHERE work_key = v_dependency.dependent_work_key
      AND status IN ('preparing_submission','sent_to_leadership','awaiting_response',
        'additional_information_requested','deferred','leadership_completing_action')
  ) THEN
    UPDATE public.operational_work_states
    SET workflow_status = 'active', updated_by = v_actor, last_transition_at = NOW()
    WHERE work_key = v_dependency.dependent_work_key;
  END IF;

  PERFORM public.append_operational_work_event(
    v_dependency.dependent_work_key, 'dependency_removed', p_reason,
    JSONB_BUILD_OBJECT('dependency_id', p_dependency_id, 'blocker_work_key', v_dependency.blocker_work_key)
  );
  RETURN v_dependency;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.postpone_operational_work(
  p_work_key TEXT,
  p_reason TEXT,
  p_explanation TEXT,
  p_resume_date DATE,
  p_review_date DATE,
  p_blocking_work_key TEXT DEFAULT NULL
)
RETURNS public.operational_work_postponements AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_row public.operational_work_postponements%ROWTYPE;
  v_status TEXT;
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.operational_work_actor_can_execute(p_work_key) THEN
    RAISE EXCEPTION 'You may not postpone this work item';
  END IF;
  IF p_reason NOT IN (
    'waiting_on_another_task','waiting_on_leadership','waiting_on_employee',
    'waiting_on_vendor','waiting_on_contractor','waiting_on_parts','waiting_on_funding',
    'waiting_on_approval','waiting_on_weather','equipment_unavailable','staffing_unavailable',
    'higher_priority_emergency','scheduled_operational_window','other'
  ) THEN RAISE EXCEPTION 'Choose a supported postponement reason'; END IF;
  IF NULLIF(BTRIM(p_explanation), '') IS NULL THEN RAISE EXCEPTION 'An explanation is required'; END IF;
  IF p_resume_date IS NULL AND p_review_date IS NULL THEN
    RAISE EXCEPTION 'A resume date or review date is required';
  END IF;
  IF COALESCE(p_review_date, p_resume_date) < CURRENT_DATE THEN
    RAISE EXCEPTION 'The review date cannot be in the past';
  END IF;
  IF p_blocking_work_key IS NOT NULL AND p_reason <> 'waiting_on_another_task' THEN
    RAISE EXCEPTION 'A blocking task is only valid when waiting on another task';
  END IF;

  UPDATE public.operational_work_postponements
  SET active = FALSE, ended_at = NOW(), ended_by = v_actor
  WHERE work_key = p_work_key AND active;

  INSERT INTO public.operational_work_postponements(
    work_key, reason, explanation, resume_date, review_date,
    blocking_work_key, actor_id
  ) VALUES (
    p_work_key, p_reason, BTRIM(p_explanation), p_resume_date, p_review_date,
    p_blocking_work_key, v_actor
  ) RETURNING * INTO v_row;

  IF p_blocking_work_key IS NOT NULL THEN
    IF NOT public.can_manage_daily_operations() THEN
      RAISE EXCEPTION 'Only an operations manager may create a blocking dependency';
    END IF;
    PERFORM public.add_operational_dependency(p_work_key, p_blocking_work_key);
  END IF;

  v_status := CASE
    WHEN p_reason = 'waiting_on_leadership' THEN 'waiting_leadership'
    WHEN p_reason = 'waiting_on_another_task' THEN 'blocked'
    ELSE 'postponed'
  END;
  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, workflow_status, created_by, updated_by
  ) VALUES (
    p_work_key, v_kind, SPLIT_PART(p_work_key, ':', 2), v_status, v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    workflow_status = v_status, updated_by = v_actor, last_transition_at = NOW();

  PERFORM public.append_operational_work_event(
    p_work_key, 'postponed', p_explanation,
    JSONB_BUILD_OBJECT('postponement_id', v_row.id, 'reason', p_reason,
      'resume_date', p_resume_date, 'review_date', p_review_date,
      'blocking_work_key', p_blocking_work_key)
  );
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.send_operational_work_to_leadership(
  p_work_key TEXT,
  p_recipient TEXT,
  p_leadership_group TEXT,
  p_reason TEXT,
  p_request_or_decision_needed TEXT,
  p_date_sent DATE,
  p_requested_response_date DATE,
  p_follow_up_date DATE,
  p_related_reference TEXT
)
RETURNS public.operational_work_leadership_handoffs AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_row public.operational_work_leadership_handoffs%ROWTYPE;
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may send work to leadership';
  END IF;
  IF NOT public.operational_work_key_exists(p_work_key) THEN RAISE EXCEPTION 'Work item was not found'; END IF;
  IF NUM_NONNULLS(NULLIF(BTRIM(p_recipient), ''), NULLIF(BTRIM(p_leadership_group), '')) < 1 THEN
    RAISE EXCEPTION 'A recipient or leadership group is required';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL OR NULLIF(BTRIM(p_request_or_decision_needed), '') IS NULL THEN
    RAISE EXCEPTION 'A reason and requested decision are required';
  END IF;
  IF p_follow_up_date IS NULL THEN RAISE EXCEPTION 'A leadership follow-up date is required'; END IF;

  INSERT INTO public.operational_work_leadership_handoffs(
    work_key, recipient, leadership_group, reason, request_or_decision_needed,
    date_sent, requested_response_date, follow_up_date, related_reference,
    status, created_by, updated_by
  ) VALUES (
    p_work_key, NULLIF(BTRIM(p_recipient), ''), NULLIF(BTRIM(p_leadership_group), ''),
    BTRIM(p_reason), BTRIM(p_request_or_decision_needed), COALESCE(p_date_sent, CURRENT_DATE),
    p_requested_response_date, p_follow_up_date, NULLIF(BTRIM(p_related_reference), ''),
    'sent_to_leadership', v_actor, v_actor
  ) RETURNING * INTO v_row;

  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, accountable_manager_id,
    workflow_status, created_by, updated_by
  ) VALUES (
    p_work_key, v_kind, SPLIT_PART(p_work_key, ':', 2), v_actor,
    'waiting_leadership', v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    accountable_manager_id = v_actor,
    workflow_status = 'waiting_leadership',
    updated_by = v_actor,
    last_transition_at = NOW();

  PERFORM public.append_operational_work_event(
    p_work_key, 'sent_to_leadership', p_request_or_decision_needed,
    JSONB_BUILD_OBJECT('handoff_id', v_row.id, 'follow_up_date', p_follow_up_date)
  );
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.resolve_operational_leadership_handoff(
  p_handoff_id UUID,
  p_status TEXT,
  p_response TEXT,
  p_outcome TEXT,
  p_next_action TEXT
)
RETURNS public.operational_work_leadership_handoffs AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_row public.operational_work_leadership_handoffs%ROWTYPE;
  v_workflow TEXT;
  v_kind TEXT;
  v_source_id UUID;
  v_standard public.program_standards%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may record a leadership response';
  END IF;
  IF p_status NOT IN (
    'awaiting_response','additional_information_requested','approved','denied','deferred',
    'leadership_completing_action','returned_to_local_management','completed','closed_without_action'
  ) THEN RAISE EXCEPTION 'Unsupported leadership status'; END IF;
  IF p_next_action NOT IN ('reactivate','verification','next_action','complete') THEN
    RAISE EXCEPTION 'Choose what happens to the originating work item';
  END IF;
  IF p_next_action = 'complete'
     AND (p_status NOT IN ('approved','completed') OR NULLIF(BTRIM(p_outcome), '') IS NULL) THEN
    RAISE EXCEPTION 'Leadership work may complete the source only with an approved/completed outcome';
  END IF;

  UPDATE public.operational_work_leadership_handoffs
  SET status = p_status,
      response = NULLIF(BTRIM(p_response), ''),
      outcome = NULLIF(BTRIM(p_outcome), ''),
      updated_by = v_actor,
      completed_at = CASE WHEN p_status IN ('completed','closed_without_action') THEN NOW() ELSE NULL END
  WHERE id = p_handoff_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Leadership handoff was not found'; END IF;

  -- A leadership outcome may close the originating record only through its
  -- strongest audited lifecycle. Unsupported source kinds remain open rather
  -- than being cosmetically marked complete in the projection layer.
  IF p_next_action = 'complete' THEN
    v_kind := SPLIT_PART(v_row.work_key, ':', 1);
    v_source_id := SPLIT_PART(v_row.work_key, ':', 2)::UUID;
    IF v_kind = 'standard' THEN
      SELECT * INTO v_standard FROM public.program_standards
      WHERE id = v_source_id;
      PERFORM public.record_program_standard_progress(
        v_source_id, 'complete', COALESCE(p_outcome, p_response),
        v_standard.estimated_minutes, v_standard.impact_level,
        v_standard.manager_target_date, NULL, NULL, NULL
      );
    ELSIF v_kind IN ('task','step','obligation') THEN
      PERFORM public.transition_operational_work(
        v_row.work_key, 'complete', COALESCE(p_outcome, p_response)
      );
    ELSE
      RAISE EXCEPTION 'This source type cannot be completed by a leadership outcome';
    END IF;
  END IF;

  v_workflow := CASE p_next_action
    WHEN 'verification' THEN 'needs_verification'
    WHEN 'complete' THEN 'completed'
    ELSE 'active'
  END;
  UPDATE public.operational_work_states
  SET workflow_status = v_workflow, updated_by = v_actor, last_transition_at = NOW()
  WHERE work_key = v_row.work_key;

  PERFORM public.append_operational_work_event(
    v_row.work_key, 'leadership_' || p_status, COALESCE(p_outcome, p_response),
    JSONB_BUILD_OBJECT('handoff_id', p_handoff_id, 'next_action', p_next_action)
  );
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_operational_work_evidence(
  p_work_key TEXT,
  p_evidence_type TEXT,
  p_label TEXT,
  p_reference TEXT
)
RETURNS public.operational_work_evidence AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_row public.operational_work_evidence%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.operational_work_actor_can_execute(p_work_key) THEN
    RAISE EXCEPTION 'You may not add evidence to this work item';
  END IF;
  IF p_evidence_type NOT IN ('photo','document','record','external_reference','note') THEN
    RAISE EXCEPTION 'Unsupported evidence type';
  END IF;
  IF NULLIF(BTRIM(p_label), '') IS NULL OR NULLIF(BTRIM(p_reference), '') IS NULL THEN
    RAISE EXCEPTION 'An evidence label and reference are required';
  END IF;
  INSERT INTO public.operational_work_evidence(
    work_key, evidence_type, label, reference, added_by
  ) VALUES (p_work_key, p_evidence_type, BTRIM(p_label), BTRIM(p_reference), v_actor)
  RETURNING * INTO v_row;
  PERFORM public.append_operational_work_event(
    p_work_key, 'evidence_added', p_label, JSONB_BUILD_OBJECT('evidence_id', v_row.id)
  );
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_program_standard_progress(
  p_standard_id UUID,
  p_status TEXT,
  p_notes TEXT,
  p_estimated_minutes INTEGER,
  p_impact_level TEXT,
  p_manager_target_date DATE,
  p_not_applicable_reason TEXT DEFAULT NULL,
  p_evidence_label TEXT DEFAULT NULL,
  p_evidence_reference TEXT DEFAULT NULL
)
RETURNS public.program_standards AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_before public.program_standards%ROWTYPE;
  v_after public.program_standards%ROWTYPE;
  v_evaluation_status TEXT;
  v_operational_status TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may update Program Standards';
  END IF;
  SELECT * INTO v_before FROM public.program_standards WHERE id = p_standard_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Program Standard was not found'; END IF;
  IF p_status NOT IN ('not_started','partially_complete','complete','not_applicable','reopen') THEN
    RAISE EXCEPTION 'Unsupported Program Standard status';
  END IF;
  IF p_estimated_minutes IS NULL OR p_estimated_minutes <= 0 THEN
    RAISE EXCEPTION 'Estimated duration is required';
  END IF;
  IF p_impact_level NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Impact level is required';
  END IF;
  IF p_status = 'not_applicable' AND NULLIF(BTRIM(p_not_applicable_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A not-applicable reason is required';
  END IF;
  IF NUM_NULLS(NULLIF(BTRIM(p_evidence_label), ''), NULLIF(BTRIM(p_evidence_reference), '')) = 1 THEN
    RAISE EXCEPTION 'Evidence label and reference must be supplied together';
  END IF;

  v_operational_status := CASE WHEN p_status = 'reopen' THEN 'not_started' ELSE p_status END;
  v_evaluation_status := CASE v_operational_status
    WHEN 'complete' THEN 'meets_standard'
    WHEN 'partially_complete' THEN 'corrective_action_active'
    WHEN 'not_applicable' THEN 'not_applicable'
    ELSE 'not_evaluated'
  END;

  UPDATE public.program_standards
  SET operational_status = v_operational_status,
      estimated_minutes = p_estimated_minutes,
      impact_level = p_impact_level,
      manager_target_date = p_manager_target_date,
      not_applicable_reason = CASE WHEN v_operational_status = 'not_applicable'
        THEN BTRIM(p_not_applicable_reason) ELSE NULL END,
      notes = NULLIF(BTRIM(p_notes), ''),
      version = version + 1,
      updated_by = v_actor
  WHERE id = p_standard_id
  RETURNING * INTO v_after;

  INSERT INTO public.program_standard_versions(
    standard_id, version, before_state, after_state, change_reason, changed_by
  ) VALUES (
    p_standard_id, v_after.version, TO_JSONB(v_before), TO_JSONB(v_after),
    'Operational progress: ' || p_status, v_actor
  );
  INSERT INTO public.standard_evaluations(
    standard_id, status, method, source_kind, source_id, detail,
    is_automated, evaluated_by
  ) VALUES (
    p_standard_id, v_evaluation_status, 'manual', 'operations_command_center',
    p_standard_id, NULLIF(BTRIM(p_notes), ''), FALSE, v_actor
  );

  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, responsible_employee_id,
    workflow_status, verification_required, created_by, updated_by
  ) VALUES (
    'standard:' || p_standard_id, 'standard', p_standard_id::TEXT,
    v_after.owner_profile_id,
    CASE WHEN v_operational_status IN ('complete','not_applicable') THEN 'completed'
      WHEN v_operational_status = 'partially_complete' THEN 'in_progress' ELSE 'active' END,
    v_after.verification_required, v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    responsible_employee_id = EXCLUDED.responsible_employee_id,
    workflow_status = EXCLUDED.workflow_status,
    verification_required = EXCLUDED.verification_required,
    updated_by = v_actor,
    last_transition_at = NOW();

  IF NULLIF(BTRIM(p_evidence_reference), '') IS NOT NULL THEN
    PERFORM public.record_operational_work_evidence(
      'standard:' || p_standard_id, 'external_reference',
      p_evidence_label, p_evidence_reference
    );
  END IF;
  PERFORM public.append_operational_work_event(
    'standard:' || p_standard_id, 'standard_' || p_status, p_notes,
    JSONB_BUILD_OBJECT('version', v_after.version, 'impact_level', p_impact_level,
      'estimated_minutes', p_estimated_minutes, 'manager_target_date', p_manager_target_date)
  );
  RETURN v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.delegate_program_standard(
  p_standard_id UUID,
  p_profile_id UUID,
  p_reason TEXT DEFAULT 'Owner changed from Program Standards'
)
RETURNS public.program_standards AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_before public.program_standards%ROWTYPE;
  v_after public.program_standards%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may delegate Program Standards';
  END IF;
  IF p_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_profile_id AND is_active
  ) THEN RAISE EXCEPTION 'The selected employee is not active'; END IF;
  SELECT * INTO v_before FROM public.program_standards WHERE id = p_standard_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Program Standard was not found'; END IF;
  UPDATE public.program_standards
  SET owner_profile_id = p_profile_id, updated_by = v_actor, version = version + 1
  WHERE id = p_standard_id RETURNING * INTO v_after;
  INSERT INTO public.program_standard_versions(
    standard_id, version, before_state, after_state, change_reason, changed_by
  ) VALUES (
    p_standard_id, v_after.version, TO_JSONB(v_before), TO_JSONB(v_after),
    COALESCE(NULLIF(BTRIM(p_reason), ''), 'Program Standard owner changed'), v_actor
  );
  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, responsible_employee_id,
    accountable_manager_id, workflow_status, created_by, updated_by
  ) VALUES (
    'standard:' || p_standard_id, 'standard', p_standard_id::TEXT,
    p_profile_id, v_actor, 'active', v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    responsible_employee_id = p_profile_id,
    accountable_manager_id = v_actor,
    updated_by = v_actor,
    last_transition_at = NOW();
  PERFORM public.append_operational_work_event(
    'standard:' || p_standard_id, 'standard_owner_changed', p_reason,
    JSONB_BUILD_OBJECT('profile_id', p_profile_id)
  );
  RETURN v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_operational_work_priority(
  p_work_key TEXT,
  p_override INTEGER,
  p_safety_flag BOOLEAN DEFAULT FALSE,
  p_compliance_flag BOOLEAN DEFAULT FALSE,
  p_payroll_deadline_flag BOOLEAN DEFAULT FALSE,
  p_financial_deadline_flag BOOLEAN DEFAULT FALSE,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.operational_work_states AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_row public.operational_work_states%ROWTYPE;
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may override priority';
  END IF;
  IF NOT public.operational_work_key_exists(p_work_key) THEN RAISE EXCEPTION 'Work item was not found'; END IF;
  IF p_override IS NOT NULL AND (p_override < -500 OR p_override > 500) THEN
    RAISE EXCEPTION 'Priority override must be between -500 and 500';
  END IF;
  IF p_override IS NOT NULL AND NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A manager priority override requires a reason';
  END IF;
  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, manager_priority_override,
    safety_flag, compliance_flag, payroll_deadline_flag, financial_deadline_flag,
    notes, created_by, updated_by
  ) VALUES (
    p_work_key, v_kind, SPLIT_PART(p_work_key, ':', 2), p_override,
    COALESCE(p_safety_flag,FALSE), COALESCE(p_compliance_flag,FALSE),
    COALESCE(p_payroll_deadline_flag,FALSE), COALESCE(p_financial_deadline_flag,FALSE),
    NULLIF(BTRIM(p_reason), ''), v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    manager_priority_override = p_override,
    safety_flag = COALESCE(p_safety_flag,FALSE),
    compliance_flag = COALESCE(p_compliance_flag,FALSE),
    payroll_deadline_flag = COALESCE(p_payroll_deadline_flag,FALSE),
    financial_deadline_flag = COALESCE(p_financial_deadline_flag,FALSE),
    notes = NULLIF(BTRIM(p_reason), ''),
    updated_by = v_actor,
    last_transition_at = NOW()
  RETURNING * INTO v_row;
  PERFORM public.append_operational_work_event(
    p_work_key, 'priority_override', p_reason,
    JSONB_BUILD_OBJECT('override', p_override, 'safety', p_safety_flag,
      'compliance', p_compliance_flag, 'payroll', p_payroll_deadline_flag,
      'financial', p_financial_deadline_flag)
  );
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.transition_operational_work(
  p_work_key TEXT,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
  v_id UUID;
  v_status TEXT;
  v_state_status TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.operational_work_actor_can_execute(p_work_key) THEN
    RAISE EXCEPTION 'You may not update this work item';
  END IF;
  IF p_action NOT IN ('start','mark_blocked','submit_verification','complete','verify') THEN
    RAISE EXCEPTION 'Unsupported operational transition';
  END IF;
  IF p_action IN ('mark_blocked') AND NULLIF(BTRIM(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'A blocked reason is required';
  END IF;
  IF p_action = 'verify' AND NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may verify work';
  END IF;
  v_id := SPLIT_PART(p_work_key, ':', 2)::UUID;

  IF v_kind = 'task' THEN
    v_status := CASE p_action
      WHEN 'start' THEN 'in_progress'
      WHEN 'mark_blocked' THEN 'blocked'
      WHEN 'submit_verification' THEN 'completed'
      WHEN 'complete' THEN 'completed'
      WHEN 'verify' THEN 'verified'
      ELSE NULL
    END;
    IF v_status IS NOT NULL THEN
      PERFORM public.transition_task_status(v_id, v_status,
        CASE WHEN v_status = 'blocked' THEN p_note ELSE NULL END);
    END IF;
  ELSIF v_kind = 'step' AND p_action = 'complete' THEN
    UPDATE public.daily_steps
    SET done = TRUE, done_at = COALESCE(done_at, NOW()), updated_at = NOW()
    WHERE id = v_id;
  ELSIF v_kind = 'obligation' AND p_action = 'complete' THEN
    PERFORM public.complete_operational_obligation(
      v_id, SPLIT_PART(p_work_key, ':', 3), p_note
    );
  ELSIF v_kind = 'standard' AND p_action IN ('complete','verify') THEN
    RAISE EXCEPTION 'Use the Program Standard progress command to preserve evaluation history';
  END IF;

  v_state_status := CASE p_action
    WHEN 'start' THEN 'in_progress'
    WHEN 'mark_blocked' THEN 'blocked'
    WHEN 'submit_verification' THEN 'needs_verification'
    WHEN 'verify' THEN 'completed'
    WHEN 'complete' THEN CASE WHEN COALESCE((
      SELECT verification_required FROM public.operational_work_states WHERE work_key = p_work_key
    ), FALSE) THEN 'needs_verification' ELSE 'completed' END
  END;
  INSERT INTO public.operational_work_states(
    work_key, source_type, source_record_id, workflow_status, created_by, updated_by
  ) VALUES (
    p_work_key, v_kind, SPLIT_PART(p_work_key, ':', 2), v_state_status, v_actor, v_actor
  ) ON CONFLICT (work_key) DO UPDATE SET
    workflow_status = v_state_status, updated_by = v_actor, last_transition_at = NOW();

  IF p_action = 'verify' THEN
    UPDATE public.operational_work_assignments
    SET status = 'completed', ended_at = NOW()
    WHERE work_key = p_work_key AND status = 'submitted_for_verification';
  END IF;

  PERFORM public.append_operational_work_event(
    p_work_key, p_action, p_note, JSONB_BUILD_OBJECT('workflow_status', v_state_status)
  );
  RETURN p_work_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reopen_operational_work(
  p_work_key TEXT,
  p_reason TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
  v_id UUID;
  v_new_task UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may reopen completed work';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A reopen reason is required'; END IF;
  IF NOT public.operational_work_key_exists(p_work_key) THEN RAISE EXCEPTION 'Work item was not found'; END IF;
  v_id := SPLIT_PART(p_work_key, ':', 2)::UUID;

  IF v_kind = 'task' THEN
    INSERT INTO public.tasks(
      title, description, category, priority, status, assigned_to, assigned_crew,
      assigned_by, due_date, due_time, estimated_minutes, zone_id, hole_numbers,
      equipment_needed, materials_needed, checklist, requires_photo_before,
      requires_photo_after, weather_dependent, weather_conditions, parent_task_id,
      notes, standard_id, standard_code, why_it_matters, definition_of_done
    )
    SELECT
      'Reopened: ' || title, description, category, priority, 'pending', assigned_to,
      assigned_crew, v_actor, GREATEST(due_date, CURRENT_DATE), due_time,
      estimated_minutes, zone_id, hole_numbers, equipment_needed, materials_needed,
      checklist, requires_photo_before, requires_photo_after, weather_dependent,
      weather_conditions, id, 'Reopened because: ' || BTRIM(p_reason),
      standard_id, standard_code, why_it_matters, definition_of_done
    FROM public.tasks WHERE id = v_id AND status IN ('completed','verified')
    RETURNING id INTO v_new_task;
    IF v_new_task IS NULL THEN RAISE EXCEPTION 'Only completed or verified tasks can be reopened'; END IF;
    PERFORM public.append_operational_work_event(
      p_work_key, 'reopened_as_successor', p_reason,
      JSONB_BUILD_OBJECT('successor_work_key', 'task:' || v_new_task)
    );
    RETURN 'task:' || v_new_task;
  ELSIF v_kind = 'standard' THEN
    PERFORM public.record_program_standard_progress(
      v_id, 'reopen', p_reason,
      (SELECT estimated_minutes FROM public.program_standards WHERE id = v_id),
      (SELECT impact_level FROM public.program_standards WHERE id = v_id),
      (SELECT manager_target_date FROM public.program_standards WHERE id = v_id),
      NULL, NULL, NULL
    );
  ELSE
    INSERT INTO public.operational_work_states(
      work_key, source_type, source_record_id, workflow_status, created_by, updated_by
    ) VALUES (p_work_key, v_kind, v_id::TEXT, 'active', v_actor, v_actor)
    ON CONFLICT (work_key) DO UPDATE SET
      workflow_status = 'active', updated_by = v_actor, last_transition_at = NOW();
  END IF;
  UPDATE public.operational_work_postponements
  SET active = FALSE, ended_at = NOW(), ended_by = v_actor
  WHERE work_key = p_work_key AND active;
  PERFORM public.append_operational_work_event(p_work_key, 'reopened', p_reason);
  RETURN p_work_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Automatic dependency reactivation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.operational_work_is_satisfied(p_work_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_kind TEXT := SPLIT_PART(p_work_key, ':', 1);
  v_id UUID := SPLIT_PART(p_work_key, ':', 2)::UUID;
BEGIN
  CASE v_kind
    WHEN 'task' THEN RETURN EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.operational_work_states s ON s.work_key = p_work_key
      WHERE t.id = v_id
        AND (t.status = 'verified' OR (
          t.status = 'completed'
          AND COALESCE(t.duty_verification_requirement_state, 'not_required') <> 'required'
          AND COALESCE(s.verification_required, FALSE) = FALSE
        ))
    );
    WHEN 'standard' THEN RETURN EXISTS (
      SELECT 1 FROM public.program_standards
      WHERE id = v_id AND operational_status IN ('complete','not_applicable')
    );
    WHEN 'step' THEN RETURN EXISTS (SELECT 1 FROM public.daily_steps WHERE id = v_id AND done);
    WHEN 'obligation' THEN RETURN EXISTS (
      SELECT 1 FROM public.obligation_completions
      WHERE obligation_id = v_id AND period = SPLIT_PART(p_work_key, ':', 3)
    );
    ELSE RETURN EXISTS (
      SELECT 1 FROM public.operational_work_states
      WHERE work_key = p_work_key AND workflow_status = 'completed'
    );
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reactivate_operational_dependents(p_blocker_work_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_dependency public.operational_work_dependencies%ROWTYPE;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.operational_work_is_satisfied(p_blocker_work_key) THEN RETURN 0; END IF;
  FOR v_dependency IN
    SELECT * FROM public.operational_work_dependencies
    WHERE blocker_work_key = p_blocker_work_key AND active
    FOR UPDATE
  LOOP
    UPDATE public.operational_work_dependencies
    SET active = FALSE, resolved_at = NOW(), resolved_by = v_actor,
        resolution_reason = 'Blocker completed and satisfied its verification requirement'
    WHERE id = v_dependency.id;

    UPDATE public.operational_work_postponements
    SET active = FALSE, ended_at = NOW(), ended_by = v_actor
    WHERE work_key = v_dependency.dependent_work_key
      AND blocking_work_key = p_blocker_work_key
      AND reason = 'waiting_on_another_task'
      AND active;

    IF NOT EXISTS (
      SELECT 1 FROM public.operational_work_dependencies
      WHERE dependent_work_key = v_dependency.dependent_work_key AND active
    ) AND NOT EXISTS (
      SELECT 1 FROM public.operational_work_postponements
      WHERE work_key = v_dependency.dependent_work_key AND active
    ) AND NOT EXISTS (
      SELECT 1 FROM public.operational_work_leadership_handoffs
      WHERE work_key = v_dependency.dependent_work_key
        AND status IN ('preparing_submission','sent_to_leadership','awaiting_response',
          'additional_information_requested','deferred','leadership_completing_action')
    ) THEN
      UPDATE public.operational_work_states
      SET workflow_status = 'active', updated_by = v_actor, last_transition_at = NOW()
      WHERE work_key = v_dependency.dependent_work_key;
      PERFORM public.append_operational_work_event(
        v_dependency.dependent_work_key, 'automatically_reactivated',
        'Blocking work completed',
        JSONB_BUILD_OBJECT('blocker_work_key', p_blocker_work_key,
          'dependency_id', v_dependency.id)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reactivate_after_task_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('completed','verified')
     AND public.operational_work_is_satisfied('task:' || NEW.id) THEN
    PERFORM public.reactivate_operational_dependents('task:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_reactivate_after_task_completion
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.reactivate_after_task_completion();

CREATE OR REPLACE FUNCTION public.reactivate_after_step_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.done AND (OLD.done IS DISTINCT FROM TRUE) THEN
    PERFORM public.reactivate_operational_dependents('step:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_reactivate_after_step_completion
  AFTER UPDATE OF done ON public.daily_steps
  FOR EACH ROW EXECUTE FUNCTION public.reactivate_after_step_completion();

CREATE OR REPLACE FUNCTION public.reactivate_after_obligation_completion()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.reactivate_operational_dependents(
    'obligation:' || NEW.obligation_id || ':' || NEW.period
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_reactivate_after_obligation_completion
  AFTER INSERT ON public.obligation_completions
  FOR EACH ROW EXECUTE FUNCTION public.reactivate_after_obligation_completion();

-- ---------------------------------------------------------------------------
-- Least-privilege RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.operational_work_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_work_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_work_postponements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_work_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_work_leadership_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_work_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_work_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY operational_work_states_select ON public.operational_work_states
  FOR SELECT TO authenticated USING (public.can_read_operational_work(work_key));
CREATE POLICY operational_work_assignments_select ON public.operational_work_assignments
  FOR SELECT TO authenticated USING (public.can_read_operational_work(work_key));
CREATE POLICY operational_work_postponements_select ON public.operational_work_postponements
  FOR SELECT TO authenticated USING (public.can_read_operational_work(work_key));
CREATE POLICY operational_work_dependencies_select ON public.operational_work_dependencies
  FOR SELECT TO authenticated USING (
    public.can_read_operational_work(blocker_work_key)
    OR public.can_read_operational_work(dependent_work_key)
  );
CREATE POLICY operational_work_leadership_select ON public.operational_work_leadership_handoffs
  FOR SELECT TO authenticated USING (public.can_read_operational_work(work_key));
CREATE POLICY operational_work_evidence_select ON public.operational_work_evidence
  FOR SELECT TO authenticated USING (public.can_read_operational_work(work_key));
CREATE POLICY operational_work_events_select ON public.operational_work_events
  FOR SELECT TO authenticated USING (public.can_read_operational_work(work_key));

REVOKE ALL PRIVILEGES ON TABLE
  public.operational_work_states,
  public.operational_work_assignments,
  public.operational_work_postponements,
  public.operational_work_dependencies,
  public.operational_work_leadership_handoffs,
  public.operational_work_evidence,
  public.operational_work_events
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.operational_work_states,
  public.operational_work_assignments,
  public.operational_work_postponements,
  public.operational_work_dependencies,
  public.operational_work_leadership_handoffs,
  public.operational_work_evidence,
  public.operational_work_events
TO authenticated;

-- Standards are now mutated only through the audited progress/delegation RPCs.
DROP POLICY IF EXISTS program_standards_write ON public.program_standards;
REVOKE INSERT, UPDATE, DELETE ON public.program_standards FROM authenticated;
GRANT SELECT ON public.program_standards TO authenticated;

REVOKE ALL ON FUNCTION public.operational_work_key_exists(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_operational_work(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operational_work_actor_can_execute(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_operational_work_event(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegate_operational_work(TEXT,UUID,TEXT,TEXT,DATE,TEXT,DATE,BOOLEAN,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_operational_assignment(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_operational_dependency(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_operational_dependency(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.postpone_operational_work(TEXT,TEXT,TEXT,DATE,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_operational_work_to_leadership(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,DATE,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_operational_leadership_handoff(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_operational_work_evidence(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_program_standard_progress(UUID,TEXT,TEXT,INTEGER,TEXT,DATE,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegate_program_standard(UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_operational_work_priority(TEXT,INTEGER,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_operational_work(TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_operational_work(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operational_work_is_satisfied(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_operational_dependents(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.operational_work_key_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_operational_work(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_work_actor_can_execute(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delegate_operational_work(TEXT,UUID,TEXT,TEXT,DATE,TEXT,DATE,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_operational_assignment(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_operational_dependency(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_operational_dependency(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.postpone_operational_work(TEXT,TEXT,TEXT,DATE,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_operational_work_to_leadership(TEXT,TEXT,TEXT,TEXT,TEXT,DATE,DATE,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_operational_leadership_handoff(UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_operational_work_evidence(TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_program_standard_progress(UUID,TEXT,TEXT,INTEGER,TEXT,DATE,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delegate_program_standard(UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operational_work_priority(TEXT,INTEGER,BOOLEAN,BOOLEAN,BOOLEAN,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_operational_work(TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_operational_work(TEXT,TEXT) TO authenticated;

-- Fail closed if any new table lacks RLS, exposes direct writes, or grants anon.
DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'operational_work_states','operational_work_assignments',
    'operational_work_postponements','operational_work_dependencies',
    'operational_work_leadership_handoffs','operational_work_evidence',
    'operational_work_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'Unified operations assertion failed: % is missing RLS', v_table; END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_table
        AND grantee IN ('PUBLIC','anon','authenticated')
        AND privilege_type IN ('INSERT','UPDATE','DELETE')
    ) THEN RAISE EXCEPTION 'Unified operations assertion failed: direct writer remains on %', v_table; END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_table AND grantee = 'anon'
    ) THEN RAISE EXCEPTION 'Unified operations assertion failed: anon grant remains on %', v_table; END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
