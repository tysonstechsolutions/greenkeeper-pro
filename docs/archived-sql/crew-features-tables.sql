-- ==========================================
-- GreenKeeper Pro: Crew Features Tables
-- Run this in Supabase SQL Editor
-- ==========================================

-- 1. Shift Swap / Pickup Board
-- ==========================================
CREATE TABLE IF NOT EXISTS shift_swap_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  posted_by uuid REFERENCES profiles(id) NOT NULL,
  shift_date date NOT NULL,
  shift_start time,
  shift_end time,
  shift_type text CHECK (shift_type IN ('morning', 'afternoon', 'split', 'full')) DEFAULT 'full',
  description text,
  reason text,
  status text CHECK (status IN ('open', 'claimed', 'approved', 'denied', 'cancelled')) DEFAULT 'open',
  claimed_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_shift_swap_status ON shift_swap_posts(status);
CREATE INDEX idx_shift_swap_date ON shift_swap_posts(shift_date);
CREATE INDEX idx_shift_swap_posted_by ON shift_swap_posts(posted_by);
CREATE INDEX idx_shift_swap_claimed_by ON shift_swap_posts(claimed_by);

-- RLS
ALTER TABLE shift_swap_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all shift swaps"
  ON shift_swap_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own shift swap posts"
  ON shift_swap_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = posted_by);

CREATE POLICY "Users can update relevant shift swaps"
  ON shift_swap_posts FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = posted_by
    OR auth.uid() = claimed_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super')
    )
  );

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_shift_swap_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shift_swap_updated
  BEFORE UPDATE ON shift_swap_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_shift_swap_timestamp();


-- 2. Equipment Checkouts
-- ==========================================
CREATE TABLE IF NOT EXISTS equipment_checkouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid REFERENCES equipment(id) NOT NULL,
  checked_out_by uuid REFERENCES profiles(id) NOT NULL,
  checked_out_at timestamptz DEFAULT now(),
  expected_return timestamptz,
  returned_at timestamptz,
  condition_out text CHECK (condition_out IN ('good', 'fair', 'needs_attention')) DEFAULT 'good',
  condition_in text CHECK (condition_in IN ('good', 'fair', 'needs_attention', 'damaged')),
  notes_out text,
  notes_in text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_equip_checkout_equipment ON equipment_checkouts(equipment_id);
CREATE INDEX idx_equip_checkout_user ON equipment_checkouts(checked_out_by);
CREATE INDEX idx_equip_checkout_returned ON equipment_checkouts(returned_at);
CREATE INDEX idx_equip_checkout_active ON equipment_checkouts(equipment_id) WHERE returned_at IS NULL;

-- RLS
ALTER TABLE equipment_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all checkouts"
  ON equipment_checkouts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own checkouts"
  ON equipment_checkouts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = checked_out_by);

CREATE POLICY "Users can update their own checkouts or managers can update any"
  ON equipment_checkouts FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = checked_out_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'foreman')
    )
  );


-- 3. Course Conditions Settings (uses existing app_settings table)
-- Insert default course_conditions if not exists
-- ==========================================
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'course_conditions',
  '{
    "course_status": "Open",
    "green_speed": "10.0",
    "pin_positions": "Standard",
    "cart_rules": "90 Degree Rule",
    "frost_delay": false,
    "frost_delay_until": null,
    "tee_assignments": "Regular",
    "practice_range": "Open",
    "notes": "",
    "last_updated_by": null
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;


-- Done!
-- Tables created:
--   1. shift_swap_posts (Shift Swap Board)
--   2. equipment_checkouts (Equipment Checkout)
--   3. course_conditions setting in app_settings (Member Conditions)
