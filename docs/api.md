# GreenKeeper Pro API Documentation

## Overview

GreenKeeper Pro uses a **hybrid API approach** combining Next.js API routes for server-side operations and Supabase direct access for real-time data operations. This architecture provides:

- **Performance**: Direct Supabase queries eliminate middleware overhead
- **Real-time**: Built-in subscriptions for live updates
- **Security**: Row Level Security (RLS) enforces permissions at the database level
- **Simplicity**: Fewer API endpoints to maintain

### When to Use Each Approach

**Use Next.js API Routes for:**
- Server-side AI processing (Anthropic Claude)
- External API calls requiring secrets (WeatherAPI)
- Complex business logic requiring orchestration
- PDF generation and report processing
- Cron jobs and scheduled tasks

**Use Supabase Direct Access for:**
- CRUD operations on database tables
- Real-time subscriptions
- File uploads to storage
- User authentication flows

---

## Authentication

### Supabase Authentication

GreenKeeper Pro uses Supabase Auth with email/password authentication. Sessions are stored in HTTP-only cookies for SSR compatibility.

#### Login
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})
```

#### Get Current User
```typescript
const { data: { user }, error } = await supabase.auth.getUser()
```

#### Logout
```typescript
await supabase.auth.signOut()
```

### API Route Authentication

API routes that require authentication use one of two methods:

#### 1. Bearer Token Authentication (for cron/webhooks)
```bash
Authorization: Bearer <DAILY_BRIEFING_SECRET>
```

#### 2. Session Cookie Authentication (for user requests)
Uses the same Supabase session from the browser. The API route validates the session:

```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user }, error } = await supabase.auth.getUser()

