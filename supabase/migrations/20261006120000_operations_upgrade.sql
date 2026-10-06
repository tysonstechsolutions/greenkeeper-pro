-- ============================================================================
-- Operations upgrade (2026-10-06). One file, run once in the SQL editor.
--
--   1. app_migrations: newer migrations record themselves here so the
--      System Health page can tell which ones were run.
--   2. Re-applies the 90-day evaluation rule from 20261005120000 (harmless if
--      that file was already run).
--   3. The F&B Manager can only change and see the Buckleys schedule, enforced
--      in the database for every schedule table.
--   4. US Foods invoices with their line items, for food cost and the order
--      guide.
--   5. Evaluation follow-through: approving official signed, discussed with
--      the employee, copy given.
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- Idempotent. Safe to run again.
-- ============================================================================

-- ── 1. Applied-migration log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_migrations_read ON public.app_migrations;
CREATE POLICY app_migrations_read ON public.app_migrations
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.app_migrations TO authenticated;

-- ── 2. 90-day evaluations next to yearly ones (same as 20261005120000) ──────

ALTER TABLE public.staff_evaluations
  DROP CONSTRAINT IF EXISTS staff_evaluations_one_per_period;
CREATE UNIQUE INDEX IF NOT EXISTS staff_evaluations_one_per_period
  ON public.staff_evaluations(employee_id, period_start)
  WHERE rating_reason <> 'ninety_day';
CREATE UNIQUE INDEX IF NOT EXISTS staff_evaluations_one_ninety_day_per_period
  ON public.staff_evaluations(employee_id, period_start)
  WHERE rating_reason = 'ninety_day';

-- ── 3. F&B Manager: Buckleys schedule only ─────────────────────────────────

-- The schedule area a row belongs to (time off belongs to its person).
CREATE OR REPLACE FUNCTION public.schedule_row_area(p_table TEXT, p_row JSONB)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_table = 'pro_shop_time_off' THEN
    RETURN (SELECT s.area FROM public.pro_shop_staff s WHERE s.id = (p_row->>'staff_id')::UUID);
  END IF;
  RETURN p_row->>'area';
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_fb_manager_schedule_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_old TEXT;
  v_new TEXT;
BEGIN
  -- Managers and everyone else are unaffected. Only an F&B Manager who is
  -- not also a course manager is held to the Buckleys schedule.
  IF NOT public.is_fb_manager() OR public.is_manager() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := public.schedule_row_area(TG_TABLE_NAME, to_jsonb(OLD));
    IF v_old IS DISTINCT FROM 'buckleys' THEN
      RAISE EXCEPTION 'The F&B Manager can only change the Buckleys schedule';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := public.schedule_row_area(TG_TABLE_NAME, to_jsonb(NEW));
    IF v_new IS DISTINCT FROM 'buckleys' THEN
      RAISE EXCEPTION 'The F&B Manager can only change the Buckleys schedule';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- One guard trigger per schedule table (written out, no DO block, for the SQL editor).
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_staff;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_staff
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_schedules;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_shifts;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_shifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_time_off;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_time_off
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_coverage_rules;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_coverage_rules
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_schedule_settings;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();
DROP TRIGGER IF EXISTS trg_fb_manager_schedule_area ON public.pro_shop_week_templates;
CREATE TRIGGER trg_fb_manager_schedule_area BEFORE INSERT OR UPDATE OR DELETE ON public.pro_shop_week_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_fb_manager_schedule_area();

