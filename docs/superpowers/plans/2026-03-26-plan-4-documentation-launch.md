# Plan 4: Documentation & Launch Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete documentation overhaul (README, architecture, API, user guide), perform security audit, PWA verification, browser testing, and execute launch checklist.

**Architecture:** Documentation follows a structured approach with README for quick start, architecture docs for developers, API docs for integrations, and user guide for staff. Security audit covers RLS policies and API routes. Launch checklist ensures production readiness.

**Tech Stack:** Markdown documentation, Supabase CLI (for RLS audit), manual testing procedures

---

## File Structure

```
README.md                           # Complete project documentation
docs/
├── architecture.md                 # System architecture
├── api.md                          # API endpoint documentation
├── database.md                     # Database schema documentation
├── user-guide.md                   # End-user guide for staff
└── deployment.md                   # (already created in Plan 3)
SECURITY.md                         # Security audit results and policies
```

---

### Task 1: Create Comprehensive README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the complete README**

```markdown
# GreenKeeper Pro

A modern golf course management application for Veterans Memorial Golf Course. Built for superintendents and maintenance crews to manage daily operations, track equipment, log chemical applications, and coordinate team activities.

## Features

- **Task Management** - Create, assign, and track maintenance tasks with photo documentation
- **Chemical Tracking** - Log applications with REI tracking for regulatory compliance
- **Equipment Management** - Monitor equipment status, maintenance schedules, and service history
- **AI Diagnostics** - Upload photos for AI-powered turf disease identification
- **Daily Briefings** - Automated weather-aware daily plans for the crew
- **Real-time Updates** - Live task status and schedule changes across all users
- **Offline Support** - PWA with offline queue for field work without connectivity
- **Course Mapping** - Interactive map with zone-based condition tracking

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **AI**: Anthropic Claude for diagnostics and briefings
- **Weather**: WeatherAPI.com integration
- **PWA**: Serwist service worker for offline support
- **Monitoring**: Sentry error tracking, Vercel Analytics

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase account (free tier works)
- WeatherAPI.com account (free tier)
- Anthropic API key (for AI features)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-org/greenkeeper-pro.git
cd greenkeeper-pro
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```bash
# Supabase (from your project settings)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Weather API (from weatherapi.com)
NEXT_PUBLIC_WEATHER_API_KEY=your-weather-key

# Anthropic (from console.anthropic.com)
ANTHROPIC_API_KEY=your-anthropic-key

# Daily briefing security
DAILY_BRIEFING_SECRET=generate-a-random-string

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set Up Database

Run the migrations in your Supabase SQL Editor:

```bash
# Or use Supabase CLI
supabase link --project-ref your-project-ref
supabase db push
```

Migration files are in `supabase/migrations/`:
1. `001_initial_schema.sql` - Core tables and RLS
2. `002_invites_table.sql` - User invitation system
3. `003_activity_log.sql` - Activity tracking
4. `004_user_preferences.sql` - User settings

### 4. Create First User

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000/login`
3. Sign up with your email
4. In Supabase SQL Editor, update your role to superintendent:

```sql
UPDATE profiles SET role = 'super' WHERE email = 'your-email@example.com';
```

### 5. Start Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript check |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:e2e` | Run Playwright E2E tests |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   ├── dashboard/          # Main dashboard
│   ├── tasks/              # Task management
│   ├── chemicals/          # Chemical tracking
│   ├── equipment/          # Equipment management
│   ├── diagnostics/        # AI diagnostics
│   ├── settings/           # User settings
│   └── member/             # Member portal
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── features/           # Feature-specific components
│   └── layout/             # Layout components
├── lib/
│   ├── hooks/              # Custom React hooks
│   ├── supabase/           # Supabase client setup
│   ├── utils/              # Utility functions
│   └── validations/        # Zod validation schemas
└── types/                  # TypeScript type definitions
```

## User Roles

| Role | Permissions |
|------|-------------|
| `super` | Full access, manage users, all settings |
| `asst_super` | Most admin features, manage schedules |
| `foreman` | Manage crew tasks, view reports |
| `mechanic` | Equipment management, maintenance logs |
| `crew` | View/complete assigned tasks |
| `seasonal` | Limited task access |
| `pro` | Pro shop features (limited) |
| `member` | Member portal only |

## Documentation

- [Architecture](docs/architecture.md) - System design and data flow
- [API Reference](docs/api.md) - API endpoint documentation
- [Database Schema](docs/database.md) - Tables and relationships
- [User Guide](docs/user-guide.md) - Guide for staff users
- [Deployment](docs/deployment.md) - Production deployment guide

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and add tests
3. Run checks: `npm run lint && npm run typecheck && npm run test:run`
4. Submit a pull request

## License

Proprietary - Veterans Memorial Golf Course
```

