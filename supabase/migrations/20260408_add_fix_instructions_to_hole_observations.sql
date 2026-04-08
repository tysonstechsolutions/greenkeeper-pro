-- Add missing fix_instructions column to hole_observations
-- (green_observations already had this column; hole_observations was missing it)
ALTER TABLE hole_observations ADD COLUMN IF NOT EXISTS fix_instructions TEXT DEFAULT NULL;