if (error || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

## API Routes

### POST /api/daily-briefing

Generates and posts an AI-powered daily briefing to the "All Staff" channel. Includes weather forecast, task priorities, and course conditions.

**Authentication:** Bearer token

**Headers:**
```
Authorization: Bearer <DAILY_BRIEFING_SECRET>
```

**Query Parameters:**
- `preview` (optional): If `true`, returns briefing content without posting
- `date` (optional): Generate briefing for specific date (format: `YYYY-MM-DD`)

**Request Example:**
```bash
# Generate and post today's briefing
curl -X POST https://your-app.com/api/daily-briefing \
  -H "Authorization: Bearer your-secret-here"

# Preview briefing without posting
curl -X POST "https://your-app.com/api/daily-briefing?preview=true" \
  -H "Authorization: Bearer your-secret-here"

# Generate for specific date
curl -X POST "https://your-app.com/api/daily-briefing?date=2026-03-28" \
  -H "Authorization: Bearer your-secret-here"
```

**Success Response (200):**
```json
{
  "success": true,
  "date": "2026-03-27",
  "message": "Daily briefing posted successfully"
}
```

**Preview Response (200):**
```json
{
  "success": true,
  "preview": true,
  "date": "2026-03-27",
  "content": "# Daily Briefing - Thursday, March 27\n\n## Weather\n..."
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing bearer token
- `400 Bad Request`: Invalid date format
- `500 Internal Server Error`: Failed to generate or post briefing

**Rate Limits:** No rate limit (intended for scheduled cron job)

**Typical Use Cases:**
- Vercel Cron Job at 6:00 AM daily
- Manual trigger from settings page
- Preview during briefing configuration

---

### GET /api/daily-briefing

Returns current briefing settings and a preview of today's briefing.

**Authentication:** Bearer token

**Headers:**
```
Authorization: Bearer <DAILY_BRIEFING_SECRET>
```

**Request Example:**
```bash
curl -X GET https://your-app.com/api/daily-briefing \
  -H "Authorization: Bearer your-secret-here"
```

**Success Response (200):**
```json
{
  "settings": {
    "enabled": true,
    "time": "06:00",
    "include_weather": true,
    "include_tasks": true
  },
  "preview": "# Daily Briefing - Thursday, March 27\n\n...",
  "date": "2026-03-27"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing bearer token
- `500 Internal Server Error`: Failed to fetch settings

---

### POST /api/diagnostics

AI-powered turf diagnostics using Claude vision. Analyzes photos of turf issues and provides diagnosis with treatment recommendations.

**Authentication:** Session cookie (authenticated user)

**Request Body:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "description": "Brown patches on fairway #3",
  "category": "turf_disease",
  "zoneId": "uuid-of-zone",
  "conversationHistory": [
    {
      "role": "user",
      "content": "What caused this?"
    },
    {
      "role": "assistant",
      "content": "This appears to be dollar spot..."
    }
  ],
  "followUpQuestion": "What fungicide should I use?",
  "originalDiagnosis": { ... }
}
```

**Request Fields:**
- `image` (required): Base64-encoded image data
- `description` (optional): User's description of the issue
- `category` (optional): One of: `turf_disease`, `turf_insect`, `turf_weed`, `turf_nutrient`, `turf_abiotic`, `turf_mechanical`, `tree`, `equipment`, `infrastructure`, `other`, or `auto`
- `zoneId` (optional): UUID of the course zone for context
- `conversationHistory` (optional): Previous conversation messages for follow-up questions
- `followUpQuestion` (optional): Follow-up question about the diagnosis
- `originalDiagnosis` (optional): Original diagnosis object for context

**Request Example:**
```bash
curl -X POST https://your-app.com/api/diagnostics \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "description": "Brown patches appearing on green #7",
    "category": "turf_disease",
    "zoneId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "diagnosis": {
      "condition": "Dollar Spot",
      "scientific_name": "Clarireedia spp.",
      "confidence": "high",
      "confidence_reason": "Classic silver-dollar sized spots visible, hourglass lesions on leaf blades",
      "severity": 3,
      "severity_label": "Moderate",
      "category": "turf_disease",
      "description": "Fungal disease affecting creeping bentgrass under stress conditions...",
      "differential": [
        "Brown patch - but spots are smaller and more defined",
        "Summer patch - but no frog-eye pattern visible"
      ]
    },
    "treatment": {
      "immediate_actions": [
        "Lower mowing height to 0.125 inches to remove infected tissue",
        "Increase air circulation by pruning overhanging vegetation",
        "Reduce irrigation frequency, water deeply in early morning only"
      ],
      "products": [
        {
          "name": "Banner Maxx",
          "active_ingredient": "Propiconazole",
          "type": "fungicide",
          "application_rate": "1.0 fl oz per 1,000 sq ft",
          "rate_per_acre": "43.5 fl oz per acre",
          "water_volume": "2-4 gallons per 1,000 sq ft",
          "method": "spray",
          "timing": "Apply in early morning when dew is present",
          "rei_hours": 12,
          "precautions": [
            "Wear protective gloves and eye protection",
            "Do not apply when temperature exceeds 85°F"
          ],
          "in_inventory": true,
          "alternative_products": [
            "Clearscape (fludioxonil + mefentrifluconazole)",
            "Medallion (fludioxonil)"
          ]
        }
      ],
      "application_window": {
        "best_date": "March 28, 2026 (tomorrow morning)",
        "best_time": "6:00 AM - 9:00 AM before temperature rises",
        "ideal_temp_range": "60-75°F",
        "max_wind": "< 8 mph",
        "rain_buffer": "No rain for 24 hours after application",
        "avoid": "Do not apply if rain is forecast within 6 hours"
      },
      "follow_up": [
        {
          "days_after": 7,
          "action": "Inspect treated areas for new spot development",
          "what_to_look_for": "Reduction in spot size, no new infections",
          "if_no_improvement": "Apply second application with different mode of action (Group 7 or 11)"
        },
        {
          "days_after": 14,
          "action": "Evaluate need for second application",
          "what_to_look_for": "Complete suppression of disease activity",
          "if_no_improvement": "Send samples to University of Illinois Plant Clinic for resistance testing"
        }
      ]
    },
    "prevention": [
      "Maintain adequate nitrogen levels (3-5 lbs N per 1,000 sq ft annually)",
      "Ensure proper drainage to avoid prolonged moisture",
      "Reduce thatch layer to < 0.5 inches",
      "Apply preventive fungicide programs during high-risk periods (May-Sept)",
      "Promote air movement with morning mowing and strategic fan placement"
    ],
    "additional_notes": "Dollar spot is highly active in current weather conditions (60-80°F with high humidity). Monitor adjacent greens and fairways for early symptoms. Consider rotating fungicide chemistries to prevent resistance.",
    "lab_test_recommended": true,
    "extension_contact": "University of Illinois Plant Clinic - 217-333-0519 - http://web.extension.illinois.edu/plantclinic/"
  },
  "isFollowUp": false
}
```

**Follow-Up Response (200):**
```json
{
  "success": true,
  "data": {
    "follow_up_response": "Based on your current inventory, I recommend Banner Maxx (propiconazole) at 1.0 fl oz per 1,000 sq ft. You have 2 gallons in stock which is sufficient for this application. Propiconazole is a DMI fungicide (FRAC Group 3) with excellent curative activity against dollar spot. Apply in 2-4 gallons of water per 1,000 sq ft for best coverage. The REI is 12 hours, so plan your application timing accordingly."
  },
  "isFollowUp": true
}
```

**Error Responses:**
- `400 Bad Request`: Missing required `image` field
- `401 Unauthorized`: User not authenticated
- `500 Internal Server Error`: AI processing failed or API error

**Rate Limits:**
- Practical limit: ~10 requests per minute per user
- API timeout: 30 seconds per request
- Retry: Automatic retry once on 5xx errors

**Notes:**
- Images should be JPEG format, max 5MB
- AI uses current weather data and chemical inventory for context
- Responses are structured JSON for easy display in UI
- Confidence levels: `high`, `medium`, `low`
- Severity scale: 1-5 (Cosmetic, Minor, Moderate, Severe, Critical)

---

### POST /api/reports/pdf

Server-side PDF report generation endpoint. Validates permissions and returns report metadata for client-side PDF generation.

**Authentication:** Session cookie (authenticated user)

**Request Body:**
```json
{
  "reportType": "daily",
  "params": {
    "date": "2026-03-27"
  }
}
```

**Report Types:**
- `daily` - Daily operations report
- `weekly` - Weekly summary report
- `monthly` - Monthly condition report
- `staff` - Staff performance report (superintendents only)
- `chemical` - Chemical compliance report (superintendents only)
- `equipment` - Equipment fleet report

**Request Example:**
```bash
curl -X POST https://your-app.com/api/reports/pdf \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{
    "reportType": "daily",
    "params": {
      "date": "2026-03-27"
    }
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "reportType": "daily",
  "metadata": {
    "title": "Daily Operations Report",
    "date": "2026-03-27",
    "sections": [
      "weather",
      "tasks",
      "staff",
      "equipment",
      "chemicals",
      "photos"
    ]
  },
  "generatedAt": "2026-03-27T14:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid report type
