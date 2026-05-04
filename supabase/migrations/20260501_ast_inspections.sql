-- ============================================================================
-- AST (Aboveground Storage Tank) Monthly Inspections — STI SP001
-- ============================================================================
--
-- Captures the monthly STI SP001 visual checklist required for the fuel AST
-- and the used-cooking-oil AST. Per the standard the completed checklist must
-- be retained for 36 months and is forwarded to environmental for filing.
--
-- The form has 19 fixed checklist items grouped into four sections (Tank &
-- Piping, Equipment on tank, Containment, Concrete Exterior AST) plus a
-- general "Other Conditions" item. Each item has a Yes / No* / N/A status
-- and a comments field. Item 16 is intentionally inverted (Yes* is the
-- non-conformance) — handled in the UI; the DB just stores the raw status.
--
-- Items live in a JSONB column rather than 19 pairs of TEXT columns because
--   • the schema is fixed (we never query individual items in SQL)
--   • adding/removing items later (if STI revises SP001) is a UI-only change
--   • the audit PDF is rendered client-side from the JSON anyway
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--
--   DROP TABLE IF EXISTS ast_inspections;
-- ============================================================================

CREATE TABLE IF NOT EXISTS ast_inspections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- General inspection information ------------------------------------------
  inspection_date        DATE NOT NULL,
  prior_inspection_date  DATE,
  -- Per SP001 the form must be retained for 36 months. UI defaults this to
  -- inspection_date + 36 months at insert; stored explicitly so a future rule
  -- change doesn't silently shorten retention on historic records.
  retain_until_date      DATE NOT NULL,

  inspector_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  inspector_name         TEXT NOT NULL,
  inspector_title        TEXT,
  -- Typed signature (we don't ask for a drawn signature on mobile — typing
  -- the full name in the signature field is the same legal weight per SP001
  -- and matches how the user fills the paper form by hand today).
  inspector_signature    TEXT,

  -- Tanks covered by this inspection. Free text because the user has two
  -- ASTs (fuel + used cooking oil) but might add more later.
  tank_ids               TEXT NOT NULL,
  facility_name          TEXT,
  facility_id            TEXT,

  -- Items 1-19 keyed by string number:
  --   { "1": { "status": "yes" | "no" | "na", "comment": "..." }, ... }
  items                  JSONB NOT NULL DEFAULT '{}'::jsonb,

  additional_comments    TEXT,

  -- 'draft' lets the inspector save partial work and finish later.
  status                 TEXT NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('draft', 'completed')),

  created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ast_inspections_date
  ON ast_inspections(inspection_date DESC);

CREATE INDEX IF NOT EXISTS idx_ast_inspections_status
  ON ast_inspections(status);

-- Reuse the existing updated_at trigger function. The function is defined in
-- the initial schema migration; if your env doesn't have it, see
-- 001_initial_schema.sql for the canonical definition.
DROP TRIGGER IF EXISTS ast_inspections_touch_updated_at ON ast_inspections;
CREATE TRIGGER ast_inspections_touch_updated_at
  BEFORE UPDATE ON ast_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ast_inspections ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the inspection roster (sup, asst sup,
-- foreman, etc. — environmental reports often need to be reviewed by anyone
-- on staff).
DROP POLICY IF EXISTS "ast_inspections_select_auth" ON ast_inspections;
CREATE POLICY "ast_inspections_select_auth"
  ON ast_inspections FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Only management roles can create or modify inspections. Foreman is
-- intentionally NOT in this set — the inspection is an SP001 owner's-rep
-- responsibility and should be signed by a supervisor.
DROP POLICY IF EXISTS "ast_inspections_insert_management" ON ast_inspections;
CREATE POLICY "ast_inspections_insert_management"
  ON ast_inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

DROP POLICY IF EXISTS "ast_inspections_update_management" ON ast_inspections;
CREATE POLICY "ast_inspections_update_management"
  ON ast_inspections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

DROP POLICY IF EXISTS "ast_inspections_delete_management" ON ast_inspections;
CREATE POLICY "ast_inspections_delete_management"
  ON ast_inspections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid())
      AND role IN ('super', 'asst_super', 'director', 'gm')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ast_inspections TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE ast_inspections IS
  'Monthly STI SP001 visual inspection checklist for aboveground storage tanks (fuel + used cooking oil). 36-month retention.';
