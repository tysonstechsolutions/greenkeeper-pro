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
