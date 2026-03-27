-- Add 'director' role for MWR / organizational leadership (full read access, oversight)

-- Update the profiles table role constraint to include 'director'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super', 'asst_super', 'foreman', 'mechanic', 'crew', 'seasonal', 'pro', 'member', 'director'));

-- Update the invites table role constraint to include 'director'
ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check
  CHECK (role IN ('asst_super', 'foreman', 'mechanic', 'crew', 'seasonal', 'director'));

-- Allow directors to read all data (same RLS policies as super/asst_super)
-- Directors can view invites
DROP POLICY IF EXISTS "Directors can view all invites" ON invites;
CREATE POLICY "Directors can view all invites" ON invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'director'
    )
  );

-- Update the invite creation policy to allow directors to create invites
DROP POLICY IF EXISTS "Managers can create invites" ON invites;
CREATE POLICY "Managers can create invites" ON invites
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND role IN ('super', 'asst_super', 'director')
    )
  );