- [ ] **Step 2: Verify README renders correctly**

Open in a markdown preview or check on GitHub

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: complete README with setup and usage instructions"
```

---

### Task 2: Create Architecture Documentation

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: Write architecture documentation**

```markdown
# GreenKeeper Pro Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser/PWA)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Next.js    │  │   React 19   │  │   Service Worker     │   │
│  │  App Router  │  │  Components  │  │  (Serwist/Offline)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Platform                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  PostgreSQL  │  │    Auth      │  │      Realtime        │   │
│  │  (Database)  │  │   (Users)    │  │  (Subscriptions)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │   Storage    │  │  Edge Func   │                             │
│  │   (Photos)   │  │  (Optional)  │                             │
│  └──────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  WeatherAPI  │  │   Anthropic  │  │       Sentry         │   │
│  │   (Weather)  │  │   (AI/LLM)   │  │    (Monitoring)      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### App Router Structure

The application uses Next.js App Router with the following organization:

- **Route Groups**: Pages organized by feature (tasks, chemicals, equipment)
- **Layouts**: Shared navigation and authentication wrapper
- **Loading States**: Skeleton components for progressive loading
- **Error Boundaries**: Graceful error handling per route segment

### Component Hierarchy

```
RootLayout
├── AuthProvider (session management)
├── ThemeProvider (dark/light mode)
└── NavigationLayout
    ├── Sidebar (desktop)
    ├── BottomNav (mobile)
    └── Page Content
        └── Feature Components
```

### State Management

- **Server State**: React hooks with Supabase client
- **Client State**: React useState/useReducer for local UI state
- **Real-time**: Supabase Realtime subscriptions via custom hooks
- **Offline**: IndexedDB queue for pending operations

## Data Flow

### Authentication Flow

```
1. User visits /login
2. Supabase Auth handles email/password
3. Session stored in cookies (SSR-compatible)
4. Profile fetched from profiles table
5. Role determines accessible routes/features
```

### Task Creation Flow

```
1. User fills task form (validated with Zod)
2. Task inserted via useTasks hook
3. Supabase RLS validates permissions
4. Realtime broadcasts to subscribed clients
5. Activity logged to activity_log table
6. Notification sent to assigned user
```

### Offline Sync Flow

```
1. User performs action offline
2. Action queued in IndexedDB
3. Service worker detects reconnection
4. Queue processed sequentially
5. Conflicts resolved (server wins)
6. UI updated with final state
```

## Database Architecture

### Core Tables

| Table | Purpose |
|-------|---------|
| profiles | User accounts and roles |
| tasks | Work assignments |
| task_templates | Reusable task definitions |
| course_zones | Geographic areas |
| equipment | Machines and tools |
| chemical_products | Inventory |
| chemical_applications | Application logs |

### Row Level Security

All tables use RLS policies based on user role:

- **Managers** (super, asst_super): Full CRUD access
- **Foreman**: Read all, write team tasks
- **Crew**: Read assigned, update own tasks
- **Members**: Read-only member portal data

See `supabase/migrations/001_initial_schema.sql` for complete policies.

## API Routes

### Next.js API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| /api/daily-briefing | POST | Generate AI briefing (cron) |
| /api/diagnostics | POST | AI turf analysis |
| /api/pdf | POST | Generate PDF reports |

### Supabase Direct Access

