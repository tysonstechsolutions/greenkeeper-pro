-- ==========================================
-- GreenKeeper Pro: Diagnostics (Course Doctor) Table
-- Run this in Supabase SQL Editor
-- ==========================================

-- Create a simple courses reference table (single-tenant placeholder)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Veterans Memorial Golf Course',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default course if not exists
INSERT INTO courses (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Veterans Memorial Golf Course')
ON CONFLICT (id) DO NOTHING;

-- Create the diagnostics table
CREATE TABLE IF NOT EXISTS diagnostics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'auto',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'diagnosed', 'treating', 'resolved', 'monitoring')),
  full_response JSONB,
  conversation JSONB DEFAULT '[]'::jsonb,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_diagnostics_course_id ON diagnostics(course_id);
CREATE INDEX IF NOT EXISTS idx_diagnostics_status ON diagnostics(status);
CREATE INDEX IF NOT EXISTS idx_diagnostics_created_at ON diagnostics(created_at DESC);

-- RLS
ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Courses: everyone can read
CREATE POLICY "Anyone can read courses" ON courses FOR SELECT TO authenticated USING (true);

-- Diagnostics: authenticated users can do everything (single-tenant)
CREATE POLICY "Authenticated can read diagnostics" ON diagnostics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert diagnostics" ON diagnostics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update diagnostics" ON diagnostics FOR UPDATE TO authenticated USING (true);

-- Grant permissions
GRANT ALL ON diagnostics TO authenticated;
GRANT ALL ON courses TO authenticated;
GRANT SELECT ON diagnostics TO anon;
GRANT SELECT ON courses TO anon;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_diagnostics_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diagnostics_updated
  BEFORE UPDATE ON diagnostics
  FOR EACH ROW
  EXECUTE FUNCTION update_diagnostics_timestamp();
