-- Phase 0B.5: least-privilege calendar, qualification, onboarding, and
-- workforce-schedule boundaries.
--
-- This is a forward-only security correction. Existing business rows are
-- preserved. Protected browser writes move behind fixed-search-path commands,
-- actors are derived from auth.uid(), removals become explicit terminal states,
-- and every mutation emits an append-only audit event plus a transactional
-- outbox event. No policy, staffing, certification, or schedule facts are
-- invented here.

-- ---------------------------------------------------------------------------
-- Shared authorization, audit, and transactional outbox foundations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active = TRUE
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_schedule_for(p_employee_id UUID)
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
          AND (
            (
              actor.role = 'pro'
              AND (
                employee.department = 'pro_shop'
                OR employee.role_group IN ('pro_shop_staff','golf_operations_assistant','recreation_aide')
              )
            )
            OR employee.supervisor_id = actor.id
          )
      )
    );
$function$;

COMMENT ON FUNCTION public.can_manage_schedule_for(UUID) IS
  'Schedule authority for active managers, the established pro scheduling role, or the employee recorded direct supervisor.';

CREATE TABLE IF NOT EXISTS public.domain_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL,
  reason TEXT,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_audit_events_record
  ON public.domain_audit_events(record_type, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_audit_events_actor
  ON public.domain_audit_events(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.operational_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_outbox_pending
  ON public.operational_outbox_events(status, available_at, created_at)
  WHERE status IN ('pending','failed');

CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_domain_audit_events ON public.domain_audit_events;
CREATE TRIGGER trg_protect_domain_audit_events
  BEFORE UPDATE OR DELETE ON public.domain_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

CREATE OR REPLACE FUNCTION public.assert_allowed_jsonb_keys(
  p_values JSONB,
  p_allowed TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_key TEXT;
BEGIN
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'Values must be a JSON object';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_values)
  LOOP
    IF NOT (v_key = ANY(p_allowed)) THEN
      RAISE EXCEPTION 'Field % is not client-writable', v_key;
    END IF;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Actor/history columns and non-destructive terminal states
-- ---------------------------------------------------------------------------

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by UUID,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS document_bucket TEXT NOT NULL DEFAULT 'photos',
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID,
  ADD COLUMN IF NOT EXISTS retirement_reason TEXT;

ALTER TABLE public.certifications DROP CONSTRAINT IF EXISTS certifications_document_bucket_check;
ALTER TABLE public.certifications ADD CONSTRAINT certifications_document_bucket_check
  CHECK (document_bucket IN ('photos','certification-documents'));

ALTER TABLE public.onboarding_documents
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID,
  ADD COLUMN IF NOT EXISTS retirement_reason TEXT;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE public.time_off_requests
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.time_off_requests DROP CONSTRAINT IF EXISTS time_off_requests_status_check;
ALTER TABLE public.time_off_requests ADD CONSTRAINT time_off_requests_status_check
  CHECK (status IN ('pending','approved','denied','cancelled'));
ALTER TABLE public.time_off_requests DROP CONSTRAINT IF EXISTS time_off_requests_date_order_check;
ALTER TABLE public.time_off_requests ADD CONSTRAINT time_off_requests_date_order_check
  CHECK (end_date >= start_date);

ALTER TABLE public.pro_shop_staff
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.pro_shop_schedules
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID;
ALTER TABLE public.pro_shop_shifts
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS generation_key TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID,
  ADD COLUMN IF NOT EXISTS retirement_reason TEXT;
ALTER TABLE public.pro_shop_time_off
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID,
  ADD COLUMN IF NOT EXISTS retirement_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_shop_shifts_active_generation
  ON public.pro_shop_shifts(schedule_id, generation_key)
  WHERE is_active = TRUE AND generation_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.attribute_phase0b5_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '% mutations require an authenticated actor', TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% history cannot be deleted; use the protected terminal command', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME = 'calendar_events' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.canceled_at IS NOT NULL THEN
      RAISE EXCEPTION 'Canceled calendar events are immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'certifications' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'Retired certifications are immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'onboarding_documents' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'Retired onboarding documents are immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'schedules' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.is_active = FALSE AND NEW.is_active = FALSE THEN
      RAISE EXCEPTION 'Voided schedule rows are immutable unless explicitly reactivated';
    END IF;
  ELSIF TG_TABLE_NAME = 'time_off_requests' THEN
    IF TG_OP = 'INSERT' THEN NEW.submitted_by := v_actor; ELSE NEW.submitted_by := OLD.submitted_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Reviewed or canceled time-off requests are immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Time-off history cannot be moved to another employee';
    END IF;
  ELSIF TG_TABLE_NAME = 'pro_shop_staff' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
  ELSIF TG_TABLE_NAME = 'pro_shop_schedules' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
  ELSIF TG_TABLE_NAME = 'pro_shop_shifts' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.is_active = FALSE AND NEW.is_active = FALSE THEN
      RAISE EXCEPTION 'Retired pro-shop shifts are immutable unless explicitly reactivated';
    END IF;
  ELSIF TG_TABLE_NAME = 'pro_shop_time_off' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := v_actor; ELSE NEW.created_by := OLD.created_by; END IF;
    NEW.updated_by := v_actor; NEW.updated_at := NOW();
    IF TG_OP = 'UPDATE' AND OLD.is_active = FALSE AND NEW.is_active = FALSE THEN
      RAISE EXCEPTION 'Retired pro-shop time-off rows are immutable unless explicitly reactivated';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_phase0b5_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_audit_id UUID := gen_random_uuid();
  v_record_id UUID := NEW.id;
  v_action TEXT := COALESCE(NULLIF(current_setting('app.change_action', TRUE), ''), LOWER(TG_OP));
  v_reason TEXT := NULLIF(current_setting('app.change_reason', TRUE), '');
BEGIN
  INSERT INTO public.domain_audit_events (
    id, domain, record_type, record_id, action, actor_id, reason, before_state, after_state
  ) VALUES (
    v_audit_id, TG_ARGV[0], TG_TABLE_NAME, v_record_id, v_action, v_actor, v_reason,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    to_jsonb(NEW)
  );
  INSERT INTO public.operational_outbox_events (
    event_key, topic, aggregate_type, aggregate_id, event_type, actor_id, payload
  ) VALUES (
    v_audit_id::TEXT, 'operations.' || TG_ARGV[0], TG_TABLE_NAME, v_record_id,
    v_action, v_actor, jsonb_build_object('audit_event_id', v_audit_id)
  );
  RETURN NEW;
END;
$function$;

DO $trigger_setup$
DECLARE
  v_pair TEXT[];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['calendar_events','calendar'],
    ARRAY['certifications','qualifications'],
    ARRAY['onboarding_documents','onboarding'],
    ARRAY['schedules','scheduling'],
    ARRAY['time_off_requests','scheduling'],
    ARRAY['pro_shop_staff','pro_shop_scheduling'],
    ARRAY['pro_shop_schedules','pro_shop_scheduling'],
    ARRAY['pro_shop_shifts','pro_shop_scheduling'],
    ARRAY['pro_shop_time_off','pro_shop_scheduling']
  ]
  LOOP
    EXECUTE FORMAT('DROP TRIGGER IF EXISTS trg_00_attribute_phase0b5 ON public.%I', v_pair[1]);
    EXECUTE FORMAT(
      'CREATE TRIGGER trg_00_attribute_phase0b5 BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.attribute_phase0b5_mutation()',
      v_pair[1]
    );
    EXECUTE FORMAT('DROP TRIGGER IF EXISTS trg_99_audit_phase0b5 ON public.%I', v_pair[1]);
    EXECUTE FORMAT(
      'CREATE TRIGGER trg_99_audit_phase0b5 AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_phase0b5_mutation(%L)',
      v_pair[1], v_pair[2]
    );
  END LOOP;
END;
$trigger_setup$;

-- ---------------------------------------------------------------------------
-- Calendar commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_calendar_event(
  p_event_id UUID,
  p_values JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.calendar_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_current public.calendar_events%ROWTYPE;
  v_next public.calendar_events%ROWTYPE;
BEGIN
  IF NOT public.is_active_staff() THEN RAISE EXCEPTION 'Active staff access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values, ARRAY[
    'title','category','event_date','end_date','start_time','end_time','all_day',
    'location','expected_guests','contact_name','contact_phone','status','notes'
  ]);

  IF p_event_id IS NULL THEN
    v_next := jsonb_populate_record(NULL::public.calendar_events, p_values);
    v_next.id := gen_random_uuid();
    v_next.category := COALESCE(v_next.category, 'other');
    v_next.all_day := COALESCE(v_next.all_day, FALSE);
    v_next.created_at := NOW(); v_next.updated_at := NOW();
  ELSE
    SELECT * INTO v_current FROM public.calendar_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Calendar event not found'; END IF;
    IF NOT (public.is_manager() OR v_current.created_by = v_actor) THEN
      RAISE EXCEPTION 'Not authorized to update this calendar event';
    END IF;
    v_next := jsonb_populate_record(v_current, p_values);
    v_next.id := v_current.id; v_next.created_by := v_current.created_by;
    v_next.created_at := v_current.created_at; v_next.canceled_at := v_current.canceled_at;
    v_next.canceled_by := v_current.canceled_by; v_next.cancellation_reason := v_current.cancellation_reason;
  END IF;

  IF NULLIF(BTRIM(v_next.title), '') IS NULL OR v_next.event_date IS NULL THEN
    RAISE EXCEPTION 'Calendar title and event date are required';
  END IF;
  IF v_next.end_date IS NOT NULL AND v_next.end_date < v_next.event_date THEN
    RAISE EXCEPTION 'Calendar end date cannot precede the event date';
  END IF;
  IF v_next.expected_guests IS NOT NULL AND v_next.expected_guests < 0 THEN
    RAISE EXCEPTION 'Expected guests cannot be negative';
  END IF;

  PERFORM set_config('app.change_action', CASE WHEN p_event_id IS NULL THEN 'calendar_event_created' ELSE 'calendar_event_updated' END, TRUE);
  PERFORM set_config('app.change_reason', COALESCE(NULLIF(BTRIM(p_reason), ''), 'Calendar event saved'), TRUE);

  IF p_event_id IS NULL THEN
    INSERT INTO public.calendar_events (
      id,title,category,event_date,end_date,start_time,end_time,all_day,location,
      expected_guests,contact_name,contact_phone,status,notes,created_at,updated_at
    ) VALUES (
      v_next.id,v_next.title,v_next.category,v_next.event_date,v_next.end_date,
      v_next.start_time,v_next.end_time,v_next.all_day,v_next.location,
      v_next.expected_guests,v_next.contact_name,v_next.contact_phone,v_next.status,
      v_next.notes,v_next.created_at,v_next.updated_at
    ) RETURNING * INTO v_next;
  ELSE
    UPDATE public.calendar_events SET
      title=v_next.title, category=v_next.category, event_date=v_next.event_date,
      end_date=v_next.end_date, start_time=v_next.start_time, end_time=v_next.end_time,
      all_day=v_next.all_day, location=v_next.location, expected_guests=v_next.expected_guests,
      contact_name=v_next.contact_name, contact_phone=v_next.contact_phone,
      status=v_next.status, notes=v_next.notes
    WHERE id=p_event_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_calendar_event(p_event_id UUID, p_reason TEXT)
