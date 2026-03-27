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
