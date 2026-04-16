-- FY26 Asset condition photos (front / back / left / right)
-- Stored as JSONB with fixed keys so each angle is tracked independently.
ALTER TABLE fy26_assets
  ADD COLUMN IF NOT EXISTS condition_photos JSONB DEFAULT '{}';
-- Shape: { "front": "url", "back": "url", "left": "url", "right": "url" }

-- Damage documentation log — each row is one damage event
CREATE TABLE IF NOT EXISTS asset_damage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fy26_assets(id) ON DELETE CASCADE,
  damage_date TEXT NOT NULL,           -- "Prior to April 1 2026" or ISO date "2026-04-16"
  description TEXT NOT NULL,           -- what happened / how
  photos TEXT[] DEFAULT '{}',          -- array of photo URLs
  reported_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE asset_damage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view damage records"
  ON asset_damage_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage damage records"
  ON asset_damage_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_asset_damage_asset ON asset_damage_records(asset_id, created_at DESC);
