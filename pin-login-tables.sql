-- ============================================================
-- PIN Login System for GreenKeeper Pro
-- ============================================================

-- Pin codes table
CREATE TABLE IF NOT EXISTS pin_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast PIN lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_pin_codes_pin ON pin_codes(pin) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pin_codes_user_id ON pin_codes(user_id);

-- RLS
ALTER TABLE pin_codes ENABLE ROW LEVEL SECURITY;

-- Only managers can read/write pin codes
CREATE POLICY "Managers can read pin codes" ON pin_codes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super')
    )
  );

CREATE POLICY "Managers can insert pin codes" ON pin_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super')
    )
  );

CREATE POLICY "Managers can update pin codes" ON pin_codes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super')
    )
  );

CREATE POLICY "Managers can delete pin codes" ON pin_codes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super')
    )
  );

-- Anon users need to verify PINs (for login)
CREATE POLICY "Anon can verify pins" ON pin_codes
  FOR SELECT TO anon
  USING (is_active = true);

-- Grant permissions
GRANT ALL ON pin_codes TO authenticated;
GRANT SELECT ON pin_codes TO anon;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_pin_codes_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pin_codes_updated
  BEFORE UPDATE ON pin_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_pin_codes_timestamp();

-- ============================================================
-- Seed PINs for existing crew members
-- ============================================================
INSERT INTO pin_codes (user_id, pin) VALUES
  ('11111111-1111-1111-1111-111111111111', '1111'),  -- Eric (Mechanic)
  ('22222222-2222-2222-2222-222222222222', '2222'),  -- V (Crew)
  ('33333333-3333-3333-3333-333333333333', '3333'),  -- George (Crew)
  ('44444444-4444-4444-4444-444444444444', '4444')   -- Cornelio (Crew)
ON CONFLICT (user_id) DO NOTHING;

-- Verify
SELECT p.full_name, p.role, pc.pin, pc.is_active
FROM pin_codes pc
JOIN profiles p ON p.id = pc.user_id
ORDER BY p.full_name;