Most data operations use Supabase client directly from the browser, secured by RLS policies. This reduces API route complexity and leverages Supabase's built-in features.

## Real-time Architecture

### Subscriptions

```typescript
// Generic pattern used across the app
supabase
  .channel('table-name-realtime')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'table_name',
  }, handleChange)
  .subscribe()
```

### Subscribed Tables

- `tasks` - Task status updates
- `equipment` - Equipment status changes
- `messages` - Chat messages
- `notifications` - User notifications

## PWA Architecture

### Service Worker

- Built with Serwist (Workbox wrapper)
- Precaches static assets and app shell
- Runtime caching for API responses
- Background sync for offline actions

### Offline Capabilities

- Dashboard viewable offline (cached data)
- Tasks can be viewed and marked complete
- Photos queued for upload on reconnection
- Sync indicator shows pending operations

## Monitoring & Observability

### Error Tracking (Sentry)

- Client-side errors captured automatically
- Server-side errors from API routes
- Source maps uploaded for debugging
- Performance monitoring enabled

### Analytics (Vercel)

- Page view tracking
- Web Vitals monitoring
- Speed Insights for performance
- Geographic and device distribution

### Logging

- Structured JSON logs in production
- Console logging in development
- Error breadcrumbs sent to Sentry
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: add system architecture documentation"
```

---

### Task 3: Create API Documentation

**Files:**
- Create: `docs/api.md`

- [ ] **Step 1: Write API documentation**

```markdown
# GreenKeeper Pro API Reference

## Overview

GreenKeeper Pro uses a hybrid API approach:

1. **Supabase Direct Access** - Most CRUD operations use Supabase client from the browser, secured by Row Level Security policies
2. **Next.js API Routes** - Server-side operations requiring secrets or complex processing

## Authentication

All requests require authentication via Supabase session cookies. The session is automatically included when using the Supabase client.

## API Routes

### POST /api/daily-briefing

Generates the AI-powered daily briefing for the crew.

**Authentication**: Bearer token (DAILY_BRIEFING_SECRET)

**Request Headers**:
```
Authorization: Bearer <DAILY_BRIEFING_SECRET>
Content-Type: application/json
```

**Request Body**:
```json
{
  "date": "2024-03-26",
  "latitude": 42.3095,
  "longitude": -87.8475
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "briefing": {
    "date": "2024-03-26",
    "weather_summary": "Clear skies, high of 72°F...",
    "priority_tasks": [...],
    "recommendations": [...],
    "generated_at": "2024-03-26T05:00:00Z"
  }
}
```

**Error Response** (401):
```json
{
  "error": "Unauthorized"
}
```

**Usage**: Called by Vercel cron job at 5 AM daily.

---

### POST /api/diagnostics

Analyzes turf condition photos using AI.

**Authentication**: Supabase session cookie

**Request Body** (multipart/form-data):
```
image: File (JPEG/PNG, max 10MB)
zone_id: string (optional)
notes: string (optional)
```

**Response** (200 OK):
```json
{
  "success": true,
  "diagnosis": {
    "id": "uuid",
    "condition": "Dollar Spot",
    "confidence": 0.87,
    "severity": "moderate",
    "description": "Fungal disease causing small...",
    "treatment_recommendations": [
      "Apply fungicide within 48 hours",
      "Reduce irrigation frequency"
    ],
    "follow_up_date": "2024-03-29"
  }
}
```

**Error Response** (400):
```json
{
  "error": "No image provided"
}
```

---

### POST /api/pdf

Generates PDF reports.

**Authentication**: Supabase session cookie

**Request Body**:
```json
{
  "report_type": "daily" | "weekly" | "chemical_log" | "equipment",
  "date_range": {
    "start": "2024-03-01",
    "end": "2024-03-26"
  },
  "filters": {
    "category": "mowing",
    "zone_id": "uuid"
  }
}
```

**Response** (200 OK):
- Content-Type: application/pdf
- Content-Disposition: attachment; filename="report.pdf"

**Error Response** (400):
```json
{
  "error": "Invalid report type"
}
```

## Supabase Tables API

