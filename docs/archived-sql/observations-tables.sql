-- ============================================
-- Course Observations & AI Improvement Plan
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Course Observations table
CREATE TABLE IF NOT EXISTS course_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  hole_number INTEGER CHECK (hole_number >= 1 AND hole_number <= 18),
  zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  photo_ids TEXT[],
  tags TEXT[],
  is_addressed BOOLEAN NOT NULL DEFAULT FALSE,
  linked_plan_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Improvement Plans table (tracks plan versions)
CREATE TABLE IF NOT EXISTS improvement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_summary TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Improvement Plan Items table
CREATE TABLE IF NOT EXISTS improvement_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'ongoing',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'not_started',
  category TEXT NOT NULL DEFAULT 'other',
  effort_level TEXT NOT NULL DEFAULT 'medium',
  impact_level TEXT NOT NULL DEFAULT 'medium',
  estimated_cost NUMERIC(10,2),
  linked_observation_ids TEXT[],
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_date DATE,
  completed_date TIMESTAMPTZ,
  ai_reasoning TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add the foreign key from observations to plan items now that the table exists
ALTER TABLE course_observations
  ADD CONSTRAINT fk_linked_plan_item
  FOREIGN KEY (linked_plan_item_id)
  REFERENCES improvement_plan_items(id)
  ON DELETE SET NULL;

-- 4. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_observations_created_by ON course_observations(created_by);
CREATE INDEX IF NOT EXISTS idx_observations_category ON course_observations(category);
CREATE INDEX IF NOT EXISTS idx_observations_sentiment ON course_observations(sentiment);
CREATE INDEX IF NOT EXISTS idx_observations_is_addressed ON course_observations(is_addressed);
CREATE INDEX IF NOT EXISTS idx_observations_created_at ON course_observations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_items_phase ON improvement_plan_items(phase);
CREATE INDEX IF NOT EXISTS idx_plan_items_status ON improvement_plan_items(status);
CREATE INDEX IF NOT EXISTS idx_plan_items_priority ON improvement_plan_items(priority);
CREATE INDEX IF NOT EXISTS idx_plan_items_sort_order ON improvement_plan_items(sort_order);

CREATE INDEX IF NOT EXISTS idx_plans_is_current ON improvement_plans(is_current);

-- 5. Row Level Security (RLS)
ALTER TABLE course_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_plan_items ENABLE ROW LEVEL SECURITY;

-- Observations: all authenticated users can read, only creator can modify
CREATE POLICY "observations_select" ON course_observations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "observations_insert" ON course_observations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "observations_update" ON course_observations
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "observations_delete" ON course_observations
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Plans: all authenticated users can read, only creator can modify
CREATE POLICY "plans_select" ON improvement_plans
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "plans_insert" ON improvement_plans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "plans_update" ON improvement_plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

-- Plan items: all authenticated users can read and update status, only creator can delete
CREATE POLICY "plan_items_select" ON improvement_plan_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "plan_items_insert" ON improvement_plan_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "plan_items_update" ON improvement_plan_items
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "plan_items_delete" ON improvement_plan_items
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- 6. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_observations_updated_at
  BEFORE UPDATE ON course_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON improvement_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plan_items_updated_at
  BEFORE UPDATE ON improvement_plan_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