RETURNS public.calendar_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_row public.calendar_events%ROWTYPE;
  v_actor UUID := auth.uid();
BEGIN
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
  SELECT * INTO v_row FROM public.calendar_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar event not found'; END IF;
  IF NOT (public.is_manager() OR v_row.created_by=v_actor) THEN RAISE EXCEPTION 'Not authorized to cancel this calendar event'; END IF;
  PERFORM set_config('app.change_action','calendar_event_canceled',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.calendar_events SET status='canceled', canceled_at=NOW(), canceled_by=v_actor,
    cancellation_reason=BTRIM(p_reason) WHERE id=p_event_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Certification and onboarding commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_certification(p_certification_id UUID, p_values JSONB, p_reason TEXT DEFAULT NULL)
RETURNS public.certifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_current public.certifications%ROWTYPE;
  v_next public.certifications%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values, ARRAY[
    'holder','profile_id','cert_name','license_number','issued_date','expires_date',
    'document_path','document_bucket','notes'
  ]);
  IF p_certification_id IS NULL THEN
    v_next := jsonb_populate_record(NULL::public.certifications,p_values);
    v_next.id := gen_random_uuid(); v_next.is_active := TRUE;
    v_next.document_bucket := COALESCE(v_next.document_bucket,'certification-documents');
    v_next.created_at := NOW(); v_next.updated_at := NOW();
  ELSE
    SELECT * INTO v_current FROM public.certifications WHERE id=p_certification_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Certification not found'; END IF;
    v_next := jsonb_populate_record(v_current,p_values);
    v_next.id:=v_current.id; v_next.created_at:=v_current.created_at;
    v_next.created_by:=v_current.created_by; v_next.is_active:=v_current.is_active;
    v_next.retired_at:=v_current.retired_at; v_next.retired_by:=v_current.retired_by;
    v_next.retirement_reason:=v_current.retirement_reason;
  END IF;
  IF NULLIF(BTRIM(v_next.holder),'') IS NULL OR NULLIF(BTRIM(v_next.cert_name),'') IS NULL THEN
    RAISE EXCEPTION 'Certification holder and name are required';
  END IF;
  IF v_next.issued_date IS NOT NULL AND v_next.expires_date IS NOT NULL AND v_next.expires_date < v_next.issued_date THEN
    RAISE EXCEPTION 'Certification expiry cannot precede issue date';
  END IF;
  IF v_next.document_bucket NOT IN ('photos','certification-documents') THEN
    RAISE EXCEPTION 'Unsupported certification document bucket';
  END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_certification_id IS NULL THEN 'certification_created' ELSE 'certification_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Certification saved'),TRUE);
  IF p_certification_id IS NULL THEN
    INSERT INTO public.certifications (
      id,holder,profile_id,cert_name,license_number,issued_date,expires_date,
      document_path,document_bucket,notes,is_active,created_at,updated_at
    ) VALUES (
      v_next.id,v_next.holder,v_next.profile_id,v_next.cert_name,v_next.license_number,
      v_next.issued_date,v_next.expires_date,v_next.document_path,v_next.document_bucket,
      v_next.notes,TRUE,v_next.created_at,v_next.updated_at
    ) RETURNING * INTO v_next;
  ELSE
    UPDATE public.certifications SET holder=v_next.holder, profile_id=v_next.profile_id,
      cert_name=v_next.cert_name, license_number=v_next.license_number,
      issued_date=v_next.issued_date, expires_date=v_next.expires_date,
      document_path=v_next.document_path, document_bucket=v_next.document_bucket,
      notes=v_next.notes WHERE id=p_certification_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retire_certification(p_certification_id UUID,p_reason TEXT)