For direct database access, use the Supabase client. Examples:

### Fetch Tasks

```typescript
const { data, error } = await supabase
  .from('tasks')
  .select(`
    *,
    assigned_user:profiles!tasks_assigned_to_fkey(id, full_name),
    zone:course_zones!tasks_zone_id_fkey(id, name)
  `)
  .eq('due_date', '2024-03-26')
  .order('priority', { ascending: true });
```

### Create Task

```typescript
const { data, error } = await supabase
  .from('tasks')
  .insert({
    title: 'Morning Mow - Greens',
    category: 'mowing',
    priority: 'high',
    due_date: '2024-03-26',
    assigned_to: 'user-uuid',
    assigned_by: 'current-user-uuid',
  })
  .select()
  .single();
```

### Update Task Status

```typescript
const { error } = await supabase
  .from('tasks')
  .update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: 'user-uuid',
  })
  .eq('id', 'task-uuid');
```

### Log Chemical Application

```typescript
const { data, error } = await supabase
  .from('chemical_applications')
  .insert({
    product_id: 'product-uuid',
    applied_by: 'user-uuid',
    application_date: '2024-03-26',
    zone_ids: ['zone-uuid-1', 'zone-uuid-2'],
    application_rate: '2 oz/1000 sq ft',
    total_amount_used: 4.5,
    weather_temp_f: 72,
    rei_expires_at: '2024-03-27T06:00:00Z',
  })
  .select()
  .single();
```

## Rate Limits

- Supabase: Depends on your plan (free tier: 500 requests/hour)
- API Routes: No explicit limits (Vercel serverless limits apply)
- Weather API: 1,000,000 calls/month (free tier)
- Anthropic: Depends on your plan

## Error Handling

All API routes return consistent error format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional info
}
```

HTTP Status Codes:
- 200: Success
- 400: Bad Request (validation error)
- 401: Unauthorized
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 500: Internal Server Error
```

- [ ] **Step 2: Commit**

```bash
git add docs/api.md
git commit -m "docs: add API reference documentation"
```

---

### Task 4: Create Database Documentation

**Files:**
- Create: `docs/database.md`

- [ ] **Step 1: Write database documentation**

```markdown
# GreenKeeper Pro Database Schema

## Overview

The database runs on Supabase (PostgreSQL) with Row Level Security (RLS) policies for fine-grained access control.

## Entity Relationship Diagram

```
profiles ─────────────┬─────────────────────────────────────────────────────┐
    │                 │                                                     │
    │ assigned_to     │ assigned_by                                         │
    ▼                 ▼                                                     │
┌─────────┐    ┌─────────────┐                                              │
│  tasks  │───▶│ task_temps  │                                              │
└────┬────┘    └─────────────┘                                              │
     │                                                                      │
     │ zone_id                                                              │
     ▼                                                                      │
┌──────────────┐                                                            │
│ course_zones │◀──────────────────────────────────────────────┐            │
└──────────────┘                                                │            │
                                                                │            │
┌───────────┐    ┌────────────────────┐                        │            │
│ equipment │───▶│  equipment_logs    │                        │            │
└───────────┘    └────────────────────┘                        │            │
                                                                │            │
┌───────────────────┐    ┌────────────────────────┐            │            │
│ chemical_products │───▶│ chemical_applications  │────────────┘            │
└───────────────────┘    └────────────────────────┘                         │
                                   │                                         │
                                   │ applied_by                              │
                                   └─────────────────────────────────────────┘
