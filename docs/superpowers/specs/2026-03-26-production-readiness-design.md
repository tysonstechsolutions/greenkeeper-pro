# GreenKeeper Pro: Full Production Readiness Design

**Date:** 2026-03-26
**Status:** Approved
**Approach:** Full Production (Approach C) - Complete test suite, monitoring, documentation, and CI/CD before launch

## Context

GreenKeeper Pro is a golf course management PWA for Veterans Memorial Golf Course. The application is approximately 70% complete with 18+ major features implemented. It will be deployed to Vercel with Supabase backend for production use by 6-15 staff members.

### Current State
- **Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, Tailwind CSS, shadcn/ui
- **Features Built:** Tasks, chemicals, equipment, diagnostics, scheduling, budget, member portal, offline PWA
- **Database:** Supabase configured with tables and RLS policies
- **API Keys:** All ready (Supabase, WeatherAPI.com, Anthropic)

### Critical Gaps
- Zero test coverage
- Settings don't persist to database
- Weather API not connected (placeholder)
- Dashboard has hardcoded data (Recent Activity, staff count)
- No real-time updates (critical for 6-15 users)
- No error boundaries
- No CI/CD pipeline
- No monitoring/error tracking
- Documentation is boilerplate

---

## Section 1: Test Infrastructure & Coverage

### 1.1 Test Stack
- **Vitest** - Test runner (fast, Vite-native)
- **React Testing Library** - Component testing
- **MSW (Mock Service Worker)** - API mocking for Supabase
- **Playwright** - E2E testing for critical flows

### 1.2 Test Coverage Priorities

| Priority | Area | Rationale |
|----------|------|-----------|
| Critical | Authentication flow | App unusable if login breaks |
| Critical | Task CRUD operations | Core daily workflow |
| Critical | Chemical application logging | Regulatory/safety implications |
| High | Equipment status updates | Operational coordination |
| High | Offline queue sync | Data loss prevention |
| Medium | Dashboard data loading | UX but not data integrity |
| Medium | Settings persistence | After fix is implemented |

### 1.3 Test Structure
```
src/
├── __tests__/
│   ├── unit/           # Pure function tests
│   ├── components/     # Component tests
│   ├── hooks/          # Hook tests with mock Supabase
│   └── integration/    # Multi-component flows
tests/
└── e2e/                # Playwright E2E tests
```

---

## Section 2: Fix Broken Functionality

### 2.1 Settings Persistence

**Problem:** Settings UI exists but save handlers are fake delays with TODOs.

**Solution:**
- Add `user_preferences` JSONB column to existing `profiles` table
- Structure:
  ```typescript
  {
    notifications: {
      push_enabled: boolean,
      task_assigned: boolean,
      task_completed: boolean,
      schedule_changes: boolean,
      weather_alerts: boolean,
      equipment_issues: boolean,
      messages: boolean
    },
    course: { /* course-specific prefs */ }
  }
  ```
- Create `useUserPreferences` hook (fetch on mount, save on change)
- Update `notifications/page.tsx` and `course/page.tsx` to use the hook

### 2.2 Weather API Integration

**Problem:** `generate-briefing.ts:591` has placeholder, no actual API call.

**Solution:**
- Create `src/lib/utils/weather.ts`:
  - `fetchCurrentWeather(lat: number, lng: number)` - current conditions
  - `fetchForecast(lat: number, lng: number, days: number)` - forecast
  - `fetchAlerts(lat: number, lng: number)` - weather alerts
- Use WeatherAPI.com (key in env)
- Add 15-minute cache to reduce API calls
- Fallback to last cached data if API fails
- Update briefing generation to use real data

### 2.3 Dashboard Hardcoded Data

**Problem:** "8 staff on duty" and Recent Activity are static.

**Solution:**
- **Staff count:** Query `profiles` where role is staff type + has activity today
- **Recent Activity:** Create `activity_log` table:
  ```sql
  CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- Log events from existing hooks (task create/complete, equipment updates)
- Create `useRecentActivity` hook for dashboard

### 2.4 Member Community Photo Upload

**Problem:** `page.tsx:73` has `undefined // TODO: photo upload`

**Solution:**
- Wire up existing photo capture component to community posts
- Upload to Supabase Storage bucket
- Store URL in post record

---

## Section 3: Real-Time Updates

### 3.1 Rationale
With 6-15 users, lack of real-time causes:
- Task completion not visible to others until refresh
- Schedule changes don't propagate
- Equipment status changes missed

### 3.2 Supabase Realtime Subscriptions

| Table | Events | Audience |
|-------|--------|----------|
| `tasks` | INSERT, UPDATE, DELETE | All staff on dashboard/task list |
| `equipment` | UPDATE | All staff (status changes) |
| `schedule_entries` | INSERT, UPDATE, DELETE | Staff viewing schedule |
| `messages` | INSERT | Users in that channel |
| `notifications` | INSERT | Target user |

### 3.3 Implementation
- Create `src/lib/hooks/useRealtimeSubscription.ts` - generic subscription hook
- Table-specific hooks:
  - `useRealtimeTasks()` - merges updates into task list
  - `useRealtimeEquipment()` - updates equipment status live
  - `useRealtimeMessages()` - new messages appear instantly
- React Context for shared subscriptions (avoid duplicate connections)
- Graceful reconnection handling

### 3.4 Optimistic Updates
- Update local state immediately on user action
- Send to Supabase
- Reconcile if server response differs
- Integrate with existing offline queue pattern

---

## Section 4: Error Handling & Resilience