RETURNS public.certifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.certifications%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Retirement reason is required'; END IF;
  PERFORM set_config('app.change_action','certification_retired',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.certifications SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),
    retirement_reason=BTRIM(p_reason) WHERE id=p_certification_id AND is_active=TRUE RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active certification not found'; END IF;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_onboarding_document(p_document_id UUID,p_values JSONB,p_reason TEXT DEFAULT NULL)
RETURNS public.onboarding_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.onboarding_documents%ROWTYPE; v_next public.onboarding_documents%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['slug','title','category','roles','body','sort_order']);
  IF p_document_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.onboarding_documents,p_values);
    v_next.id:=gen_random_uuid(); v_next.is_active:=TRUE; v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.onboarding_documents WHERE id=p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding document not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values);
    v_next.id:=v_current.id; v_next.slug:=v_current.slug; v_next.created_at:=v_current.created_at;
    v_next.created_by:=v_current.created_by; v_next.is_active:=v_current.is_active;
    v_next.retired_at:=v_current.retired_at; v_next.retired_by:=v_current.retired_by;
    v_next.retirement_reason:=v_current.retirement_reason;
  END IF;
  IF NULLIF(BTRIM(v_next.slug),'') IS NULL OR NULLIF(BTRIM(v_next.title),'') IS NULL THEN
    RAISE EXCEPTION 'Onboarding slug and title are required';
  END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_document_id IS NULL THEN 'onboarding_document_created' ELSE 'onboarding_document_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Onboarding document saved'),TRUE);
  IF p_document_id IS NULL THEN
    INSERT INTO public.onboarding_documents(id,slug,title,category,roles,body,sort_order,is_active,created_at,updated_at)
    VALUES(v_next.id,v_next.slug,v_next.title,v_next.category,COALESCE(v_next.roles,'{}'::TEXT[]),COALESCE(v_next.body,''),
      COALESCE(v_next.sort_order,0),TRUE,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;
  ELSE
    UPDATE public.onboarding_documents SET title=v_next.title,category=v_next.category,roles=v_next.roles,
      body=v_next.body,sort_order=v_next.sort_order WHERE id=p_document_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_onboarding_documents(p_documents JSONB,p_replace_existing BOOLEAN DEFAULT FALSE,p_reason TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_doc JSONB; v_existing UUID; v_count INTEGER:=0;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF jsonb_typeof(p_documents) <> 'array' THEN RAISE EXCEPTION 'Documents must be a JSON array'; END IF;
  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documents)
  LOOP
    SELECT id INTO v_existing FROM public.onboarding_documents WHERE slug=v_doc->>'slug' FOR UPDATE;
    IF v_existing IS NULL OR p_replace_existing THEN
      PERFORM public.save_onboarding_document(v_existing,v_doc,COALESCE(p_reason,'Onboarding defaults synchronized'));
      v_count:=v_count+1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retire_onboarding_document(p_document_id UUID,p_reason TEXT)
RETURNS public.onboarding_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.onboarding_documents%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Retirement reason is required'; END IF;
  PERFORM set_config('app.change_action','onboarding_document_retired',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.onboarding_documents SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),
    retirement_reason=BTRIM(p_reason) WHERE id=p_document_id AND is_active RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active onboarding document not found'; END IF;
  RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Generic schedules and employee time-off commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_staff_schedule(p_user_id UUID,p_schedule_date DATE,p_values JSONB,p_reason TEXT DEFAULT NULL)
RETURNS public.schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.schedules%ROWTYPE;
BEGIN
  IF NOT public.can_manage_schedule_for(p_user_id) THEN RAISE EXCEPTION 'Not authorized to schedule this employee'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['shift_start','shift_end','shift_type','crew_assignment','notes']);
  PERFORM set_config('app.change_action','staff_schedule_saved',TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Schedule entry saved'),TRUE);
  INSERT INTO public.schedules(user_id,schedule_date,shift_start,shift_end,shift_type,crew_assignment,notes,is_active)
  VALUES(p_user_id,p_schedule_date,(p_values->>'shift_start')::TIME,(p_values->>'shift_end')::TIME,
    NULLIF(p_values->>'shift_type',''),NULLIF(p_values->>'crew_assignment',''),NULLIF(p_values->>'notes',''),TRUE)
  ON CONFLICT(user_id,schedule_date) DO UPDATE SET
    shift_start=EXCLUDED.shift_start,shift_end=EXCLUDED.shift_end,shift_type=EXCLUDED.shift_type,
    crew_assignment=EXCLUDED.crew_assignment,notes=EXCLUDED.notes,is_active=TRUE,
    voided_at=NULL,voided_by=NULL,void_reason=NULL
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_upsert_staff_schedules(p_entries JSONB,p_reason TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_entry JSONB; v_count INTEGER:=0;
BEGIN
  IF jsonb_typeof(p_entries) <> 'array' THEN RAISE EXCEPTION 'Schedule entries must be a JSON array'; END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    PERFORM public.upsert_staff_schedule((v_entry->>'user_id')::UUID,(v_entry->>'schedule_date')::DATE,
      v_entry-ARRAY['user_id','schedule_date'],COALESCE(p_reason,'Bulk schedule update'));
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_staff_schedule(p_user_id UUID,p_schedule_date DATE,p_reason TEXT)
RETURNS public.schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.schedules%ROWTYPE;
BEGIN
  IF NOT public.can_manage_schedule_for(p_user_id) THEN RAISE EXCEPTION 'Not authorized to change this employee schedule'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Void reason is required'; END IF;
  PERFORM set_config('app.change_action','staff_schedule_voided',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.schedules SET is_active=FALSE,voided_at=NOW(),voided_by=auth.uid(),void_reason=BTRIM(p_reason)
  WHERE user_id=p_user_id AND schedule_date=p_schedule_date AND is_active RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active schedule entry not found'; END IF;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_time_off_request(p_start_date DATE,p_end_date DATE,p_request_type TEXT,p_reason TEXT DEFAULT NULL)
RETURNS public.time_off_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_actor UUID:=auth.uid(); v_row public.time_off_requests%ROWTYPE;
BEGIN
  IF NOT public.is_active_staff() THEN RAISE EXCEPTION 'Active staff access required'; END IF;
  IF p_end_date<p_start_date THEN RAISE EXCEPTION 'Time-off end date cannot precede start date'; END IF;
  IF p_request_type NOT IN ('vacation','sick','personal','military','other') THEN RAISE EXCEPTION 'Unsupported time-off type'; END IF;
  PERFORM set_config('app.change_action','time_off_submitted',TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Time-off request submitted'),TRUE);
  INSERT INTO public.time_off_requests(user_id,start_date,end_date,request_type,reason,status)
  VALUES(v_actor,p_start_date,p_end_date,p_request_type,NULLIF(BTRIM(p_reason),''),'pending') RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_time_off_request_for_employee(
  p_user_id UUID,p_start_date DATE,p_end_date DATE,p_request_type TEXT,
  p_status TEXT DEFAULT 'pending',p_reason TEXT DEFAULT NULL
)
RETURNS public.time_off_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.time_off_requests%ROWTYPE;
BEGIN
  IF NOT public.can_manage_schedule_for(p_user_id) THEN RAISE EXCEPTION 'Not authorized to create time off for this employee'; END IF;
  IF p_end_date<p_start_date THEN RAISE EXCEPTION 'Time-off end date cannot precede start date'; END IF;
  IF p_request_type NOT IN ('vacation','sick','personal','military','other') THEN RAISE EXCEPTION 'Unsupported time-off type'; END IF;
  IF p_status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Created time off must be pending or approved'; END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_status='approved' THEN 'time_off_created_approved' ELSE 'time_off_created_pending' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Manager-created time-off record'),TRUE);
  INSERT INTO public.time_off_requests(
    user_id,start_date,end_date,request_type,reason,status,reviewed_by,reviewed_at
  ) VALUES(
    p_user_id,p_start_date,p_end_date,p_request_type,NULLIF(BTRIM(p_reason),''),p_status,
    CASE WHEN p_status='approved' THEN auth.uid() ELSE NULL END,
    CASE WHEN p_status='approved' THEN NOW() ELSE NULL END
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_time_off_request(p_request_id UUID,p_decision TEXT,p_notes TEXT DEFAULT NULL)
RETURNS public.time_off_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.time_off_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.time_off_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time-off request not found'; END IF;
  IF NOT public.can_manage_schedule_for(v_row.user_id) THEN RAISE EXCEPTION 'Not authorized to review this request'; END IF;
  IF v_row.status<>'pending' THEN RAISE EXCEPTION 'Only pending requests can be reviewed'; END IF;
  IF p_decision NOT IN ('approved','denied') THEN RAISE EXCEPTION 'Decision must be approved or denied'; END IF;
  PERFORM set_config('app.change_action','time_off_'||p_decision,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_notes),''),'Time-off request '||p_decision),TRUE);
  UPDATE public.time_off_requests SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=NOW(),
    notes=CASE WHEN p_notes IS NULL THEN notes ELSE BTRIM(p_notes) END
  WHERE id=p_request_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_time_off_request(p_request_id UUID,p_reason TEXT)
