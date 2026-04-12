-- Add end_time for Illinois RUP compliance (start/end time of application)
-- All other required fields already exist:
--   chemical_applications: application_time (start), weather_temp_f, weather_wind_mph,
--     weather_wind_direction, target_pest, applicator_license
--   chemical_products: epa_registration
--   profiles: certifications (JSON array with license_number)

ALTER TABLE chemical_applications ADD COLUMN IF NOT EXISTS end_time TIME;
