-- Add diagnosis_result JSONB column to both observation tables
-- Stores the full AI diagnosis with treatment plans, products, follow-up schedules

ALTER TABLE green_observations
ADD COLUMN IF NOT EXISTS diagnosis_result JSONB DEFAULT NULL;

ALTER TABLE hole_observations
ADD COLUMN IF NOT EXISTS diagnosis_result JSONB DEFAULT NULL;
