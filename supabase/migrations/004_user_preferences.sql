-- supabase/migrations/004_user_preferences.sql
-- Add user_preferences JSONB column to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{
  "notifications": {
    "push_enabled": true,
    "task_assigned": true,
    "task_completed": true,
    "schedule_changes": true,
    "weather_alerts": true,
    "equipment_issues": true,
    "messages": true
  },
  "course": {}
}'::jsonb;

COMMENT ON COLUMN profiles.user_preferences IS 'User preferences for notifications and app settings';
