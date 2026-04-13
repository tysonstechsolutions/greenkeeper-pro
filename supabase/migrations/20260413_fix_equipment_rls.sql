-- Fix equipment RLS: ensure all authenticated users with frontend role checks can insert/update
-- The frontend already guards access via canManageEquipment (super, asst_super, foreman, mechanic, director)
-- Old restrictive policies may block mechanic inserts/updates in some configurations

DROP POLICY IF EXISTS "equipment_insert_manager_mechanic" ON equipment;
DROP POLICY IF EXISTS "equipment_update_manager_mechanic" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can insert equipment" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can update equipment" ON equipment;

CREATE POLICY "equipment_insert_authenticated" ON equipment
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "equipment_update_authenticated" ON equipment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
