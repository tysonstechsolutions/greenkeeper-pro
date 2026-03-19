-- GreenKeeper Pro - Invites Table
-- Run this in Supabase SQL Editor after the initial schema

-- ============================================================================
-- INVITES TABLE
-- ============================================================================
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('asst_super', 'foreman', 'mechanic', 'crew', 'seasonal')),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_created_by ON invites(created_by);
CREATE INDEX idx_invites_expires ON invites(expires_at);

-- Enable RLS
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Only managers can create invites
CREATE POLICY "invites_insert_manager" ON invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super')
      AND is_active = true
    )
  );

-- Managers can view all invites they created
CREATE POLICY "invites_select_manager" ON invites
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super'
      AND is_active = true
    )
  );

-- Anyone can read an invite by token (for registration)
CREATE POLICY "invites_select_by_token" ON invites
  FOR SELECT USING (true);

-- Managers can delete unused invites
CREATE POLICY "invites_delete_manager" ON invites
  FOR DELETE USING (
    created_by = auth.uid()
    AND used_by IS NULL
  );

-- Allow updating invite when used (mark as used)
CREATE POLICY "invites_update_use" ON invites
  FOR UPDATE USING (used_by IS NULL)
  WITH CHECK (used_by IS NOT NULL);
