
-- ═══ 001_initial_schema.sql ═══

-- GreenKeeper Pro - Complete Database Schema
-- Run this in Supabase SQL Editor to set up all tables, indexes, RLS policies, and seed data

-- ============================================================================
-- PROFILES TABLE (extends auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('super', 'asst_super', 'foreman', 'mechanic', 'crew', 'seasonal')),
  phone TEXT,
  avatar_url TEXT,
  hire_date DATE,
  certifications JSONB DEFAULT '[]'::jsonb,
  emergency_contact JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- ============================================================================
-- COURSE ZONES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('green', 'tee', 'fairway', 'rough', 'bunker', 'cart_path', 'practice', 'clubhouse', 'maintenance', 'other')),
  hole_number INTEGER,
  description TEXT,
  acreage DECIMAL(8,3),
  turf_type TEXT,
  geojson JSONB,
  condition_score INTEGER CHECK (condition_score BETWEEN 1 AND 10),
  last_condition_update TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_zones_type ON course_zones(zone_type);
CREATE INDEX IF NOT EXISTS idx_course_zones_hole ON course_zones(hole_number);

-- ============================================================================
-- PLAN GOALS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS plan_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_level TEXT NOT NULL CHECK (plan_level IN ('five_year', 'annual', 'seasonal', 'monthly', 'weekly')),
  title TEXT NOT NULL,
  description TEXT,
  year INTEGER,
  season TEXT CHECK (season IN ('spring', 'summer', 'fall', 'winter')),
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  week_start DATE,
  category TEXT NOT NULL CHECK (category IN ('turf', 'irrigation', 'equipment', 'infrastructure', 'staffing', 'budget', 'environmental', 'safety', 'tournament', 'other')),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'deferred', 'cancelled')),
  budget_allocated DECIMAL(12,2),
  budget_spent DECIMAL(12,2) DEFAULT 0,
  target_metric TEXT,
  target_value DECIMAL(10,2),
  actual_value DECIMAL(10,2),
  parent_goal_id UUID REFERENCES plan_goals(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_goals_level ON plan_goals(plan_level);
CREATE INDEX IF NOT EXISTS idx_plan_goals_status ON plan_goals(status);
CREATE INDEX IF NOT EXISTS idx_plan_goals_year ON plan_goals(year);
CREATE INDEX IF NOT EXISTS idx_plan_goals_parent ON plan_goals(parent_goal_id);

-- ============================================================================
-- TASK TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('mowing', 'irrigation', 'chemical', 'mechanical', 'landscaping', 'construction', 'bunker', 'greens', 'admin', 'safety', 'other')),
  default_priority TEXT DEFAULT 'normal' CHECK (default_priority IN ('critical', 'high', 'normal', 'low')),
  estimated_minutes INTEGER,
  equipment_needed TEXT[] DEFAULT '{}',
  materials_needed JSONB DEFAULT '[]'::jsonb,
  checklist JSONB DEFAULT '[]'::jsonb,
  requires_photo_before BOOLEAN DEFAULT false,
  requires_photo_after BOOLEAN DEFAULT false,
  weather_dependent BOOLEAN DEFAULT false,
  weather_conditions JSONB,
  instructions TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_category ON task_templates(category);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON task_templates(is_active);

-- ============================================================================
-- TASKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('mowing', 'irrigation', 'chemical', 'mechanical', 'landscaping', 'construction', 'bunker', 'greens', 'admin', 'safety', 'other')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'verified', 'blocked', 'deferred', 'cancelled')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_crew TEXT,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date DATE NOT NULL,
  due_time TIME,
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  hole_numbers INTEGER[] DEFAULT '{}',
  equipment_needed TEXT[] DEFAULT '{}',
  materials_needed JSONB DEFAULT '[]'::jsonb,
  checklist JSONB DEFAULT '[]'::jsonb,
  requires_photo_before BOOLEAN DEFAULT false,
  requires_photo_after BOOLEAN DEFAULT false,
  weather_dependent BOOLEAN DEFAULT false,
  weather_conditions JSONB,
  recurring_rule JSONB,
  template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL,
  plan_goal_id UUID REFERENCES plan_goals(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_zone ON tasks(zone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_template ON tasks(template_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_goal ON tasks(plan_goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_crew ON tasks(assigned_crew);

-- ============================================================================
-- PHOTOS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('before', 'after', 'condition', 'problem', 'completed_work', 'equipment', 'safety', 'other')),
  caption TEXT,
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photos_task ON photos(task_id);
CREATE INDEX IF NOT EXISTS idx_photos_zone ON photos(zone_id);
CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_by ON photos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_photos_type ON photos(photo_type);

-- ============================================================================
-- CHANNELS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('direct', 'group', 'announcement', 'crew', 'role')),
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active);

-- ============================================================================
-- CHANNEL MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  muted BOOLEAN DEFAULT false,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'photo', 'task_ref', 'alert', 'system')),
  reference_id UUID,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channel_id, is_pinned) WHERE is_pinned = true;

-- ============================================================================
-- EQUIPMENT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('mower_reel', 'mower_rotary', 'mower_rough', 'aerator', 'sprayer', 'topdresser', 'utility_vehicle', 'tractor', 'blower', 'trimmer', 'chainsaw', 'roller', 'seeder', 'hand_tool', 'pump', 'other')),
  make TEXT,
  model TEXT,
  year INTEGER,
  serial_number TEXT,
  asset_tag TEXT,
  status TEXT DEFAULT 'operational' CHECK (status IN ('operational', 'needs_service', 'in_repair', 'out_of_service', 'retired')),
  current_hours DECIMAL(10,1),
  service_interval_hours INTEGER,
  next_service_due_hours DECIMAL(10,1),
  next_service_due_date DATE,
  location TEXT,
  purchase_date DATE,
  purchase_price DECIMAL(10,2),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(equipment_type);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_service_due ON equipment(next_service_due_date);

-- ============================================================================
-- EQUIPMENT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL CHECK (log_type IN ('service', 'repair', 'fuel', 'inspection', 'incident', 'hours_update')),
  description TEXT NOT NULL,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  hours_at_service DECIMAL(10,1),
  cost DECIMAL(10,2),
  parts_used JSONB DEFAULT '[]'::jsonb,
  vendor TEXT,
  downtime_hours DECIMAL(6,1),
  photos UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment ON equipment_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_type ON equipment_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_date ON equipment_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_performed_by ON equipment_logs(performed_by);

-- ============================================================================
-- CHEMICAL PRODUCTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS chemical_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  manufacturer TEXT,
  epa_registration TEXT,
  active_ingredient TEXT,
  product_type TEXT CHECK (product_type IN ('fertilizer', 'herbicide', 'insecticide', 'fungicide', 'growth_regulator', 'wetting_agent', 'colorant', 'seed', 'amendment', 'other')),
  unit_of_measure TEXT,
  current_inventory DECIMAL(10,2),
  reorder_threshold DECIMAL(10,2),
  cost_per_unit DECIMAL(10,2),
  sds_storage_path TEXT,
  rei_hours INTEGER,
  signal_word TEXT CHECK (signal_word IN ('danger', 'warning', 'caution', 'none')),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chemical_products_type ON chemical_products(product_type);
CREATE INDEX IF NOT EXISTS idx_chemical_products_active ON chemical_products(is_active);
CREATE INDEX IF NOT EXISTS idx_chemical_products_inventory ON chemical_products(current_inventory, reorder_threshold);

-- ============================================================================
-- CHEMICAL APPLICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS chemical_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES chemical_products(id) ON DELETE RESTRICT,
  applied_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  applicator_license TEXT,
  application_date DATE NOT NULL,
  application_time TIME,
  zone_ids UUID[] NOT NULL,
  hole_numbers INTEGER[],
  area_treated_sqft INTEGER,
  application_rate TEXT,
  total_amount_used DECIMAL(10,3),
  method TEXT CHECK (method IN ('spray', 'granular', 'injection', 'drench', 'other')),
  weather_temp_f INTEGER,
  weather_wind_mph INTEGER,
  weather_wind_direction TEXT,
  weather_humidity INTEGER,
  weather_conditions TEXT,
  target_pest TEXT,
  rei_expires_at TIMESTAMPTZ,
  notes TEXT,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chemical_applications_product ON chemical_applications(product_id);
CREATE INDEX IF NOT EXISTS idx_chemical_applications_date ON chemical_applications(application_date);
CREATE INDEX IF NOT EXISTS idx_chemical_applications_applied_by ON chemical_applications(applied_by);
CREATE INDEX IF NOT EXISTS idx_chemical_applications_rei ON chemical_applications(rei_expires_at) WHERE rei_expires_at IS NOT NULL;

-- ============================================================================
-- IRRIGATION ZONES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS irrigation_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name TEXT NOT NULL,
  controller_id TEXT,
  station_number INTEGER,
  zone_type TEXT CHECK (zone_type IN ('green', 'tee', 'fairway', 'rough', 'landscape', 'other')),
  head_count INTEGER,
  head_type TEXT,
  gpm DECIMAL(6,1),
  course_zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_zones_type ON irrigation_zones(zone_type);
CREATE INDEX IF NOT EXISTS idx_irrigation_zones_course_zone ON irrigation_zones(course_zone_id);

