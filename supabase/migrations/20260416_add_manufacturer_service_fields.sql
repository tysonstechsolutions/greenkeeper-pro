-- Add manufacturer service tracking to equipment_service_records.
-- When a piece of equipment is sent to the manufacturer for service,
-- we need to track pickup and return dates.

ALTER TABLE equipment_service_records
  ADD COLUMN IF NOT EXISTS sent_to_manufacturer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS return_date DATE;

-- Index for quick lookup of equipment currently out for manufacturer service
CREATE INDEX IF NOT EXISTS idx_service_records_manufacturer
  ON equipment_service_records(sent_to_manufacturer, return_date)
  WHERE sent_to_manufacturer = true;
