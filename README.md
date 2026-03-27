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
