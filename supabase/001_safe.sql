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
