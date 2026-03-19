// GreenKeeper Pro Database Types
// Auto-generated types for Supabase integration
// Based on the complete schema from greenkeeper-pro-spec.md

export type UserRole = "super" | "asst_super" | "foreman" | "mechanic" | "crew" | "seasonal";

export type ZoneType =
  | "green"
  | "tee"
  | "fairway"
  | "rough"
  | "bunker"
  | "cart_path"
  | "practice"
  | "clubhouse"
  | "maintenance"
  | "other";

export type PlanLevel = "five_year" | "annual" | "seasonal" | "monthly" | "weekly";

export type PlanCategory =
  | "turf"
  | "irrigation"
  | "equipment"
  | "infrastructure"
  | "staffing"
  | "budget"
  | "environmental"
  | "safety"
  | "tournament"
  | "other";

export type PlanStatus = "planned" | "in_progress" | "completed" | "deferred" | "cancelled";

export type TaskCategory =
  | "mowing"
  | "irrigation"
  | "chemical"
  | "mechanical"
  | "landscaping"
  | "construction"
  | "bunker"
  | "greens"
  | "admin"
  | "safety"
  | "other";

export type TaskPriority = "critical" | "high" | "normal" | "low";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "verified"
  | "blocked"
  | "deferred"
  | "cancelled";

export type PhotoType =
  | "before"
  | "after"
  | "condition"
  | "problem"
  | "completed_work"
  | "equipment"
  | "safety"
  | "other";

export type ChannelType = "direct" | "group" | "announcement" | "crew" | "role";

export type MessageType = "text" | "photo" | "task_ref" | "alert" | "system";

export type EquipmentType =
  | "mower_reel"
  | "mower_rotary"
  | "mower_rough"
  | "aerator"
  | "sprayer"
  | "topdresser"
  | "utility_vehicle"
  | "tractor"
  | "blower"
  | "trimmer"
  | "chainsaw"
  | "roller"
  | "seeder"
  | "hand_tool"
  | "pump"
  | "other";

export type EquipmentStatus =
  | "operational"
  | "needs_service"
  | "in_repair"
  | "out_of_service"
  | "retired";

export type EquipmentLogType =
  | "service"
  | "repair"
  | "fuel"
  | "inspection"
  | "incident"
  | "hours_update";

export type ChemicalProductType =
  | "fertilizer"
  | "herbicide"
  | "insecticide"
  | "fungicide"
  | "growth_regulator"
  | "wetting_agent"
  | "colorant"
  | "seed"
  | "amendment"
  | "other";

export type SignalWord = "danger" | "warning" | "caution" | "none";

export type ApplicationMethod = "spray" | "granular" | "injection" | "drench" | "other";

export type IrrigationZoneType = "green" | "tee" | "fairway" | "rough" | "landscape" | "other";

export type IrrigationTriggerType = "scheduled" | "manual" | "rain_delay" | "override";

export type BudgetCategory =
  | "labor"
  | "chemicals"
  | "fertilizer"
  | "seed"
  | "equipment_purchase"
  | "equipment_repair"
  | "fuel"
  | "irrigation"
  | "supplies"
  | "capital_projects"
  | "training"
  | "other";

export type ExpenseStatus = "pending" | "approved" | "denied" | "paid";

export type ShiftType = "morning" | "afternoon" | "split" | "full" | "on_call" | "off";

export type TimeOffRequestType = "vacation" | "sick" | "personal" | "military" | "other";

export type TimeOffRequestStatus = "pending" | "approved" | "denied";

export type NotificationType =
  | "task_assigned"
  | "task_completed"
  | "message"
  | "alert"
  | "schedule_change"
  | "approval_needed"
  | "weather"
  | "equipment"
  | "reminder";