- `401 Unauthorized`: User not authenticated
- `403 Forbidden`: Insufficient permissions for report type
- `500 Internal Server Error`: Report generation failed

**Rate Limits:** 5 requests per minute per user

**Role-Based Access:**
- All authenticated users: `daily`, `weekly`, `monthly`, `equipment`
- Superintendents only: `staff`, `chemical`

---

### GET /api/reports/pdf

Returns available report types and their parameters based on user role.

**Authentication:** Session cookie (authenticated user)

**Request Example:**
```bash
curl -X GET https://your-app.com/api/reports/pdf \
  -H "Cookie: sb-access-token=..."
```

**Success Response (200):**
```json
{
  "reportTypes": [
    {
      "id": "daily",
      "name": "Daily Operations Report",
      "description": "Summary of daily activities, tasks, and conditions",
      "params": ["date"],
      "available": true
    },
    {
      "id": "weekly",
      "name": "Weekly Summary Report",
      "description": "Week-over-week performance and highlights",
      "params": ["weekStart"],
      "available": true
    },
    {
      "id": "staff",
      "name": "Staff Performance Report",
      "description": "Individual staff productivity and metrics",
      "params": ["userId", "dateRange"],
      "available": false,
      "requiresRole": "superintendent"
    }
  ],
  "userRole": "crew"
}
```