```

## Tables

### profiles

User accounts linked to Supabase Auth.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (matches auth.users.id) |
| email | TEXT | User email |
| full_name | TEXT | Display name |
| role | TEXT | User role (super, crew, etc.) |
| phone | TEXT | Contact phone |
| avatar_url | TEXT | Profile photo URL |
| hire_date | DATE | Employment start date |
| certifications | JSONB | Array of certification objects |
| user_preferences | JSONB | Notification and app settings |
| is_active | BOOLEAN | Account active status |

### tasks

Work assignments for maintenance crew.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| title | TEXT | Task name |
| description | TEXT | Detailed description |
| category | TEXT | Task type (mowing, irrigation, etc.) |
| priority | TEXT | critical, high, normal, low |
| status | TEXT | pending, in_progress, completed, etc. |
| assigned_to | UUID | FK to profiles |
| assigned_by | UUID | FK to profiles |
| due_date | DATE | Target completion date |
| zone_id | UUID | FK to course_zones |
| checklist | JSONB | Array of checklist items |
| requires_photo_before | BOOLEAN | Require documentation |
| requires_photo_after | BOOLEAN | Require documentation |

### course_zones

Geographic areas of the golf course.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Zone name (e.g., "Green #7") |
| zone_type | TEXT | green, tee, fairway, rough, etc. |
| hole_number | INTEGER | Associated hole (1-18) |
| acreage | DECIMAL | Zone size |
| turf_type | TEXT | Grass variety |
| geojson | JSONB | Map polygon coordinates |
| condition_score | INTEGER | Current condition (1-10) |

### equipment

Machines and tools inventory.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Equipment name |
| equipment_type | TEXT | mower_reel, sprayer, etc. |
| make | TEXT | Manufacturer |
| model | TEXT | Model number |
| status | TEXT | operational, needs_service, etc. |
| current_hours | DECIMAL | Operating hours |
| next_service_due_hours | DECIMAL | Service threshold |

### chemical_products

Pesticide, fertilizer, and chemical inventory.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_name | TEXT | Product name |
| manufacturer | TEXT | Maker |
| epa_registration | TEXT | EPA reg number |
| product_type | TEXT | herbicide, fungicide, etc. |
| current_inventory | DECIMAL | Stock quantity |
| rei_hours | INTEGER | Re-entry interval hours |
| signal_word | TEXT | danger, warning, caution |

### chemical_applications

Application log for compliance.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | FK to chemical_products |
| applied_by | UUID | FK to profiles |
| application_date | DATE | When applied |
| zone_ids | UUID[] | Array of treated zones |
| application_rate | TEXT | Rate description |
| total_amount_used | DECIMAL | Quantity used |
| rei_expires_at | TIMESTAMPTZ | Re-entry allowed time |

### activity_log

User action tracking for dashboard.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to profiles |
| action_type | TEXT | task_created, task_completed, etc. |
| entity_type | TEXT | task, equipment, etc. |
| entity_id | UUID | Related record ID |
| description | TEXT | Human-readable description |
| metadata | JSONB | Additional context |

## Row Level Security Policies

### Policy Pattern

```sql
-- Example: Tasks visible to assigned user or managers
CREATE POLICY "tasks_select_own" ON tasks
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR assigned_by = auth.uid()
    OR is_manager(auth.uid())
  );