RETURNS public.time_off_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.time_off_requests%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
  SELECT * INTO v_row FROM public.time_off_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time-off request not found'; END IF;
  IF v_row.user_id<>auth.uid() AND NOT public.can_manage_schedule_for(v_row.user_id) THEN
    RAISE EXCEPTION 'Not authorized to cancel this request';
  END IF;
  IF v_row.status<>'pending' THEN RAISE EXCEPTION 'Only pending requests can be canceled'; END IF;
  PERFORM set_config('app.change_action','time_off_cancelled',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.time_off_requests SET status='cancelled',cancellation_reason=BTRIM(p_reason)
  WHERE id=p_request_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Pro-shop schedule commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_pro_shop_staff(p_staff_id UUID,p_values JSONB,p_reason TEXT DEFAULT NULL)
RETURNS public.pro_shop_staff
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_staff%ROWTYPE; v_next public.pro_shop_staff%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY[
    'full_name','position','default_group','availability_text','availability','phone','is_active','sort_order','notes','flex'
  ]);
  IF p_staff_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.pro_shop_staff,p_values); v_next.id:=gen_random_uuid();
    v_next.position:=COALESCE(v_next.position,'rec_aid'); v_next.default_group:=COALESCE(v_next.default_group,'outside');
    v_next.availability:=COALESCE(v_next.availability,'{}'::JSONB); v_next.is_active:=COALESCE(v_next.is_active,TRUE);
    v_next.sort_order:=COALESCE(v_next.sort_order,0); v_next.flex:=COALESCE(v_next.flex,TRUE);
    v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.pro_shop_staff WHERE id=p_staff_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop staff record not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.profile_id:=v_current.profile_id;
    v_next.created_at:=v_current.created_at; v_next.created_by:=v_current.created_by;
  END IF;
  IF NULLIF(BTRIM(v_next.full_name),'') IS NULL THEN RAISE EXCEPTION 'Staff name is required'; END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_staff_id IS NULL THEN 'pro_shop_staff_created' ELSE 'pro_shop_staff_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop staff saved'),TRUE);
  IF p_staff_id IS NULL THEN
    INSERT INTO public.pro_shop_staff(id,full_name,position,default_group,availability_text,availability,phone,is_active,sort_order,notes,flex,created_at,updated_at)
    VALUES(v_next.id,v_next.full_name,v_next.position,v_next.default_group,v_next.availability_text,v_next.availability,v_next.phone,
      v_next.is_active,v_next.sort_order,v_next.notes,v_next.flex,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_staff SET full_name=v_next.full_name,position=v_next.position,default_group=v_next.default_group,
      availability_text=v_next.availability_text,availability=v_next.availability,phone=v_next.phone,is_active=v_next.is_active,
      sort_order=v_next.sort_order,notes=v_next.notes,flex=v_next.flex WHERE id=p_staff_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_pro_shop_schedule(p_schedule_id UUID,p_values JSONB,p_reason TEXT DEFAULT NULL)
RETURNS public.pro_shop_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_schedules%ROWTYPE; v_next public.pro_shop_schedules%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['month','title','notes','dismissed_warnings']);
  IF p_schedule_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.pro_shop_schedules,p_values); v_next.id:=gen_random_uuid();
    v_next.status:='draft'; v_next.dismissed_warnings:=COALESCE(v_next.dismissed_warnings,'{}'::JSONB);
    v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.pro_shop_schedules WHERE id=p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.month:=v_current.month;
    v_next.status:=v_current.status; v_next.created_at:=v_current.created_at; v_next.created_by:=v_current.created_by;
    v_next.published_at:=v_current.published_at; v_next.published_by:=v_current.published_by;
  END IF;
  IF v_next.month IS NULL OR NULLIF(BTRIM(v_next.title),'') IS NULL THEN RAISE EXCEPTION 'Schedule month and title are required'; END IF;
  IF EXTRACT(DAY FROM v_next.month)<>1 THEN RAISE EXCEPTION 'Schedule month must be the first day of the month'; END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_schedule_id IS NULL THEN 'pro_shop_schedule_created' ELSE 'pro_shop_schedule_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop schedule saved'),TRUE);
  IF p_schedule_id IS NULL THEN
    INSERT INTO public.pro_shop_schedules(id,month,title,status,notes,dismissed_warnings,created_at,updated_at)
    VALUES(v_next.id,v_next.month,v_next.title,'draft',v_next.notes,v_next.dismissed_warnings,v_next.created_at,v_next.updated_at)
    RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_schedules SET title=v_next.title,notes=v_next.notes,dismissed_warnings=v_next.dismissed_warnings
    WHERE id=p_schedule_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_pro_shop_schedule_shifts(
  p_schedule_id UUID,p_rows JSONB,p_replace BOOLEAN,p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_item JSONB; v_keys TEXT[]:=ARRAY[]::TEXT[]; v_key TEXT; v_existing UUID; v_count INTEGER:=0;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Replacement reason is required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pro_shop_schedules WHERE id=p_schedule_id) THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;
  IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Shift rows must be a JSON array'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    PERFORM public.assert_allowed_jsonb_keys(v_item,ARRAY['staff_id','shift_date','group','start_time','end_time','source','note']);
    IF (v_item->>'staff_id') IS NULL OR (v_item->>'shift_date') IS NULL OR (v_item->>'start_time') IS NULL OR (v_item->>'end_time') IS NULL THEN
      RAISE EXCEPTION 'Generated shifts require staff, date, start, and end';
    END IF;
    v_key:=md5(concat_ws('|',p_schedule_id::TEXT,v_item->>'staff_id',v_item->>'shift_date',v_item->>'group',v_item->>'start_time',v_item->>'end_time'));
    v_keys:=array_append(v_keys,v_key);
  END LOOP;
  PERFORM set_config('app.change_action','pro_shop_schedule_regenerated',TRUE);
  PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  IF p_replace THEN
    UPDATE public.pro_shop_shifts SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),retirement_reason=BTRIM(p_reason)
    WHERE schedule_id=p_schedule_id AND is_active AND (generation_key IS NULL OR NOT(generation_key=ANY(v_keys)));
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_key:=md5(concat_ws('|',p_schedule_id::TEXT,v_item->>'staff_id',v_item->>'shift_date',v_item->>'group',v_item->>'start_time',v_item->>'end_time'));
    SELECT id INTO v_existing FROM public.pro_shop_shifts WHERE schedule_id=p_schedule_id AND generation_key=v_key ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_existing IS NULL THEN
      INSERT INTO public.pro_shop_shifts(schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active)
      VALUES(p_schedule_id,(v_item->>'staff_id')::UUID,(v_item->>'shift_date')::DATE,COALESCE(v_item->>'group','outside'),
        (v_item->>'start_time')::TIME,(v_item->>'end_time')::TIME,COALESCE(v_item->>'source','template'),NULLIF(v_item->>'note',''),v_key,TRUE);
    ELSIF EXISTS(SELECT 1 FROM public.pro_shop_shifts WHERE id=v_existing AND is_active=FALSE) THEN
      UPDATE public.pro_shop_shifts SET is_active=TRUE,retired_at=NULL,retired_by=NULL,retirement_reason=NULL,
        source=COALESCE(v_item->>'source','template'),note=NULLIF(v_item->>'note','') WHERE id=v_existing;
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_pro_shop_shift(p_shift_id UUID,p_values JSONB,p_reason TEXT DEFAULT NULL)
RETURNS public.pro_shop_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_shifts%ROWTYPE; v_next public.pro_shop_shifts%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['schedule_id','staff_id','shift_date','group','start_time','end_time','source','note']);
  IF p_shift_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.pro_shop_shifts,p_values); v_next.id:=gen_random_uuid(); v_next.is_active:=TRUE;
    v_next.source:=COALESCE(v_next.source,'manual'); v_next."group":=COALESCE(v_next."group",'outside');
    v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.pro_shop_shifts WHERE id=p_shift_id FOR UPDATE;
    IF NOT FOUND OR NOT v_current.is_active THEN RAISE EXCEPTION 'Active pro-shop shift not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.created_at:=v_current.created_at;
    v_next.created_by:=v_current.created_by; v_next.generation_key:=NULL;
  END IF;
  IF v_next.staff_id IS NULL OR v_next.shift_date IS NULL OR v_next.start_time IS NULL OR v_next.end_time IS NULL THEN
    RAISE EXCEPTION 'Shift staff, date, start, and end are required';
  END IF;
  IF v_next.end_time<=v_next.start_time THEN RAISE EXCEPTION 'Shift end must be after start'; END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_shift_id IS NULL THEN 'pro_shop_shift_created' ELSE 'pro_shop_shift_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop shift saved'),TRUE);
  IF p_shift_id IS NULL THEN
    INSERT INTO public.pro_shop_shifts(id,schedule_id,staff_id,shift_date,"group",start_time,end_time,source,note,generation_key,is_active,created_at,updated_at)
    VALUES(v_next.id,v_next.schedule_id,v_next.staff_id,v_next.shift_date,v_next."group",v_next.start_time,v_next.end_time,
      v_next.source,v_next.note,NULL,TRUE,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_shifts SET schedule_id=v_next.schedule_id,staff_id=v_next.staff_id,shift_date=v_next.shift_date,
      "group"=v_next."group",start_time=v_next.start_time,end_time=v_next.end_time,source=v_next.source,note=v_next.note,generation_key=NULL
    WHERE id=p_shift_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retire_pro_shop_shift(p_shift_id UUID,p_reason TEXT)
RETURNS public.pro_shop_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.pro_shop_shifts%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Retirement reason is required'; END IF;
  PERFORM set_config('app.change_action','pro_shop_shift_retired',TRUE); PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.pro_shop_shifts SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),retirement_reason=BTRIM(p_reason)
  WHERE id=p_shift_id AND is_active RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active pro-shop shift not found'; END IF; RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_pro_shop_time_off(p_time_off_id UUID,p_values JSONB,p_reason TEXT DEFAULT NULL)
