-- Revenue tracking for GM oversight
CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('greens_fees','cart_rentals','pro_shop','food_beverage','events','memberships','driving_range','other')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  rounds_count INTEGER, -- for greens_fees category
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capital projects for GM tracking
CREATE TABLE IF NOT EXISTS capital_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','in_progress','completed','cancelled')),
  budget_amount NUMERIC(12,2),
  spent_amount NUMERIC(12,2) DEFAULT 0,
  start_date DATE,
  target_completion DATE,
  actual_completion DATE,
  category TEXT CHECK (category IN ('renovation','equipment','infrastructure','building','irrigation','other')),
  approval_notes TEXT,
  approved_by TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view revenue" ON revenue_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leadership can manage revenue" ON revenue_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can view projects" ON capital_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leadership can manage projects" ON capital_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_revenue_date ON revenue_entries(entry_date DESC);
CREATE INDEX idx_revenue_category ON revenue_entries(category);
CREATE INDEX idx_capital_projects_status ON capital_projects(status);
