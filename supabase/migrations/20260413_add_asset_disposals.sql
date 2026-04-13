-- Asset Disposal workflow table (NAVCOMPT 2212 Certificate of Disposition)
CREATE TABLE IF NOT EXISTS asset_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_request'
    CHECK (status IN (
      'pending_request',
      'pending_approval',
      'approved',
      'rendering_useless',
      'pending_witness',
      'disposed',
      'routed_to_business',
      'completed'
    )),
  reason TEXT NOT NULL,
  requested_by UUID REFERENCES profiles(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  -- Step 3: approval signatures
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  -- Step 4: render useless
  rendered_useless_at TIMESTAMPTZ,
  rendered_useless_notes TEXT,
  -- Step 5: witness signatures
  witness_1_name TEXT,
  witness_1_signed_at TIMESTAMPTZ,
  witness_2_name TEXT,
  witness_2_signed_at TIMESTAMPTZ,
  disposal_date TIMESTAMPTZ,
  disposal_photo_url TEXT,
  -- Step 6: route to business office
  routed_to_business_at TIMESTAMPTZ,
  routed_to_business_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE asset_disposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view disposals"
  ON asset_disposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create disposals"
  ON asset_disposals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update disposals"
  ON asset_disposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_asset_disposals_equipment_id ON asset_disposals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_asset_disposals_status ON asset_disposals(status);