-- ============================================================================
-- IRRIGATION LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS irrigation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irrigation_zone_id UUID REFERENCES irrigation_zones(id) ON DELETE SET NULL,
  run_date DATE NOT NULL,
  run_time_minutes INTEGER NOT NULL,
  gallons_estimated DECIMAL(10,1),
  trigger_type TEXT CHECK (trigger_type IN ('scheduled', 'manual', 'rain_delay', 'override')),
  logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_logs_zone ON irrigation_logs(irrigation_zone_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_logs_date ON irrigation_logs(run_date);
CREATE INDEX IF NOT EXISTS idx_irrigation_logs_trigger ON irrigation_logs(trigger_type);

-- ============================================================================
-- WEATHER LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS weather_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date DATE NOT NULL UNIQUE,
  high_temp_f INTEGER,
  low_temp_f INTEGER,
  precipitation_inches DECIMAL(5,2),
  wind_max_mph INTEGER,
  humidity_avg INTEGER,
  conditions TEXT,
  gdd_base50 DECIMAL(5,1),
  frost_observed BOOLEAN DEFAULT false,
  notes TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_logs_date ON weather_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_weather_logs_frost ON weather_logs(frost_observed) WHERE frost_observed = true;

-- ============================================================================
-- BUDGET ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('labor', 'chemicals', 'fertilizer', 'seed', 'equipment_purchase', 'equipment_repair', 'fuel', 'irrigation', 'supplies', 'capital_projects', 'training', 'other')),
  description TEXT,
  budgeted_amount DECIMAL(12,2) NOT NULL,
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  plan_goal_id UUID REFERENCES plan_goals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_items_year ON budget_items(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budget_items_category ON budget_items(category);
CREATE INDEX IF NOT EXISTS idx_budget_items_month ON budget_items(fiscal_year, month);

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_item_id UUID REFERENCES budget_items(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT NOT NULL,
  vendor TEXT,
  expense_date DATE NOT NULL,
  receipt_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_budget_item ON expenses(budget_item_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by ON expenses(submitted_by);

-- ============================================================================
-- SCHEDULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  shift_start TIME,
  shift_end TIME,
  shift_type TEXT CHECK (shift_type IN ('morning', 'afternoon', 'split', 'full', 'on_call', 'off')),
  crew_assignment TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_crew ON schedules(crew_assignment);

-- ============================================================================
-- TIME OFF REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  request_type TEXT CHECK (request_type IN ('vacation', 'sick', 'personal', 'military', 'other')),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_off_user ON time_off_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_time_off_dates ON time_off_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('task_assigned', 'task_completed', 'message', 'alert', 'schedule_change', 'approval_needed', 'weather', 'equipment', 'reminder')),
  title TEXT NOT NULL,
  body TEXT,
  reference_type TEXT,
  reference_id UUID,
  is_read BOOLEAN DEFAULT false,
  push_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chemical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE chemical_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Check if user has management role
-- ============================================================================
CREATE OR REPLACE FUNCTION is_manager(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role IN ('super', 'asst_super')
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- HELPER FUNCTION: Check if user is foreman
-- ============================================================================
CREATE OR REPLACE FUNCTION is_foreman(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'foreman'
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- HELPER FUNCTION: Get user's role
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- HELPER FUNCTION: Get user's crew assignment
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_crew(p_user_id UUID)
RETURNS TEXT AS $$
  SELECT crew_assignment FROM schedules
  WHERE schedules.user_id = p_user_id
  AND schedule_date = CURRENT_DATE
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- RLS POLICIES: PROFILES
-- ============================================================================
-- Anyone authenticated can read active profiles
CREATE POLICY "profiles_select_active" ON profiles
  FOR SELECT USING (is_active = true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Managers can update any profile
CREATE POLICY "profiles_update_manager" ON profiles
  FOR UPDATE USING (is_manager(auth.uid()));

-- Managers can insert profiles (for invites)
CREATE POLICY "profiles_insert_manager" ON profiles
  FOR INSERT WITH CHECK (is_manager(auth.uid()) OR auth.uid() = id);

-- ============================================================================
-- RLS POLICIES: COURSE ZONES
-- ============================================================================
CREATE POLICY "course_zones_select_all" ON course_zones
  FOR SELECT USING (true);

CREATE POLICY "course_zones_insert_manager" ON course_zones
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "course_zones_update_manager" ON course_zones
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "course_zones_delete_manager" ON course_zones
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: PLAN GOALS
-- ============================================================================
CREATE POLICY "plan_goals_select_all" ON plan_goals
  FOR SELECT USING (true);

CREATE POLICY "plan_goals_insert_manager" ON plan_goals
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "plan_goals_update_manager" ON plan_goals
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "plan_goals_delete_manager" ON plan_goals
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: TASK TEMPLATES
-- ============================================================================
CREATE POLICY "task_templates_select_active" ON task_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "task_templates_insert_manager" ON task_templates
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "task_templates_update_manager" ON task_templates
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "task_templates_delete_manager" ON task_templates
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: TASKS
-- ============================================================================
-- Everyone can read tasks assigned to them or their crew
CREATE POLICY "tasks_select_own" ON tasks
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR assigned_by = auth.uid()
    OR is_manager(auth.uid())
    OR (is_foreman(auth.uid()) AND assigned_crew = get_user_crew(auth.uid()))
    OR assigned_crew = get_user_crew(auth.uid())
  );

-- Managers can insert any task
CREATE POLICY "tasks_insert_manager" ON tasks
  FOR INSERT WITH CHECK (is_manager(auth.uid()) OR is_foreman(auth.uid()));

-- Managers can update any task
CREATE POLICY "tasks_update_manager" ON tasks
  FOR UPDATE USING (is_manager(auth.uid()));

-- Foremen can update tasks for their crew
CREATE POLICY "tasks_update_foreman" ON tasks
  FOR UPDATE USING (
    is_foreman(auth.uid())
    AND assigned_crew = get_user_crew(auth.uid())
  );

-- Crew can update status of their own tasks
CREATE POLICY "tasks_update_own_status" ON tasks
  FOR UPDATE USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Managers can delete tasks
CREATE POLICY "tasks_delete_manager" ON tasks
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: PHOTOS
-- ============================================================================
CREATE POLICY "photos_select_all" ON photos
  FOR SELECT USING (true);

CREATE POLICY "photos_insert_authenticated" ON photos
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "photos_update_own" ON photos
  FOR UPDATE USING (auth.uid() = uploaded_by);

CREATE POLICY "photos_delete_own" ON photos
  FOR DELETE USING (auth.uid() = uploaded_by OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: CHANNELS
-- ============================================================================
CREATE POLICY "channels_select_member" ON channels
  FOR SELECT USING (
    is_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = channels.id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "channels_insert_manager" ON channels
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "channels_update_manager" ON channels
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "channels_delete_manager" ON channels
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: CHANNEL MEMBERS
-- ============================================================================
CREATE POLICY "channel_members_select_own" ON channel_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_manager(auth.uid())
  );

CREATE POLICY "channel_members_insert_manager" ON channel_members
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "channel_members_update_own" ON channel_members
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "channel_members_delete_manager" ON channel_members
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: MESSAGES
-- ============================================================================
CREATE POLICY "messages_select_channel_member" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = messages.channel_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert_channel_member" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = messages.channel_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "messages_update_own" ON messages
  FOR UPDATE USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_delete_own_or_manager" ON messages
  FOR DELETE USING (sender_id = auth.uid() OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: EQUIPMENT
-- ============================================================================
CREATE POLICY "equipment_select_all" ON equipment
  FOR SELECT USING (true);

CREATE POLICY "equipment_insert_manager_mechanic" ON equipment
  FOR INSERT WITH CHECK (
    is_manager(auth.uid())
    OR get_user_role(auth.uid()) = 'mechanic'
  );

CREATE POLICY "equipment_update_manager_mechanic" ON equipment
  FOR UPDATE USING (
    is_manager(auth.uid())
    OR get_user_role(auth.uid()) = 'mechanic'
  );

CREATE POLICY "equipment_delete_manager_mechanic" ON equipment
  FOR DELETE USING (
    is_manager(auth.uid())
    OR get_user_role(auth.uid()) = 'mechanic'
  );

-- ============================================================================
-- RLS POLICIES: EQUIPMENT LOGS
-- ============================================================================
CREATE POLICY "equipment_logs_select_all" ON equipment_logs
  FOR SELECT USING (true);

CREATE POLICY "equipment_logs_insert_authenticated" ON equipment_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "equipment_logs_update_manager" ON equipment_logs
  FOR UPDATE USING (is_manager(auth.uid()) OR performed_by = auth.uid());

CREATE POLICY "equipment_logs_delete_manager" ON equipment_logs
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: CHEMICAL PRODUCTS
-- ============================================================================
CREATE POLICY "chemical_products_select_all" ON chemical_products
  FOR SELECT USING (true);

CREATE POLICY "chemical_products_insert_manager" ON chemical_products
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "chemical_products_update_manager" ON chemical_products
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "chemical_products_delete_manager" ON chemical_products
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: CHEMICAL APPLICATIONS
-- ============================================================================
CREATE POLICY "chemical_applications_select_all" ON chemical_applications
  FOR SELECT USING (true);

CREATE POLICY "chemical_applications_insert_authenticated" ON chemical_applications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "chemical_applications_update_manager" ON chemical_applications
  FOR UPDATE USING (is_manager(auth.uid()) OR applied_by = auth.uid());

CREATE POLICY "chemical_applications_delete_manager" ON chemical_applications
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: IRRIGATION ZONES
-- ============================================================================
CREATE POLICY "irrigation_zones_select_all" ON irrigation_zones
  FOR SELECT USING (true);

CREATE POLICY "irrigation_zones_insert_manager" ON irrigation_zones
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "irrigation_zones_update_manager" ON irrigation_zones
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "irrigation_zones_delete_manager" ON irrigation_zones
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: IRRIGATION LOGS
-- ============================================================================
CREATE POLICY "irrigation_logs_select_all" ON irrigation_logs
  FOR SELECT USING (true);

CREATE POLICY "irrigation_logs_insert_authenticated" ON irrigation_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "irrigation_logs_update_manager" ON irrigation_logs
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "irrigation_logs_delete_manager" ON irrigation_logs
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: WEATHER LOGS
-- ============================================================================
CREATE POLICY "weather_logs_select_all" ON weather_logs
  FOR SELECT USING (true);

CREATE POLICY "weather_logs_insert_manager" ON weather_logs
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "weather_logs_update_manager" ON weather_logs
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "weather_logs_delete_manager" ON weather_logs
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: BUDGET ITEMS
-- ============================================================================
CREATE POLICY "budget_items_select_manager" ON budget_items
  FOR SELECT USING (is_manager(auth.uid()));

CREATE POLICY "budget_items_insert_manager" ON budget_items
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "budget_items_update_manager" ON budget_items
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "budget_items_delete_manager" ON budget_items
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: EXPENSES
-- ============================================================================
CREATE POLICY "expenses_select_own_or_manager" ON expenses
  FOR SELECT USING (
    submitted_by = auth.uid()
    OR is_manager(auth.uid())
  );

CREATE POLICY "expenses_insert_authenticated" ON expenses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "expenses_update_manager" ON expenses
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "expenses_delete_manager" ON expenses
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: SCHEDULES
-- ============================================================================
CREATE POLICY "schedules_select_own_or_manager" ON schedules
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_manager(auth.uid())
    OR is_foreman(auth.uid())
  );

CREATE POLICY "schedules_insert_manager" ON schedules
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "schedules_update_manager" ON schedules
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "schedules_delete_manager" ON schedules
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: TIME OFF REQUESTS
-- ============================================================================
CREATE POLICY "time_off_requests_select_own_or_manager" ON time_off_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_manager(auth.uid())
  );

CREATE POLICY "time_off_requests_insert_own" ON time_off_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "time_off_requests_update_manager" ON time_off_requests
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "time_off_requests_delete_manager" ON time_off_requests
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: NOTIFICATIONS
-- ============================================================================
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_system" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- TRIGGER: Auto-create profile on new user signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'crew')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER course_zones_updated_at
  BEFORE UPDATE ON course_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER plan_goals_updated_at
  BEFORE UPDATE ON plan_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DATA: Task Templates
-- ============================================================================
INSERT INTO task_templates (name, description, category, default_priority, estimated_minutes, equipment_needed, checklist, requires_photo_before, requires_photo_after, weather_dependent, instructions) VALUES

-- 1. Morning Mow Greens
('Morning Mow - Greens', 'Daily morning mowing of all greens at tournament height', 'mowing', 'high', 120,
 ARRAY['Greens Mower #1', 'Greens Mower #2', 'Greens Mower #3'],
 '[{"id":"1","text":"Check mower height setting (0.125 in)","checked":false},{"id":"2","text":"Inspect reel for damage","checked":false},{"id":"3","text":"Mow in alternating patterns","checked":false},{"id":"4","text":"Clean up clippings","checked":false},{"id":"5","text":"Report any issues","checked":false}]'::jsonb,
 false, false, true,
 'Start at furthest green from clubhouse. Mow in straight lines, alternating direction from previous day. Clean-up pass around collar. Remove all clippings. Check for disease or stress while mowing.'),

-- 2. Morning Mow Tees
('Morning Mow - Tees', 'Daily morning mowing of all tee boxes', 'mowing', 'normal', 90,
 ARRAY['Tee Mower #1', 'Tee Mower #2'],
 '[{"id":"1","text":"Check mower height setting (0.375 in)","checked":false},{"id":"2","text":"Edge tee markers","checked":false},{"id":"3","text":"Clean up clippings","checked":false}]'::jsonb,
 false, false, true,
 'Mow all tee boxes. Trim edges cleanly. Remove all clippings from surface. Reset tee markers if moved.'),

-- 3. Morning Mow Fairways
('Morning Mow - Fairways', 'Daily fairway mowing with striping pattern', 'mowing', 'normal', 180,
 ARRAY['Fairway Mower #1', 'Fairway Mower #2'],
 '[{"id":"1","text":"Check mower height setting (0.5 in)","checked":false},{"id":"2","text":"Verify striping pattern for today","checked":false},{"id":"3","text":"Check fuel levels","checked":false},{"id":"4","text":"Clean up perimeter edges","checked":false}]'::jsonb,
 false, false, true,
 'Follow the weekly striping pattern schedule. Maintain clean lines. Overlap passes by 6 inches. Clean perimeter edges with triplex.'),

-- 4. Bunker Rake
('Bunker Rake - All', 'Daily bunker maintenance including raking and edge trimming', 'bunker', 'normal', 120,
 ARRAY['Bunker Rake Machine', 'Hand Rakes', 'Edger'],
 '[{"id":"1","text":"Machine rake all bunkers","checked":false},{"id":"2","text":"Hand rake faces and edges","checked":false},{"id":"3","text":"Check drainage","checked":false},{"id":"4","text":"Trim grass edges if needed","checked":false},{"id":"5","text":"Report sand depth issues","checked":false}]'::jsonb,
 false, false, false,
 'Start with bunkers nearest to clubhouse for tournament readiness. Machine rake floors, hand rake faces and edges. Maintain 4-inch sand depth on faces. Report any washout or erosion.'),

-- 5. Irrigation Check
('Irrigation System Check', 'Daily inspection of irrigation system operation', 'irrigation', 'high', 60,
 ARRAY['Utility Cart', 'Irrigation Tool Kit'],
 '[{"id":"1","text":"Check controller for alerts","checked":false},{"id":"2","text":"Inspect running heads on greens","checked":false},{"id":"3","text":"Check pump station pressure","checked":false},{"id":"4","text":"Log any broken heads","checked":false},{"id":"5","text":"Verify moisture levels","checked":false}]'::jsonb,
 false, true, false,
 'Review controller alerts first. Drive course checking for broken heads, leaks, or dry spots. Check pump station pressure and log readings. Flag any repairs needed.'),

-- 6. Green Aerification
('Green Aerification', 'Core aerification of putting greens', 'greens', 'critical', 480,
 ARRAY['Core Aerifier', 'Topdresser', 'Drag Mat', 'Blower'],
 '[{"id":"1","text":"Set up traffic control signs","checked":false},{"id":"2","text":"Aerify all greens","checked":false},{"id":"3","text":"Collect cores","checked":false},{"id":"4","text":"Topdress with sand","checked":false},{"id":"5","text":"Drag and brush in sand","checked":false},{"id":"6","text":"Irrigate lightly","checked":false},{"id":"7","text":"Remove traffic signs","checked":false}]'::jsonb,
 true, true, true,
 'Spring or fall aerification. Use 0.5 inch tines at 2x2 spacing. Collect all cores. Topdress with USGA spec sand. Drag in both directions. Water lightly to settle sand.'),

-- 7. Topdressing
('Topdressing - Greens', 'Light topdressing application to putting greens', 'greens', 'normal', 180,
 ARRAY['Topdresser', 'Drag Brush', 'Blower'],
 '[{"id":"1","text":"Load topdresser with sand","checked":false},{"id":"2","text":"Apply light coat to all greens","checked":false},{"id":"3","text":"Drag/brush into turf","checked":false},{"id":"4","text":"Blow excess from collars","checked":false}]'::jsonb,
 false, true, true,
 'Apply light dusting of sand - should not be visible after brushing. Brush in with drag mat. Blow excess from collars and surrounds. Water if needed to settle.'),

-- 8. Fertilizer Application
('Fertilizer Application', 'Scheduled fertilizer application to designated areas', 'chemical', 'high', 240,
 ARRAY['Sprayer', 'Spreader'],
 '[{"id":"1","text":"Verify product and rate","checked":false},{"id":"2","text":"Calibrate spreader/sprayer","checked":false},{"id":"3","text":"Apply to designated areas","checked":false},{"id":"4","text":"Log application details","checked":false},{"id":"5","text":"Clean equipment","checked":false}]'::jsonb,
 false, false, true,
 'Check weather - no rain expected for 24 hours, temps below 85°F. Calibrate equipment before application. Log all details including weather conditions at time of application.'),

-- 9. Pesticide Application
('Pesticide/Fungicide Application', 'Targeted pesticide or fungicide application', 'chemical', 'critical', 180,
 ARRAY['Boom Sprayer', 'PPE Kit'],
 '[{"id":"1","text":"Review SDS and label","checked":false},{"id":"2","text":"Don proper PPE","checked":false},{"id":"3","text":"Calibrate sprayer","checked":false},{"id":"4","text":"Apply per label rate","checked":false},{"id":"5","text":"Post REI signage","checked":false},{"id":"6","text":"Log application details","checked":false},{"id":"7","text":"Clean and store equipment","checked":false}]'::jsonb,
 false, false, true,
 'Full PPE required. Check wind speed < 10 mph. Apply per EPA label instructions. Post REI signs at all entry points. Log all details for compliance records.'),

-- 10. Tree Maintenance
('Tree/Shrub Maintenance', 'Pruning, trimming, and care of trees and shrubs', 'landscaping', 'low', 240,
 ARRAY['Chainsaw', 'Pole Saw', 'Loppers', 'Chipper'],
 '[{"id":"1","text":"Identify trees needing attention","checked":false},{"id":"2","text":"Remove dead/hazardous limbs","checked":false},{"id":"3","text":"Prune for clearance","checked":false},{"id":"4","text":"Chip debris","checked":false},{"id":"5","text":"Clean up area","checked":false}]'::jsonb,
 true, true, false,
 'Focus on dead/hazardous limbs first. Maintain 8-foot clearance over cart paths. Prune for aesthetics and air circulation. Chip all debris and remove from site.'),

-- 11. Cart Path Repair
('Cart Path Repair', 'Repair and maintenance of cart paths', 'construction', 'normal', 180,
 ARRAY['Asphalt Patch Kit', 'Tamper', 'Edger'],
 '[{"id":"1","text":"Identify all repair locations","checked":false},{"id":"2","text":"Clean and prep areas","checked":false},{"id":"3","text":"Apply patch material","checked":false},{"id":"4","text":"Compact and finish","checked":false},{"id":"5","text":"Edge along path borders","checked":false}]'::jsonb,
 true, true, false,
 'Document all repair locations with photos before work. Clean loose material from cracks and holes. Apply patch and compact firmly. Edge grass along path borders.'),

-- 12. Equipment Pre-Check
('Equipment Pre-Operation Check', 'Daily equipment inspection before operation', 'mechanical', 'high', 15,
 ARRAY[]::text[],
 '[{"id":"1","text":"Check fluid levels (oil, fuel, hydraulic)","checked":false},{"id":"2","text":"Inspect tires/tracks","checked":false},{"id":"3","text":"Test all controls","checked":false},{"id":"4","text":"Check safety features","checked":false},{"id":"5","text":"Log hours","checked":false},{"id":"6","text":"Report any issues","checked":false}]'::jsonb,
 false, false, false,
 'Complete pre-op checklist before each use. Report any deficiencies immediately. Do not operate equipment with safety issues.'),

-- 13. Drainage Work
('Drainage Installation/Repair', 'Installation or repair of drainage systems', 'construction', 'normal', 480,
 ARRAY['Trencher', 'Mini Excavator', 'Laser Level', 'Compactor'],
 '[{"id":"1","text":"Mark utilities before digging","checked":false},{"id":"2","text":"Excavate trench to grade","checked":false},{"id":"3","text":"Install pipe with proper fall","checked":false},{"id":"4","text":"Backfill with gravel","checked":false},{"id":"5","text":"Compact and restore surface","checked":false}]'::jsonb,
 true, true, false,
 'Call 811 before any digging. Maintain minimum 1% slope to outlet. Use filter fabric around gravel. Compact backfill in lifts. Restore turf or surface to match surroundings.'),

-- 14. Winterization
('Winterization Procedures', 'End of season winterization of course and equipment', 'admin', 'critical', 480,
 ARRAY['Air Compressor', 'Antifreeze'],
 '[{"id":"1","text":"Blow out irrigation system","checked":false},{"id":"2","text":"Winterize pump station","checked":false},{"id":"3","text":"Service all equipment","checked":false},{"id":"4","text":"Store chemicals properly","checked":false},{"id":"5","text":"Apply winter fertilizer","checked":false},{"id":"6","text":"Document system status","checked":false}]'::jsonb,
 true, true, false,
 'Follow winterization checklist completely. Blow out all irrigation lines with compressor. Drain pump station and treat with antifreeze. Service all equipment before storage. Store chemicals in heated area.'),

-- 15. Spring Opening
('Spring Opening Procedures', 'Beginning of season startup procedures', 'admin', 'critical', 960,
 ARRAY['All Equipment'],
 '[{"id":"1","text":"Inspect entire course for winter damage","checked":false},{"id":"2","text":"Start up irrigation system","checked":false},{"id":"3","text":"Commission pump station","checked":false},{"id":"4","text":"Test all equipment","checked":false},{"id":"5","text":"First mow of season","checked":false},{"id":"6","text":"Apply pre-emergent","checked":false},{"id":"7","text":"Document conditions","checked":false}]'::jsonb,
 true, true, false,
 'Walk entire course documenting winter damage. Start irrigation system slowly, checking for leaks. Service and test all equipment. Document baseline conditions for all greens and key areas.');

-- ============================================================================
-- SEED DATA: Create default "All Staff" channel
-- ============================================================================
INSERT INTO channels (name, channel_type, description, is_active)
VALUES ('All Staff', 'announcement', 'Announcements and updates for all staff members', true);

-- ============================================================================
-- COMPLETE
-- ============================================================================
-- Migration complete. To use:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Paste this entire file
-- 3. Click "Run"
-- 4. Set up your first user through Supabase Auth
-- 5. Update that user's profile role to 'super' in the profiles table


-- ═══ 002_invites_table.sql ═══

-- GreenKeeper Pro - Invites Table
-- Run this in Supabase SQL Editor after the initial schema

-- ============================================================================
-- INVITES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS invites (
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

CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by);
CREATE INDEX IF NOT EXISTS idx_invites_expires ON invites(expires_at);

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


-- ═══ 003_activity_log.sql ═══

-- supabase/migrations/003_activity_log.sql
-- Activity log table for tracking user actions

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
CREATE POLICY "activity_log_select_authenticated" ON activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- System can insert (we'll use service role for logging)
CREATE POLICY "activity_log_insert_authenticated" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only managers can delete
CREATE POLICY "activity_log_delete_manager" ON activity_log
  FOR DELETE USING (is_manager(auth.uid()));

COMMENT ON TABLE activity_log IS 'Tracks user actions for dashboard activity feed';


-- ═══ 004_user_preferences.sql ═══

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


-- ═══ 005_missing_tables.sql ═══

-- GreenKeeper Pro - Missing Tables Migration
-- Adds 11 tables referenced in code but not yet created in the database

-- ============================================================================
-- COMMUNITY POSTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL CHECK (post_type IN ('official', 'poll', 'discussion', 'photo')),
  content TEXT NOT NULL,
  photo_url TEXT,
  is_official BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  poll_question TEXT,
  poll_options TEXT[] DEFAULT '{}',
  poll_votes JSONB,
  poll_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_pinned_created ON community_posts(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_type ON community_posts(post_type);

-- ============================================================================
-- COMMUNITY COMMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_comments_author ON community_comments(author_id);

-- ============================================================================
-- COMMUNITY LIKES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS community_likes (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ============================================================================
-- POLL VOTES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON poll_votes(post_id);

-- ============================================================================
-- TEE TIMES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tee_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tee_date DATE NOT NULL,
  tee_time TEXT NOT NULL,
  num_players INTEGER NOT NULL CHECK (num_players >= 1),
  player_names TEXT[] DEFAULT '{}',
  cart_requested BOOLEAN DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tee_times_user ON tee_times(user_id);
CREATE INDEX IF NOT EXISTS idx_tee_times_date_time ON tee_times(tee_date, tee_time);
CREATE INDEX IF NOT EXISTS idx_tee_times_status ON tee_times(status);

-- ============================================================================
-- ROUND RATINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS round_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_date DATE NOT NULL,
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  greens_rating INTEGER CHECK (greens_rating BETWEEN 1 AND 5),
  fairways_rating INTEGER CHECK (fairways_rating BETWEEN 1 AND 5),
  bunkers_rating INTEGER CHECK (bunkers_rating BETWEEN 1 AND 5),
  tees_rating INTEGER CHECK (tees_rating BETWEEN 1 AND 5),
  pace_rating INTEGER CHECK (pace_rating BETWEEN 1 AND 5),
  setup_rating INTEGER CHECK (setup_rating BETWEEN 1 AND 5),
  cleanliness_rating INTEGER CHECK (cleanliness_rating BETWEEN 1 AND 5),
  value_rating INTEGER CHECK (value_rating BETWEEN 1 AND 5),
  favorite_hole INTEGER CHECK (favorite_hole BETWEEN 1 AND 18),
  comments TEXT,
  would_recommend BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_ratings_user ON round_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_round_ratings_date ON round_ratings(round_date DESC);

-- ============================================================================
-- MEMBER REGISTRATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS member_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('active_duty', 'retired_reserve', 'veteran', 'dod_civilian', 'general_public')),
  handicap INTEGER,
  preferred_tee TEXT NOT NULL CHECK (preferred_tee IN ('blue', 'white', 'gold', 'red')),
  wants_updates BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- GOLFER FEEDBACK TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS golfer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feedback_date DATE NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('compliment', 'complaint', 'suggestion')),
  area TEXT NOT NULL CHECK (area IN ('greens', 'fairways', 'bunkers', 'tees', 'cart_paths', 'pace_of_play', 'course_setup', 'cleanliness', 'other')),
  hole_number INTEGER CHECK (hole_number BETWEEN 1 AND 18),
  notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
  superintendent_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golfer_feedback_submitted_by ON golfer_feedback(submitted_by);
CREATE INDEX IF NOT EXISTS idx_golfer_feedback_status ON golfer_feedback(status);
CREATE INDEX IF NOT EXISTS idx_golfer_feedback_created ON golfer_feedback(created_at DESC);

-- ============================================================================
-- DIAGNOSTICS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'auto',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'diagnosed', 'treating', 'resolved', 'monitoring')),
  full_response JSONB,
  conversation JSONB DEFAULT '[]'::jsonb,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_course ON diagnostics(course_id);
CREATE INDEX IF NOT EXISTS idx_diagnostics_status ON diagnostics(status);
CREATE INDEX IF NOT EXISTS idx_diagnostics_created ON diagnostics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostics_created_by ON diagnostics(created_by);

-- ============================================================================
-- KNOWLEDGE ARTICLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mowing', 'irrigation', 'chemical', 'equipment', 'greens', 'bunkers', 'landscaping', 'safety', 'admin', 'onboarding', 'emergency', 'seasonal', 'general')),
  article_type TEXT NOT NULL CHECK (article_type IN ('sop', 'guide', 'manual', 'checklist', 'reference', 'training')),
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT true,
  linked_template_ids UUID[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON knowledge_articles(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_type ON knowledge_articles(article_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_published ON knowledge_articles(is_published);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags ON knowledge_articles USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_course ON knowledge_articles(course_id);

-- ============================================================================
-- KNOWLEDGE READ LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_read_log (
  article_id UUID NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tee_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golfer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_read_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: COMMUNITY POSTS
-- ============================================================================
CREATE POLICY "community_posts_select_all" ON community_posts
  FOR SELECT USING (true);

CREATE POLICY "community_posts_insert_authenticated" ON community_posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_posts_update_own" ON community_posts
  FOR UPDATE USING (auth.uid() = author_id OR is_manager(auth.uid()));

CREATE POLICY "community_posts_delete_own" ON community_posts
  FOR DELETE USING (auth.uid() = author_id OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: COMMUNITY COMMENTS
-- ============================================================================
CREATE POLICY "community_comments_select_all" ON community_comments
  FOR SELECT USING (true);

CREATE POLICY "community_comments_insert_authenticated" ON community_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_comments_delete_own" ON community_comments
  FOR DELETE USING (auth.uid() = author_id OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: COMMUNITY LIKES
-- ============================================================================
CREATE POLICY "community_likes_select_all" ON community_likes
  FOR SELECT USING (true);

CREATE POLICY "community_likes_insert_own" ON community_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_likes_delete_own" ON community_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: POLL VOTES
-- ============================================================================
CREATE POLICY "poll_votes_select_all" ON poll_votes
  FOR SELECT USING (true);

CREATE POLICY "poll_votes_insert_own" ON poll_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: TEE TIMES
-- ============================================================================
CREATE POLICY "tee_times_select_all" ON tee_times
  FOR SELECT USING (true);

CREATE POLICY "tee_times_insert_own" ON tee_times
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tee_times_update_own" ON tee_times
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: ROUND RATINGS
-- ============================================================================
CREATE POLICY "round_ratings_select_all" ON round_ratings
  FOR SELECT USING (true);

CREATE POLICY "round_ratings_insert_own" ON round_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: MEMBER REGISTRATIONS
-- ============================================================================
CREATE POLICY "member_registrations_select_all" ON member_registrations
  FOR SELECT USING (true);

CREATE POLICY "member_registrations_insert_own" ON member_registrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "member_registrations_update_own" ON member_registrations
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: GOLFER FEEDBACK
-- ============================================================================
CREATE POLICY "golfer_feedback_select_all" ON golfer_feedback
  FOR SELECT USING (auth.uid() = submitted_by OR is_manager(auth.uid()));

CREATE POLICY "golfer_feedback_insert_own" ON golfer_feedback
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "golfer_feedback_update_manager" ON golfer_feedback
  FOR UPDATE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: DIAGNOSTICS
-- ============================================================================
CREATE POLICY "diagnostics_select_all" ON diagnostics
  FOR SELECT USING (true);

CREATE POLICY "diagnostics_insert_authenticated" ON diagnostics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "diagnostics_update_authenticated" ON diagnostics
  FOR UPDATE USING (auth.uid() = created_by OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: KNOWLEDGE ARTICLES
-- ============================================================================
CREATE POLICY "knowledge_articles_select_published" ON knowledge_articles
  FOR SELECT USING (is_published = true OR is_manager(auth.uid()));

CREATE POLICY "knowledge_articles_insert_manager" ON knowledge_articles
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "knowledge_articles_update_manager" ON knowledge_articles
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "knowledge_articles_delete_manager" ON knowledge_articles
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: KNOWLEDGE READ LOG
-- ============================================================================
CREATE POLICY "knowledge_read_log_select_own" ON knowledge_read_log
  FOR SELECT USING (auth.uid() = user_id OR is_manager(auth.uid()));

CREATE POLICY "knowledge_read_log_insert_own" ON knowledge_read_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "knowledge_read_log_update_own" ON knowledge_read_log
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RPC FUNCTIONS: COMMUNITY COUNTERS
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_likes_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_likes_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_comments_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_poll_vote(p_post_id UUID, p_option TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts
  SET poll_votes = COALESCE(poll_votes, '{}'::jsonb) || jsonb_build_object(p_option, COALESCE((poll_votes ->> p_option)::int, 0) + 1)
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 006_add_director_role.sql ═══

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


-- ═══ 20260407_green_area_path.sql ═══

-- Add area_path column to green_observations for freehand drawn zones
-- Stores an array of {x, y} points (0-1 relative coords) representing
-- the boundary of the affected area on the green image.
-- pin_x/pin_y become the centroid of the drawn area.

ALTER TABLE green_observations
ADD COLUMN IF NOT EXISTS area_path JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN green_observations.area_path IS 'Array of {x,y} points (0-1 relative) defining the freehand-drawn boundary of the affected area. Null for legacy pin-only observations.';


-- ═══ 20260407_green_observations.sql ═══

-- Green Observations System
-- Separate table for putting green-specific issues and tracking
-- Similar structure to hole_observations but with green-specific issue types

-- Create enum for green issue types (shared + green-specific)
CREATE TYPE green_issue_type AS ENUM (
  'fungus_disease',
  'dry_spot',
  'wet_area',
  'bare_spot',
  'weed_pressure',
  'pest_damage',
  'mechanical_damage',
  'irrigation_issue',
  'algae',
  'frost_damage',
  'ball_marks',
  'scalping',
  'compaction',
  'thatch_buildup',
  'aeration_needed',
  'topdressing_needed',
  'moss',
  'shade_stress',
  'traffic_wear',
  'chemical_burn',
  'poor_drainage',
  'uneven_surface',
  'other'
);

-- Reuse existing status enum pattern
CREATE TYPE green_observation_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'monitoring'
);

-- Main table
CREATE TABLE IF NOT EXISTS green_observations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  pin_x REAL NOT NULL CHECK (pin_x BETWEEN 0 AND 1),
  pin_y REAL NOT NULL CHECK (pin_y BETWEEN 0 AND 1),
  issue_type green_issue_type NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status green_observation_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  fix_instructions TEXT,
  photo_url TEXT,
  reported_by UUID NOT NULL REFERENCES profiles(id),
  task_id UUID REFERENCES tasks(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_green_observations_hole ON green_observations(hole_number);
CREATE INDEX IF NOT EXISTS idx_green_observations_status ON green_observations(status);
CREATE INDEX IF NOT EXISTS idx_green_observations_priority ON green_observations(priority);
CREATE INDEX IF NOT EXISTS idx_green_observations_reported_by ON green_observations(reported_by);
CREATE INDEX IF NOT EXISTS idx_green_observations_created ON green_observations(created_at DESC);

-- Enable RLS
ALTER TABLE green_observations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view green observations"
  ON green_observations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create green observations"
  ON green_observations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "Authenticated users can update green observations"
  ON green_observations FOR UPDATE
  TO authenticated
  USING (true);

-- Auto-update trigger for updated_at
CREATE TRIGGER update_green_observations_updated_at
  BEFORE UPDATE ON green_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for green observation photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('green-observations', 'green-observations', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload green observation photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'green-observations');

CREATE POLICY "Anyone can view green observation photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'green-observations');


-- ═══ 20260407_hole_observations.sql ═══

-- Hole Observations: Pin-on-map issue reporting for each hole
-- Users tap on hole images to drop a pin and report issues

-- Issue type enum
CREATE TYPE hole_issue_type AS ENUM (
  'fungus_disease',
  'dry_spot',
  'wet_area',
  'bare_spot',
  'weed_pressure',
  'pest_damage',
  'mechanical_damage',
  'drainage',
  'bunker_issue',
  'tree_issue',
  'irrigation_issue',
  'turf_thin',
  'algae',
  'frost_damage',
  'other'
);

-- Observation status enum
CREATE TYPE hole_observation_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'monitoring'
);

-- Main table
CREATE TABLE IF NOT EXISTS hole_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  pin_x REAL NOT NULL CHECK (pin_x >= 0 AND pin_x <= 1),
  pin_y REAL NOT NULL CHECK (pin_y >= 0 AND pin_y <= 1),
  issue_type hole_issue_type NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  status hole_observation_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  reported_by UUID NOT NULL REFERENCES profiles(id),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hole_obs_hole ON hole_observations(hole_number);
CREATE INDEX IF NOT EXISTS idx_hole_obs_status ON hole_observations(status);
CREATE INDEX IF NOT EXISTS idx_hole_obs_priority ON hole_observations(priority);
CREATE INDEX IF NOT EXISTS idx_hole_obs_reported_by ON hole_observations(reported_by);
CREATE INDEX IF NOT EXISTS idx_hole_obs_created ON hole_observations(created_at DESC);

-- RLS
ALTER TABLE hole_observations ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Anyone can view hole observations"
  ON hole_observations FOR SELECT
  USING (true);

-- Authenticated users can create
CREATE POLICY "Authenticated users can create observations"
  ON hole_observations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Reporter or managers can update
CREATE POLICY "Reporter or managers can update observations"
  ON hole_observations FOR UPDATE
  USING (
    reported_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'foreman')
    )
  );

-- Auto-update updated_at
CREATE TRIGGER hole_observations_updated_at
  BEFORE UPDATE ON hole_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for hole observation photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('hole-observations', 'hole-observations', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view hole observation photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hole-observations');

CREATE POLICY "Authenticated users can upload hole observation photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'hole-observations' AND auth.uid() IS NOT NULL);


-- ═══ 20260408_add_fix_instructions_to_hole_observations.sql ═══

-- Add missing fix_instructions column to hole_observations
-- (green_observations already had this column; hole_observations was missing it)
ALTER TABLE hole_observations ADD COLUMN IF NOT EXISTS fix_instructions TEXT DEFAULT NULL;


-- ═══ 20260408_fix_equipment_inspections_rls.sql ═══

-- Fix equipment_inspections RLS policies (table existed but had no usable policies)
ALTER TABLE equipment_inspections ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_select_all') THEN
    CREATE POLICY "equipment_inspections_select_all" ON equipment_inspections FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Allow authenticated users to create inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_insert_auth') THEN
    CREATE POLICY "equipment_inspections_insert_auth" ON equipment_inspections FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- Allow authenticated users to update inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_update_auth') THEN
    CREATE POLICY "equipment_inspections_update_auth" ON equipment_inspections FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- Allow managers to delete inspections
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'equipment_inspections' AND policyname = 'equipment_inspections_delete_manager') THEN
    CREATE POLICY "equipment_inspections_delete_manager" ON equipment_inspections FOR DELETE TO authenticated USING (is_manager(auth.uid()));
  END IF;
END $$;


-- ═══ 20260408_observation_diagnosis_result.sql ═══

-- Add diagnosis_result JSONB column to both observation tables
-- Stores the full AI diagnosis with treatment plans, products, follow-up schedules

ALTER TABLE green_observations
ADD COLUMN IF NOT EXISTS diagnosis_result JSONB DEFAULT NULL;

ALTER TABLE hole_observations
ADD COLUMN IF NOT EXISTS diagnosis_result JSONB DEFAULT NULL;


-- ═══ 20260409_add_equipment_parts_and_service_records.sql ═══

-- Equipment Parts table (tracks individual parts needed per equipment)
CREATE TABLE IF NOT EXISTS equipment_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  part_number TEXT,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received')),
  estimated_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Equipment Service Records table (tracks service history per equipment)
CREATE TABLE IF NOT EXISTS equipment_service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  hours_at_service DECIMAL(10,1),
  cost DECIMAL(10,2),
  parts_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for equipment_parts
ALTER TABLE equipment_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment parts"
  ON equipment_parts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert equipment parts"
  ON equipment_parts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update equipment parts"
  ON equipment_parts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete equipment parts"
  ON equipment_parts FOR DELETE TO authenticated USING (true);

-- RLS Policies for equipment_service_records
ALTER TABLE equipment_service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service records"
  ON equipment_service_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert service records"
  ON equipment_service_records FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update service records"
  ON equipment_service_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete service records"
  ON equipment_service_records FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equipment_parts_equipment_id ON equipment_parts(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_service_records_equipment_id ON equipment_service_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_service_records_service_date ON equipment_service_records(service_date);


-- ═══ 20260409_add_order_items.sql ═══

-- Order Items table for tracking supplies/materials that need to be ordered
-- Categories: clubhouse, cart_paths, turf_course, general
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('clubhouse', 'cart_paths', 'turf_course', 'general')),
  item_name TEXT NOT NULL,
  description TEXT,
  quantity TEXT,
  estimated_cost DECIMAL(10,2),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received')),
  vendor TEXT,
  notes TEXT,
  ordered_date DATE,
  received_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order items" ON order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update order items" ON order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete order items" ON order_items FOR DELETE TO authenticated USING (true);


-- ═══ 20260409_add_parking_lot_and_clubhouse_issues.sql ═══

-- Parking Lot / Cart Path Issues table
CREATE TABLE IF NOT EXISTS parking_lot_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT, -- e.g. "Cart path hole 3-4", "Main parking lot entrance"
  issue_type TEXT NOT NULL DEFAULT 'pothole' CHECK (issue_type IN ('pothole', 'crack', 'drainage', 'erosion', 'marking', 'curbing', 'other')),
  severity TEXT NOT NULL DEFAULT 'moderate' CHECK (severity IN ('minor', 'moderate', 'severe', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'scheduled', 'completed')),
  photos TEXT[] DEFAULT '{}',
  repair_notes TEXT,
  estimated_cost DECIMAL(10,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Clubhouse Issues table
CREATE TABLE IF NOT EXISTS clubhouse_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT, -- e.g. "Pro shop", "Men's locker room", "Kitchen"
  category TEXT NOT NULL DEFAULT 'damage' CHECK (category IN ('damage', 'cleaning', 'order', 'maintenance')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'ordered', 'scheduled', 'completed')),
  photos TEXT[] DEFAULT '{}',
  repair_notes TEXT,
  estimated_cost DECIMAL(10,2),
  assigned_to TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for parking_lot_issues
ALTER TABLE parking_lot_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view parking lot issues"
  ON parking_lot_issues FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert parking lot issues"
  ON parking_lot_issues FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update parking lot issues"
  ON parking_lot_issues FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete parking lot issues"
  ON parking_lot_issues FOR DELETE TO authenticated USING (true);

-- RLS Policies for clubhouse_issues
ALTER TABLE clubhouse_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clubhouse issues"
  ON clubhouse_issues FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert clubhouse issues"
  ON clubhouse_issues FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update clubhouse issues"
  ON clubhouse_issues FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete clubhouse issues"
  ON clubhouse_issues FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_parking_lot_issues_status ON parking_lot_issues(status);
CREATE INDEX IF NOT EXISTS idx_parking_lot_issues_reported_by ON parking_lot_issues(reported_by);
CREATE INDEX IF NOT EXISTS idx_clubhouse_issues_status ON clubhouse_issues(status);
CREATE INDEX IF NOT EXISTS idx_clubhouse_issues_category ON clubhouse_issues(category);
CREATE INDEX IF NOT EXISTS idx_clubhouse_issues_reported_by ON clubhouse_issues(reported_by);


-- ═══ 20260409_add_parts_delay_reason.sql ═══

-- Add delay_reason column to equipment_parts for tracking delayed orders
ALTER TABLE equipment_parts ADD COLUMN IF NOT EXISTS delay_reason TEXT DEFAULT NULL;


-- ═══ 20260409_enable_rls_clubhouse_parkinglot.sql ═══

-- Enable RLS on clubhouse_issues table
ALTER TABLE clubhouse_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on clubhouse_issues" ON clubhouse_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable RLS on parking_lot_issues table
ALTER TABLE parking_lot_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on parking_lot_issues" ON parking_lot_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add assigned_to column to parking_lot_issues if it doesn't exist
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS assigned_to TEXT;


-- ═══ 20260409_enable_rls_equipment_tables.sql ═══

-- Enable RLS on equipment table
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view equipment" ON equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert equipment" ON equipment FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update equipment" ON equipment FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete equipment" ON equipment FOR DELETE TO authenticated USING (true);

-- Enable RLS on equipment_logs table
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view equipment logs" ON equipment_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert equipment logs" ON equipment_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update equipment logs" ON equipment_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete equipment logs" ON equipment_logs FOR DELETE TO authenticated USING (true);

-- Enable RLS on equipment_checkouts table
ALTER TABLE equipment_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on checkouts" ON equipment_checkouts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable RLS on equipment_inspections table
ALTER TABLE equipment_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can do all on inspections" ON equipment_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ═══ 20260411_add_chemical_compliance_fields.sql ═══

-- Add end_time for Illinois RUP compliance (start/end time of application)
-- All other required fields already exist:
--   chemical_applications: application_time (start), weather_temp_f, weather_wind_mph,
--     weather_wind_direction, target_pest, applicator_license
--   chemical_products: epa_registration
--   profiles: certifications (JSON array with license_number)

ALTER TABLE chemical_applications ADD COLUMN IF NOT EXISTS end_time TIME;


-- ═══ 20260411_add_drone_flights.sql ═══

-- Drone flight NDVI/imagery ingest table
CREATE TABLE IF NOT EXISTS drone_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_date date NOT NULL,
  geotiff_path text,          -- Supabase Storage path (nullable — may upload PNG instead)
  preview_png_path text,      -- Supabase Storage path for the preview image
  bbox jsonb,                 -- {north, south, east, west} - nullable
  band text CHECK (band IN ('ndvi','ndre','thermal','rgb')),
  source text,                -- 'greensight', 'pix4d', 'dji', 'manual'
  notes text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drone_flights_date ON drone_flights(flight_date);

ALTER TABLE drone_flights ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user
CREATE POLICY "drone_flights_select" ON drone_flights
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: management + foreman roles only
CREATE POLICY "drone_flights_insert" ON drone_flights
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director', 'foreman', 'pro')
    )
  );

-- UPDATE: management only
CREATE POLICY "drone_flights_update" ON drone_flights
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );

-- DELETE: management only
CREATE POLICY "drone_flights_delete" ON drone_flights
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );


-- ═══ 20260411_add_language_preference.sql ═══

-- Task 1.2: Bilingual task & message rendering
-- Adds a per-user language preference and a Spanish translation slot on
-- tasks, messages, and observation tables. Also creates a translation_cache
-- table so Claude Haiku is only called once per unique source string.

-- ── Profiles: preferred display language ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language_preference TEXT
  CHECK (language_preference IN ('en', 'es'))
  DEFAULT 'en';

-- ── Spanish translation columns on content tables ─────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT;

-- NOTE: the `messages` table in this codebase uses `content` as the primary
-- text field, so the Spanish translation lives in `content_es`.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_es TEXT;

ALTER TABLE course_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

ALTER TABLE hole_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

ALTER TABLE green_observations
  ADD COLUMN IF NOT EXISTS title_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS notes_es TEXT;

-- ── Translation cache ─────────────────────────────────────────────────────
-- TODO(privacy): A future task should consider dropping `source_text` and
-- relying on `key_hash` alone for lookups. Storing raw source text in a
-- shared cache is a mild privacy leak (super notes may contain names, crew
-- comments, etc.). Hash-only lookup would keep the cache functional while
-- removing the plaintext surface area. Deferred for now.
CREATE TABLE IF NOT EXISTS translation_cache (
  key_hash     TEXT PRIMARY KEY,           -- sha256(source||source_lang||target_lang)
  source_lang  TEXT NOT NULL,
  target_lang  TEXT NOT NULL,
  source_text  TEXT NOT NULL,
  target_text  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_created
  ON translation_cache(created_at);

-- ── RLS on translation_cache ──────────────────────────────────────────────
-- All authenticated users need SELECT (for cache hits) and INSERT (for
-- cache misses). No UPDATE, no DELETE — cache entries are immutable. The
-- cache contains no private data (it's just text translations) but we still
-- gate it behind an auth check to prevent unauthenticated scraping.

ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'translation_cache'
      AND policyname = 'translation_cache_select_authenticated'
  ) THEN
    CREATE POLICY translation_cache_select_authenticated
      ON translation_cache
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'translation_cache'
      AND policyname = 'translation_cache_insert_authenticated'
  ) THEN
    CREATE POLICY translation_cache_insert_authenticated
      ON translation_cache
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;


-- ═══ 20260411_add_pin_positions.sql ═══

-- ============================================================================
-- Add pin_positions table for daily pin sheet management
-- ============================================================================
-- Stores the daily hole cup location (paces from front edge, paces from left
-- edge) for each of the 18 holes. Supers set pins each morning, and the pro
-- shop prints a PDF pin sheet for the day. Staff can edit; pro shop and
-- seasonal employees can only read.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pin_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  hole_number int NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  paces_from_front int NOT NULL CHECK (paces_from_front >= 0 AND paces_from_front <= 50),
  paces_from_left int NOT NULL CHECK (paces_from_left >= 0 AND paces_from_left <= 40),
  difficulty text CHECK (difficulty IN ('easy','medium','hard')),
  notes text,
  set_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_pin_positions_date ON pin_positions(date);

ALTER TABLE pin_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent)
DO $$
BEGIN
  -- SELECT: any authenticated user (so pro shop and seasonal can view/print)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_select_authenticated'
  ) THEN
    CREATE POLICY "pin_positions_select_authenticated"
      ON pin_positions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  -- INSERT: staff only (super / asst_super / director / foreman / mechanic / crew)
  -- Pro shop and seasonal are blocked.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_insert_staff'
  ) THEN
    CREATE POLICY "pin_positions_insert_staff"
      ON pin_positions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;

  -- UPDATE: staff only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_update_staff'
  ) THEN
    CREATE POLICY "pin_positions_update_staff"
      ON pin_positions
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;

  -- DELETE: staff only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'pin_positions'
      AND policyname = 'pin_positions_delete_staff'
  ) THEN
    CREATE POLICY "pin_positions_delete_staff"
      ON pin_positions
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super','asst_super','director','foreman','mechanic','crew')
        )
      );
  END IF;
