-- Add delay_reason column to equipment_parts for tracking delayed orders
ALTER TABLE equipment_parts ADD COLUMN IF NOT EXISTS delay_reason TEXT DEFAULT NULL;