---

## Supabase Direct Access

Most data operations in GreenKeeper Pro use the Supabase client directly from the browser. This provides real-time updates and reduces API complexity. All operations are secured by Row Level Security (RLS) policies.

### Client Setup

```typescript
// Client-side (browser)
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()

// Server-side (API routes, Server Components)
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
```

### Common Operations

#### Query Data
```typescript
// Get all tasks assigned to current user
const { data: tasks, error } = await supabase
  .from('tasks')
  .select('*, assigned_to:profiles!tasks_assigned_to_fkey(*)')
  .eq('assigned_to', userId)
  .order('due_date', { ascending: true })
```

#### Insert Data
```typescript
const { data, error } = await supabase
  .from('tasks')
  .insert({
    title: 'Mow greens #1-9',
    description: 'Morning mowing routine',
    category: 'mowing',
    priority: 'high',
    assigned_to: userId,
    due_date: '2026-03-28',
    zone_id: zoneId
  })
  .select()
  .single()
```

#### Update Data
```typescript
const { data, error } = await supabase
  .from('tasks')
  .update({ status: 'completed', completed_at: new Date().toISOString() })
  .eq('id', taskId)
  .select()
  .single()
```

#### Delete Data
```typescript
const { error } = await supabase
  .from('tasks')
  .delete()
  .eq('id', taskId)
```

#### Real-time Subscriptions
```typescript
const channel = supabase
  .channel('tasks-realtime')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks',
    filter: `assigned_to=eq.${userId}`
  }, (payload) => {
    console.log('Task updated:', payload)
  })
  .subscribe()

// Cleanup
channel.unsubscribe()
```

### Storage Operations

#### Upload File
```typescript
const file = event.target.files[0]
const fileName = `${userId}/${Date.now()}-${file.name}`

const { data, error } = await supabase.storage
  .from('photos')
  .upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  })
```

#### Get Public URL
```typescript
const { data } = supabase.storage
  .from('photos')
  .getPublicUrl(fileName)

console.log(data.publicUrl)
```

#### Download File
```typescript
const { data, error } = await supabase.storage
  .from('photos')
  .download(fileName)
```

### Key Database Tables

#### profiles
User accounts and roles. Joined with `auth.users` table.

```typescript
{
  id: string // UUID, matches auth.users.id
  email: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  phone_number: string | null
  created_at: string
  updated_at: string
}
```

#### tasks
Work assignments and task tracking.

```typescript
{
  id: string
  title: string
  description: string | null
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  created_by: string // FK -> profiles.id
  assigned_to: string | null // FK -> profiles.id
  zone_id: string | null // FK -> course_zones.id
  due_date: string | null
  completed_at: string | null
  estimated_hours: number | null
  actual_hours: number | null
  created_at: string
  updated_at: string
}
```

#### chemical_applications
Chemical application logs for compliance.

```typescript
{
  id: string
  product_id: string // FK -> chemical_products.id
  applied_by: string // FK -> profiles.id
  zone_id: string // FK -> course_zones.id
  application_date: string
  application_method: ApplicationMethod
  rate_applied: number
  unit_of_measure: string
  area_treated: number // acres
  weather_conditions: string | null
  temperature: number | null
  wind_speed: number | null
  rei_until: string // Calculated re-entry time
  notes: string | null
  created_at: string
}
```

#### equipment
Equipment inventory and status.