END$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION pin_positions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pin_positions_updated_at ON pin_positions;
CREATE TRIGGER pin_positions_updated_at
  BEFORE UPDATE ON pin_positions
  FOR EACH ROW
  EXECUTE FUNCTION pin_positions_set_updated_at();


-- ═══ 20260411_add_push_subscriptions.sql ═══

-- Web Push subscriptions table
-- Stores a VAPID-signed Web Push subscription per browser/device per user.
-- One user can have many subscriptions (phone browser, desktop browser, TWA).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can see/manage their own subscriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_select_own') THEN
    CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_insert_own') THEN
    CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_delete_own') THEN
    CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- NOTE: VAPID keys must be generated out-of-band and set as Vercel env vars:
--   npx web-push generate-vapid-keys
-- Then set:
--   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (public key, exposed to client)
--   VAPID_PRIVATE_KEY             (private key, server-only)
--   VAPID_SUBJECT                 (mailto:admin@example.com)


-- ═══ 20260412_add_environmental_compliance.sql ═══

-- Environmental Compliance Log tables
-- EPA/NPDES discharge monitoring & buffer zone tracking

-- ── Environmental Logs ──
create table if not exists public.environmental_logs (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('stormwater','discharge','buffer_zone','spill','waste_disposal','fuel_storage','wildlife')),
  title        text not null,
  description  text,
  severity     text not null default 'routine' check (severity in ('routine','minor','major','critical')),
  date_observed date not null default current_date,
  location     text,
  hole_numbers integer[] not null default '{}',
  corrective_action text,
  corrective_deadline date,
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id),
  photo_ids    text[] not null default '{}',
  reported_by  uuid not null references auth.users(id),
  npdes_reportable boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_env_logs_date on public.environmental_logs (date_observed);
