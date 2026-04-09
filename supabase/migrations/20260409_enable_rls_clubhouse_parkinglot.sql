-- Enable RLS on clubhouse_issues table
ALTER TABLE clubhouse_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on clubhouse_issues" ON clubhouse_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable RLS on parking_lot_issues table
ALTER TABLE parking_lot_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on parking_lot_issues" ON parking_lot_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add assigned_to column to parking_lot_issues if it doesn't exist
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS assigned_to TEXT;