```

### Helper Functions

```sql
-- Check if user is manager (super or asst_super)
CREATE FUNCTION is_manager(user_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND role IN ('super', 'asst_super')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

## Migrations

Migrations are stored in `supabase/migrations/`:

1. **001_initial_schema.sql** - Core tables, indexes, RLS policies
2. **002_invites_table.sql** - User invitation system
3. **003_activity_log.sql** - Activity tracking table
4. **004_user_preferences.sql** - User settings column

### Running Migrations

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push

# Generate new migration
supabase migration new migration_name
```

## Indexes

Key indexes for query performance:

```sql
-- Tasks
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_status ON tasks(status);

-- Equipment
CREATE INDEX idx_equipment_status ON equipment(status);

-- Chemical Applications
CREATE INDEX idx_chemical_applications_date ON chemical_applications(application_date);
CREATE INDEX idx_chemical_applications_rei ON chemical_applications(rei_expires_at);
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/database.md
git commit -m "docs: add database schema documentation"
```

---

### Task 5: Create User Guide

**Files:**
- Create: `docs/user-guide.md`

- [ ] **Step 1: Write user guide**

```markdown
# GreenKeeper Pro User Guide

Welcome to GreenKeeper Pro! This guide covers daily operations for golf course maintenance staff.

## Getting Started

### Logging In

1. Open the app at your course's URL
2. Enter your email and password
3. Click "Sign In"

If you don't have an account, ask your superintendent for an invitation link.

### Dashboard Overview

The dashboard shows:

- **Weather** - Current conditions and alerts
- **Today's Tasks** - Your assigned work
- **Staff On Duty** - Who's working today
- **Alerts** - Weather warnings and equipment issues
- **Plan Progress** - Monthly goal tracking

## Daily Workflow

### Morning Routine

1. **Check Dashboard** - Review weather alerts and assigned tasks
2. **Review Daily Briefing** - AI-generated plan for the day
3. **Check Equipment** - Verify assigned equipment is operational
4. **Start Tasks** - Begin with highest priority items

### Working on Tasks

**Viewing Your Tasks**

1. Tap "Tasks" in the navigation
2. Tasks are sorted by priority (Critical → High → Normal → Low)
3. Tap a task to see full details

**Starting a Task**

1. Open the task
2. If photos are required, take "Before" photos
3. Tap "Start" to mark as in progress
4. Follow the checklist items

**Completing a Task**

1. Complete all checklist items
2. Take "After" photos if required
3. Tap "Complete"
4. Add any notes about issues encountered

### Taking Photos

**For Tasks**

1. Open the task
2. Tap the camera icon
3. Take the photo (automatically tagged with GPS)
4. Add a caption if helpful

**For Diagnostics**

1. Tap "Diagnose" from Quick Actions
2. Take a photo of the issue
3. Select the affected zone
4. Add notes about what you observed
5. Submit for AI analysis

## Chemical Applications

### Logging an Application

1. Navigate to Chemicals > Log Application
2. Select the product from inventory
3. Enter application details:
   - Date and time
   - Zones treated
   - Application rate
   - Weather conditions
4. Submit the log

**Important**: All chemical applications are logged for regulatory compliance. Be accurate with rates and conditions.

### Checking REI Status

The dashboard shows active REI (Restricted Entry Interval) warnings. These zones are off-limits until the time expires.

## Equipment

### Checking Status

1. Navigate to Equipment
2. See all equipment with current status
3. Equipment needing service shows a warning badge

### Logging Issues

1. Open the equipment item
2. Tap "Report Issue"
3. Describe the problem
4. Take photos if helpful
5. Submit - the mechanic will be notified

### Pre-Operation Checks

Before using any equipment:

1. Open the equipment in the app
2. Complete the pre-op checklist
3. Log current hours
4. Report any issues before use

## Schedule & Time Off

### Viewing Your Schedule

1. Navigate to Schedule
2. See your shifts for the current week
3. Swipe to see future weeks

### Requesting Time Off

1. Go to Schedule > Request Time Off
2. Select start and end dates
3. Choose reason type
4. Add notes if needed
5. Submit for approval

## Messages

### Team Communication

1. Navigate to Messages
2. Select a channel or start a direct message
3. Type your message
4. Send photos or task references

### Channels

- **All Staff** - Announcements from management
- **Crew** - Daily coordination
- **Mechanics** - Equipment discussions

## Offline Mode

GreenKeeper Pro works offline! When you lose connection:

- You can still view your tasks
- Changes are saved locally
- A "Pending sync" indicator appears
- Changes upload automatically when back online

**Tip**: Download the app to your phone's home screen for the best offline experience.

## Troubleshooting

### App Won't Load

1. Check your internet connection
2. Clear browser cache
3. Try logging out and back in
4. Contact your superintendent

### Tasks Not Showing

1. Pull down to refresh
2. Check your filter settings
3. Ensure you're viewing today's date
4. Contact your superintendent if tasks are missing

### Photos Won't Upload

1. Check your connection
2. Photos queue for upload automatically
3. Check the "Pending uploads" indicator
4. Large photos may take time on slow connections

## Getting Help

- **Technical Issues**: Contact your superintendent
- **App Questions**: Check this guide or ask a coworker
- **Emergency**: Follow your course's emergency procedures

---

*GreenKeeper Pro - Making course management simple.*
```

- [ ] **Step 2: Commit**

```bash
git add docs/user-guide.md
git commit -m "docs: add user guide for staff"
```

---

### Task 6: Create Security Documentation

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Write security documentation**

```markdown
# Security Policy

## Overview

GreenKeeper Pro implements security best practices for protecting golf course operational data, staff information, and regulatory compliance records.

## Authentication

- **Provider**: Supabase Auth (email/password)
- **Session Management**: HTTP-only cookies with secure flag
- **Token Expiration**: 1 hour access tokens, 7 day refresh tokens
- **Password Requirements**: Minimum 8 characters

## Authorization

### Row Level Security (RLS)

All database tables use PostgreSQL RLS policies:

- Policies enforce role-based access at the database level
- Even direct database access respects permissions
- No data leakage between users

### Role Hierarchy

```
super (Superintendent)
  └── asst_super (Assistant Superintendent)
       └── foreman
            └── mechanic
            └── crew
                 └── seasonal
```

### API Route Protection

- All API routes verify Supabase session
- Server-side routes use service role for elevated operations
- DAILY_BRIEFING_SECRET protects cron endpoints

## Data Protection

### Sensitive Data

| Data Type | Protection |
|-----------|------------|
| Passwords | Hashed by Supabase Auth |
| API Keys | Server-side only (not in client bundle) |
| Photos | Stored in Supabase Storage with auth |
| Chemical Records | Retained for regulatory compliance |

### Environment Variables

**Server-side only** (never exposed to client):
- ANTHROPIC_API_KEY
- DAILY_BRIEFING_SECRET
- SUPABASE_SERVICE_ROLE_KEY

**Client-side safe** (public):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_WEATHER_API_KEY

## Security Headers

The application sets these headers via `vercel.json`:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## Audit Logging

The `activity_log` table records:

- Task creation and completion
- Equipment status changes
- Chemical applications (compliance requirement)
- User authentication events

## Reporting Vulnerabilities

If you discover a security vulnerability:

1. **Do not** create a public GitHub issue
2. Email security concerns to: [security contact]
3. Include detailed reproduction steps
4. Allow 48 hours for initial response

## Compliance

### Chemical Application Records

- All applications logged with timestamp
- REI tracking for worker safety
- Records retained per state regulations
- Export available for inspections

### Data Retention

- Active records: Retained indefinitely
- Deleted users: Profile anonymized, activity retained
- Chemical logs: 3-year minimum retention
- Photos: 1-year minimum retention

## Security Checklist for Deployment

- [ ] All environment variables set in Vercel
- [ ] Supabase RLS enabled on all tables
- [ ] No service role key in client code
- [ ] HTTPS enforced (Vercel default)
- [ ] Sentry configured (no PII in breadcrumbs)
- [ ] API routes validate authentication
- [ ] Rate limiting configured (Vercel/Supabase)
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: add security policy documentation"
```

---

### Task 7: PWA and Browser Testing

**Files:**
- None (testing only)

- [ ] **Step 1: Test PWA installation on desktop**

1. Open Chrome and navigate to the app
2. Click the install icon in the address bar
3. Verify app installs and opens correctly
4. Verify offline page loads when disconnected

Expected: App installs and functions as standalone

- [ ] **Step 2: Test PWA installation on mobile (iOS)**

1. Open Safari on iPhone
2. Navigate to the app
3. Tap Share > Add to Home Screen
4. Open from home screen
5. Verify app displays correctly with safe areas

Expected: App runs full-screen with proper safe area insets

- [ ] **Step 3: Test PWA installation on mobile (Android)**

1. Open Chrome on Android
2. Navigate to the app
3. Tap menu > Install app
4. Open from home screen

Expected: App installs and runs as standalone

- [ ] **Step 4: Test offline mode**

1. Load the dashboard fully
2. Enable airplane mode
3. Navigate to tasks
4. Verify cached content displays
5. Try to complete a task
6. Re-enable network
7. Verify queued action syncs

Expected: Offline page or cached content shows, actions queue properly

- [ ] **Step 5: Cross-browser testing**

Test basic functionality in:
- [ ] Chrome (desktop)
- [ ] Safari (desktop)
- [ ] Firefox (desktop)
- [ ] Edge (desktop)
- [ ] Safari (iOS)
- [ ] Chrome (Android)

Expected: Core functionality works in all browsers

- [ ] **Step 6: Document any issues found**

Create GitHub issues for any bugs discovered during testing.

---

### Task 8: Security Audit

**Files:**
- None (audit only)

- [ ] **Step 1: Verify RLS policies are enabled**

Run in Supabase SQL Editor:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

Expected: All tables show `rowsecurity = true`

- [ ] **Step 2: Test RLS policy for cross-user access**

1. Log in as a crew member
2. Try to access tasks assigned to another user
3. Verify access is denied

Expected: Only own tasks visible

- [ ] **Step 3: Verify API keys are not in client bundle**

1. Run `npm run build`
2. Search build output for API keys:

```bash
grep -r "ANTHROPIC" .next/static/ || echo "Not found - good!"
```

Expected: No matches found

- [ ] **Step 4: Check for exposed secrets in git history**

```bash
git log -p | grep -i "api_key\|secret\|password" | head -20
```

Expected: No actual secrets in output

- [ ] **Step 5: Verify HTTPS redirect (production)**

After deployment, verify https:// is enforced

Expected: HTTP requests redirect to HTTPS

---

### Task 9: Final Launch Preparation

**Files:**
- None (verification)

- [ ] **Step 1: Run full test suite**

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Expected: All commands pass

- [ ] **Step 2: Verify Supabase production setup**

- [ ] Database migrations applied
- [ ] RLS enabled on all tables
- [ ] Storage buckets configured
- [ ] First admin user created with 'super' role

- [ ] **Step 3: Verify Vercel production setup**

- [ ] Environment variables set
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Cron job configured for daily briefing

- [ ] **Step 4: Verify Sentry production setup**

- [ ] DSN configured in production
- [ ] Test error captured
- [ ] Source maps uploading

- [ ] **Step 5: Create launch commit**

```bash
git add -A
git commit -m "release: GreenKeeper Pro v1.0.0

Production-ready release including:
- Complete documentation suite
- Security audit passed
- PWA verified on iOS/Android
- Cross-browser compatibility confirmed
- All tests passing

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 10: Production Deployment

**Files:**
- None (deployment)

- [ ] **Step 1: Push to main branch**

```bash
git push origin main
```

Expected: GitHub Actions CI runs

- [ ] **Step 2: Monitor CI pipeline**

1. Go to GitHub Actions
2. Watch the workflow run
3. Verify all checks pass

Expected: All jobs green

- [ ] **Step 3: Verify Vercel deployment**

1. Go to Vercel dashboard
2. Verify deployment completed
3. Check deployment logs for errors

Expected: Deployment successful

- [ ] **Step 4: Smoke test production**

1. Navigate to production URL
2. Log in with admin account
3. Verify dashboard loads with weather
4. Create a test task
5. Verify real-time updates work

Expected: All features functional

- [ ] **Step 5: Trigger test error for Sentry**

In browser console on production:

```javascript
throw new Error('Production test error - please ignore');
```

Verify error appears in Sentry dashboard.

Expected: Error captured in Sentry

- [ ] **Step 6: Post-launch monitoring**

Monitor for first 24 hours:
- [ ] Watch Sentry for new errors
- [ ] Check Vercel Analytics for issues
- [ ] Verify daily briefing cron runs (next morning)
- [ ] Confirm real-time updates across multiple users

---

## Summary

After completing Plan 4, you will have:

1. **Complete Documentation**
   - README with setup and usage
   - Architecture documentation
   - API reference
   - Database schema docs
   - User guide for staff

2. **Security Audit**
   - RLS policies verified
   - No exposed secrets
   - Security policy documented

3. **Testing Verification**
   - PWA tested on iOS/Android
   - Cross-browser compatibility
   - Offline mode functional

4. **Production Deployment**
   - All CI checks passing
   - Deployed to Vercel
   - Monitoring active

**GreenKeeper Pro is now production-ready!**