create index if not exists idx_env_logs_category on public.environmental_logs (category);
create index if not exists idx_env_logs_npdes on public.environmental_logs (npdes_reportable);

-- ── Buffer Zones ──
create table if not exists public.buffer_zones (
  id                  uuid primary key default gen_random_uuid(),
  zone_name           text not null,
  water_feature       text not null,
  buffer_distance_ft  integer not null default 25,
  last_inspected      date,
  inspected_by        uuid references auth.users(id),
  status              text not null default 'needs_review' check (status in ('compliant','non_compliant','needs_review')),
  vegetation_condition text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_buffer_zones_status on public.buffer_zones (status);

-- ── RLS ──
alter table public.environmental_logs enable row level security;
alter table public.buffer_zones enable row level security;

-- SELECT: any authenticated user
create policy "env_logs_select" on public.environmental_logs
  for select to authenticated using (true);

create policy "buffer_zones_select" on public.buffer_zones
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: super, asst_super, director only
create policy "env_logs_insert" on public.environmental_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "env_logs_update" on public.environmental_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "env_logs_delete" on public.environmental_logs
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_insert" on public.buffer_zones
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_update" on public.buffer_zones
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_delete" on public.buffer_zones
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );


-- ═══ 20260412_add_inspection_checklists.sql ═══