RETURNS public.pro_shop_time_off
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_current public.pro_shop_time_off%ROWTYPE; v_next public.pro_shop_time_off%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  PERFORM public.assert_allowed_jsonb_keys(p_values,ARRAY['staff_id','start_date','end_date','reason']);
  IF p_time_off_id IS NULL THEN
    v_next:=jsonb_populate_record(NULL::public.pro_shop_time_off,p_values); v_next.id:=gen_random_uuid(); v_next.is_active:=TRUE;
    v_next.created_at:=NOW(); v_next.updated_at:=NOW();
  ELSE
    SELECT * INTO v_current FROM public.pro_shop_time_off WHERE id=p_time_off_id FOR UPDATE;
    IF NOT FOUND OR NOT v_current.is_active THEN RAISE EXCEPTION 'Active pro-shop time-off row not found'; END IF;
    v_next:=jsonb_populate_record(v_current,p_values); v_next.id:=v_current.id; v_next.created_at:=v_current.created_at; v_next.created_by:=v_current.created_by;
  END IF;
  IF v_next.staff_id IS NULL OR v_next.start_date IS NULL OR v_next.end_date IS NULL OR v_next.end_date<v_next.start_date THEN
    RAISE EXCEPTION 'Valid pro-shop time-off staff and date range are required';
  END IF;
  PERFORM set_config('app.change_action',CASE WHEN p_time_off_id IS NULL THEN 'pro_shop_time_off_created' ELSE 'pro_shop_time_off_updated' END,TRUE);
  PERFORM set_config('app.change_reason',COALESCE(NULLIF(BTRIM(p_reason),''),'Pro-shop time off saved'),TRUE);
  IF p_time_off_id IS NULL THEN
    INSERT INTO public.pro_shop_time_off(id,staff_id,start_date,end_date,reason,is_active,created_at,updated_at)
    VALUES(v_next.id,v_next.staff_id,v_next.start_date,v_next.end_date,v_next.reason,TRUE,v_next.created_at,v_next.updated_at) RETURNING * INTO v_next;
  ELSE
    UPDATE public.pro_shop_time_off SET staff_id=v_next.staff_id,start_date=v_next.start_date,end_date=v_next.end_date,reason=v_next.reason
    WHERE id=p_time_off_id RETURNING * INTO v_next;
  END IF;
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retire_pro_shop_time_off(p_time_off_id UUID,p_reason TEXT)
RETURNS public.pro_shop_time_off
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.pro_shop_time_off%ROWTYPE;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Retirement reason is required'; END IF;
  PERFORM set_config('app.change_action','pro_shop_time_off_retired',TRUE); PERFORM set_config('app.change_reason',BTRIM(p_reason),TRUE);
  UPDATE public.pro_shop_time_off SET is_active=FALSE,retired_at=NOW(),retired_by=auth.uid(),retirement_reason=BTRIM(p_reason)
  WHERE id=p_time_off_id AND is_active RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active pro-shop time-off row not found'; END IF; RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_pro_shop_schedule(
  p_schedule_id UUID,p_reminder_date DATE,p_reminder_title TEXT,p_reminder_notes TEXT DEFAULT NULL
)
RETURNS public.pro_shop_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.pro_shop_schedules%ROWTYPE; v_event_id UUID;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Manager access required'; END IF;
  IF NULLIF(BTRIM(p_reminder_title),'') IS NULL THEN RAISE EXCEPTION 'Reminder title is required'; END IF;
  PERFORM set_config('app.change_action','pro_shop_schedule_published',TRUE);
  PERFORM set_config('app.change_reason','Pro-shop schedule published',TRUE);
  UPDATE public.pro_shop_schedules SET status='published',published_at=NOW(),published_by=auth.uid()
  WHERE id=p_schedule_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pro-shop schedule not found'; END IF;
  SELECT id INTO v_event_id FROM public.calendar_events
  WHERE title=p_reminder_title AND canceled_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  PERFORM public.save_calendar_event(v_event_id,jsonb_build_object(
    'title',p_reminder_title,'category','deadline','event_date',p_reminder_date,
    'all_day',TRUE,'notes',p_reminder_notes
  ),'Schedule publication reminder synchronized');
  RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- RLS, grants, and protected certification storage
