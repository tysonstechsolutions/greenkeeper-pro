-- ============================================================================
-- Operation Blueprint Phase 5 — certification & license tracking.
--
-- Food handler cards, cash handling, the pesticide applicator license —
-- anything with an expiry date that must never lapse quietly. Today shows
-- expiring/expired certs alongside the obligation alarms.
--
-- holder is free text: certificate holders span profiles (crew), the
-- pro_shop_staff table, and Tyson himself — a name string covers all three
-- without coupling; profile_id is an optional link when one exists.
-- ============================================================================

CREATE TABLE IF NOT EXISTS certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder TEXT NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cert_name TEXT NOT NULL,
  license_number TEXT,
  issued_date DATE,
  -- NULL = doesn't expire.
  expires_date DATE,
  document_path TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage certifications" ON certifications;
CREATE POLICY "Authenticated manage certifications" ON certifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_certifications_active ON certifications(is_active, expires_date);