```typescript
{
  id: string
  name: string
  equipment_type: EquipmentType
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  year: number | null
  status: EquipmentStatus
  assigned_to: string | null // FK -> profiles.id
  purchase_date: string | null
  purchase_price: number | null
  current_hours: number | null
  last_service_date: string | null
  next_service_due: number | null // hours
  notes: string | null
  created_at: string
  updated_at: string
}
```

---

## Error Handling

### Standard Error Response Format

All API routes return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong",
  "success": false
}
```

### HTTP Status Codes

- `200 OK` - Request succeeded
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required or failed
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server-side error

### Supabase Error Handling

```typescript
const { data, error } = await supabase.from('tasks').select()

if (error) {
  console.error('Supabase error:', error.message)
  console.error('Error details:', error.details)
  console.error('Error hint:', error.hint)
}
```

Common Supabase error codes:
- `PGRST116` - Row not found
- `PGRST204` - No content (for updates/deletes)
- `23505` - Unique constraint violation
- `23503` - Foreign key violation
- `42501` - Insufficient privilege (RLS policy denied)

---

## Rate Limits

### API Routes

| Endpoint | Rate Limit | Notes |
|----------|------------|-------|
| /api/daily-briefing | None | Intended for cron job |
| /api/diagnostics | ~10/min per user | 30s timeout, auto-retry |
| /api/reports/pdf | 5/min per user | Per authenticated user |

### Supabase

Supabase has generous rate limits on the free tier:
- **Database**: 500 concurrent connections
- **Auth**: 50,000 MAU (Monthly Active Users)
- **Storage**: 1GB, 2GB bandwidth
- **Realtime**: 200 concurrent connections

Rate limit headers are not currently exposed by Supabase.

### External APIs

**WeatherAPI.com** (Free tier):
- 1,000,000 calls/month
- ~30,000 calls/day
- Used by: Daily briefing, weather page

**Anthropic Claude API** (Pay-as-you-go):
- No hard rate limit (rate limited by account tier)
- Timeout: 30s per request
- Used by: Diagnostics AI, daily briefing generation

---

## Webhooks & Cron Jobs

### Daily Briefing Cron

**Schedule:** Daily at 6:00 AM CT

**Vercel Configuration (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/daily-briefing",
      "schedule": "0 11 * * *"
    }
  ]
}
```

**Manual Trigger:**
```bash
curl -X POST https://your-app.com/api/daily-briefing \
  -H "Authorization: Bearer ${DAILY_BRIEFING_SECRET}"
```

---

## Environment Variables

Required environment variables for API functionality:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # Optional

# Weather API
NEXT_PUBLIC_WEATHER_API_KEY=your-weather-api-key

# Anthropic (AI)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Daily Briefing
DAILY_BRIEFING_SECRET=your-random-secret-string

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-app.com

# Monitoring (Optional)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

---

## TypeScript Types

The application is fully typed with TypeScript. Import types from:

```typescript
import type {
  UserRole,
  TaskStatus,
  TaskPriority,
  ChemicalProductType,
  EquipmentType
} from '@/types/database'
```

For Supabase query results, use type inference:

```typescript
const { data } = await supabase
  .from('tasks')
  .select('*, assigned_to:profiles!tasks_assigned_to_fkey(*)')
  .single()

// data is automatically typed based on the query
type TaskWithProfile = typeof data
```

---

## Security Best Practices

1. **Never expose sensitive keys** - Keep `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` server-side only
2. **Use RLS policies** - All database tables have Row Level Security enabled
3. **Validate inputs** - All form inputs validated with Zod schemas
4. **Rate limit API routes** - Implement rate limiting for public endpoints
5. **Use HTTPS only** - All production traffic over HTTPS
6. **Rotate secrets regularly** - Update `DAILY_BRIEFING_SECRET` periodically
7. **Monitor error logs** - Use Sentry for error tracking and alerting

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference)
- [WeatherAPI Documentation](https://www.weatherapi.com/docs/)
- [Architecture Overview](./architecture.md)
- [Deployment Guide](./deployment.md)
