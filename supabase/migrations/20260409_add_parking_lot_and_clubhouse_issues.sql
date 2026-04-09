-- Parking Lot / Cart Path Issues table
CREATE TABLE IF NOT EXISTS parking_lot_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT, -- e.g. "Cart path hole 3-4", "Main parking lot entrance"
  issue_type TEXT NOT NULL DEFAULT 'pothole' CHECK (issue_type IN ('pothole', 'crack', 'drainage', 'erosion', 'marking', 'curbing', 'other')),
  severity TEXT NOT NULL DEFAULT 'moderate' CHECK (severity IN ('minor', 'moderate', 'severe', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'scheduled', 'completed')),
  photos TEXT[] DEFAULT '{}',
  repair_notes TEXT,
  estimated_cost DECIMAL(10,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Clubhouse Issues table
CREATE TABLE IF NOT EXISTS clubhouse_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT, -- e.g. "Pro shop", "Men's locker room", "Kitchen"
  category TEXT NOT NULL DEFAULT 'damage' CHECK (category IN ('damage', 'cleaning', 'order', 'maintenance')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'ordered', 'scheduled', 'completed')),
  photos TEXT[] DEFAULT '{}',
  repair_notes TEXT,
  estimated_cost DECIMAL(10,2),
  assigned_to TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for parking_lot_issues
ALTER TABLE parking_lot_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view parking lot issues"
  ON parking_lot_issues FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert parking lot issues"
  ON parking_lot_issues FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update parking lot issues"
  ON parking_lot_issues FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete parking lot issues"
  ON parking_lot_issues FOR DELETE TO authenticated USING (true);

-- RLS Policies for clubhouse_issues
ALTER TABLE clubhouse_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clubhouse issues"
  ON clubhouse_issues FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert clubhouse issues"
  ON clubhouse_issues FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update clubhouse issues"
  ON clubhouse_issues FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete clubhouse issues"
  ON clubhouse_issues FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_parking_lot_issues_status ON parking_lot_issues(status);
CREATE INDEX IF NOT EXISTS idx_parking_lot_issues_reported_by ON parking_lot_issues(reported_by);
CREATE INDEX IF NOT EXISTS idx_clubhouse_issues_status ON clubhouse_issues(status);
CREATE INDEX IF NOT EXISTS idx_clubhouse_issues_category ON clubhouse_issues(category);
CREATE INDEX IF NOT EXISTS idx_clubhouse_issues_reported_by ON clubhouse_issues(reported_by);
