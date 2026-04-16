-- Equipment Parts table (tracks individual parts needed per equipment)
CREATE TABLE IF NOT EXISTS equipment_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  part_number TEXT,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received')),
  estimated_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Equipment Service Records table (tracks service history per equipment)
CREATE TABLE IF NOT EXISTS equipment_service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  hours_at_service DECIMAL(10,1),
  cost DECIMAL(10,2),
  parts_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for equipment_parts
ALTER TABLE equipment_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment parts"
  ON equipment_parts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert equipment parts"
  ON equipment_parts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update equipment parts"
  ON equipment_parts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete equipment parts"
  ON equipment_parts FOR DELETE TO authenticated USING (true);

-- RLS Policies for equipment_service_records
ALTER TABLE equipment_service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service records"
  ON equipment_service_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert service records"
  ON equipment_service_records FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update service records"
  ON equipment_service_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete service records"
  ON equipment_service_records FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_parts_equipment_id ON equipment_parts(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_service_records_equipment_id ON equipment_service_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_service_records_service_date ON equipment_service_records(service_date);
-- Order Items table for tracking supplies/materials that need to be ordered
-- Categories: clubhouse, cart_paths, turf_course, general
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('clubhouse', 'cart_paths', 'turf_course', 'general')),
  item_name TEXT NOT NULL,
  description TEXT,
  quantity TEXT,
  estimated_cost DECIMAL(10,2),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received')),
  vendor TEXT,
  notes TEXT,
  ordered_date DATE,
  received_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order items" ON order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update order items" ON order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete order items" ON order_items FOR DELETE TO authenticated USING (true);
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
-- Add delay_reason column to equipment_parts for tracking delayed orders
ALTER TABLE equipment_parts ADD COLUMN IF NOT EXISTS delay_reason TEXT DEFAULT NULL;
-- Enable RLS on clubhouse_issues table
ALTER TABLE clubhouse_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on clubhouse_issues" ON clubhouse_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable RLS on parking_lot_issues table
ALTER TABLE parking_lot_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on parking_lot_issues" ON parking_lot_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add assigned_to column to parking_lot_issues if it doesn't exist
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS assigned_to TEXT;
-- Enable RLS on equipment table
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view equipment" ON equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert equipment" ON equipment FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update equipment" ON equipment FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete equipment" ON equipment FOR DELETE TO authenticated USING (true);

-- Enable RLS on equipment_logs table
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view equipment logs" ON equipment_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert equipment logs" ON equipment_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update equipment logs" ON equipment_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete equipment logs" ON equipment_logs FOR DELETE TO authenticated USING (true);

-- Enable RLS on equipment_checkouts table
ALTER TABLE equipment_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on checkouts" ON equipment_checkouts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable RLS on equipment_inspections table
ALTER TABLE equipment_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on inspections" ON equipment_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);
