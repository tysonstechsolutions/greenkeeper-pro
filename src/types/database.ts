// VMGC Database Types
// Auto-generated types for Supabase integration
// Based on the complete schema from greenkeeper-pro-spec.md

export type UserRole = "super" | "asst_super" | "foreman" | "mechanic" | "crew" | "seasonal" | "pro" | "director" | "gm";

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
  | "other"
  | "pro_shop"
  | "events"
  | "customer_service";

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

export type EquipmentCondition = 'good' | 'fair' | 'needs_repair' | 'beyond_repair' | 'unknown';

export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid' | 'manual' | 'other';

export type InspectionType = 'pre' | 'post' | 'cleaning';

export type InspectionStatus = 'pass' | 'fail' | 'needs_attention';

export type FuelLevel = 'full' | 'three_quarter' | 'half' | 'quarter' | 'empty' | 'na';

export type OilLevel = 'full' | 'ok' | 'low' | 'critical' | 'na';

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

// User preferences structure
export interface NotificationPreferences {
  push_enabled: boolean;
  task_assigned: boolean;
  task_completed: boolean;
  schedule_changes: boolean;
  weather_alerts: boolean;
  equipment_issues: boolean;
  messages: boolean;
}

export interface CoursePreferences {
  default_view?: 'list' | 'calendar' | 'map';
  theme?: 'light' | 'dark' | 'system';
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  course: CoursePreferences;
}

// Activity log entry
export type ActivityActionType =
  | 'task_created'
  | 'task_completed'
  | 'task_assigned'
  | 'equipment_updated'
  | 'chemical_applied'
  | 'photo_uploaded'
  | 'schedule_changed';

export type ActivityEntityType =
  | 'task'
  | 'equipment'
  | 'chemical_application'
  | 'photo'
  | 'schedule';

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action_type: ActivityActionType;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
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
  user_preferences: UserPreferences | null;
  is_active: boolean;
  /** Preferred display locale for bilingual content. Defaults to 'en'. */
  language_preference?: "en" | "es" | null;
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
  /** Spanish translation of {@link Task.title} (optional). */
  title_es?: string | null;
  /** Spanish translation of {@link Task.description} (optional). */
  description_es?: string | null;
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
  /** Spanish translation of {@link Message.content} (optional). */
  content_es?: string | null;
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
  condition_status: EquipmentCondition;
  condition_notes: string | null;
  needs_parts_ordered: boolean;
  parts_needed: string | null;
  estimated_repair_cost: number | null;
  photos: string[];
  requires_pre_inspection: boolean;
  requires_post_inspection: boolean;
  last_inspection_date: string | null;
  last_inspected_by: string | null;
  fuel_type: FuelType;
  created_at: string;
  updated_at: string;
}

export type EquipmentPartStatus = 'needed' | 'ordered' | 'received';

