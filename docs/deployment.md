# Deployment Guide

## Prerequisites

- GitHub repository with push access
- Vercel account connected to the repository
- Supabase project with database configured
- Sentry project (optional but recommended)

## Required GitHub Secrets

Configure these secrets in your GitHub repository settings (Settings > Secrets and variables > Actions):

### Required for builds:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_WEATHER_API_KEY` - WeatherAPI.com API key

### Required for Sentry (optional):
- `SENTRY_AUTH_TOKEN` - Sentry authentication token for source maps
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error reporting

### Required for Vercel (if using CLI):
- `VERCEL_TOKEN` - Vercel deployment token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID

## Vercel Environment Variables

Set these in your Vercel project settings (Settings > Environment Variables):

| Variable | Environment | Description |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase anon key |
| `NEXT_PUBLIC_WEATHER_API_KEY` | Production, Preview | Weather API key |
| `ANTHROPIC_API_KEY` | Production | AI features |
| `DAILY_BRIEFING_SECRET` | Production | Cron job auth |
| `NEXT_PUBLIC_APP_URL` | Production | Your production URL |
| `NEXT_PUBLIC_SENTRY_DSN` | Production | Sentry error tracking |

## Database Migrations

Before deploying, run migrations against your production Supabase database:

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Deployment Process

### Automatic (recommended)
1. Push to `main` branch
2. GitHub Actions runs CI checks
3. If checks pass, Vercel automatically deploys

### Manual
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy preview
vercel

# Deploy production
vercel --prod
```

## Monitoring

### Sentry Dashboard
- View errors: https://sentry.io/organizations/[your-org]/issues/
- Performance: https://sentry.io/organizations/[your-org]/performance/

### Vercel Dashboard
- Deployments: https://vercel.com/[your-team]/greenkeeper-pro
- Analytics: https://vercel.com/[your-team]/greenkeeper-pro/analytics
- Logs: https://vercel.com/[your-team]/greenkeeper-pro/logs

## Rollback

If a deployment causes issues:

1. Go to Vercel dashboard
2. Navigate to Deployments
3. Find the last working deployment
4. Click "..." menu > "Promote to Production"
