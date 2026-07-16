-- Command-center trust boundary: obligations, completion history, and My Day.
--
-- This migration intentionally does not consolidate the parallel work models.
-- It first makes the current command paths attributable and owner-scoped so a
-- later consolidation can rely on the history it reads.

-- ---------------------------------------------------------------------------
-- Obligation completion audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.obligation_completion_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL,
  completion_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('baseline', 'completed', 'voided')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  completion_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (completion_id, event_type)
);

COMMENT ON TABLE public.obligation_completion_audit_events IS
  'Append-only evidence for obligation completion creation and manager correction. The snapshot survives deletion of the active completion row.';

CREATE INDEX IF NOT EXISTS idx_obligation_completion_audit_obligation
  ON public.obligation_completion_audit_events(obligation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obligation_completion_audit_actor
  ON public.obligation_completion_audit_events(actor_id, created_at DESC);

-- Preserve the small amount of history that predates command hardening. The
-- snapshot is exact source data; the migration does not infer a missing actor,
-- reason, or business meaning.
INSERT INTO public.obligation_completion_audit_events (
  obligation_id,
  completion_id,
  event_type,
  actor_id,
  reason,
  completion_snapshot,
  created_at
)
SELECT
  c.obligation_id,
  c.id,
  'baseline',
  c.completed_by,
  'Completion existed before command-center audit hardening',
  TO_JSONB(c),
  c.completed_at
FROM public.obligation_completions c
ON CONFLICT (completion_id, event_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.audit_obligation_completion_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.obligation_completion_audit_events (
    obligation_id,
    completion_id,
    event_type,
    actor_id,
    completion_snapshot
  ) VALUES (
    NEW.obligation_id,
    NEW.id,
    'completed',
    COALESCE((SELECT auth.uid()), NEW.completed_by),
    TO_JSONB(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.protect_obligation_completion_history()
RETURNS TRIGGER AS $$
DECLARE
  v_reason TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Obligation completion history is immutable; void and re-complete it instead';
  END IF;

  v_reason := NULLIF(BTRIM(CURRENT_SETTING('app.obligation_void_reason', TRUE)), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Obligation completions can only be removed by the audited correction command';
  END IF;

  INSERT INTO public.obligation_completion_audit_events (
    obligation_id,
    completion_id,
    event_type,
    actor_id,
    reason,
    completion_snapshot
  ) VALUES (
    OLD.obligation_id,
    OLD.id,
    'voided',
    (SELECT auth.uid()),
    v_reason,
    TO_JSONB(OLD)
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_obligation_completion_insert ON public.obligation_completions;
CREATE TRIGGER trg_audit_obligation_completion_insert
  AFTER INSERT ON public.obligation_completions
  FOR EACH ROW EXECUTE FUNCTION public.audit_obligation_completion_insert();

DROP TRIGGER IF EXISTS trg_protect_obligation_completion_history ON public.obligation_completions;
CREATE TRIGGER trg_protect_obligation_completion_history
  BEFORE UPDATE OR DELETE ON public.obligation_completions
  FOR EACH ROW EXECUTE FUNCTION public.protect_obligation_completion_history();

CREATE OR REPLACE FUNCTION public.prevent_obligation_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Obligation completion audit events are append-only';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_obligation_audit_mutation ON public.obligation_completion_audit_events;
CREATE TRIGGER trg_prevent_obligation_audit_mutation
  BEFORE UPDATE OR DELETE ON public.obligation_completion_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_obligation_audit_mutation();

-- ---------------------------------------------------------------------------
-- Server-authoritative obligation commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_execute_obligation(p_obligation_id UUID)
RETURNS BOOLEAN AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      public.can_manage_daily_operations()
      OR EXISTS (
        SELECT 1
        FROM public.obligations o
        WHERE o.id = p_obligation_id
          AND (
            o.owner_profile_id = (SELECT auth.uid())
            OR o.backup_profile_id = (SELECT auth.uid())
          )
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.complete_operational_obligation(
  p_obligation_id UUID,
  p_period TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.obligation_completions AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_obligation public.obligations%ROWTYPE;
  v_completion public.obligation_completions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO v_obligation
  FROM public.obligations
  WHERE id = p_obligation_id
    AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active obligation not found';
  END IF;
  IF NOT public.can_execute_obligation(v_obligation.id) THEN
    RAISE EXCEPTION 'Only the primary owner, backup owner, or an operations manager may complete this obligation';
  END IF;

  IF p_period IS NULL
    OR (v_obligation.cadence = 'weekly' AND p_period !~ '^W[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    OR (v_obligation.cadence = 'monthly' AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
    OR (v_obligation.cadence = 'quarterly' AND p_period !~ '^[0-9]{4}-Q[1-4]$')
    OR (v_obligation.cadence = 'annual' AND p_period !~ '^[0-9]{4}$')
    OR v_obligation.cadence NOT IN ('weekly', 'monthly', 'quarterly', 'annual')
  THEN
    RAISE EXCEPTION 'Period key does not match the obligation cadence';
  END IF;

  INSERT INTO public.obligation_completions (
    obligation_id,
    period,
    completed_by,
    note
  ) VALUES (
    v_obligation.id,
    p_period,
    v_actor,
    NULLIF(BTRIM(p_note), '')
  )
  ON CONFLICT (obligation_id, period) DO NOTHING
  RETURNING * INTO v_completion;

  IF v_completion.id IS NULL THEN
    SELECT * INTO v_completion
    FROM public.obligation_completions
    WHERE obligation_id = v_obligation.id
      AND period = p_period;
  END IF;

  RETURN v_completion;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.void_operational_obligation_completion(
  p_obligation_id UUID,
  p_period TEXT,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_completion_id UUID;
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT public.can_manage_daily_operations() THEN
    RAISE EXCEPTION 'Only an active operations manager may correct an obligation completion';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A correction reason is required';
  END IF;

  PERFORM SET_CONFIG('app.obligation_void_reason', v_reason, TRUE);
  DELETE FROM public.obligation_completions
  WHERE obligation_id = p_obligation_id
    AND period = p_period
  RETURNING id INTO v_completion_id;

  IF v_completion_id IS NULL THEN
    RAISE EXCEPTION 'Obligation completion not found';
  END IF;

  RETURN v_completion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.audit_obligation_completion_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_obligation_completion_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_obligation_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_execute_obligation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_operational_obligation(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_operational_obligation_completion(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_execute_obligation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_operational_obligation(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_operational_obligation_completion(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Replace broad RLS policies. Dynamic drops make the boundary fail closed even
-- if a preview environment accumulated an older policy name.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table TEXT;
  v_policy RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'obligations',
    'obligation_completions',
    'obligation_completion_audit_events',
    'daily_goals',
    'daily_steps'
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

ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation_completion_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and owners view obligations" ON public.obligations
  FOR SELECT TO authenticated
  USING (
    public.can_manage_daily_operations()
    OR owner_profile_id = (SELECT auth.uid())
    OR backup_profile_id = (SELECT auth.uid())
  );
CREATE POLICY "Managers insert obligations" ON public.obligations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_daily_operations());
CREATE POLICY "Managers update obligations" ON public.obligations
  FOR UPDATE TO authenticated
  USING (public.can_manage_daily_operations())
  WITH CHECK (public.can_manage_daily_operations());
CREATE POLICY "Managers delete obligations without history" ON public.obligations
  FOR DELETE TO authenticated
  USING (public.can_manage_daily_operations());

CREATE POLICY "Managers and owners view obligation completions" ON public.obligation_completions
  FOR SELECT TO authenticated
  USING (public.can_execute_obligation(obligation_id));

CREATE POLICY "Managers and owners view obligation completion audit" ON public.obligation_completion_audit_events
  FOR SELECT TO authenticated
  USING (
    public.can_manage_daily_operations()
    OR actor_id = (SELECT auth.uid())
    OR public.can_execute_obligation(obligation_id)
  );

CREATE POLICY "Creators view daily goals" ON public.daily_goals
  FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()));
CREATE POLICY "Creators insert daily goals" ON public.daily_goals
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Creators update daily goals" ON public.daily_goals
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Creators delete daily goals" ON public.daily_goals
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Creators view daily steps" ON public.daily_steps
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND (
      goal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.daily_goals g
        WHERE g.id = daily_steps.goal_id
          AND g.created_by = (SELECT auth.uid())
      )
    )
  );
CREATE POLICY "Creators insert daily steps" ON public.daily_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      goal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.daily_goals g
        WHERE g.id = daily_steps.goal_id
          AND g.created_by = (SELECT auth.uid())
      )
    )
  );
CREATE POLICY "Creators update daily steps" ON public.daily_steps
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      goal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.daily_goals g
        WHERE g.id = daily_steps.goal_id
          AND g.created_by = (SELECT auth.uid())
      )
    )
  );
CREATE POLICY "Creators delete daily steps" ON public.daily_steps
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obligations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.obligation_completions FROM authenticated;
GRANT SELECT ON public.obligation_completions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.obligation_completion_audit_events FROM authenticated;
GRANT SELECT ON public.obligation_completion_audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_steps TO authenticated;

NOTIFY pgrst, 'reload schema';
