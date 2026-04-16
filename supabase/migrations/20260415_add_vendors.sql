CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('spray_contractor','equipment_dealer','parts_supplier','irrigation','landscaping','construction','fuel','seed_sod','general')),
  supplies TEXT, -- what they provide
  contract_end_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view vendors" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage vendors" ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_vendors_category ON vendors(category);