-- Inspection Readiness Checklists
-- Command inspection preparation for MWR golf courses

-- ── Tables ──

create table if not exists inspection_checklists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  inspection_date date,
  inspector_name text,
  status        text not null default 'draft' check (status in ('draft','in_progress','completed')),
  notes         text,
  created_by    uuid not null references profiles(id) on delete cascade,
  score         smallint check (score is null or (score >= 0 and score <= 100)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists inspection_items (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references inspection_checklists(id) on delete cascade,
  category      text not null check (category in ('course_conditions','safety','environmental','equipment','facilities','documentation')),
  title         text not null,
  description   text,
  status        text not null default 'not_started' check (status in ('not_started','in_progress','compliant','non_compliant','na')),
  notes         text,
  photo_ids     text[] not null default '{}',
  sort_order    int not null default 0,
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz
);

-- ── Indexes ──

create index if not exists idx_inspection_items_checklist on inspection_items(checklist_id);
create index if not exists idx_inspection_items_category  on inspection_items(category);

-- ── Updated-at trigger ──

create or replace function update_inspection_checklist_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inspection_checklist_updated on inspection_checklists;
create trigger trg_inspection_checklist_updated
  before update on inspection_checklists
  for each row execute function update_inspection_checklist_timestamp();

-- ── RLS ──

alter table inspection_checklists enable row level security;
alter table inspection_items enable row level security;

-- All authenticated users can read
create policy "inspection_checklists_select"
  on inspection_checklists for select
  to authenticated
  using (true);

create policy "inspection_items_select"
  on inspection_items for select
  to authenticated
  using (true);

-- Only super / asst_super / director can modify checklists
create policy "inspection_checklists_insert"
  on inspection_checklists for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_checklists_update"
  on inspection_checklists for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_checklists_delete"
  on inspection_checklists for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Same RLS for items
create policy "inspection_items_insert"
  on inspection_items for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_items_update"
  on inspection_items for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_items_delete"
  on inspection_items for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );


-- ═══ 20260412_add_water_usage.sql ═══

-- Water Usage Reporting: meter readings & monthly targets
-- Ties irrigation logs to base utilities reporting (DoD MWR)

-- ── Water Meter Readings ──
create table if not exists public.water_meter_readings (
  id            uuid primary key default gen_random_uuid(),
  meter_id      text not null,
  reading_date  date not null default current_date,
  reading_value numeric not null check (reading_value >= 0),
  previous_reading numeric,
  usage_gallons numeric not null default 0 check (usage_gallons >= 0),
  source        text not null default 'municipal'
                check (source in ('municipal','well','reclaimed','pond','mixed')),
  notes         text,
  recorded_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create index idx_water_meter_readings_date on public.water_meter_readings(reading_date);
create index idx_water_meter_readings_meter on public.water_meter_readings(meter_id);

-- ── Water Usage Targets ──
create table if not exists public.water_usage_targets (
  id             uuid primary key default gen_random_uuid(),
  year           int not null,
  month          int not null check (month between 1 and 12),
  target_gallons numeric not null check (target_gallons > 0),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (year, month)
);

-- ── RLS ──
alter table public.water_meter_readings enable row level security;
alter table public.water_usage_targets  enable row level security;

-- Readings: all auth'd can SELECT
create policy "readings_select" on public.water_meter_readings
  for select to authenticated using (true);

-- Readings: super, asst_super, director, foreman can INSERT
create policy "readings_insert" on public.water_meter_readings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director','foreman')
    )
  );

-- Readings: super, asst_super, director, foreman can UPDATE
create policy "readings_update" on public.water_meter_readings
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director','foreman')
    )
  );

-- Readings: super, asst_super, director can DELETE
create policy "readings_delete" on public.water_meter_readings
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: all auth'd can SELECT
create policy "targets_select" on public.water_usage_targets
  for select to authenticated using (true);

-- Targets: super, asst_super, director can INSERT
create policy "targets_insert" on public.water_usage_targets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: super, asst_super, director can UPDATE
create policy "targets_update" on public.water_usage_targets
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: super, asst_super, director can DELETE
create policy "targets_delete" on public.water_usage_targets
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );


-- ═══ 20260413_add_asset_disposals.sql ═══

-- Asset Disposal workflow table (NAVCOMPT 2212 Certificate of Disposition)
CREATE TABLE IF NOT EXISTS asset_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_request'
    CHECK (status IN (
      'pending_request',
      'pending_approval',
      'approved',
      'rendering_useless',
      'pending_witness',
      'disposed',
      'routed_to_business',
      'completed'
    )),
  reason TEXT NOT NULL,
  requested_by UUID REFERENCES profiles(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  -- Step 3: approval signatures
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  -- Step 4: render useless
  rendered_useless_at TIMESTAMPTZ,
  rendered_useless_notes TEXT,
  -- Step 5: witness signatures
  witness_1_name TEXT,
  witness_1_signed_at TIMESTAMPTZ,
  witness_2_name TEXT,
  witness_2_signed_at TIMESTAMPTZ,
  disposal_date TIMESTAMPTZ,
  disposal_photo_url TEXT,
  -- Step 6: route to business office
  routed_to_business_at TIMESTAMPTZ,
  routed_to_business_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE asset_disposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view disposals"
  ON asset_disposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create disposals"
  ON asset_disposals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update disposals"
  ON asset_disposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_asset_disposals_equipment_id ON asset_disposals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_asset_disposals_status ON asset_disposals(status);


-- ═══ 20260413_add_grub_damage_issue_type.sql ═══

-- Add grub_damage, mulch_pile, sticks_around_tree, sticks_on_ground, felled_tree to hole_issue_type enum
-- Add grub_damage to green_issue_type enum
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'grub_damage' AFTER 'pest_damage';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'mulch_pile' AFTER 'grub_damage';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'sticks_around_tree' AFTER 'mulch_pile';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'sticks_on_ground' AFTER 'sticks_around_tree';
ALTER TYPE hole_issue_type ADD VALUE IF NOT EXISTS 'felled_tree' AFTER 'sticks_on_ground';
ALTER TYPE green_issue_type ADD VALUE IF NOT EXISTS 'grub_damage' AFTER 'pest_damage';


-- ═══ 20260413_add_parking_lot_pin_coords_and_types.sql ═══

-- Add pin coordinates for map-based issue placement
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS pin_x REAL;
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS pin_y REAL;

-- Add new issue types: low_area, badly_cracked
-- Drop and recreate check constraint to include new values
ALTER TABLE parking_lot_issues DROP CONSTRAINT IF EXISTS parking_lot_issues_issue_type_check;
ALTER TABLE parking_lot_issues ADD CONSTRAINT parking_lot_issues_issue_type_check
  CHECK (issue_type IN ('pothole', 'low_area', 'badly_cracked', 'crack', 'drainage', 'erosion', 'marking', 'curbing', 'other'));


-- ═══ 20260413_fix_equipment_rls.sql ═══

-- Fix equipment RLS: ensure all authenticated users with frontend role checks can insert/update
-- The frontend already guards access via canManageEquipment (super, asst_super, foreman, mechanic, director)
-- Old restrictive policies may block mechanic inserts/updates in some configurations

DROP POLICY IF EXISTS "equipment_insert_manager_mechanic" ON equipment;
DROP POLICY IF EXISTS "equipment_update_manager_mechanic" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can insert equipment" ON equipment;
DROP POLICY IF EXISTS "Authenticated users can update equipment" ON equipment;

CREATE POLICY "equipment_insert_authenticated" ON equipment
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "equipment_update_authenticated" ON equipment
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ═══ 20260415_add_ai_conversations.sql ═══

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT, -- auto-generated from first message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  error BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own conversations"
  ON ai_conversations FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage messages in their conversations"
  ON ai_messages FOR ALL TO authenticated
  USING (conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at ASC);


-- ═══ 20260415_add_fy26_assets.sql ═══

-- FY26 Annual Inventory (AI) Assets — imported from SITE 7009 (GL GOLF COURSE)
-- and SITE 7010 (GL GOLF COURSE MAINTENANCE) Flexible Asset Listings.
--
-- Status values:
--   'unverified'       — not yet confirmed by inventory
--   'verified_present' — auto-matched by serial # against equipment table, OR manually confirmed
--   'mia'              — Missing In Action (could not be located)
--   'disposed'         — confirmed disposed / retired
--
-- Auto-match logic: after inserting, any row whose serial_number matches an
-- existing equipment.serial_number is flipped to 'verified_present' and linked.

CREATE TABLE IF NOT EXISTS fy26_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,                      -- '7009' or '7010'
  cost_center TEXT,
  resp_cost_center TEXT,
  asset_number TEXT NOT NULL,              -- e.g. '17307537'
  sub_number TEXT,                         -- sub-asset index
  license_plate TEXT,
  description TEXT NOT NULL,
  qty NUMERIC DEFAULT 1,
  model_text TEXT,                         -- "Model no / Asset Main text" from PDF
  serial_number TEXT,
  manufacturer TEXT,
  original_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified','verified_present','mia','disposed')),
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site, asset_number, sub_number)
);