export interface EquipmentPart {
  id: string;
  equipment_id: string;
  name: string;
  part_number: string | null;
  description: string | null;
  quantity: number;
  status: EquipmentPartStatus;
  estimated_cost: number | null;
  delay_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type DisposalStatus =
  | 'pending_request'
  | 'pending_approval'
  | 'approved'
  | 'rendering_useless'
  | 'pending_witness'
  | 'disposed'
  | 'routed_to_business'
  | 'completed';

export interface AssetDisposal {
  id: string;
  equipment_id: string;
  status: DisposalStatus;
  reason: string;
  requested_by: string | null;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rendered_useless_at: string | null;
  rendered_useless_notes: string | null;
  witness_1_name: string | null;
  witness_1_signed_at: string | null;
  witness_2_name: string | null;
  witness_2_signed_at: string | null;
  disposal_date: string | null;
  disposal_photo_url: string | null;
  routed_to_business_at: string | null;
  routed_to_business_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentServiceRecord {
  id: string;
  equipment_id: string;
  service_date: string;
  description: string;
  performed_by: string;
  hours_at_service: number | null;
  cost: number | null;
  parts_used: string | null;
  sent_to_manufacturer: boolean;
  pickup_date: string | null;
  return_date: string | null;
  created_at: string;
}

// ── Parking Lot / Cart Path Issues ──
export type ParkingLotIssueType = 'pothole' | 'low_area' | 'badly_cracked' | 'crack' | 'drainage' | 'erosion' | 'marking' | 'curbing' | 'other';
export type IssueSeverity = 'minor' | 'moderate' | 'severe' | 'critical';
export type IssueStatus = 'open' | 'in_progress' | 'scheduled' | 'completed';

export interface ParkingLotIssue {
  id: string;
  reported_by: string;
  title: string;
  description: string | null;
  location: string | null;
  pin_x: number | null;
  pin_y: number | null;
  issue_type: ParkingLotIssueType;
  severity: IssueSeverity;
  status: IssueStatus;
  photos: string[];
  repair_notes: string | null;
  estimated_cost: number | null;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Clubhouse Issues ──
export type ClubhouseCategory = 'damage' | 'cleaning' | 'order' | 'maintenance';
export type ClubhousePriority = 'low' | 'normal' | 'high' | 'urgent';
export type ClubhouseStatus = 'open' | 'in_progress' | 'ordered' | 'scheduled' | 'completed';

export interface ClubhouseIssue {
  id: string;
  reported_by: string;
  title: string;
  description: string | null;
  location: string | null;
  category: ClubhouseCategory;
  priority: ClubhousePriority;
  status: ClubhouseStatus;
  photos: string[];
  repair_notes: string | null;
  estimated_cost: number | null;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Order Items ──
export type OrderCategory = 'clubhouse' | 'cart_paths' | 'turf_course' | 'general';
export type OrderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type OrderItemStatus = 'needed' | 'ordered' | 'received';

export interface PinPosition {
  id: string;
  date: string;
  hole_number: number;
  paces_from_front: number;
  paces_from_left: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  notes: string | null;
  set_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  created_by: string;
  category: OrderCategory;
  item_name: string;
  description: string | null;
  quantity: string | null;
  estimated_cost: number | null;
  priority: OrderPriority;
  status: OrderItemStatus;
  vendor: string | null;
  notes: string | null;
  ordered_date: string | null;
  received_date: string | null;
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

export interface InspectionChecklistItem {
  item: string;
  status: 'ok' | 'issue' | 'na';
  notes?: string;
}

export interface EquipmentInspection {
  id: string;
  equipment_id: string;
  inspection_type: InspectionType;
  inspected_by: string;
  checkout_id: string | null;
  checklist_items: InspectionChecklistItem[];
  overall_status: InspectionStatus;
  notes: string | null;
  photos: string[];
  engine_hours: number | null;
  fuel_level: FuelLevel | null;
  oil_level: OilLevel | null;
  created_at: string;
  updated_at: string;
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
  end_time: string | null;
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

export type InviteRole = "asst_super" | "foreman" | "mechanic" | "crew" | "seasonal" | "director" | "gm";

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

// ── Drone Flights ──
export type DroneBand = 'ndvi' | 'ndre' | 'thermal' | 'rgb';
export type DroneSource = 'greensight' | 'pix4d' | 'dji' | 'manual';

export interface DroneBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface DroneFlight {
  id: string;
  flight_date: string;
  geotiff_path: string | null;
  preview_png_path: string | null;
  bbox: DroneBbox | null;
  band: DroneBand | null;
  source: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
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
        Insert: Omit<Message, "id" | "created_at" | "edited_at"> & {
          id?: string;
          created_at?: string;
          edited_at?: string | null;
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
      equipment_parts: {
        Row: EquipmentPart;
        Insert: Omit<EquipmentPart, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<EquipmentPart, "id">>;
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
      activity_log: {
        Row: ActivityLog;
        Insert: Omit<ActivityLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ActivityLog, "id">>;
      };
      drone_flights: {
        Row: DroneFlight;
        Insert: Omit<DroneFlight, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<DroneFlight, "id">>;
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

// ==========================================
// Course Observations & AI Improvement Plan
// ==========================================

export type ObservationCategory =
  | "turf"
  | "irrigation"
  | "equipment"
  | "staffing"
  | "processes"
  | "aesthetics"
  | "safety"
  | "infrastructure"
  | "drainage"
  | "pest_disease"
  | "member_experience"
  | "other";

export type ObservationSentiment = "positive" | "negative" | "neutral" | "idea";

export type PlanItemStatus = "not_started" | "in_progress" | "completed" | "deferred" | "cancelled";
export type PlanItemPriority = "critical" | "high" | "medium" | "low";
export type PlanPhase = "immediate" | "week_1_2" | "month_1" | "month_2_3" | "ongoing";

export interface CourseObservation {
  id: string;
  created_by: string;
  category: ObservationCategory;
  sentiment: ObservationSentiment;
  title: string;
  description: string;
  location: string | null;
  hole_number: number | null;
  zone_id: string | null;
  photo_ids: string[] | null;
  tags: string[] | null;
  is_addressed: boolean;
  linked_plan_item_id: string | null;
  /** Spanish translation of {@link CourseObservation.title} (optional). */
  title_es?: string | null;
  /** Spanish translation of {@link CourseObservation.description} (optional). */
  description_es?: string | null;
  /** Spanish translation of any free-form notes (optional). */
  notes_es?: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// Hole Observations (Pin-on-Map Reports)
// ==========================================

export type HoleIssueType =
  | "fungus_disease"
  | "dry_spot"
  | "wet_area"
  | "bare_spot"
  | "weed_pressure"
  | "pest_damage"
  | "grub_damage"
  | "mulch_pile"
  | "sticks_around_tree"
  | "sticks_on_ground"
  | "felled_tree"
  | "mechanical_damage"
  | "drainage"
  | "bunker_issue"
  | "tree_issue"
  | "irrigation_issue"
  | "turf_thin"
  | "algae"
  | "frost_damage"
  | "other";

export type HoleObservationStatus = "open" | "in_progress" | "resolved" | "monitoring";

export interface HoleObservation {
  id: string;
  hole_number: number;
  pin_x: number; // 0-1 relative X position on the hole image
  pin_y: number; // 0-1 relative Y position on the hole image
  issue_type: HoleIssueType;
  priority: TaskPriority; // reuse: critical | high | normal | low
  status: HoleObservationStatus;
  title: string;
  description: string | null;
  fix_instructions: string | null; // How to fix it — written by super or AI-generated
  photo_url: string | null;
  diagnosis_result: DiagnosisResult | null; // AI diagnosis with treatment plan
  reported_by: string;
  task_id: string | null; // linked task when created from observation
  resolved_at: string | null;
  resolved_by: string | null;
  /** Photos taken after the fix to prove resolution (URLs). */
  resolution_photos: string[];
  /** Notes describing what was done to fix the issue. */
  resolution_notes: string | null;
  /** Spanish translation of {@link HoleObservation.title} (optional). */
  title_es?: string | null;
  /** Spanish translation of {@link HoleObservation.description} (optional). */
  description_es?: string | null;
  /** Spanish translation of notes/fix instructions (optional). */
  notes_es?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  reporter?: Pick<Profile, "id" | "full_name" | "avatar_url" | "role"> | null;
  task?: Pick<Task, "id" | "title" | "status"> | null;
}

// ── Green Observation Types ──

export type GreenIssueType =
  | "fungus_disease"
  | "dry_spot"
  | "wet_area"
  | "bare_spot"
  | "weed_pressure"
  | "pest_damage"
  | "grub_damage"
  | "mechanical_damage"
  | "irrigation_issue"
  | "algae"
  | "frost_damage"
  | "ball_marks"
  | "scalping"
  | "compaction"
  | "thatch_buildup"
  | "aeration_needed"
  | "topdressing_needed"
  | "moss"
  | "shade_stress"
  | "traffic_wear"
  | "chemical_burn"
  | "poor_drainage"
  | "uneven_surface"
  | "other";

export type GreenObservationStatus = "open" | "in_progress" | "resolved" | "monitoring";

/** A single point in the freehand-drawn area path (0-1 relative coords) */
export interface AreaPoint {
  x: number;
  y: number;
}

// ── Diagnosis Result (from AI analysis) ──

export interface DiagnosisProduct {
  name: string;
  active_ingredient: string;
  type: string;
  application_rate: string;
  rate_per_acre: string;
  water_volume: string;
  method: string;
  timing: string;
  rei_hours: number;
  precautions: string[];
  in_inventory: boolean;
  alternative_products: string[];
}

export interface DiagnosisFollowUp {
  days_after: number;
  action: string;
  what_to_look_for: string;
  if_no_improvement: string;
}

export interface DiagnosisResult {
  diagnosis: {
    condition: string;
    scientific_name: string;
    confidence: "high" | "medium" | "low";
    confidence_reason: string;
    severity: number;
    severity_label: string;
    category: string;
    description: string;
    differential: string[];
  };
  treatment: {
    immediate_actions: string[];
    products: DiagnosisProduct[];
    application_window: {
      best_date: string;
      best_time: string;
      ideal_temp_range: string;
      max_wind: string;
      rain_buffer: string;
      avoid?: string;
    };
    follow_up: DiagnosisFollowUp[];
  };
  prevention: string[];
  additional_notes: string;
  lab_test_recommended: boolean;
  extension_contact: string;
}

export interface GreenObservation {
  id: string;
  hole_number: number;
  pin_x: number; // centroid X of the drawn area (0-1 relative)
  pin_y: number; // centroid Y of the drawn area (0-1 relative)
  area_path: AreaPoint[] | null; // freehand drawn boundary points (null for legacy pin-only)
  issue_type: GreenIssueType;
  priority: TaskPriority;
  status: GreenObservationStatus;
  title: string;
  description: string | null;
  fix_instructions: string | null;
  photo_url: string | null;
  diagnosis_result: DiagnosisResult | null; // AI diagnosis with treatment plan
  reported_by: string;
  task_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  /** Photos taken after the fix to prove resolution (URLs). */
  resolution_photos: string[];
  /** Notes describing what was done to fix the issue. */
  resolution_notes: string | null;
  /** Spanish translation of {@link GreenObservation.title} (optional). */
  title_es?: string | null;
  /** Spanish translation of {@link GreenObservation.description} (optional). */
  description_es?: string | null;
  /** Spanish translation of notes/fix instructions (optional). */
  notes_es?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  reporter?: Pick<Profile, "id" | "full_name" | "avatar_url" | "role"> | null;
  task?: Pick<Task, "id" | "title" | "status"> | null;
}

export interface ImprovementPlanItem {
  id: string;
  title: string;
  description: string;
  phase: PlanPhase;
  priority: PlanItemPriority;
  status: PlanItemStatus;
  category: ObservationCategory;
  effort_level: "low" | "medium" | "high";
  impact_level: "low" | "medium" | "high";
  estimated_cost: number | null;
  linked_observation_ids: string[] | null;
  assigned_to: string | null;
  target_date: string | null;
  completed_date: string | null;
  ai_reasoning: string | null;
  notes: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ImprovementPlan {
  id: string;
  title: string;
  description: string | null;
  version: number;
  is_current: boolean;
  generated_at: string;
  ai_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Inspection Readiness ──

export type InspectionCategory =
  | "course_conditions"
  | "safety"
  | "environmental"
  | "equipment"
  | "facilities"
  | "documentation";

export type InspectionItemStatus = "not_started" | "in_progress" | "compliant" | "non_compliant" | "na";

export interface InspectionChecklist {
  id: string;
  name: string;
  inspection_date: string | null;
  inspector_name: string | null;
  status: "draft" | "in_progress" | "completed";
  notes: string | null;
  created_by: string;
  score: number | null; // percentage 0-100
  created_at: string;
  updated_at: string;
}

export interface InspectionItem {
  id: string;
  checklist_id: string;
  category: InspectionCategory;
  title: string;
  description: string | null;
  status: InspectionItemStatus;
  notes: string | null;
  photo_ids: string[];
  sort_order: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

// ── Environmental Compliance ──

export type ComplianceLogCategory =
  | "stormwater"
  | "discharge"
  | "buffer_zone"
  | "spill"
  | "waste_disposal"
  | "fuel_storage"
  | "wildlife";

export type ComplianceSeverity = "routine" | "minor" | "major" | "critical";

export interface EnvironmentalLog {
  id: string;
  category: ComplianceLogCategory;
  title: string;
  description: string | null;
  severity: ComplianceSeverity;
  date_observed: string;
  location: string | null;
  hole_numbers: number[];
  corrective_action: string | null;
  corrective_deadline: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  photo_ids: string[];
  reported_by: string;
  npdes_reportable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BufferZoneRecord {
  id: string;
  zone_name: string;
  water_feature: string;
  buffer_distance_ft: number;
  last_inspected: string | null;
  inspected_by: string | null;
  status: "compliant" | "non_compliant" | "needs_review";
  vegetation_condition: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── AST (Aboveground Storage Tank) Monthly Inspection ──

export type AstInspectionItemStatus = "yes" | "no" | "na";

export interface AstInspectionItem {
  status: AstInspectionItemStatus | null;
  comment: string | null;
}

export type AstInspectionItems = Record<string, AstInspectionItem>;

export interface AstInspection {
  id: string;
  inspection_date: string;
  prior_inspection_date: string | null;
  retain_until_date: string;
  inspector_id: string | null;
  inspector_name: string;
  inspector_title: string | null;
  inspector_signature: string | null;
  tank_ids: string;
  facility_name: string | null;
  facility_id: string | null;
  items: AstInspectionItems;
  additional_comments: string | null;
  status: "draft" | "completed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Purchase Request (NAVMIDLANT NAF Purchase Request, FY2025) ──

export interface PurchaseRequestItem {
  /** Position in the line-item table; the form prints these 1-based. */
  item: number;
  site: string;
  cost_ctr: string;
  gl_acct: string;
  /** Item / product name. */
  description: string;
  /** Vendor part number, SKU, or item number. Optional. */
  part_number?: string;
  qty: number;
  unit: string;
  unit_price: number;
}

export interface VendorWith889 {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  category: string;
  supplies: string | null;
  notes: string | null;
  contract_end_date: string | null;
  address: string | null;
  address_line2: string | null;
  city_state_zip: string | null;
  poc: string | null;
  sap_vendor_no: string | null;
  gsa_naf_other_no: string | null;
  section_889_path: string | null;
  section_889_filename: string | null;
  section_889_expiration_date: string | null;
  section_889_uploaded_at: string | null;
}

export interface PurchaseRequest {
  id: string;

  // Header
  date_prepared: string;
  required_delivery_date: string | null;
  request_via: string;
  currency: string;

  // Vendor link + uploaded quote (added in 20260503 migration)
  vendor_id: string | null;
  quote_storage_path: string | null;
  quote_filename: string | null;
  quote_uploaded_at: string | null;

  // Auto-assigned monotonic sequence (added in 20260504 migration). The
  // PDF's "Internal Order" field is rendered as `FY{YY}-FM-{NNNN}` from
  // this number + date_prepared.
  pr_sequence_number: number | null;

  // Requestor
  requestor_name: string;
  requestor_email: string | null;
  requestor_phone: string | null;

  // Vendor 1
  vendor1_name: string | null;
  vendor1_address: string | null;
  vendor1_line2: string | null;
  vendor1_city_state_zip: string | null;
  vendor1_poc: string | null;
  vendor1_email: string | null;
  vendor1_phone: string | null;
  vendor1_sap_no: string | null;
  vendor1_gsa_naf_no: string | null;

  // Vendors 2 & 3 (just names)
  vendor2_name: string | null;
  vendor3_name: string | null;

  // Invoice address
  invoice_address: string | null;
  invoice_line2: string | null;
  invoice_city_state_zip: string | null;
  invoice_poc: string | null;
  invoice_phone: string | null;
  invoice_email: string | null;

  // Delivery address
  delivery_address: string | null;
  delivery_line2: string | null;
  delivery_city_state_zip: string | null;
  delivery_poc: string | null;
  delivery_phone: string | null;
  delivery_email: string | null;

  // Accounting
  company_code: string | null;
  requesting_facility_code: string | null;
  internal_order: string | null;
  project_no: string | null;
  program: string | null;

  // Line items
  items: PurchaseRequestItem[];

  // IGE
  ige_excess_pct: number;
  ige_amount: number;
  justification: string | null;
  ige_based_on: string | null;

  // Approvals
  financial_analyst: string | null;
  approving_authority: string | null;
  approving_signature_date: string | null;
  second_approval: string | null;
  second_signature_date: string | null;

  // Attached items
  attached_ssj: boolean;
  attached_bnj: boolean;
  attached_pws: boolean;
  attached_itpr: boolean;
  attached_other: string | null;
  attached_section_889: boolean;

  status: "draft" | "submitted";

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Water Usage Types ──

export type WaterSource = "municipal" | "well" | "reclaimed" | "pond" | "mixed";

export interface WaterMeterReading {
  id: string;
  meter_id: string;
  reading_date: string;
  reading_value: number; // gallons
  previous_reading: number | null;
  usage_gallons: number; // calculated: reading - previous
  source: WaterSource;
  notes: string | null;
  recorded_by: string;
  created_at: string;
}

export interface WaterUsageTarget {
  id: string;
  year: number;
  month: number;
  target_gallons: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
