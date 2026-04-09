-- Fix equipment_inspections RLS policies (table existed but had no usable policies)
ALTER TABLE equipment_inspections ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_select_all') THEN
    CREATE POLICY "equipment_inspections_select_all" ON equipment_inspections FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Allow authenticated users to create inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_insert_auth') THEN
    CREATE POLICY "equipment_inspections_insert_auth" ON equipment_inspections FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- Allow authenticated users to update inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_update_auth') THEN
    CREATE POLICY "equipment_inspections_update_auth" ON equipment_inspections FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- Allow managers to delete inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_delete_manager') THEN
    CREATE POLICY "equipment_inspections_delete_manager" ON equipment_inspections FOR DELETE TO authenticated USING (is_manager(auth.uid()));
  END IF;
END $$;
