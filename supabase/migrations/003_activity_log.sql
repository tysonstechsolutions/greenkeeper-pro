-- supabase/migrations/003_activity_log.sql
-- Activity log table for tracking user actions
--
-- Idempotent: every CREATE/POLICY uses IF NOT EXISTS or DROP-then-create so
-- this file is safe to re-run. The dashboard's recent-activity feed reads
-- this table; if you're seeing PGRST205 ("not in schema cache") even though
-- the table exists, run `NOTIFY pgrst, 'reload schema';` to refresh
-- PostgREST.

CREATE TABLE IF NOT EXISTS activity_log (
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
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read activity (for dashboard)
DROP POLICY IF EXISTS "activity_log_select_authenticated" ON activity_log;
CREATE POLICY "activity_log_select_authenticated" ON activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- System can insert (we'll use service role for logging)
DROP POLICY IF EXISTS "activity_log_insert_authenticated" ON activity_log;
CREATE POLICY "activity_log_insert_authenticated" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only managers can delete
DROP POLICY IF EXISTS "activity_log_delete_manager" ON activity_log;
CREATE POLICY "activity_log_delete_manager" ON activity_log
  FOR DELETE USING (is_manager(auth.uid()));

-- Make sure PostgREST sees the latest schema. Without this you can hit
-- PGRST205 ("table not in schema cache") even though the table exists.
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE activity_log IS 'Tracks user actions for dashboard activity feed';