CREATE INDEX IF NOT EXISTS idx_fy26_assets_site ON fy26_assets(site);
CREATE INDEX IF NOT EXISTS idx_fy26_assets_status ON fy26_assets(status);
CREATE INDEX IF NOT EXISTS idx_fy26_assets_serial ON fy26_assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_fy26_assets_manufacturer ON fy26_assets(manufacturer);

ALTER TABLE fy26_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view fy26 assets"
  ON fy26_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert fy26 assets"
  ON fy26_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update fy26 assets"
  ON fy26_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete fy26 assets"
  ON fy26_assets FOR DELETE TO authenticated USING (true);

-- Seed data: SITE 7009 — GL GOLF COURSE
INSERT INTO fy26_assets (site, cost_center, resp_cost_center, asset_number, sub_number, description, qty, model_text, serial_number, manufacturer, original_value) VALUES
('7009','20091','20091','11005207','0','REFRESHMENT CART TRAILER',1,'BC660','A31692',NULL,1700.00),
('7009','20087','20087','11005208','0','SIGN/WILLOW GLEN GOLF COURSE',1,'SINGLE SIDED',NULL,NULL,1798.00),
('7009','20087','20087','11005221','0','GOLF BALL WASHER',1,'W-75','901079','WITTEK',1495.00),
('7009','25229','25229','11006241','0','ELECTRIC PRESSURE WASHER',1,'ELECTRIC PRESSURE WASHER',NULL,NULL,696.84),
('7009','20002','20087','16504980','0','TABLE, CLEAN CORNER',1,'S4- 74- 1842Z',NULL,NULL,2263.80),
('7009','20002','20087','16504982','0','TABLE BASE, METAL FINISH, BLACK',1,'B213-22',NULL,NULL,0.00),
('7009','20091','20091','16505042','0','REFRIGERATOR W/ GLASS DOOR',1,'BB48 B','6371368','BEVERAGE AIR',1153.67),
('7009','20087','20087','16505100','0','CHAIR, OPEN ARM SIDE',2,'ACCAPELLA LOW BLACK',NULL,NULL,1222.68),
('7009','20002','20087','16505101','0','DINING TABLE 35.5 ROUND',2,'KENDAL TEAK 4860',NULL,NULL,1004.09),
('7009','20091','20091','16505121','0','TV, 46" W/ARM WALL MOUNT',1,'LC-46D64U LCD HDTV','803813929','SHARP',1754.13),
('7009','25224','25224','16505174','0','BALL PICKER W/ 6 BASKETS',7,'SL-90',NULL,NULL,2307.00),
('7009','20087','20087','16505775','0','CYBERNET ALL-IN-ONE PC',1,'C22','LPCC22T-01400','CYBERNET',2125.00),
('7009','20087','20087','16505776','0','CYBERNET ALL-IN-ONE PC',1,'C22','LPCC22T-01362','CYBERNET',2125.00),
('7009','20087','20087','16505777','0','CYBERNET ALL-IN-ONE PC',1,'C22','LPCC22T-01376','CYBERNET',2125.00),
('7009','25224','25224','16506323','0','50 G JUNIOR BALL WASHER',1,'50 G JUNIOR BALL WASHER',NULL,NULL,2124.99),
('7009','25581','25581','16506681','0','JACOBSEN FAIRWAY MOWER',0,'JACOBSEN FAIRWAY MOWER',NULL,NULL,7060.00),
('7009','20087','20087','17000047','0','POS SYSTEM COMPLETE',1,'WITH REC TRAC SOFTWARE','36J2MM1',NULL,1003.30),
('7009','20087','20087','17000048','0','POS SYSTEM COMPLETE',1,'WITH REC TRAC SOFTWARE','36N3MM1',NULL,2108.13),
('7009','20091','20091','17000049','0','POS SYSTEM COMPLETE',1,'WITH REC TRAC SOFTWARE','36F3MM1',NULL,2251.06),
('7009','20087','20087','17000095','0','DESKTOP COMPUTER',1,'SB Z220','2UA2491HVZ','HEWLETT PACKARD',1111.03),
('7009','20087','20087','17000098','0','DESKTOP W/SMART CARD & KEYBOARD',1,'SB Z220','2UA2491HWS','HEWLETT PACKARD',1111.03),
('7009','20087','20087','17000100','0','DESKTOP COMPUTER',1,'SB Z220','2UA2491HW5','HEWLETT PACKARD',1111.03),
('7009','20087','20087','17000197','3','COLOR LASERJET PRINTER',1,'M553DN','JPBCK461V5','HEWLETT PACKARD',612.75),
('7009','20087','20087','17000198','4','LASERJET PRINTER',1,'M604DN','CNDCJDC2CQ','HEWLETT PACKARD',901.69),
('7009','20087','20087','17000198','7','LASERJET PRINTER',1,'M604DN','CNDCJDC2CT','HEWLETT PACKARD',901.69),
('7009','20087','20087','17000198','17','LASERJET PRINTER',1,'M604DN','CNDCJDD07R','HEWLETT PACKARD',901.69),
('7009','20087','20087','17000198','18','LASERJET PRINTER',1,'M604DN','CNDCJDD07S','HEWLETT PACKARD',901.69),
('7009','20087','20087','17306944','0','SIGN / WILLOW GLEN',1,'CONCEPT SUPRA II 2-SIDE/NON-ILLUMD',NULL,'J. M. STEWART',4955.68),
('7009','20087','20087','17307007','0','SIGNS, ALUMINUM TEE',18,'W/ALUMINUM POST & CAP & HANGAR ARM',NULL,NULL,10007.13),
('7009','25224','25224','17307097','0','RANGE BALL DISPENSER',1,'74731',NULL,NULL,2876.00),
('7009','20002','20087','17307101','0','CABINET, STORAGE BACKBAR',2,'BS108 QTY 1, BN24 QTY 1',NULL,NULL,4236.45),
('7009','20002','20087','17307124','0','CHAIR, LOUNGE, LEG FINISH',4,'S- T22',NULL,NULL,3082.80),
('7009','20002','20087','17307125','0','FOUNTAIN, SLATE, WALL',1,'HORIZONTAL FALLS',NULL,NULL,3549.00),
('7009','20002','20087','17307126','0','CABINET, CUSTOM',1,'CABINET, CUSTOM',NULL,NULL,72923.00),
('7009','20002','20087','17307127','0','RUG, CUSTOM AREA',1,'RUG, CUSTOM AREA',NULL,NULL,2869.16),
('7009','20002','20087','17307128','0','DESK, CREDENZA',4,'DESK, CREDENZA',NULL,NULL,14732.20),
('7009','25229','25229','17307142','0','GOLF CART, HANDICAP',1,'GOLF CART, HANDICAP',NULL,'E Z GO',7253.00),
('7009','25229','25229','17307143','0','GOLF CART, HANDICAP',1,'GOLF CART, HANDICAP',NULL,'E Z GO',7253.00),
('7009','20002','20087','17307157','0','TV, 52" W/ TILT WALL MOUNT',1,'LN-T5271F','AK2V3CFQ300302H','SAMSUNG',3003.34),
('7009','20087','20087','17307220','0','BEVERAGE CART, LOUNGE DELUXE',1,'YT2A-1BEV2','JW7-500490','YAMAHA',11948.72),
('7009','25229','25229','17307537','0','GOLF CART #1',1,'YDREP1H','JW9-611248','YAMAHA',2860.61),
('7009','25229','25229','17307538','0','GOLF CART #2',1,'YDREP1H','JW9-611260','YAMAHA',2860.61),
('7009','25229','25229','17307539','0','GOLF CART #3',1,'YDREP1H','JW9-611256','YAMAHA',2860.61),
('7009','25229','25229','17307540','0','GOLF CART #4',1,'YDREP1H','JW9-611231','YAMAHA',2860.61),
('7009','25229','25229','17307541','0','GOLF CART #5',1,'YDREP1H','JW9-611225','YAMAHA',2860.61),
('7009','25229','25229','17307542','0','GOLF CART #6',1,'YDREP1H','JW9-611221','YAMAHA',2860.61),
('7009','25229','25229','17307543','0','GOLF CART #7',1,'YDREP1H','JW9-611233','YAMAHA',2860.61),
('7009','25229','25229','17307544','0','GOLF CART #8',1,'YDREP1H','JW9-611218','YAMAHA',2860.61),
('7009','25229','25229','17307545','0','GOLF CART #9',1,'YDREP1H','JW9-611236','YAMAHA',2860.61),
('7009','25229','25229','17307546','0','GOLF CART #10',1,'YDREP1H','JW9-611223','YAMAHA',2860.61),
('7009','25229','25229','17307547','0','GOLF CART #11',1,'YDREP1H','JW9-611271','YAMAHA',2860.61),
('7009','25229','25229','17307548','0','GOLF CART #12',1,'YDREP1H','JW9-611255','YAMAHA',2860.61),
('7009','25229','25229','17307549','0','GOLF CART #13',1,'YDREP1H','JW9-611257','YAMAHA',2860.61),
('7009','25229','25229','17307550','0','GOLF CART #14',1,'YDREP1H','JW9-611267','YAMAHA',2860.61),
('7009','25229','25229','17307551','0','GOLF CART #15',1,'YDREP1H','JW9-611220','YAMAHA',2860.61),
('7009','25229','25229','17307552','0','GOLF CART #16',1,'YDREP1H','JW9-611254','YAMAHA',2860.61),
('7009','25229','25229','17307553','0','GOLF CART #17',1,'YDREP1H','JW9-611224','YAMAHA',2860.61),
('7009','25229','25229','17307554','0','GOLF CART #18',1,'YDREP1H','JW9-611228','YAMAHA',2860.61),
('7009','25229','25229','17307555','0','GOLF CART #19',1,'YDREP1H','JW9-611232','YAMAHA',2860.61),
('7009','25229','25229','17307556','0','GOLF CART #20',1,'YDREP1H','JW9-611229','YAMAHA',2860.61),
('7009','25229','25229','17307557','0','GOLF CART #21',1,'YDREP1H','JW9-611227','YAMAHA',2860.61),
('7009','25229','25229','17307558','0','GOLF CART #22',1,'YDREP1H','JW9-611270',NULL,2860.61),
('7009','25229','25229','17307559','0','GOLF CART #23',1,'YDREP1H','JW9-611258',NULL,2860.61),
('7009','25229','25229','17307560','0','GOLF CART #24',1,'YDREP1H','JW9-611261',NULL,2860.61),
('7009','25229','25229','17307561','0','GOLF CART #25',1,'YDREP1H','JW9-611247',NULL,2860.61),
('7009','25229','25229','17307562','0','GOLF CART #26',1,'YDREP1H','JW9-611222',NULL,2860.61),
('7009','25229','25229','17307563','0','GOLF CART #27',1,'YDREP1H','JW9-612840',NULL,2860.61),
('7009','25229','25229','17307564','0','GOLF CART #28',1,'YDREP1H','JW9-612838',NULL,2860.61),
('7009','25229','25229','17307565','0','GOLF CART #29',1,'YDREP1H','JW9-612839',NULL,2860.61),
('7009','25229','25229','17307566','0','GOLF CART #30',1,'YDREP1H','JW9-612841',NULL,2860.61),
('7009','25229','25229','17307567','0','GOLF CART #31',1,'YDREP1H','JW9-612842',NULL,2860.61),
('7009','25229','25229','17307568','0','GOLF CART #32',1,'YDREP1H','JW9-612843',NULL,2860.61),
('7009','25229','25229','17307569','0','GOLF CART #33',1,'YDREP1H','JW9-612844',NULL,2860.61),
('7009','25229','25229','17307570','0','GOLF CART #34',1,'YDREP1H','JW9-612845',NULL,2860.61),
('7009','25229','25229','17307571','0','GOLF CART #35',1,'YDREP1H','JW9-612847',NULL,2860.61),
('7009','25229','25229','17307572','0','GOLF CART #36',1,'YDREP1H','JW9-612846',NULL,2860.61),
('7009','25229','25229','17307573','0','GOLF CART #37',1,'YDREP1H','JW9-612848',NULL,2860.61),
('7009','25229','25229','17307574','0','GOLF CART #38',1,'YDREP1H','JW9-612849',NULL,2860.61),
('7009','25229','25229','17307575','0','GOLF CART #39',1,'YDREP1H','JW9-612815',NULL,2860.61),
('7009','25229','25229','17307576','0','GOLF CART #40',1,'YDREP1H','JW9-612850',NULL,2860.61),
('7009','25229','25229','17307577','0','GOLF CART #41',1,'YDREP1H','JW9-612828',NULL,2860.61),
('7009','25229','25229','17307578','0','GOLF CART #42',1,'YDREP1H','JW9-612829',NULL,2860.61),
('7009','25229','25229','17307579','0','GOLF CART #43',1,'YDREP1H','JW9-612830',NULL,2860.61),
('7009','25229','25229','17307580','0','GOLF CART #44',1,'YDREP1H','JW9-612831',NULL,2860.61),
('7009','25229','25229','17307581','0','GOLF CART #45',1,'YDREP1H','JW9-612833',NULL,2860.61),
('7009','25229','25229','17307582','0','GOLF CART #46',1,'YDREP1H','JW9-612832',NULL,2860.61),
('7009','25229','25229','17307583','0','GOLF CART #47',1,'YDREP1H','JW9-612835',NULL,2860.61),
('7009','25229','25229','17307584','0','GOLF CART #48',1,'YDREP1H','JW9-612834',NULL,2860.61),
('7009','25229','25229','17307585','0','GOLF CART #49',1,'YDREP1H','JW9-612836',NULL,2860.61),
('7009','25229','25229','17307586','0','GOLF CART #50',1,'YDREP1H','JW9-613100',NULL,2860.61),
('7009','25229','25229','17307587','0','GOLF CART #51',1,'YDREP1H','JW9-611226',NULL,2860.61),
('7009','25229','25229','17307588','0','GOLF CART #52',1,'YDREP1H','JW9-611243',NULL,2860.61),
('7009','25229','25229','17307589','0','GOLF CART #53',1,'YDREP1H','JW9-611219',NULL,2860.61),
('7009','25229','25229','17307590','0','GOLF CART #54',1,'YDREP1H','JW9-611238',NULL,2860.61),
('7009','25229','25229','17307591','0','GOLF CART #55',1,'YDREP1H','JW9-611269',NULL,2860.61),
('7009','25229','25229','17307592','0','GOLF CART #56',1,'YDREP1H','JW9-611265',NULL,4260.61),
('7009','25229','25229','17307593','0','GOLF CART #57',1,'YDREP1H','JW9-611272',NULL,4260.61),
('7009','25229','25229','17307594','0','GOLF CART #58',1,'YDREP1H','JW9-611230',NULL,4260.61),
('7009','25229','25229','17307595','0','GOLF CART #59',1,'YDREP1H','JW9-616641',NULL,4260.61),
('7009','25229','25229','17307596','0','GOLF CART #60',1,'YDREP1H','JW9-616639',NULL,4260.61),
('7009','20087','20087','17308218','0','SIGN, WHITE LEXAN FACES',1,'4'' W X 12'' H',NULL,NULL,2550.00),
('7009','20087','25581','17308600','0','JACOBSEN TRIPLEX MOWER',1,'GP400','GZ500695','JACOBSEN',48500.00),
('7009','25581','25581','17308762','0','TORO ROUGH MOWER',2,'4700',NULL,NULL,39500.00),
('7009','25581','25581','17308763','0','TORO ROUGH MOWER',2,'4500',NULL,NULL,19500.00),
('7009','25581','25581','17308764','0','TORO ROUGH MOWER',2,'3500',NULL,NULL,17900.00),
('7009','25581','25581','17308765','0','RYAN AERATOR',2,'G30',NULL,NULL,4900.00),
('7009','25581','25581','17308766','0','REDEXIM RAPIDCORE AERATOR',2,'1600',NULL,NULL,7500.00),
('7009','25581','25581','17308870','0','2017 GREENS PRO',0,'2017 GREENS PRO',NULL,NULL,7666.66),
('7009','25581','25581','17308871','0','2018 GREENS PRO',0,'2017 GREENS PRO',NULL,NULL,7666.67),
('7009','25581','25581','17308872','0','2018 BLOWER',5,'2018 BLOWER',NULL,NULL,8116.67),
('7009','24999','20087','17500133','0','RESTROOM BUILDING',1,'DOUBLE VAULT/DESERT SAND BRICK','FY00-004-40','APS CONCRETE PRODUCTS',21373.54),
('7009','24998','24999','17500135','0','GOLF CLUBHOUSE',1,'GOLF CLUBHOUSE',NULL,NULL,0.00),
('7009','24999','20087','17701103','0','RENOVATION / BACK 9 / PHASE 1',1,'RENOVATION / BACK 9 / PHASE 1','FY00-004-40',NULL,1907615.37),
('7009','24999','25224','17701104','0','PRACTICE RANGE IMPROVEMENT',1,'30'' & 50 POLES, NETTING & INSTALLATION',NULL,NULL,24107.00),
('7009','24999','20087','17701105','0','BACK 9 RENOVATION, PHASE 2',1,'BACK 9 RENOVATION, PHASE 2','FY00-004-40',NULL,123736.16),
('7009','20087','20087','17901231','0','GLK REPAIRS/REPLACEMENT',1,'GOLF RANGE NETTING, 23-GLK-08',NULL,NULL,0.00),
('7009','20087','20087','17901286','0','GREAT LAKES GOLF RETENTION POND DREDGING 25-GLK-02',0,'GREAT LAKES GOLF RETENTION POND DREDGING 25-GLK-02',NULL,NULL,611097.00),
('7009','20087','20087','17901306','0','GLK GOLF TREE TRIMMING AND REMOVAL',0,'GLK GOLF TREE TRIMMING AND REMOVAL',NULL,NULL,25000.00);

