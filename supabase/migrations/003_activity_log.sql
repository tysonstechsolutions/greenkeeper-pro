-- supabase/migrations/003_activity_log.sql
-- Activity log table for tracking user actions

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read activity (for dashboard)
CREATE POLICY "activity_log_select_authenticated" ON activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- System can insert (we'll use service role for logging)
CREATE POLICY "activity_log_insert_authenticated" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only managers can delete
CREATE POLICY "activity_log_delete_manager" ON activity_log
  FOR DELETE USING (is_manager(auth.uid()));

COMMENT ON TABLE activity_log IS 'Tracks user actions for dashboard activity feed';