-- ---------------------------------------------------------------------------

DO $policy_cleanup$
DECLARE v_table TEXT; v_policy RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'calendar_events','certifications','onboarding_documents','schedules','time_off_requests',
    'pro_shop_staff','pro_shop_schedules','pro_shop_shifts','pro_shop_time_off'
  ] LOOP
    FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=v_table
    LOOP EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON public.%I',v_policy.policyname,v_table); END LOOP;
    EXECUTE FORMAT('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE FORMAT('REVOKE ALL ON public.%I FROM anon, authenticated',v_table);
    EXECUTE FORMAT('GRANT SELECT ON public.%I TO authenticated',v_table);
  END LOOP;
END;
$policy_cleanup$;

CREATE POLICY calendar_events_active_staff_read ON public.calendar_events FOR SELECT TO authenticated USING(public.is_active_staff());
CREATE POLICY certifications_scoped_read ON public.certifications FOR SELECT TO authenticated
  USING(public.is_manager() OR profile_id=auth.uid() OR public.can_manage_staff_member(profile_id));
CREATE POLICY onboarding_documents_active_staff_read ON public.onboarding_documents FOR SELECT TO authenticated USING(public.is_active_staff());
CREATE POLICY schedules_scoped_read ON public.schedules FOR SELECT TO authenticated
  USING(user_id=auth.uid() OR public.can_manage_schedule_for(user_id));
CREATE POLICY time_off_requests_scoped_read ON public.time_off_requests FOR SELECT TO authenticated
  USING(user_id=auth.uid() OR public.can_manage_schedule_for(user_id));
CREATE POLICY pro_shop_staff_manager_read ON public.pro_shop_staff FOR SELECT TO authenticated
  USING(public.is_manager() OR profile_id=auth.uid() OR public.can_manage_staff_member(profile_id));
CREATE POLICY pro_shop_schedules_manager_read ON public.pro_shop_schedules FOR SELECT TO authenticated USING(public.is_manager());
CREATE POLICY pro_shop_shifts_manager_read ON public.pro_shop_shifts FOR SELECT TO authenticated USING(public.is_manager());
CREATE POLICY pro_shop_time_off_manager_read ON public.pro_shop_time_off FOR SELECT TO authenticated USING(public.is_manager());

ALTER TABLE public.domain_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_outbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domain_audit_events_manager_read ON public.domain_audit_events;
DROP POLICY IF EXISTS operational_outbox_events_manager_read ON public.operational_outbox_events;
CREATE POLICY domain_audit_events_manager_read ON public.domain_audit_events FOR SELECT TO authenticated USING(public.is_manager());
CREATE POLICY operational_outbox_events_manager_read ON public.operational_outbox_events FOR SELECT TO authenticated USING(public.is_manager());
REVOKE ALL ON public.domain_audit_events,public.operational_outbox_events FROM anon,authenticated;
GRANT SELECT ON public.domain_audit_events,public.operational_outbox_events TO authenticated;

INSERT INTO storage.buckets(id,name,public)
VALUES('certification-documents','certification-documents',FALSE)
ON CONFLICT(id) DO UPDATE SET public=FALSE;

DROP POLICY IF EXISTS certification_documents_insert ON storage.objects;
DROP POLICY IF EXISTS certification_documents_select ON storage.objects;
DROP POLICY IF EXISTS certification_documents_delete ON storage.objects;
CREATE POLICY certification_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='certification-documents' AND public.is_manager()
    AND (storage.foldername(name))[1]=auth.uid()::TEXT);