-- Seed data: SITE 7010 — GL GOLF COURSE MAINTENANCE
INSERT INTO fy26_assets (site, cost_center, asset_number, license_plate, description, qty, model_text, serial_number, manufacturer, original_value) VALUES
('7010','20087','10008336',NULL,'GILL RAKE PULVERIZER',1,'SP-2572','L-49544','LANDSPRIDE',1242.80),
('7010','20087','10008369',NULL,'GRINDER / BED KNIFE',1,'GRINDER / BED KNIFE','224','FOLEY',4000.00),
('7010','20087','10008370',NULL,'GENERATOR / 9000 WATT',1,'GA902EH','594015','HONDA',2990.00),
('7010','20087','10008380',NULL,'AMP VOLTAGE & REGULATOR TEST',1,'MT3750KP','95449202','SNAP-ON',1351.20),
('7010','20087','10008381',NULL,'AMP VOLTAGE & REGULATOR TEST',1,'MT3750KR','95449186','SNAP-ON',1351.20),
('7010','20087','10008395',NULL,'GREENSMOWER /1992',1,'GREENSMOWER /1992','E00022G905090','JOHN DEERE',3688.12),
('7010','20087','10008397',NULL,'RYAN CARE MACHINE / 1977',1,'544801770','66343','RYAN',2835.00),
('7010','20087','10008435',NULL,'MID-RISE SCISSOR LIFT',1,'EELR338A','M16761','WHEELTRONIC',2621.25),
('7010','20087','10008517',NULL,'LOADER SCOOP TYPE',1,'610C','TO610CB739125','JOHN DEERE',47762.00),
('7010','20087','11005210',NULL,'TOPDRESSER FINISHING BRUSH ATTACH',1,'QUICK PASS 300/450','6149','TYCROP',1115.00),
('7010','20087','11005211',NULL,'TOPDRESSER TWIN SPINNER ATTACH',1,'QUICK PASS 300/450','6063','TYCROP',1862.00),
('7010','20087','11005212',NULL,'WOODEN BRIDGE',1,'WOODEN BRIDGE',NULL,NULL,1777.00),
('7010','20087','11005213',NULL,'WOODEN BRIDGE',1,'WOODEN BRIDGE',NULL,NULL,1777.00),
('7010','20087','11005214',NULL,'WOODEN BRIDGE',1,'WOODEN BRIDGE',NULL,NULL,1382.75),
('7010','20087','11005215',NULL,'TRACTOR SPREADER',1,'TRACTOR SPREADER','931-0529','LILY',1300.00),
('7010','20087','11005216',NULL,'SOD CUTTER',1,'5448458710','124-218','RYAN',1669.40),
('7010','20087','11005220',NULL,'FAIRWAY AERATOR',1,'270','E00270G759192','JOHN DEERE',2437.28),
('7010','20087','11005222',NULL,'PTO TILLER',1,'660','TY0660E009817','JOHN DEERE',2100.00),
('7010','20087','11005223',NULL,'CORE HARVESTER',1,'CORE HARVESTER','CUS-895100064','CUSHMAN',2054.00),
('7010','20087','11005224',NULL,'MOWER W/MULCHER',1,'GS30','MO0S30X021640','JOHN DEERE',2214.45),
('7010','20087','11005632',NULL,'BUNKER & FIELD RAKE',1,'TC1200A','170495','JOHN DEERE',10358.10),
('7010','20087','11006376',NULL,'SPRAYER 1991',1,'SMITHCO','H8503',NULL,5875.05),
('7010','20087','11006377',NULL,'GRINDER POLISHER 1995',1,'3096','260',NULL,6000.00),
('7010','20087','11006380',NULL,'TRACTOR BUNKER RAKE 2010',1,'1200A','DOM20100803',NULL,10358.00),
('7010','20087','11006381',NULL,'MOWER LAWN 1997',1,'N/A','04327-30501',NULL,10877.19),
('7010','20087','16505133',NULL,'MOWER 32" DECK',1,'M15KA322P','733158',NULL,2193.73),
('7010','20002','16505175','456652','MOWER ROUGH CUT',1,'RTDH-60','12-46282','BRUSH HOG',1445.00),
('7010','20087','16506670',NULL,'JACOBSEN FAIRWAY MOWER',0,'JACOBSEN FAIRWAY MOWER',NULL,NULL,7060.00),
('7010','20087','17000099',NULL,'DESKTOP COMPUTER W/SMART CARD & KEYBOARD',1,'SB Z220','2UA2491HW0','HEWLETT PACKARD',1111.03),
('7010','20087','17100826','447570','P/UP TRUCK 2002',1,'SILVERADO 2500/CK25903 - 4X4','1GCHK24U62Z108031','CHEVROLET (GENERAL MOTORS)',26659.00),
('7010','20087','17306600',NULL,'GREENSMASTER W ROLLERS & KNIFE',1,'GREENSMASTER','280000170','TORO',14696.30),
('7010','20087','17306600-CU',NULL,'CUTTING UNITS',4,'GREENSMASTER','280007828','TORO',4922.64),
('7010','20087','17306630',NULL,'MOWER WITH 60" DECK',1,'74925','311000314','TORO',8474.31),
('7010','20087','17306631',NULL,'BLOWER TURBINE TOWABLE',1,'PRO FORCE','11000809-44538','TORO',5891.00),
('7010','20087','17306677',NULL,'FOUNTAIN AERATOR',1,'2 HP',NULL,'KASCO',3333.76),
('7010','20087','17306678',NULL,'FOUNTAIN AERATOR',1,'2 HP',NULL,'KASCO',4123.76),
('7010','20087','17306717',NULL,'GOLF BALL PICKER',1,'GOLF BALL PICKER',NULL,'WITTEK GOLF SUPPLY',2359.00),
('7010','20087','17306724',NULL,'SET OF THREE GREEN ROLLERS',1,'TS3TQ-00006037','T2001 3Q','TURF LINE / TRUE SURFACE',5295.00),
('7010','20087','17306725',NULL,'AERATOR WITH ROLLER ATTACH',1,'BA400-SSH','111-1164','BANNERMAN',2875.00),
('7010','20087','17306726',NULL,'FAIRWAY AERATOR',1,'FINE TUNE/3-PT HITCH','E67932-6-99','AERWAY',5200.00),
('7010','20087','17306727',NULL,'TOP DRESSER WITH HOPPER',1,'QP300 (11HP HONDA)','6235','TYCORP',6625.00),
('7010','20087','17306731','445784','GOLF CART',1,'TXT-GAS','1306179','E-Z-GO DIVISION OF TEXTRON',3563.00),
('7010','20087','17306732','445787','GOLF CART / 2000',1,'TXT-GAS','1306223','E-Z-GO DIVISION OF TEXTRON',3563.00),
('7010','20087','17306733','445805','GOLF CART',1,'TXT-GAS','1306342','E-Z-GO DIVISION OF TEXTRON',3563.00),
('7010','20087','17306734','445891','UTILITY CAR',1,'1921W','W004X2X046498','JOHN DEERE',5313.57),
('7010','20087','17306777','447721','GREENSMASTER / 2002',1,'3100 TRACTION UNIT','04356-0210001803','TORO',13571.25),
('7010','20087','17306832',NULL,'TRACTOR',1,'950-DIESEL','CH0950503025','JOHN DEERE',9449.00),
('7010','20087','17306834',NULL,'MOWER / GREENSMASTER',1,'GMR-04350','91539','TORO',12287.00),
('7010','20091','17306863',NULL,'ICE CUBER WITH STORAGE BIN',1,'CM1000 & BH800',NULL,'SCOTTMAN',3394.00),
('7010','20087','17306878','440510','TRUCKSTER / 1995',1,'898630','94004655','CUSHMAN',8398.00),
('7010','20087','17306879','440511','TRACTOR/LOADER 1994',1,'M5030SU','20168','KUBOTA',10947.00),
('7010','20087','17306894','441824','TRUCKSTER 1996',1,'HEAVY DUTY/3 WHEEL','96009140','CUSHMAN',8616.00),
('7010','20087','17306895','441927','TRACTOR 1996',1,'5200','LV5200E520401','JOHN DEERE',13841.00),
('7010','20087','17306923',NULL,'MOWER / GREENSMASTER',1,'GM3050 / 04351','14351-80329','TORO',10948.24),
('7010','20087','17306932',NULL,'TRACTOR / 1998',1,'M4700S','30376','KUBOTA',15795.00),
('7010','20087','17307006',NULL,'TURF MOWER',1,'3215B TURF SYSTEM I','TC3215B040256','JOHN DEERE',26816.35),
('7010','20087','17307008','450165','GATOR',1,'PROGATOR 2030 (DIESEL)','VG2030A030015','JOHN DEERE',11580.00),
('7010','20087','17307009','450166','GATOR',1,'4X2 - ELECTRIC','WOE4X2E011309','JOHN DEERE',5235.00),
('7010','20087','17307010','450167','GREENSMOWER/TEE',1,'2500 (DIESEL)','TC2500D015302','JOHN DEERE',9500.00),
('7010','20087','17307016',NULL,'ROTARY FLEX MOWER',1,'721 XR','18291104','LASTEC',15000.00),
('7010','20087','17307020',NULL,'ZERO TURN MOWER',1,'2260ES (61" DECK)','74221200102','JACOBSEN',5705.00),
('7010','20087','17307022',NULL,'GREENS MOWER CUTTING UNITS',1,'(SET OF 3)','250010230,433 &499','TORO',5368.61),
('7010','20087','17307023',NULL,'GREENS MOWER',1,'(SET OF 3 - CUTTING & GROOMING UNITS)','250010497,498 &231','TORO',9067.48),
('7010','20087','17307027',NULL,'TRAILER MOUNTED SPRAYER',1,'TM300','52942','JOHN DEERE',10650.00),
('7010','20087','17307033',NULL,'BUNKER & FIELD RACK',1,'1200A','TC1200A155248','JOHN DEERE',9372.51),
('7010','20087','17307039',NULL,'AERATOR',1,'AERCORE 800','TC800AC060262','JOHN DEERE',13478.23),
('7010','20087','17307160',NULL,'FOUNTAIN INCLUDING INSTALL',1,'M5452-3SC',NULL,NULL,9515.00),
('7010','20087','17307166',NULL,'FOUNTAIN AERATOR 2 HP',1,'8400/VFX',NULL,'KASCO',3373.00),
('7010','20087','17307173',NULL,'MOWER FAIRWAY',2,'7500E','TC75EHX020122',NULL,39686.25),
('7010','20087','17307189',NULL,'60 HP VFD DRIVE (PUMP PANEL)',1,'ATV61HD45N4',NULL,NULL,5461.75),
('7010','20087','17307210',NULL,'GRINDER BEDKNIFE IDEAL',1,'1100 AUTOMATIC 2007','18026',NULL,7000.00),
('7010','20087','17307211',NULL,'GRINDER REEL IDEAL',1,'SIMPLEX 2000 MODEL YEAR 2007','15483',NULL,7000.00),
('7010','20087','17307221',NULL,'BUNKER/FIELD RAKE',1,'1200A','ITC1200AVDT200524','JOHN DEERE',10621.12),
('7010','20087','17307222',NULL,'GATOR 4X2 TS JOHN DEERE',1,'4X2SJ','1M04X2SJCEM090942','JOHN DEERE',6472.13),
('7010','20087','17307223',NULL,'MOWER ROTARY FLEX LASTEC',1,'721XR','50640414',NULL,14050.00),
('7010','20087','17307230',NULL,'MOWER GREENSMASTER 3150-Q',1,'04358','314000636','TORO',20922.93),
('7010','20087','17307770',NULL,'BUNKER MATERIALS & LABOR',1,'BUNKER MATERIALS & LABOR',NULL,NULL,63905.82),
('7010','20087','17308025',NULL,'JOHN DEERE SELECT',1,'SPRAY HD200',NULL,'JOHN DEERE',11616.27),
('7010','20087','17308029',NULL,'CUSHMAN HAULER',1,'800X GAS',NULL,'TEXTRON',5208.65),
('7010','20087','17308030',NULL,'CUSHMAN HAULER',1,'800X GAS',NULL,'TEXTRON',5208.65),
('7010','20087','17308031',NULL,'GREENS KING IV PLUS MOWER',1,'GREENS KING IV PLUS MOWER',NULL,'JACOBSEN',24851.38),
('7010','20087','17308032',NULL,'TORO WORKMAN',1,'TORO WORKMAN',NULL,'TORO',17531.66),
('7010','20087','17308305',NULL,'FAIRWAY MOWER',1,'MOWER REPLACEMENT',NULL,'JOHN DEERE',25000.00),
('7010','20087','17308530',NULL,'MOWER, GREENSMASTER 3150-Q',1,'MOWER, GREENSMASTER 3150-Q',NULL,'TORO',24535.23),
('7010','25581','17308582',NULL,'GOLF STAND-UP GREENS ROLLER',1,'GOLF STAND-UP GREENS ROLLER',NULL,NULL,0.00),
('7010','20087','17308867',NULL,'TORO GREENS PRO 1260',0,'TORO GREENS PRO 1260',NULL,NULL,7666.66),
('7010','20087','17308868',NULL,'TORO GREENS PRO 1260',0,'TORO GREENS PRO 1260',NULL,NULL,7666.66),
('7010','20087','17308869',NULL,'BUFFALOT TURBINE KB23 BLOWER',0,'BUFFALOT TURBINE KB23 BLOWER',NULL,NULL,8116.67),
('7010','24999','17701133',NULL,'GOLF MAINTENANCE BUILDING',1,'GOLF MAINTENANCE BUILDING',NULL,NULL,8988.26),
('7010','24999','17701169',NULL,'GLK GOLF CART PATH',1,'GLK GOLF CART PATH',NULL,NULL,55486.19),
('7010','24999','17701248',NULL,'IRRIGATION PUMP HOUSE REPLACEMENT',3,'IRRIGATION PUMP HOUSE REPLACEMENT',NULL,NULL,28569.30),
('7010','24999','17800039',NULL,'WILLOW GLEN IRRIGATION SYSTEM',1,'90-BUPERS #N-90017 & 05-NEW TRANSFORMER',NULL,NULL,324034.38),
('7010','20083','89004691',NULL,'PARTS CLEANER',1,'BCK600CS','511614','BIO-CIRCLE',1660.00);

