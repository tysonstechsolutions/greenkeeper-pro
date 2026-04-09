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