-- Reading: managers see every area, the F&B Manager sees Buckleys.
CREATE OR REPLACE FUNCTION public.can_read_schedule_area(p_area TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.is_manager() OR (public.is_fb_manager() AND p_area = 'buckleys');
$function$;
GRANT EXECUTE ON FUNCTION public.can_read_schedule_area(TEXT) TO authenticated;

DROP POLICY IF EXISTS pro_shop_staff_schedule_manager_read ON public.pro_shop_staff;
CREATE POLICY pro_shop_staff_schedule_manager_read ON public.pro_shop_staff
  FOR SELECT TO authenticated USING (public.can_read_schedule_area(area));
DROP POLICY IF EXISTS pro_shop_schedules_schedule_manager_read ON public.pro_shop_schedules;
CREATE POLICY pro_shop_schedules_schedule_manager_read ON public.pro_shop_schedules
  FOR SELECT TO authenticated USING (public.can_read_schedule_area(area));
DROP POLICY IF EXISTS pro_shop_shifts_schedule_manager_read ON public.pro_shop_shifts;
CREATE POLICY pro_shop_shifts_schedule_manager_read ON public.pro_shop_shifts
  FOR SELECT TO authenticated USING (public.can_read_schedule_area(area));
DROP POLICY IF EXISTS pro_shop_week_templates_schedule_manager_read ON public.pro_shop_week_templates;
CREATE POLICY pro_shop_week_templates_schedule_manager_read ON public.pro_shop_week_templates
  FOR SELECT TO authenticated USING (public.can_read_schedule_area(area));
DROP POLICY IF EXISTS pro_shop_time_off_schedule_manager_read ON public.pro_shop_time_off;
CREATE POLICY pro_shop_time_off_schedule_manager_read ON public.pro_shop_time_off
  FOR SELECT TO authenticated
  USING (public.can_read_schedule_area(public.schedule_row_area('pro_shop_time_off', jsonb_build_object('staff_id', staff_id))));

-- ── 4. US Foods invoices with line items ───────────────────────────────────

-- Each saved invoice or credit memo. Older hand-typed rows keep working.
ALTER TABLE public.restaurant_purchases
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS against_invoice TEXT,
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS delivery_order TEXT,
  ADD COLUMN IF NOT EXISTS site TEXT,
  ADD COLUMN IF NOT EXISTS food_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS alcohol_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS supplies_amount NUMERIC(12,2);

ALTER TABLE public.restaurant_purchases
  DROP CONSTRAINT IF EXISTS restaurant_purchases_kind_check;
ALTER TABLE public.restaurant_purchases
  ADD CONSTRAINT restaurant_purchases_kind_check CHECK (kind IN ('invoice', 'credit'));

-- The same invoice can not be imported twice.
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_purchases_one_document
  ON public.restaurant_purchases (lower(vendor), kind, document_number)
  WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_purchase_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id    UUID NOT NULL REFERENCES public.restaurant_purchases(id) ON DELETE CASCADE,
  line_no        INTEGER NOT NULL,
  section        TEXT,
  product_number TEXT NOT NULL,
  description    TEXT NOT NULL,
  brand          TEXT,
  pack_size      TEXT,
  qty            NUMERIC(10,2) NOT NULL,
  unit           TEXT,
  unit_price     NUMERIC(12,4) NOT NULL,
  extended       NUMERIC(12,2) NOT NULL,
  category       TEXT NOT NULL DEFAULT 'food' CHECK (category IN ('food', 'alcohol', 'supplies')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_purchase_lines_purchase
  ON public.restaurant_purchase_lines (purchase_id, line_no);
CREATE INDEX IF NOT EXISTS idx_restaurant_purchase_lines_product
  ON public.restaurant_purchase_lines (product_number);

ALTER TABLE public.restaurant_purchase_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurant_purchase_lines_manage ON public.restaurant_purchase_lines;
CREATE POLICY restaurant_purchase_lines_manage ON public.restaurant_purchase_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_purchase_lines TO authenticated;

-- ── 5. Evaluation follow-through ───────────────────────────────────────────

-- After an evaluation is final: the approving official signs it, the
-- supervisor goes over it with the employee, and the employee gets a copy.
ALTER TABLE public.staff_evaluations
  ADD COLUMN IF NOT EXISTS approved_on DATE,
  ADD COLUMN IF NOT EXISTS discussed_on DATE,
  ADD COLUMN IF NOT EXISTS copy_given_on DATE;

-- Same rules as before, plus one exception: on a final evaluation the three
-- follow-through dates can still be filled in. Nothing else on it can change.
CREATE OR REPLACE FUNCTION public.protect_staff_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_follow_through TEXT[] := ARRAY['approved_on', 'discussed_on', 'copy_given_on', 'updated_at', 'updated_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Evaluations cannot be deleted. Reopen and correct the draft instead.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end THEN
      RAISE EXCEPTION 'An evaluation cannot be moved to another rating period';
    END IF;

    IF OLD.status = 'final' THEN
      IF NEW.status = 'final' THEN
        IF (to_jsonb(NEW) - v_follow_through) = (to_jsonb(OLD) - v_follow_through) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Finalized evaluations are locked. Reopen it to draft first.';
      END IF;
      IF NOT public.is_manager() THEN
        RAISE EXCEPTION 'Only a manager can reopen a finalized evaluation';
      END IF;
      NEW.finalized_at := NULL;
    END IF;
  END IF;

  IF NEW.status = 'final' THEN
    NEW.finalized_at := now();
  ELSE
    NEW.finalized_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261006120000_operations_upgrade')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