-- Auto-match: any asset whose serial_number matches an existing equipment
-- row's serial_number gets flipped to 'verified_present' and linked.
UPDATE fy26_assets fa
SET
  status = 'verified_present',
  equipment_id = e.id,
  verified_at = NOW()
FROM equipment e
WHERE fa.serial_number IS NOT NULL
  AND fa.serial_number = e.serial_number
  AND fa.status = 'unverified';

-- Everything remaining gets flagged as MIA (Missing In Action) by default
-- so the user can walk the yard and flip items to verified_present.
UPDATE fy26_assets
SET status = 'mia'
WHERE status = 'unverified';

-- trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_fy26_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fy26_assets_updated_at ON fy26_assets;
CREATE TRIGGER trg_fy26_assets_updated_at
  BEFORE UPDATE ON fy26_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_fy26_assets_updated_at();


-- ═══ 20260415_add_gm_tables.sql ═══

-- Revenue tracking for GM oversight
CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('greens_fees','cart_rentals','pro_shop','food_beverage','events','memberships','driving_range','other')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  rounds_count INTEGER, -- for greens_fees category
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capital projects for GM tracking
CREATE TABLE IF NOT EXISTS capital_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','in_progress','completed','cancelled')),
  budget_amount NUMERIC(12,2),
  spent_amount NUMERIC(12,2) DEFAULT 0,
  start_date DATE,
  target_completion DATE,
  actual_completion DATE,
  category TEXT CHECK (category IN ('renovation','equipment','infrastructure','building','irrigation','other')),
  approval_notes TEXT,
  approved_by TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view revenue" ON revenue_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leadership can manage revenue" ON revenue_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can view projects" ON capital_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leadership can manage projects" ON capital_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_category ON revenue_entries(category);
CREATE INDEX IF NOT EXISTS idx_capital_projects_status ON capital_projects(status);


-- ═══ 20260415_add_irrigation.sql ═══

-- Irrigation zones (physical areas with sprinkler heads)
CREATE TABLE IF NOT EXISTS irrigation_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone_number INTEGER UNIQUE,
  zone_type TEXT NOT NULL DEFAULT 'rotor' CHECK (zone_type IN ('rotor','spray','drip','bubbler','manual')),
  area TEXT CHECK (area IN ('green','tee','fairway','rough','practice','landscape','clubhouse')),
  hole_numbers INTEGER[],
  gpm NUMERIC(6,1),           -- gallons per minute flow rate
  head_count INTEGER,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Irrigation schedules (when zones run)
CREATE TABLE IF NOT EXISTS irrigation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES irrigation_zones(id) ON DELETE CASCADE,
  day_of_week INTEGER[] NOT NULL,   -- 0=Sun, 1=Mon... 6=Sat
  start_time TIME NOT NULL,
  run_minutes INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT true,
  season TEXT CHECK (season IN ('spring','summer','fall','winter','year_round')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Irrigation run log (actual runs — manual or automatic)
CREATE TABLE IF NOT EXISTS irrigation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES irrigation_zones(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  run_minutes INTEGER,
  gallons_used NUMERIC(10,1),
  run_type TEXT DEFAULT 'scheduled' CHECK (run_type IN ('scheduled','manual','syringe','weather_skip')),
  skipped BOOLEAN DEFAULT false,
  skip_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE irrigation_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view zones" ON irrigation_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage zones" ON irrigation_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view schedules" ON irrigation_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage schedules" ON irrigation_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view runs" ON irrigation_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage runs" ON irrigation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_irrigation_zones_area ON irrigation_zones(area);
CREATE INDEX IF NOT EXISTS idx_irrigation_schedules_zone ON irrigation_schedules(zone_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_runs_zone ON irrigation_runs(zone_id, started_at DESC);

-- Seed some example zones for Great Lakes
INSERT INTO irrigation_zones (name, zone_number, zone_type, area, hole_numbers, gpm, head_count) VALUES
('Green 1', 1, 'spray', 'green', '{1}', 15.0, 6),
('Green 2', 2, 'spray', 'green', '{2}', 15.0, 6),
('Green 3', 3, 'spray', 'green', '{3}', 15.0, 6),
('Green 4', 4, 'spray', 'green', '{4}', 12.0, 5),
('Green 5', 5, 'spray', 'green', '{5}', 15.0, 6),
('Green 6', 6, 'spray', 'green', '{6}', 15.0, 6),
('Green 7', 7, 'spray', 'green', '{7}', 18.0, 7),
('Green 8', 8, 'spray', 'green', '{8}', 12.0, 5),
('Green 9', 9, 'spray', 'green', '{9}', 15.0, 6),
('Green 10', 10, 'spray', 'green', '{10}', 15.0, 6),
('Green 11', 11, 'spray', 'green', '{11}', 15.0, 6),
('Green 12', 12, 'spray', 'green', '{12}', 12.0, 5),
('Green 13', 13, 'spray', 'green', '{13}', 15.0, 6),
('Green 14', 14, 'spray', 'green', '{14}', 18.0, 7),
('Green 15', 15, 'spray', 'green', '{15}', 15.0, 6),
('Green 16', 16, 'spray', 'green', '{16}', 12.0, 5),
('Green 17', 17, 'spray', 'green', '{17}', 15.0, 6),
('Green 18', 18, 'spray', 'green', '{18}', 15.0, 6),
('Fairway 1', 19, 'rotor', 'fairway', '{1}', 45.0, 12),
('Fairway 5', 20, 'rotor', 'fairway', '{5}', 50.0, 14),
('Fairway 9', 21, 'rotor', 'fairway', '{9}', 42.0, 11),
('Fairway 10', 22, 'rotor', 'fairway', '{10}', 48.0, 13),
('Fairway 14', 23, 'rotor', 'fairway', '{14}', 52.0, 15),
('Fairway 18', 24, 'rotor', 'fairway', '{18}', 46.0, 12),
('Practice Green', 25, 'spray', 'practice', NULL, 20.0, 8),
('Driving Range', 26, 'rotor', 'practice', NULL, 35.0, 10),
('Clubhouse Landscape', 27, 'drip', 'clubhouse', NULL, 8.0, 20);


-- ═══ 20260415_add_tournaments.sql ═══

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_end_date DATE,        -- for multi-day events
  event_type TEXT NOT NULL DEFAULT 'tournament' CHECK (event_type IN ('tournament','outing','league','charity','military','practice_round','other')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','confirmed','setup','in_progress','completed','cancelled')),
  expected_players INTEGER,
  format TEXT,                -- e.g. "Scramble", "Stroke Play", "Best Ball"
  shotgun_start BOOLEAN DEFAULT false,
  first_tee_time TIME,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('course_setup','equipment','signage','food_beverage','staffing','communication','post_event')),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','na')),
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view tournaments" ON tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage tournaments" ON tournaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view checklist" ON tournament_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage checklist" ON tournament_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(event_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_checklist_tournament ON tournament_checklist_items(tournament_id, sort_order);


-- ═══ 20260415_add_vendors.sql ═══

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('spray_contractor','equipment_dealer','parts_supplier','irrigation','landscaping','construction','fuel','seed_sod','general')),
  supplies TEXT, -- what they provide
  contract_end_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view vendors" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage vendors" ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);


-- ═══ 20260415_fix_photos_bucket.sql ═══

-- ============================================================
-- Fix: allow everyone on the team to read equipment photos,
--      regardless of who uploaded them.
--
-- Symptom: Eric uploaded equipment photos. When anyone else
-- (Tyson, Jim, etc.) runs the equipment report, the images
-- don't render. The default Supabase policy on storage.objects
-- restricts SELECT to the owner, so only Eric could see them.
--
-- Fix:
--   1. Mark the `photos` bucket public so the CDN URL works
--      even for unauthenticated clients (PDF generators, etc.).
--   2. Add an explicit "anyone can read photos" policy on
--      storage.objects so the authenticated download path used
--      by the server-side report also succeeds.
--
-- Safe to re-run. Uses ON CONFLICT / IF NOT EXISTS patterns.
-- ============================================================

-- 1. Ensure the bucket exists and is public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO UPDATE
  SET public = true;

-- 2. Drop any previous policy with the same name so we can re-create it.
DROP POLICY IF EXISTS "Anyone can view equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete equipment photos" ON storage.objects;

-- 3. Public read — anyone (including anon / server-side) can SELECT.
CREATE POLICY "Anyone can view equipment photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

-- 4. Authenticated write — any signed-in staffer can upload.
CREATE POLICY "Authenticated users can upload equipment photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

-- 5. Authenticated update/delete — any signed-in staffer can manage
--    photos. (The app already restricts the UI to managers; this
--    just makes sure RLS doesn't block the legitimate calls.)
CREATE POLICY "Authenticated users can update equipment photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete equipment photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

-- Verify
SELECT id, name, public FROM storage.buckets WHERE id = 'photos';
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%equipment photos%'
ORDER BY cmd;


-- ═══ 20260416_add_asset_photos_and_damage.sql ═══

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

CREATE INDEX IF NOT EXISTS idx_asset_damage_asset ON asset_damage_records(asset_id, created_at DESC);


-- ═══ 20260416_add_manufacturer_service_fields.sql ═══

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

