-- ============================================================================
-- Work Orders
-- ============================================================================
--
-- Tracks facility/grounds work-order requests submitted through the app.
-- Each work order captures the nature of the request, facility, description
-- of work (AI-generated), POC contacts, photos, and lifecycle status.
--
-- The sequence-numbered `wo_sequence_number` is auto-assigned via a BEFORE
-- INSERT trigger, mirroring the purchase_requests pattern.
--
-- Status lifecycle:
--   draft      → saved but not yet submitted
--   submitted  → sent for review
--   sent       → dispatched to the work crew / contractor
--   completed  → work finished
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   DROP TABLE IF EXISTS work_orders;
--   DROP SEQUENCE IF EXISTS wo_sequence_seq;
--   DROP FUNCTION IF EXISTS assign_wo_sequence_number();
-- ============================================================================

-- Sequence for auto-incrementing work-order numbers.
CREATE SEQUENCE IF NOT EXISTS wo_sequence_seq
  START 1
  INCREMENT 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS work_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sequence number (auto-assigned by trigger)
  wo_sequence_number      INT,

  -- Header ------------------------------------------------------------------
  date_submitted          DATE NOT NULL DEFAULT CURRENT_DATE,
  nature_of_request       TEXT,
  facility_bldg           TEXT,
  program_area_room       TEXT,
  cost_center             TEXT,

  -- Work details
  description_of_work     TEXT NOT NULL,
  work_type               TEXT,

  -- Primary point of contact
  primary_poc_email       TEXT,
  primary_poc_phone       TEXT,

  -- Secondary point of contact
  secondary_poc_name      TEXT,
  secondary_poc_phone     TEXT,

  -- Enclosures / attachments
  number_of_enclosures    TEXT DEFAULT '0',
  photos                  JSONB DEFAULT '[]'::jsonb,

  -- Lifecycle
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'submitted', 'sent', 'completed')),

  created_by              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes -------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_work_orders_date
  ON work_orders(date_submitted DESC);

CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON work_orders(status);

CREATE INDEX IF NOT EXISTS idx_work_orders_sequence
  ON work_orders(wo_sequence_number);

CREATE INDEX IF NOT EXISTS idx_work_orders_created_by
  ON work_orders(created_by);

-- Sequence trigger ----------------------------------------------------------

CREATE OR REPLACE FUNCTION assign_wo_sequence_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wo_sequence_number IS NULL THEN
    NEW.wo_sequence_number := nextval('wo_sequence_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS work_orders_assign_seq ON work_orders;
CREATE TRIGGER work_orders_assign_seq
  BEFORE INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION assign_wo_sequence_number();

-- Updated-at trigger --------------------------------------------------------

DROP TRIGGER IF EXISTS work_orders_touch_updated_at ON work_orders;
CREATE TRIGGER work_orders_touch_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row-Level Security --------------------------------------------------------

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read work orders.
DROP POLICY IF EXISTS "work_orders_select_auth" ON work_orders;
CREATE POLICY "work_orders_select_auth"
  ON work_orders FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Management can create work orders.
DROP POLICY IF EXISTS "work_orders_insert_management" ON work_orders;
CREATE POLICY "work_orders_insert_management"
  ON work_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  );

-- Management can update work orders.
DROP POLICY IF EXISTS "work_orders_update_management" ON work_orders;
CREATE POLICY "work_orders_update_management"
  ON work_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  );

-- Management can delete work orders.
DROP POLICY IF EXISTS "work_orders_delete_management" ON work_orders;
CREATE POLICY "work_orders_delete_management"
  ON work_orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm', 'foreman')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON work_orders TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE work_orders IS
  'Facility/grounds work-order requests with AI-generated descriptions and photo attachments.';