// JSON field types
export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface Certification {
  name: string;
  issued_date: string;
  expiry_date: string | null;
  license_number: string | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface MaterialNeeded {
  name: string;
  quantity: number;
  unit: string;
}

export interface WeatherConditions {
  min_temp?: number;
  max_temp?: number;
  max_wind?: number;
  no_rain?: boolean;
}

export interface RecurringRule {
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "seasonal";
  interval: number;
  days_of_week?: number[];
  end_date?: string;
}

export interface PartUsed {
  name: string;
  part_number?: string;
  quantity: number;
  cost?: number;
}

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

// Table row types
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  hire_date: string | null;
  certifications: Certification[];
  emergency_contact: EmergencyContact | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseZone {
  id: string;
  name: string;
  zone_type: ZoneType;
  hole_number: number | null;
  description: string | null;
  acreage: number | null;
  turf_type: string | null;
  geojson: GeoJsonPolygon | null;
  condition_score: number | null;
  last_condition_update: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanGoal {
  id: string;
  plan_level: PlanLevel;
  title: string;
  description: string | null;
  year: number | null;
  season: "spring" | "summer" | "fall" | "winter" | null;
  month: number | null;
  week_start: string | null;
  category: PlanCategory;
  status: PlanStatus;
  budget_allocated: number | null;
  budget_spent: number;
  target_metric: string | null;
  target_value: number | null;
  actual_value: number | null;
  parent_goal_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: string | null;
  assigned_crew: string | null;
  assigned_by: string | null;
  due_date: string;
  due_time: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  zone_id: string | null;
  hole_numbers: number[];
  equipment_needed: string[];
  materials_needed: MaterialNeeded[];
  checklist: ChecklistItem[];
  requires_photo_before: boolean;
  requires_photo_after: boolean;
  weather_dependent: boolean;
  weather_conditions: WeatherConditions | null;
  recurring_rule: RecurringRule | null;
  template_id: string | null;
  plan_goal_id: string | null;
  parent_task_id: string | null;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  category: TaskCategory;
  default_priority: TaskPriority;
  estimated_minutes: number | null;
  equipment_needed: string[];
  materials_needed: MaterialNeeded[];
  checklist: ChecklistItem[];
  requires_photo_before: boolean;
  requires_photo_after: boolean;
  weather_dependent: boolean;
  weather_conditions: WeatherConditions | null;
  instructions: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Photo {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  uploaded_by: string;
  task_id: string | null;
  zone_id: string | null;
  photo_type: PhotoType;
  caption: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  channel_type: ChannelType;
  description: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ChannelMember {
  channel_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
  muted: boolean;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  reference_id: string | null;
  attachments: string[];
  is_pinned: boolean;
  edited_at: string | null;
  created_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  equipment_type: EquipmentType;
  make: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  asset_tag: string | null;
  status: EquipmentStatus;
  current_hours: number | null;
  service_interval_hours: number | null;
  next_service_due_hours: number | null;
  next_service_due_date: string | null;
  location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentLog {
  id: string;
  equipment_id: string;
  log_type: EquipmentLogType;
  description: string;
  performed_by: string | null;
  hours_at_service: number | null;
  cost: number | null;
  parts_used: PartUsed[];
  vendor: string | null;
  downtime_hours: number | null;
  photos: string[];
  created_at: string;
}

export interface ChemicalProduct {
  id: string;
  product_name: string;
  manufacturer: string | null;
  epa_registration: string | null;
  active_ingredient: string | null;
  product_type: ChemicalProductType | null;
  unit_of_measure: string | null;
  current_inventory: number | null;
  reorder_threshold: number | null;
  cost_per_unit: number | null;
  sds_storage_path: string | null;
  rei_hours: number | null;
  signal_word: SignalWord | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ChemicalApplication {
  id: string;
  product_id: string;
  applied_by: string;
  applicator_license: string | null;
  application_date: string;
  application_time: string | null;
  zone_ids: string[];
  hole_numbers: number[] | null;
  area_treated_sqft: number | null;
  application_rate: string | null;
  total_amount_used: number | null;
  method: ApplicationMethod | null;
  weather_temp_f: number | null;
  weather_wind_mph: number | null;
  weather_wind_direction: string | null;
  weather_humidity: number | null;
  weather_conditions: string | null;
  target_pest: string | null;
  rei_expires_at: string | null;
  notes: string | null;
  task_id: string | null;
  created_at: string;
}

export interface IrrigationZone {
  id: string;
  zone_name: string;
  controller_id: string | null;
  station_number: number | null;
  zone_type: IrrigationZoneType | null;
  head_count: number | null;
  head_type: string | null;
  gpm: number | null;
  course_zone_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface IrrigationLog {
  id: string;
  irrigation_zone_id: string | null;
  run_date: string;
  run_time_minutes: number;
  gallons_estimated: number | null;
  trigger_type: IrrigationTriggerType | null;
  logged_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface WeatherLog {
  id: string;
  log_date: string;
  high_temp_f: number | null;
  low_temp_f: number | null;
  precipitation_inches: number | null;
  wind_max_mph: number | null;
  humidity_avg: number | null;
  conditions: string | null;
  gdd_base50: number | null;
  frost_observed: boolean;
  notes: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface BudgetItem {
  id: string;
  fiscal_year: number;
  category: BudgetCategory;
  description: string | null;
  budgeted_amount: number;
  month: number | null;
  plan_goal_id: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  budget_item_id: string | null;
  amount: number;
  description: string;
  vendor: string | null;
  expense_date: string;
  receipt_photo_id: string | null;
  approved_by: string | null;
  submitted_by: string | null;
  status: ExpenseStatus;
  notes: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  schedule_date: string;
  shift_start: string | null;
  shift_end: string | null;
  shift_type: ShiftType | null;
  crew_assignment: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TimeOffRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  request_type: TimeOffRequestType | null;
  reason: string | null;
  status: TimeOffRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  push_sent: boolean;
  created_at: string;
}

export type InviteRole = "asst_super" | "foreman" | "mechanic" | "crew" | "seasonal";

export interface Invite {
  id: string;
  token: string;
  email: string | null;
  role: InviteRole;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

// Supabase Database type definition
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, "id">>;
      };
      course_zones: {
        Row: CourseZone;
        Insert: Omit<CourseZone, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CourseZone, "id">>;
      };
      plan_goals: {
        Row: PlanGoal;
        Insert: Omit<PlanGoal, "id" | "created_at" | "updated_at" | "budget_spent"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          budget_spent?: number;
        };
        Update: Partial<Omit<PlanGoal, "id">>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Task, "id">>;
      };
      task_templates: {
        Row: TaskTemplate;
        Insert: Omit<TaskTemplate, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<TaskTemplate, "id">>;
      };
      photos: {
        Row: Photo;
        Insert: Omit<Photo, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Photo, "id">>;
      };
      channels: {
        Row: Channel;
        Insert: Omit<Channel, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Channel, "id">>;
      };
      channel_members: {
        Row: ChannelMember;
        Insert: Omit<ChannelMember, "joined_at" | "last_read_at"> & {
          joined_at?: string;
          last_read_at?: string;
        };
        Update: Partial<ChannelMember>;
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Message, "id">>;
      };
      equipment: {
        Row: Equipment;
        Insert: Omit<Equipment, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Equipment, "id">>;
      };
      equipment_logs: {
        Row: EquipmentLog;
        Insert: Omit<EquipmentLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<EquipmentLog, "id">>;
      };
      chemical_products: {
        Row: ChemicalProduct;
        Insert: Omit<ChemicalProduct, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ChemicalProduct, "id">>;
      };
      chemical_applications: {
        Row: ChemicalApplication;
        Insert: Omit<ChemicalApplication, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ChemicalApplication, "id">>;
      };
      irrigation_zones: {
        Row: IrrigationZone;
        Insert: Omit<IrrigationZone, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<IrrigationZone, "id">>;
      };
      irrigation_logs: {
        Row: IrrigationLog;
        Insert: Omit<IrrigationLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<IrrigationLog, "id">>;
      };
      weather_logs: {
        Row: WeatherLog;
        Insert: Omit<WeatherLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<WeatherLog, "id">>;
      };
      budget_items: {
        Row: BudgetItem;
        Insert: Omit<BudgetItem, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<BudgetItem, "id">>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Expense, "id">>;
      };
      schedules: {
        Row: Schedule;
        Insert: Omit<Schedule, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Schedule, "id">>;
      };
      time_off_requests: {
        Row: TimeOffRequest;
        Insert: Omit<TimeOffRequest, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<TimeOffRequest, "id">>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Notification, "id">>;
      };
      invites: {
        Row: Invite;
        Insert: Omit<Invite, "id" | "token" | "created_at" | "expires_at"> & {
          id?: string;
          token?: string;
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Omit<Invite, "id" | "token">>;
      };
      app_settings: {
        Row: AppSetting;
        Insert: Omit<AppSetting, "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<AppSetting>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      zone_type: ZoneType;
      plan_level: PlanLevel;
      plan_category: PlanCategory;
      plan_status: PlanStatus;
      task_category: TaskCategory;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      photo_type: PhotoType;
      channel_type: ChannelType;
      message_type: MessageType;
      equipment_type: EquipmentType;
      equipment_status: EquipmentStatus;
      equipment_log_type: EquipmentLogType;
      chemical_product_type: ChemicalProductType;
      signal_word: SignalWord;
      application_method: ApplicationMethod;
      irrigation_zone_type: IrrigationZoneType;
      irrigation_trigger_type: IrrigationTriggerType;
      budget_category: BudgetCategory;
      expense_status: ExpenseStatus;
      shift_type: ShiftType;
      time_off_request_type: TimeOffRequestType;
      time_off_request_status: TimeOffRequestStatus;
      notification_type: NotificationType;
    };
  };
}

// Helper types for common operations
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