### 4.1 React Error Boundaries
- Create `src/components/error-boundary.tsx` - catches render errors
- Create `src/app/error.tsx` - Next.js app-level error UI
- Create `src/app/global-error.tsx` - root layout error handler
- Wrap key sections with boundaries
- Show user-friendly error UI with "Try Again" button

### 4.2 API/Network Error Handling
- Create `src/lib/utils/api-error.ts` - standardized error handling
- Retry logic with exponential backoff (3 attempts)
- Toast notifications for user-facing errors
- Preserve offline queue behavior

### 4.3 Form Validation
- Add **Zod** for schema validation
- Schemas for:
  - Task creation/editing
  - Chemical application logging (critical - wrong rates are dangerous)
  - Equipment maintenance entries
  - User profile updates
- Validate on submit, show inline errors
- Server-side validation in API routes

### 4.4 Loading & Empty States
- Audit all data-fetching pages
- Ensure every list has: loading skeleton, empty state, error state
- Consistent patterns across the app

---

## Section 5: Deployment & CI/CD

### 5.1 Vercel Configuration
- Create `vercel.json` for project settings
- Environment variables in Vercel dashboard:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_WEATHER_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `DAILY_BRIEFING_SECRET`
  - `NEXT_PUBLIC_APP_URL`
- Preview deployments for branches
- Custom domain configuration

### 5.2 CI/CD Pipeline (GitHub Actions)

```yaml
# On pull request:
- Linting (eslint)
- Type checking (tsc --noEmit)
- Unit/integration tests (vitest)
- E2E tests (playwright)
- Preview deploy to Vercel

# On merge to main:
- All above checks
- Deploy to production
```

### 5.3 Environment Management
- `.env.local` - local development
- `.env.test` - test environment
- Vercel environments: Preview, Production
- Document key handling

### 5.4 Database Migrations
- Existing: `001_initial_schema.sql`, `002_invites_table.sql`
- Add: `003_activity_log.sql`, `004_user_preferences.sql`
- Run via Supabase CLI before deploy
- Document migration process

---

## Section 6: Monitoring & Error Tracking

### 6.1 Sentry Integration
- Add `@sentry/nextjs` package
- Configure for client and server errors
- Capture unhandled exceptions, API errors, error boundary catches
- Source maps for readable stack traces
- Alert on new error types

### 6.2 Performance Monitoring
- Sentry Performance
- Track page load times, API response times
- Set baseline thresholds, alert on degradation

### 6.3 Uptime Monitoring
- Vercel Analytics (free tier)
- External ping (UptimeRobot free tier):
  - Check every 5 minutes
  - Alert if down 2+ checks
- Monitor daily briefing cron endpoint

### 6.4 Logging Strategy
- Replace 372 `console.log` calls with structured logger
- Production: only errors and critical events
- Development: verbose logging
- Sentry captures errors automatically

---

## Section 7: Documentation

### 7.1 README Overhaul
- Project overview
- Tech stack summary
- Local development setup
- Environment variables
- Database setup
- Running tests
- Deployment process

### 7.2 Architecture Documentation (`docs/architecture.md`)
- System overview diagram
- Frontend structure (App Router, components, hooks)
- Backend (Supabase tables, RLS policies, API routes)
- Data flow (auth, offline sync, real-time)
- Role-based access control

### 7.3 API Documentation (`docs/api.md`)
- `/api/daily-briefing` - webhook for scheduled briefings
- `/api/diagnostics` - AI turf analysis
- `/api/pdf` - report generation
- Request/response formats, auth requirements

### 7.4 User Guide (`docs/user-guide.md`)
- Getting started for new staff
- Role-specific workflows
- Common tasks walkthrough
- Troubleshooting

### 7.5 Database Schema (`docs/database.md`)
- Table descriptions and relationships
- RLS policy explanations
- Migration history

---

## Section 8: Final Polish & Launch Checklist

### 8.1 Security Hardening
- Audit RLS policies for data leaks
- Add rate limiting to API routes
- Validate all API inputs server-side
- Review Supabase anon key permissions
- Ensure `ANTHROPIC_API_KEY` is server-side only

### 8.2 PWA Verification
- Test install flow on iOS and Android
- Verify offline page works
- Test offline queue sync on reconnect
- Test on actual mobile devices

### 8.3 Browser/Device Testing
- Chrome, Safari, Firefox, Edge
- iOS Safari, Android Chrome
- Tablet layouts
- Slow network simulation (3G)

### 8.4 Launch Checklist

**Pre-launch:**
- [ ] All tests passing
- [ ] Sentry configured and receiving test errors
- [ ] Production environment variables set
- [ ] Database migrations run on production
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] First admin user created

**Post-launch monitoring:**
- [ ] Watch Sentry for errors in first 24 hours
- [ ] Check Vercel analytics for performance
- [ ] Verify daily briefing cron runs
- [ ] Confirm real-time updates with multiple users

---

## Implementation Order

1. **Test Infrastructure** - Foundation for safe changes
2. **Fix Broken Functionality** - With tests to verify
3. **Error Handling** - Graceful failures
4. **Real-Time Updates** - Multi-user coordination
5. **CI/CD Pipeline** - Automated quality gates
6. **Monitoring** - Production visibility
7. **Documentation** - Knowledge transfer
8. **Final Polish** - Launch readiness

---

## Success Criteria

- All critical and high-priority tests passing
- Zero TODOs in critical paths
- Settings persist correctly
- Weather data is live
- Dashboard shows real activity
- Real-time updates work across users
- Errors are caught and reported
- CI/CD blocks broken code
- Documentation enables onboarding
- PWA works on mobile devices in the field
