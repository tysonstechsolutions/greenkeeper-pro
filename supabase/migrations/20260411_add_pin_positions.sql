-- ============================================================================
-- Add pin_positions table for daily pin sheet management
-- ============================================================================
-- Stores the daily hole cup location (paces from front edge, paces from left
-- edge) for each of the 18 holes. Supers set pins each morning, and the pro
-- shop prints a PDF pin sheet for the day. Staff can edit; pro shop and
-- seasonal employees can only read.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pin_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  hole_number int NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  paces_from_front int NOT NULL CHECK (paces_from_front >= 0 AND paces_from_front <= 50),
  paces_from_left int NOT NULL CHECK (paces_from_left >= 0 AND paces_from_left <= 40),
  difficulty text CHECK (difficulty IN ('easy','medium','hard')),
  notes text,
  set_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_pin_positions_date ON pin_positions(date);

ALTER TABLE pin_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent)
DO $$
BEGIN
  -- SELECT: any authenticated user (so pro shop and seasonal can view/print)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_select_authenticated'
  ) THEN
    CREATE POLICY "pin_positions_select_authenticated"
      ON pin_positions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  -- INSERT: staff only (super / asst_super / director / foreman / mechanic / crew)
  -- Pro shop and seasonal are blocked.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_insert_staff'
  ) THEN
    CREATE POLICY "pin_positions_insert_staff"
      ON pin_positions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;

  -- UPDATE: staff only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_update_staff'
  ) THEN
    CREATE POLICY "pin_positions_update_staff"
      ON pin_positions
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;

  -- DELETE: staff only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_delete_staff'
  ) THEN
    CREATE POLICY "pin_positions_delete_staff"
      ON pin_positions
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;
END$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION pin_positions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pin_positions_updated_at ON pin_positions;
CREATE TRIGGER pin_positions_updated_at
  BEFORE UPDATE ON pin_positions
  FOR EACH ROW
  EXECUTE FUNCTION pin_positions_set_updated_at();