CREATE POLICY certification_documents_select ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='certification-documents' AND (
    public.is_manager() OR EXISTS(
      SELECT 1 FROM public.certifications c
      WHERE c.document_bucket='certification-documents' AND c.document_path=name
        AND (c.profile_id=auth.uid() OR public.can_manage_staff_member(c.profile_id))
    )
  ));
CREATE POLICY certification_documents_delete_orphan ON storage.objects FOR DELETE TO authenticated
  USING(bucket_id='certification-documents' AND public.is_manager() AND NOT EXISTS(
    SELECT 1 FROM public.certifications c
    WHERE c.document_bucket='certification-documents' AND c.document_path=name
  ));

DO $grant_commands$
DECLARE v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.is_active_staff()',
    'public.can_manage_schedule_for(uuid)',
    'public.save_calendar_event(uuid,jsonb,text)',
    'public.cancel_calendar_event(uuid,text)',
    'public.save_certification(uuid,jsonb,text)',
    'public.retire_certification(uuid,text)',
    'public.save_onboarding_document(uuid,jsonb,text)',
    'public.sync_onboarding_documents(jsonb,boolean,text)',
    'public.retire_onboarding_document(uuid,text)',
    'public.upsert_staff_schedule(uuid,date,jsonb,text)',
    'public.bulk_upsert_staff_schedules(jsonb,text)',
    'public.void_staff_schedule(uuid,date,text)',
    'public.submit_time_off_request(date,date,text,text)',
    'public.create_time_off_request_for_employee(uuid,date,date,text,text,text)',
    'public.review_time_off_request(uuid,text,text)',
    'public.cancel_time_off_request(uuid,text)',
    'public.save_pro_shop_staff(uuid,jsonb,text)',
    'public.save_pro_shop_schedule(uuid,jsonb,text)',
    'public.replace_pro_shop_schedule_shifts(uuid,jsonb,boolean,text)',
    'public.save_pro_shop_shift(uuid,jsonb,text)',
    'public.retire_pro_shop_shift(uuid,text)',
    'public.save_pro_shop_time_off(uuid,jsonb,text)',
    'public.retire_pro_shop_time_off(uuid,text)',
    'public.publish_pro_shop_schedule(uuid,date,text,text)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||v_signature||' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '||v_signature||' TO authenticated';
  END LOOP;
END;
$grant_commands$;

COMMENT ON TABLE public.domain_audit_events IS 'Append-only actor-attributed mutation history for protected operational domains.';
COMMENT ON TABLE public.operational_outbox_events IS 'Transactional event outbox. Protected domain mutations enqueue here in the same database transaction.';
COMMENT ON COLUMN public.certifications.document_bucket IS 'Legacy rows remain in photos; new protected files use certification-documents. Legacy object migration requires authorized storage copy/verification.';

NOTIFY pgrst, 'reload schema';
