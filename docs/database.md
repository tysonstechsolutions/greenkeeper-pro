# GreenKeeper Pro Database Documentation

## Table of Contents
1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [Tables Reference](#tables-reference)
4. [Relationships](#relationships)
5. [Row Level Security (RLS)](#row-level-security-rls)
6. [Helper Functions](#helper-functions)
7. [Triggers](#triggers)
8. [Migration History](#migration-history)
9. [TypeScript Types](#typescript-types)

---

## Overview

### Technology Stack
GreenKeeper Pro uses **Supabase** as its backend platform, which is built on **PostgreSQL**. Supabase provides:
- PostgreSQL database with full SQL capabilities
- Row Level Security (RLS) for data access control
- Built-in authentication via `auth.users`
- Real-time subscriptions
- RESTful API auto-generated from the schema

### Design Philosophy
The database schema is designed around these core principles:

1. **Role-Based Access Control**: Uses RLS policies to enforce permissions based on user roles (super, asst_super, foreman, mechanic, crew, seasonal)
2. **Comprehensive Auditing**: Tracks who created, updated, and completed tasks with timestamps
3. **Regulatory Compliance**: Chemical applications table captures all EPA-required information
4. **Multi-Level Planning**: Supports five-year, annual, seasonal, monthly, and weekly planning goals
5. **Flexibility**: Uses JSONB columns for extensible data like checklists, certifications, and metadata
6. **Normalization**: Related data is properly normalized with foreign keys and cascading rules

---

## Database Architecture

### Core Entities
- **User Management**: profiles, invites
- **Course Management**: course_zones, plan_goals
- **Task System**: tasks, task_templates
- **Equipment**: equipment, equipment_logs
- **Chemical Management**: chemical_products, chemical_applications
- **Irrigation**: irrigation_zones, irrigation_logs
- **Communication**: channels, channel_members, messages
- **Scheduling**: schedules, time_off_requests
- **Finance**: budget_items, expenses
- **Media**: photos
- **System**: notifications, activity_log, weather_logs

---

## Tables Reference

### profiles
**Purpose**: Extends Supabase auth.users with application-specific user data and roles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, FK → auth.users(id) | User's UUID from auth.users |
| email | TEXT | NOT NULL | User's email address |
| full_name | TEXT | NOT NULL | Full legal name |
| display_name | TEXT | NULL | Optional display name |
| role | TEXT | NOT NULL, CHECK | User role: super, asst_super, foreman, mechanic, crew, seasonal |
| phone | TEXT | NULL | Phone number |
| avatar_url | TEXT | NULL | URL to user's avatar image |
| hire_date | DATE | NULL | Date of employment start |
| certifications | JSONB | DEFAULT '[]' | Array of certification objects |
| emergency_contact | JSONB | NULL | Emergency contact information object |
| user_preferences | JSONB | DEFAULT {...} | User notification and app preferences |
| is_active | BOOLEAN | DEFAULT true | Whether user account is active |
| created_at | TIMESTAMPTZ | DEFAULT now() | Account creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes**:
- `idx_profiles_role` on (role)
- `idx_profiles_is_active` on (is_active)

**RLS Policies**:
- `profiles_select_active`: All authenticated users can read active profiles
- `profiles_update_own`: Users can update their own profile
- `profiles_update_manager`: Managers can update any profile
- `profiles_insert_manager`: Managers can insert profiles (for invites)

---

### course_zones
**Purpose**: Defines geographical areas of the golf course with their characteristics

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique zone identifier |
| name | TEXT | NOT NULL | Zone name (e.g., "Hole 1 Green") |
| zone_type | TEXT | NOT NULL, CHECK | Type: green, tee, fairway, rough, bunker, cart_path, practice, clubhouse, maintenance, other |
| hole_number | INTEGER | NULL | Associated hole number (1-18) |
| description | TEXT | NULL | Detailed description |
| acreage | DECIMAL(8,3) | NULL | Size in acres |
| turf_type | TEXT | NULL | Grass species/variety |
| geojson | JSONB | NULL | GeoJSON polygon for mapping |
| condition_score | INTEGER | CHECK 1-10 | Current condition rating |
| last_condition_update | TIMESTAMPTZ | NULL | When condition was last assessed |
| notes | TEXT | NULL | Additional notes |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes**:
- `idx_course_zones_type` on (zone_type)
- `idx_course_zones_hole` on (hole_number)

**RLS Policies**:
- `course_zones_select_all`: All authenticated users can read
- `course_zones_insert_manager`: Only managers can insert
- `course_zones_update_manager`: Only managers can update
- `course_zones_delete_manager`: Only managers can delete

---

### plan_goals
**Purpose**: Multi-level strategic planning goals (5-year down to weekly)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique goal identifier |
| plan_level | TEXT | NOT NULL, CHECK | Level: five_year, annual, seasonal, monthly, weekly |
| title | TEXT | NOT NULL | Goal title |
| description | TEXT | NULL | Detailed description |
| year | INTEGER | NULL | Calendar year |
| season | TEXT | CHECK | Season: spring, summer, fall, winter |
| month | INTEGER | CHECK 1-12 | Month number |
| week_start | DATE | NULL | Week starting date |
| category | TEXT | NOT NULL, CHECK | Category: turf, irrigation, equipment, infrastructure, staffing, budget, environmental, safety, tournament, other |
| status | TEXT | DEFAULT 'planned', CHECK | Status: planned, in_progress, completed, deferred, cancelled |
| budget_allocated | DECIMAL(12,2) | NULL | Budget amount allocated |
| budget_spent | DECIMAL(12,2) | DEFAULT 0 | Amount spent so far |
| target_metric | TEXT | NULL | Metric being measured |
| target_value | DECIMAL(10,2) | NULL | Target value for metric |
| actual_value | DECIMAL(10,2) | NULL | Actual achieved value |
| parent_goal_id | UUID | FK → plan_goals(id) | Parent goal (for hierarchies) |
| sort_order | INTEGER | DEFAULT 0 | Display order |
| created_by | UUID | FK → profiles(id) | User who created goal |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes**:
- `idx_plan_goals_level` on (plan_level)
- `idx_plan_goals_status` on (status)
- `idx_plan_goals_year` on (year)
- `idx_plan_goals_parent` on (parent_goal_id)

**RLS Policies**:
- `plan_goals_select_all`: All authenticated users can read
- `plan_goals_insert_manager`: Only managers can insert
- `plan_goals_update_manager`: Only managers can update
- `plan_goals_delete_manager`: Only managers can delete

---

### task_templates
**Purpose**: Reusable task templates with checklists and requirements

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique template identifier |
| name | TEXT | NOT NULL | Template name |
| description | TEXT | NULL | Detailed description |
| category | TEXT | NOT NULL, CHECK | Category: mowing, irrigation, chemical, mechanical, landscaping, construction, bunker, greens, admin, safety, other |
| default_priority | TEXT | DEFAULT 'normal', CHECK | Default priority: critical, high, normal, low |
| estimated_minutes | INTEGER | NULL | Estimated time to complete |
| equipment_needed | TEXT[] | DEFAULT '{}' | Array of equipment names |
| materials_needed | JSONB | DEFAULT '[]' | Array of material objects |
| checklist | JSONB | DEFAULT '[]' | Array of checklist items |
| requires_photo_before | BOOLEAN | DEFAULT false | Require before photo |
| requires_photo_after | BOOLEAN | DEFAULT false | Require after photo |
| weather_dependent | BOOLEAN | DEFAULT false | Weather-dependent task |
| weather_conditions | JSONB | NULL | Required weather conditions |
| instructions | TEXT | NULL | Step-by-step instructions |
| created_by | UUID | FK → profiles(id) | User who created template |
| is_active | BOOLEAN | DEFAULT true | Whether template is active |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes**:
- `idx_task_templates_category` on (category)
- `idx_task_templates_active` on (is_active)

**RLS Policies**:
- `task_templates_select_active`: All users can read active templates
- `task_templates_insert_manager`: Only managers can insert
- `task_templates_update_manager`: Only managers can update
- `task_templates_delete_manager`: Only managers can delete

---

### tasks
**Purpose**: Daily work assignments and tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique task identifier |
| title | TEXT | NOT NULL | Task title |
| description | TEXT | NULL | Detailed description |
| category | TEXT | NOT NULL, CHECK | Same categories as task_templates |
| priority | TEXT | DEFAULT 'normal', CHECK | Priority: critical, high, normal, low |
| status | TEXT | DEFAULT 'pending', CHECK | Status: pending, in_progress, completed, verified, blocked, deferred, cancelled |
| assigned_to | UUID | FK → profiles(id) | Individual assigned |
| assigned_crew | TEXT | NULL | Crew name assigned |
| assigned_by | UUID | FK → profiles(id) | Who assigned the task |
| due_date | DATE | NOT NULL | Due date |
| due_time | TIME | NULL | Optional specific time |
| estimated_minutes | INTEGER | NULL | Estimated duration |
| actual_minutes | INTEGER | NULL | Actual time taken |
| zone_id | UUID | FK → course_zones(id) | Associated course zone |
| hole_numbers | INTEGER[] | DEFAULT '{}' | Array of hole numbers |
| equipment_needed | TEXT[] | DEFAULT '{}' | Required equipment |
| materials_needed | JSONB | DEFAULT '[]' | Required materials |
| checklist | JSONB | DEFAULT '[]' | Task checklist items |
| requires_photo_before | BOOLEAN | DEFAULT false | Require before photo |
| requires_photo_after | BOOLEAN | DEFAULT false | Require after photo |
| weather_dependent | BOOLEAN | DEFAULT false | Weather-dependent task |
| weather_conditions | JSONB | NULL | Required weather conditions |
| recurring_rule | JSONB | NULL | Recurrence pattern |
| template_id | UUID | FK → task_templates(id) | Source template |
| plan_goal_id | UUID | FK → plan_goals(id) | Associated plan goal |
| parent_task_id | UUID | FK → tasks(id) | Parent task (for subtasks) |
| notes | TEXT | NULL | Additional notes |
| completed_at | TIMESTAMPTZ | NULL | Completion timestamp |
| completed_by | UUID | FK → profiles(id) | Who completed task |
| verified_at | TIMESTAMPTZ | NULL | Verification timestamp |
| verified_by | UUID | FK → profiles(id) | Who verified task |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes**:
- `idx_tasks_assigned_to` on (assigned_to)
- `idx_tasks_due_date` on (due_date)
- `idx_tasks_status` on (status)
- `idx_tasks_category` on (category)
- `idx_tasks_priority` on (priority)
- `idx_tasks_zone` on (zone_id)
- `idx_tasks_template` on (template_id)
- `idx_tasks_plan_goal` on (plan_goal_id)
- `idx_tasks_parent` on (parent_task_id)
- `idx_tasks_assigned_crew` on (assigned_crew)

**RLS Policies**:
- `tasks_select_own`: Users see tasks assigned to them, their crew, or if they're manager/foreman
- `tasks_insert_manager`: Managers and foremen can create tasks
- `tasks_update_manager`: Managers can update any task
- `tasks_update_foreman`: Foremen can update their crew's tasks
- `tasks_update_own_status`: Crew can update status of their own tasks
- `tasks_delete_manager`: Only managers can delete tasks

---

### photos
**Purpose**: Image storage metadata and associations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique photo identifier |
| storage_path | TEXT | NOT NULL | Path in Supabase Storage |
| thumbnail_path | TEXT | NULL | Path to thumbnail |
| uploaded_by | UUID | NOT NULL, FK → profiles(id) | User who uploaded photo |
| task_id | UUID | FK → tasks(id) | Associated task |
| zone_id | UUID | FK → course_zones(id) | Associated zone |
| photo_type | TEXT | NOT NULL, CHECK | Type: before, after, condition, problem, completed_work, equipment, safety, other |
| caption | TEXT | NULL | Photo caption |
| gps_lat | DECIMAL(10,7) | NULL | GPS latitude |
| gps_lng | DECIMAL(10,7) | NULL | GPS longitude |
| tags | TEXT[] | DEFAULT '{}' | Searchable tags |
| metadata | JSONB | NULL | Additional metadata |
| created_at | TIMESTAMPTZ | DEFAULT now() | Upload timestamp |

**Indexes**:
- `idx_photos_task` on (task_id)
- `idx_photos_zone` on (zone_id)
- `idx_photos_date` on (created_at)
- `idx_photos_uploaded_by` on (uploaded_by)
- `idx_photos_type` on (photo_type)

**RLS Policies**:
- `photos_select_all`: All users can read photos
- `photos_insert_authenticated`: Users can upload photos
- `photos_update_own`: Users can update their own photos
- `photos_delete_own`: Users can delete their own photos, managers can delete any

---

### channels
**Purpose**: Communication channels (messaging groups)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique channel identifier |
| name | TEXT | NOT NULL | Channel name |
| channel_type | TEXT | NOT NULL, CHECK | Type: direct, group, announcement, crew, role |
| description | TEXT | NULL | Channel description |
| created_by | UUID | FK → profiles(id) | User who created channel |
| is_active | BOOLEAN | DEFAULT true | Whether channel is active |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes**:
- `idx_channels_type` on (channel_type)
- `idx_channels_active` on (is_active)

**RLS Policies**:
- `channels_select_member`: Users see channels they're members of or all if manager
- `channels_insert_manager`: Only managers can create channels
- `channels_update_manager`: Only managers can update channels
- `channels_delete_manager`: Only managers can delete channels

---

### channel_members
**Purpose**: Channel membership and read status tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| channel_id | UUID | PK, FK → channels(id) | Channel reference |
| user_id | UUID | PK, FK → profiles(id) | User reference |
| joined_at | TIMESTAMPTZ | DEFAULT now() | When user joined |
| last_read_at | TIMESTAMPTZ | DEFAULT now() | Last read timestamp |
| muted | BOOLEAN | DEFAULT false | Whether user muted channel |

**Indexes**:
- `idx_channel_members_user` on (user_id)
- `idx_channel_members_channel` on (channel_id)

**RLS Policies**:
- `channel_members_select_own`: Users see their own memberships, managers see all
- `channel_members_insert_manager`: Only managers can add members
- `channel_members_update_own`: Users can update their own membership (mute, read status)
- `channel_members_delete_manager`: Only managers can remove members

---

### messages
**Purpose**: Messages within channels

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique message identifier |
| channel_id | UUID | NOT NULL, FK → channels(id) | Channel reference |
| sender_id | UUID | NOT NULL, FK → profiles(id) | User who sent message |
| content | TEXT | NOT NULL | Message content |
| message_type | TEXT | DEFAULT 'text', CHECK | Type: text, photo, task_ref, alert, system |
| reference_id | UUID | NULL | Referenced entity ID |
| attachments | JSONB | DEFAULT '[]' | Array of attachments |
| is_pinned | BOOLEAN | DEFAULT false | Whether message is pinned |
| edited_at | TIMESTAMPTZ | NULL | Edit timestamp |
| created_at | TIMESTAMPTZ | DEFAULT now() | Send timestamp |

**Indexes**:
- `idx_messages_channel` on (channel_id, created_at DESC)
- `idx_messages_sender` on (sender_id)
- `idx_messages_pinned` on (channel_id, is_pinned) WHERE is_pinned = true

**RLS Policies**:
- `messages_select_channel_member`: Users can read messages in their channels
- `messages_insert_channel_member`: Users can send messages in their channels
- `messages_update_own`: Users can edit their own messages
- `messages_delete_own_or_manager`: Users can delete their own messages, managers can delete any

---

### equipment
**Purpose**: Course equipment inventory and service tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique equipment identifier |
| name | TEXT | NOT NULL | Equipment name |
| equipment_type | TEXT | NOT NULL, CHECK | Type: mower_reel, mower_rotary, mower_rough, aerator, sprayer, topdresser, utility_vehicle, tractor, blower, trimmer, chainsaw, roller, seeder, hand_tool, pump, other |
| make | TEXT | NULL | Manufacturer |
| model | TEXT | NULL | Model number |
| year | INTEGER | NULL | Year of manufacture |
| serial_number | TEXT | NULL | Serial number |
| asset_tag | TEXT | NULL | Asset tracking tag |
| status | TEXT | DEFAULT 'operational', CHECK | Status: operational, needs_service, in_repair, out_of_service, retired |
| current_hours | DECIMAL(10,1) | NULL | Current hour meter reading |
| service_interval_hours | INTEGER | NULL | Hours between service |
| next_service_due_hours | DECIMAL(10,1) | NULL | Hour meter reading when service due |
| next_service_due_date | DATE | NULL | Calendar date when service due |
| location | TEXT | NULL | Current location |
| purchase_date | DATE | NULL | Purchase date |
| purchase_price | DECIMAL(10,2) | NULL | Purchase price |
| notes | TEXT | NULL | Additional notes |
| photo_url | TEXT | NULL | Equipment photo URL |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes**:
- `idx_equipment_type` on (equipment_type)
- `idx_equipment_status` on (status)
- `idx_equipment_service_due` on (next_service_due_date)

**RLS Policies**:
- `equipment_select_all`: All users can read equipment
- `equipment_insert_manager`: Only managers can insert equipment
- `equipment_update_manager_mechanic`: Managers and mechanics can update equipment
- `equipment_delete_manager`: Only managers can delete equipment

---

### equipment_logs
**Purpose**: Service, repair, and maintenance logs for equipment

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique log identifier |
| equipment_id | UUID | NOT NULL, FK → equipment(id) | Equipment reference |
| log_type | TEXT | NOT NULL, CHECK | Type: service, repair, fuel, inspection, incident, hours_update |
| description | TEXT | NOT NULL | Description of work |
| performed_by | UUID | FK → profiles(id) | User who performed work |
| hours_at_service | DECIMAL(10,1) | NULL | Hour meter reading |
| cost | DECIMAL(10,2) | NULL | Cost of service/repair |
| parts_used | JSONB | DEFAULT '[]' | Array of parts used |
| vendor | TEXT | NULL | Vendor/shop name |
| downtime_hours | DECIMAL(6,1) | NULL | Equipment downtime |
| photos | UUID[] | DEFAULT '{}' | Array of photo IDs |
| created_at | TIMESTAMPTZ | DEFAULT now() | Log timestamp |

**Indexes**:
- `idx_equipment_logs_equipment` on (equipment_id)
- `idx_equipment_logs_type` on (log_type)
- `idx_equipment_logs_date` on (created_at)
- `idx_equipment_logs_performed_by` on (performed_by)

**RLS Policies**:
- `equipment_logs_select_all`: All users can read logs
- `equipment_logs_insert_authenticated`: All authenticated users can insert logs
- `equipment_logs_update_manager`: Managers or log creator can update
- `equipment_logs_delete_manager`: Only managers can delete logs

---

### chemical_products
**Purpose**: Chemical product inventory and safety information

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique product identifier |
| product_name | TEXT | NOT NULL | Product name |
| manufacturer | TEXT | NULL | Manufacturer name |
| epa_registration | TEXT | NULL | EPA registration number |
| active_ingredient | TEXT | NULL | Active ingredient |
| product_type | TEXT | CHECK | Type: fertilizer, herbicide, insecticide, fungicide, growth_regulator, wetting_agent, colorant, seed, amendment, other |
| unit_of_measure | TEXT | NULL | Unit (gallons, pounds, etc.) |
| current_inventory | DECIMAL(10,2) | NULL | Current stock level |
| reorder_threshold | DECIMAL(10,2) | NULL | Reorder point |
| cost_per_unit | DECIMAL(10,2) | NULL | Cost per unit |
| sds_storage_path | TEXT | NULL | Path to SDS document |
| rei_hours | INTEGER | NULL | Re-entry interval in hours |
| signal_word | TEXT | CHECK | Signal word: danger, warning, caution, none |
| notes | TEXT | NULL | Additional notes |
| is_active | BOOLEAN | DEFAULT true | Whether product is active |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes**:
- `idx_chemical_products_type` on (product_type)
- `idx_chemical_products_active` on (is_active)
- `idx_chemical_products_inventory` on (current_inventory, reorder_threshold)

**RLS Policies**:
- `chemical_products_select_all`: All users can read products
- `chemical_products_insert_manager`: Only managers can insert products
- `chemical_products_update_manager`: Only managers can update products
- `chemical_products_delete_manager`: Only managers can delete products

---

### chemical_applications
**Purpose**: Regulatory-compliant chemical application records

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique application identifier |
| product_id | UUID | NOT NULL, FK → chemical_products(id) | Product applied |
| applied_by | UUID | NOT NULL, FK → profiles(id) | Applicator |
| applicator_license | TEXT | NULL | License number |
| application_date | DATE | NOT NULL | Application date |
| application_time | TIME | NULL | Application time |
| zone_ids | UUID[] | NOT NULL | Array of zone IDs treated |
| hole_numbers | INTEGER[] | NULL | Hole numbers treated |
| area_treated_sqft | INTEGER | NULL | Area in square feet |
| application_rate | TEXT | NULL | Rate of application |
| total_amount_used | DECIMAL(10,3) | NULL | Total amount used |
| method | TEXT | CHECK | Method: spray, granular, injection, drench, other |
| weather_temp_f | INTEGER | NULL | Temperature at application |
| weather_wind_mph | INTEGER | NULL | Wind speed |
| weather_wind_direction | TEXT | NULL | Wind direction |
| weather_humidity | INTEGER | NULL | Humidity percentage |
| weather_conditions | TEXT | NULL | Weather description |
| target_pest | TEXT | NULL | Target pest/disease |
| rei_expires_at | TIMESTAMPTZ | NULL | When re-entry interval expires |
| notes | TEXT | NULL | Additional notes |
| task_id | UUID | FK → tasks(id) | Associated task |
| created_at | TIMESTAMPTZ | DEFAULT now() | Record creation timestamp |

**Indexes**:
- `idx_chemical_applications_product` on (product_id)
- `idx_chemical_applications_date` on (application_date)
- `idx_chemical_applications_applied_by` on (applied_by)
- `idx_chemical_applications_rei` on (rei_expires_at) WHERE rei_expires_at IS NOT NULL

**RLS Policies**:
- `chemical_applications_select_all`: All users can read applications
- `chemical_applications_insert_authenticated`: All authenticated users can insert
- `chemical_applications_update_manager`: Managers or applicator can update
- `chemical_applications_delete_manager`: Only managers can delete

---

### irrigation_zones
**Purpose**: Irrigation system zone configuration

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique zone identifier |
| zone_name | TEXT | NOT NULL | Zone name |
| controller_id | TEXT | NULL | Controller identifier |
| station_number | INTEGER | NULL | Station number on controller |
| zone_type | TEXT | CHECK | Type: green, tee, fairway, rough, landscape, other |
| head_count | INTEGER | NULL | Number of sprinkler heads |
| head_type | TEXT | NULL | Type of sprinkler head |
| gpm | DECIMAL(6,1) | NULL | Gallons per minute |
| course_zone_id | UUID | FK → course_zones(id) | Associated course zone |
| notes | TEXT | NULL | Additional notes |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes**:
- `idx_irrigation_zones_type` on (zone_type)
- `idx_irrigation_zones_course_zone` on (course_zone_id)

**RLS Policies**:
- `irrigation_zones_select_all`: All users can read zones
- `irrigation_zones_insert_manager`: Only managers can insert zones
- `irrigation_zones_update_manager`: Only managers can update zones
- `irrigation_zones_delete_manager`: Only managers can delete zones

---

### irrigation_logs
**Purpose**: Irrigation run history and water usage tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique log identifier |
| irrigation_zone_id | UUID | FK → irrigation_zones(id) | Zone that ran |
| run_date | DATE | NOT NULL | Date of run |
| run_time_minutes | INTEGER | NOT NULL | Duration in minutes |
| gallons_estimated | DECIMAL(10,1) | NULL | Estimated gallons used |
| trigger_type | TEXT | CHECK | Trigger: scheduled, manual, rain_delay, override |
| logged_by | UUID | FK → profiles(id) | User who logged entry |
| notes | TEXT | NULL | Additional notes |
| created_at | TIMESTAMPTZ | DEFAULT now() | Log timestamp |

**Indexes**:
- `idx_irrigation_logs_zone` on (irrigation_zone_id)
- `idx_irrigation_logs_date` on (run_date)
- `idx_irrigation_logs_trigger` on (trigger_type)

**RLS Policies**:
- `irrigation_logs_select_all`: All users can read logs
- `irrigation_logs_insert_authenticated`: All authenticated users can insert logs
- `irrigation_logs_update_manager`: Only managers can update logs
- `irrigation_logs_delete_manager`: Only managers can delete logs

---

### weather_logs
**Purpose**: Daily weather observations and growing degree days

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique log identifier |
| log_date | DATE | NOT NULL, UNIQUE | Date of observation |
| high_temp_f | INTEGER | NULL | High temperature |
| low_temp_f | INTEGER | NULL | Low temperature |
| precipitation_inches | DECIMAL(5,2) | NULL | Rainfall amount |
| wind_max_mph | INTEGER | NULL | Maximum wind speed |
| humidity_avg | INTEGER | NULL | Average humidity |
| conditions | TEXT | NULL | Weather description |
| gdd_base50 | DECIMAL(5,1) | NULL | Growing degree days (base 50) |
| frost_observed | BOOLEAN | DEFAULT false | Whether frost observed |
| notes | TEXT | NULL | Additional notes |
| raw_data | JSONB | NULL | Raw weather API data |
| created_at | TIMESTAMPTZ | DEFAULT now() | Log timestamp |

**Indexes**:
- `idx_weather_logs_date` on (log_date)
- `idx_weather_logs_frost` on (frost_observed) WHERE frost_observed = true

**RLS Policies**:
- `weather_logs_select_all`: All users can read logs
- `weather_logs_insert_manager`: Only managers can insert logs
- `weather_logs_update_manager`: Only managers can update logs
- `weather_logs_delete_manager`: Only managers can delete logs

---

### budget_items
**Purpose**: Annual budget line items

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique item identifier |
| fiscal_year | INTEGER | NOT NULL | Fiscal year |
| category | TEXT | NOT NULL, CHECK | Category: labor, chemicals, fertilizer, seed, equipment_purchase, equipment_repair, fuel, irrigation, supplies, capital_projects, training, other |
| description | TEXT | NULL | Item description |
| budgeted_amount | DECIMAL(12,2) | NOT NULL | Budgeted amount |
| month | INTEGER | CHECK 1-12 | Month allocated |
| plan_goal_id | UUID | FK → plan_goals(id) | Associated plan goal |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes**:
- `idx_budget_items_year` on (fiscal_year)
- `idx_budget_items_category` on (category)
- `idx_budget_items_month` on (fiscal_year, month)

**RLS Policies**:
- `budget_items_select_manager`: Only managers can read budget items
- `budget_items_insert_manager`: Only managers can insert budget items
- `budget_items_update_manager`: Only managers can update budget items
- `budget_items_delete_manager`: Only managers can delete budget items

---

### expenses
**Purpose**: Expense tracking and approval workflow

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique expense identifier |
| budget_item_id | UUID | FK → budget_items(id) | Associated budget item |
| amount | DECIMAL(12,2) | NOT NULL | Expense amount |
| description | TEXT | NOT NULL | Expense description |
| vendor | TEXT | NULL | Vendor name |
| expense_date | DATE | NOT NULL | Date of expense |
| receipt_photo_id | UUID | FK → photos(id) | Receipt photo |
| approved_by | UUID | FK → profiles(id) | Who approved |
| submitted_by | UUID | FK → profiles(id) | Who submitted |
| status | TEXT | DEFAULT 'pending', CHECK | Status: pending, approved, denied, paid |
| notes | TEXT | NULL | Additional notes |
| created_at | TIMESTAMPTZ | DEFAULT now() | Submission timestamp |

**Indexes**:
- `idx_expenses_budget_item` on (budget_item_id)
- `idx_expenses_date` on (expense_date)
- `idx_expenses_status` on (status)
- `idx_expenses_submitted_by` on (submitted_by)

**RLS Policies**:
- `expenses_select_own_or_manager`: Users see their own expenses, managers see all
- `expenses_insert_authenticated`: All authenticated users can submit expenses
- `expenses_update_manager`: Only managers can update expenses (approval)
- `expenses_delete_manager`: Only managers can delete expenses

---

### schedules
**Purpose**: Staff scheduling and crew assignments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique schedule identifier |
| user_id | UUID | NOT NULL, FK → profiles(id) | User being scheduled |
| schedule_date | DATE | NOT NULL | Schedule date |
| shift_start | TIME | NULL | Shift start time |
| shift_end | TIME | NULL | Shift end time |
| shift_type | TEXT | CHECK | Type: morning, afternoon, split, full, on_call, off |
| crew_assignment | TEXT | NULL | Crew name assigned to |
| notes | TEXT | NULL | Schedule notes |
| created_by | UUID | FK → profiles(id) | Who created schedule |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Constraints**:
- UNIQUE (user_id, schedule_date) - one schedule entry per user per day

**Indexes**:
- `idx_schedules_user` on (user_id)
- `idx_schedules_date` on (schedule_date)
- `idx_schedules_crew` on (crew_assignment)

**RLS Policies**:
- `schedules_select_own_or_manager`: Users see their own schedule, managers and foremen see all
- `schedules_insert_manager`: Only managers can create schedules
- `schedules_update_manager`: Only managers can update schedules
- `schedules_delete_manager`: Only managers can delete schedules

---

### time_off_requests
**Purpose**: Time off request and approval workflow

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique request identifier |
| user_id | UUID | NOT NULL, FK → profiles(id) | User requesting time off |
| start_date | DATE | NOT NULL | Start date |
| end_date | DATE | NOT NULL | End date |
| request_type | TEXT | CHECK | Type: vacation, sick, personal, military, other |
| reason | TEXT | NULL | Reason for request |
| status | TEXT | DEFAULT 'pending', CHECK | Status: pending, approved, denied |
| reviewed_by | UUID | FK → profiles(id) | Who reviewed request |
| reviewed_at | TIMESTAMPTZ | NULL | Review timestamp |
| notes | TEXT | NULL | Review notes |
| created_at | TIMESTAMPTZ | DEFAULT now() | Request timestamp |

**Indexes**:
- `idx_time_off_user` on (user_id)
- `idx_time_off_dates` on (start_date, end_date)
- `idx_time_off_status` on (status)

**RLS Policies**:
- `time_off_requests_select_own_or_manager`: Users see their own requests, managers see all
- `time_off_requests_insert_own`: Users can create their own requests
- `time_off_requests_update_manager`: Only managers can update requests (approval)
- `time_off_requests_delete_manager`: Only managers can delete requests

---

### notifications
**Purpose**: In-app and push notifications

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique notification identifier |
| user_id | UUID | NOT NULL, FK → profiles(id) | User receiving notification |
| notification_type | TEXT | NOT NULL, CHECK | Type: task_assigned, task_completed, message, alert, schedule_change, approval_needed, weather, equipment, reminder |
| title | TEXT | NOT NULL | Notification title |
| body | TEXT | NULL | Notification body |
| reference_type | TEXT | NULL | Referenced entity type |
| reference_id | UUID | NULL | Referenced entity ID |
| is_read | BOOLEAN | DEFAULT false | Whether notification is read |
| push_sent | BOOLEAN | DEFAULT false | Whether push was sent |
| created_at | TIMESTAMPTZ | DEFAULT now() | Notification timestamp |

**Indexes**:
- `idx_notifications_user` on (user_id, is_read, created_at DESC)
- `idx_notifications_unread` on (user_id, created_at DESC) WHERE is_read = false

**RLS Policies**:
- `notifications_select_own`: Users can only read their own notifications
- `notifications_insert_system`: System can create notifications for any user
- `notifications_update_own`: Users can update their own notifications (mark as read)
- `notifications_delete_own`: Users can delete their own notifications

---

### invites
**Purpose**: User invitation system for onboarding

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique invite identifier |
| token | TEXT | NOT NULL, UNIQUE, DEFAULT random | Unique invite token |
| email | TEXT | NULL | Email address invited |
| role | TEXT | NOT NULL, CHECK | Role to assign: asst_super, foreman, mechanic, crew, seasonal |
| created_by | UUID | NOT NULL, FK → profiles(id) | Manager who created invite |
| used_by | UUID | FK → profiles(id) | User who used invite |
| used_at | TIMESTAMPTZ | NULL | When invite was used |
| expires_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() + 7 days | Expiration timestamp |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes**:
- `idx_invites_token` on (token)
- `idx_invites_created_by` on (created_by)
- `idx_invites_expires` on (expires_at)

**RLS Policies**:
- `invites_insert_manager`: Only managers can create invites
- `invites_select_manager`: Managers can view invites they created, supers see all
- `invites_select_by_token`: Anyone can read an invite by token (for registration)
- `invites_delete_manager`: Managers can delete unused invites they created
- `invites_update_use`: System can mark invite as used

---

### activity_log
**Purpose**: Audit trail of user actions for dashboard activity feed

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique log identifier |
| user_id | UUID | FK → profiles(id) | User who performed action |
| action_type | TEXT | NOT NULL | Type of action performed |
| entity_type | TEXT | NOT NULL | Type of entity affected |
| entity_id | UUID | NULL | ID of entity affected |
| description | TEXT | NOT NULL | Human-readable description |
| metadata | JSONB | DEFAULT '{}' | Additional metadata |
| created_at | TIMESTAMPTZ | DEFAULT now() | Action timestamp |

**Indexes**:
- `idx_activity_log_created_at` on (created_at DESC)
- `idx_activity_log_user_id` on (user_id)
- `idx_activity_log_entity` on (entity_type, entity_id)

**RLS Policies**:
- `activity_log_select_authenticated`: All authenticated users can read activity
- `activity_log_insert_authenticated`: All authenticated users can insert activity
- `activity_log_delete_manager`: Only managers can delete activity logs

---

## Relationships

### User and Authentication
```
auth.users (Supabase Auth)
    └─→ profiles (1:1) - extends auth user with app data
            ├─→ tasks (1:N) - tasks assigned to user
            ├─→ schedules (1:N) - user's work schedule
            ├─→ time_off_requests (1:N) - user's time off requests
            ├─→ notifications (1:N) - user's notifications
            ├─→ channel_members (1:N) - channels user belongs to
            ├─→ messages (1:N) - messages sent by user
            ├─→ photos (1:N) - photos uploaded by user
            ├─→ equipment_logs (1:N) - equipment work performed
            ├─→ chemical_applications (1:N) - chemical applications performed
            └─→ invites (1:N) - invites created by user
```

### Course Structure
```
course_zones (geographical areas)
    ├─→ tasks (1:N) - tasks for specific zones
    ├─→ photos (1:N) - photos of zones
    └─→ irrigation_zones (1:N) - irrigation configuration
            └─→ irrigation_logs (1:N) - irrigation run history
```

### Task Management
```
task_templates (reusable templates)
    └─→ tasks (1:N) - tasks created from template
            ├─→ photos (1:N) - before/after photos
            ├─→ tasks (1:N) - subtasks (parent_task_id)
            └─→ messages (1:N) - task references in messages

plan_goals (strategic planning)
    ├─→ tasks (1:N) - tasks tied to goals
    ├─→ budget_items (1:N) - budget for goals
    └─→ plan_goals (1:N) - child goals (hierarchical)
```

### Equipment Management
```
equipment (inventory)
    └─→ equipment_logs (1:N) - service/repair history
            └─→ photos (N:N via array) - photos of work
```

### Chemical Management
```
chemical_products (inventory)
    └─→ chemical_applications (1:N) - application records
            ├─→ course_zones (N:N via array) - zones treated
            └─→ tasks (1:1) - associated task
```

### Communication
```
channels (messaging groups)
    ├─→ channel_members (1:N) - members in channel
    │       └─→ profiles (N:1) - user details
    └─→ messages (1:N) - messages in channel
            └─→ profiles (N:1) - sender details
```

### Financial
```
budget_items (budget lines)
    └─→ expenses (1:N) - actual expenses
            └─→ photos (1:1) - receipt photo
```

---

## Row Level Security (RLS)

### Overview
RLS policies enforce data access control at the database level. All tables have RLS enabled, ensuring users can only access data appropriate for their role.

### Role Hierarchy
1. **super** - Course Superintendent (full access)
2. **asst_super** - Assistant Superintendent (manager permissions)
3. **foreman** - Crew Foreman (limited management, crew oversight)
4. **mechanic** - Equipment Mechanic (equipment management)
5. **crew** - Crew Member (basic access)
6. **seasonal** - Seasonal Worker (basic access)

### Policy Patterns

#### Public Read, Manager Write
Used for: course_zones, plan_goals, task_templates, weather_logs, irrigation_zones, chemical_products
- Anyone authenticated can read
- Only managers can insert/update/delete

#### Own or Assigned
Used for: tasks
- Users see tasks assigned to them or their crew
- Managers see all tasks
- Foremen see their crew's tasks
- Users can update status of their own tasks
- Managers can update any task

#### Own Data Only
Used for: notifications, profiles (partial)
- Users can only access their own data
- Users can update their own data
- Managers may have broader access

#### Manager Only
Used for: budget_items, schedules, time_off_requests (approval)
- Only managers can view and manage
- Regular users have limited access to their own data

#### Authenticated Access
Used for: photos, equipment_logs, irrigation_logs, chemical_applications
- All authenticated users can insert records
- All users can read records
- Own records can be updated
- Only managers can delete

---

## Helper Functions

### is_manager(user_id UUID) → BOOLEAN
Returns true if user is a 'super' or 'asst_super' role and is active.

**Usage**: Used in RLS policies to check management permissions.

```sql
SELECT is_manager(auth.uid());
```

### is_foreman(user_id UUID) → BOOLEAN
Returns true if user has 'foreman' role and is active.

**Usage**: Used in RLS policies for foreman-level permissions.

```sql
SELECT is_foreman(auth.uid());
```

### get_user_role(user_id UUID) → TEXT
Returns the user's role from the profiles table.

**Usage**: Used in RLS policies for role-based checks.

```sql
SELECT get_user_role(auth.uid());
```

### get_user_crew(user_id UUID) → TEXT
Returns the user's current crew assignment from today's schedule.

**Usage**: Used in task policies to filter by crew assignment.

```sql
SELECT get_user_crew(auth.uid());
```

---

## Triggers

### Auto-Create Profile on User Signup
**Trigger**: `on_auth_user_created`
**Function**: `handle_new_user()`
**Fires**: AFTER INSERT on auth.users

Automatically creates a profile record when a new user signs up via Supabase Auth. Extracts full_name and role from user metadata, defaulting role to 'crew'.

### Auto-Update Timestamps
**Trigger**: `{table}_updated_at`
**Function**: `update_updated_at()`
**Fires**: BEFORE UPDATE on various tables

Automatically updates the `updated_at` timestamp column whenever a row is modified.

**Applied to**:
- profiles
- course_zones
- plan_goals
- tasks
- equipment

---

## Migration History

### 001_initial_schema.sql
**Purpose**: Complete initial database schema

**Creates**:
- All core tables (profiles, tasks, equipment, chemicals, etc.)
- All indexes for optimal query performance
- All RLS policies for data security
- Helper functions (is_manager, is_foreman, get_user_role, get_user_crew)
- Triggers (auto-create profile, auto-update timestamps)
- Seed data (15 task templates, "All Staff" channel)

**Key Features**:
- Comprehensive task management system
- Equipment tracking and service logs
- Chemical application regulatory compliance
- Irrigation system management
- Budget and expense tracking
- Staff scheduling and time-off
- Multi-level planning (5-year to weekly)
- Photo documentation
- In-app messaging

### 002_invites_table.sql
**Purpose**: User invitation system for onboarding

**Creates**:
- `invites` table with token generation
- Indexes for efficient token lookup
- RLS policies for invite management
- 7-day default expiration

**Features**:
- Secure token-based invitations
- Email-optional (tokens can be shared directly)
- Role pre-assignment
- Expiration tracking
- Usage tracking (who used, when)

### 003_activity_log.sql
**Purpose**: Audit trail and activity feed

**Creates**:
- `activity_log` table
- Indexes optimized for recent activity queries
- RLS policies for visibility

**Features**:
- Tracks user actions (task_created, task_completed, etc.)
- Links to entity affected (task, equipment, etc.)
- JSONB metadata for flexible additional data
- Powers dashboard activity feed

### 004_user_preferences.sql
**Purpose**: User notification and app preferences

**Adds**:
- `user_preferences` JSONB column to profiles table
- Default notification preferences (all enabled)
- Structure for future course/app preferences

**Features**:
- Notification toggles (push, tasks, schedules, weather, equipment, messages)
- Extensible JSONB structure
- Default values ensure good UX on first login

---

## TypeScript Types

### Location
Type definitions are located in: `src/types/database.ts`

### Purpose
Provides type-safe access to database entities in the TypeScript/React frontend. Types are manually maintained to match the SQL schema.

### Structure

#### Enums
All CHECK constraint enums are exported as TypeScript union types:
```typescript
export type UserRole = "super" | "asst_super" | "foreman" | "mechanic" | "crew" | "seasonal";
export type TaskStatus = "pending" | "in_progress" | "completed" | "verified" | "blocked" | "deferred" | "cancelled";
// ... etc
```

#### JSONB Field Interfaces
Complex JSONB fields have TypeScript interfaces:
```typescript
export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  course: CoursePreferences;
}
```

#### Table Row Types
Each table has a corresponding interface:
```typescript
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  certifications: Certification[];
  user_preferences: UserPreferences | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // ... all columns
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assigned_to: string | null;
  checklist: ChecklistItem[];
  // ... all columns
}
```

#### Supabase Database Type
The main Database interface provides type-safe access for Supabase client:
```typescript
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at"> & { ... };
        Update: Partial<Omit<Profile, "id">>;
      };
      tasks: { ... };
      // ... all tables
    };
  };
}
```

### Usage in Application
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database, Task, Profile } from './types/database';

const supabase = createClient<Database>(url, key);

// Type-safe queries
const { data } = await supabase
  .from('tasks')
  .select('*')
  .eq('status', 'pending');  // TypeScript knows valid statuses

// Type-safe inserts
const newTask: Database['public']['Tables']['tasks']['Insert'] = {
  title: 'Mow greens',
  category: 'mowing',
  due_date: '2026-03-28',
  // ... TypeScript enforces required fields
};
```

### Maintenance
When the SQL schema is updated:
1. Update migration files in `supabase/migrations/`
2. Update corresponding types in `src/types/database.ts`
3. Ensure enums match CHECK constraints
4. Add/update interfaces for new JSONB structures
5. Update table Row/Insert/Update types

---

## Best Practices

### Query Optimization
1. Use provided indexes - most common queries are already optimized
2. Filter on indexed columns (role, status, due_date, etc.)
3. Use `.select()` to fetch only needed columns
4. Leverage foreign key indexes for joins

### Data Integrity
1. Use transactions for multi-table updates
2. Let database constraints enforce data rules
3. Use RESTRICT on critical foreign keys (chemical_products, chemical_applications)
4. Use CASCADE carefully (user deletion cascades appropriately)

### Security
1. Never bypass RLS by using service role in client code
2. Validate data in application layer as well as database
3. Use helper functions consistently (is_manager, etc.)
4. Audit sensitive operations via activity_log

### Performance
1. Paginate large result sets (tasks, messages, activity_log)
2. Use realtime subscriptions sparingly
3. Index custom queries if needed
4. Monitor slow query log in Supabase dashboard

### Development Workflow
1. Make schema changes via migration files
2. Test migrations locally first
3. Keep TypeScript types in sync with schema
4. Document complex queries and policies
5. Use Supabase Dashboard SQL Editor for testing queries

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [RLS Policy Examples](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgREST API Reference](https://postgrest.org/en/stable/api.html)

---

**Document Version**: 1.0
**Last Updated**: 2026-03-27
**Schema Version**: Migration 004
