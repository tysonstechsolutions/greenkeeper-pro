# Plan 3: DevOps & Monitoring Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up CI/CD pipeline with GitHub Actions, configure Vercel deployment, integrate Sentry for error monitoring, and establish logging strategy.

**Architecture:** GitHub Actions runs tests and type-checking on PRs, then triggers Vercel deployment. Sentry captures client and server errors with source maps. Production logging uses structured format with error-only output.

**Tech Stack:** GitHub Actions, Vercel CLI, Sentry SDK (@sentry/nextjs), Vercel Analytics

---

## File Structure

```
.github/
└── workflows/
    ├── ci.yml                      # PR checks (lint, typecheck, test)
    └── deploy.yml                  # Production deployment
vercel.json                         # Vercel project configuration
sentry.client.config.ts             # Sentry client configuration
sentry.server.config.ts             # Sentry server configuration
sentry.edge.config.ts               # Sentry edge configuration
next.config.ts                      # (modify for Sentry)
src/
├── lib/
│   └── utils/
│       └── logger.ts               # Structured logging utility
└── instrumentation.ts              # Next.js instrumentation for Sentry
```

---

### Task 1: Create GitHub Actions CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow file**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  # Test environment variables
  NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
  NEXT_PUBLIC_SUPABASE_ANON_KEY: test-anon-key
  NEXT_PUBLIC_WEATHER_API_KEY: test-weather-key

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run TypeScript
        run: npx tsc --noEmit

  test:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:run

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_WEATHER_API_KEY: ${{ secrets.NEXT_PUBLIC_WEATHER_API_KEY }}

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 3: Verify YAML syntax**

Run: `cat .github/workflows/ci.yml`

Expected: YAML file contents displayed correctly

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI workflow"
```

---

### Task 2: Create Vercel Configuration

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm ci",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store, max-age=0"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ],
  "crons": [
    {
      "path": "/api/daily-briefing",
      "schedule": "0 5 * * *"
    }
  ]
}
```

- [ ] **Step 2: Verify JSON syntax**

Run: `cat vercel.json | npx json5`

Expected: Parsed JSON displayed (or use `node -e "console.log(JSON.parse(require('fs').readFileSync('vercel.json')))"`)

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "deploy: add Vercel configuration"
```

---

### Task 3: Install and Configure Sentry

**Files:**
- Modify: `package.json` (install dependencies)
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`

- [ ] **Step 1: Install Sentry SDK**

```bash
npx @sentry/wizard@latest -i nextjs
```

This wizard will create the config files automatically. If you prefer manual setup:

```bash
npm install @sentry/nextjs
```

- [ ] **Step 2: Create sentry.client.config.ts (if wizard didn't create it)**

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: 1.0,

  // Session replay for debugging
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // App-specific settings
  environment: process.env.NODE_ENV,

  // Ignore common non-errors
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
  ],

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});
```

- [ ] **Step 3: Create sentry.server.config.ts (if wizard didn't create it)**

```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: 1.0,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,
});
```

- [ ] **Step 4: Create sentry.edge.config.ts (if wizard didn't create it)**

```typescript
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 1.0,

  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,
});
```

- [ ] **Step 5: Verify Sentry config files exist**

Run: `ls -la sentry.*.config.ts`

Expected: Three config files listed

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json sentry.*.config.ts
git commit -m "monitoring: add Sentry error tracking configuration"
```

---

### Task 4: Update Next.js Config for Sentry

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts to include Sentry**

Wrap the existing config with Sentry's withSentryConfig:

```typescript
// next.config.ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwist from "@serwist/next";

const nextConfig: NextConfig = {
  // Your existing config
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

// Apply Serwist (PWA)
const withPWA = withSerwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// Apply Sentry
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps only in production
  dryRun: process.env.NODE_ENV !== "production",
};

const sentryOptions = {
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  // Transpiles SDK to be compatible with IE11
  transpileClientSDK: false,
  // Disable tunneling in development
  tunnelRoute: process.env.NODE_ENV === "production" ? "/monitoring" : undefined,
  // Disable Sentry in development
  disableLogger: process.env.NODE_ENV !== "production",
};

export default withSentryConfig(
  withPWA(nextConfig),
  sentryWebpackPluginOptions,
  sentryOptions
);
```

- [ ] **Step 2: Verify config compiles**

Run: `npx tsc --noEmit next.config.ts`

Expected: No errors (or warnings about types are OK)

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "monitoring: integrate Sentry with Next.js build"
```

---

### Task 5: Create Instrumentation File

**Files:**
- Create: `src/instrumentation.ts`

- [ ] **Step 1: Create instrumentation.ts for server-side Sentry**

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
```

- [ ] **Step 2: Verify file syntax**

Run: `npx tsc --noEmit src/instrumentation.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/instrumentation.ts
git commit -m "monitoring: add Next.js instrumentation for Sentry"
```

---

### Task 6: Create Structured Logger Utility

**Files:**
- Create: `src/lib/utils/logger.ts`

- [ ] **Step 1: Write the logger utility**

```typescript
// src/lib/utils/logger.ts
import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

const isDevelopment = process.env.NODE_ENV === "development";

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (isDevelopment) {
      console.debug(formatMessage("debug", message, context));
    }
  },

  info(message: string, context?: LogContext) {
    if (isDevelopment) {
      console.info(formatMessage("info", message, context));
    }
  },

  warn(message: string, context?: LogContext) {
    console.warn(formatMessage("warn", message, context));

    // Send warnings to Sentry as breadcrumbs
    Sentry.addBreadcrumb({
      category: "warning",
      message,
      data: context,
      level: "warning",
    });
  },

  error(message: string, error?: Error | unknown, context?: LogContext) {
    console.error(formatMessage("error", message, context));

    if (error instanceof Error) {
      console.error(error);

      // Send to Sentry
      Sentry.captureException(error, {
        extra: {
          message,
          ...context,
        },
      });
    } else if (error) {
      // Non-Error thrown
      Sentry.captureMessage(message, {
        level: "error",
        extra: {
          error,
          ...context,
        },
      });
    } else {
      // Error message without Error object
      Sentry.captureMessage(message, {
        level: "error",
        extra: context,
      });
    }
  },

  // For capturing specific events
  event(name: string, data?: LogContext) {
    if (isDevelopment) {
      console.log(formatMessage("info", `Event: ${name}`, data));
    }

    Sentry.addBreadcrumb({
      category: "event",
      message: name,
      data,
      level: "info",
    });
  },
};

// Export for use in API routes
export function logApiError(
  route: string,
  method: string,
  error: Error | unknown,
  context?: LogContext
) {
  logger.error(`API Error: ${method} ${route}`, error, {
    route,
    method,
    ...context,
  });
}
```

- [ ] **Step 2: Verify logger compiles**

Run: `npx tsc --noEmit src/lib/utils/logger.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/logger.ts
git commit -m "monitoring: add structured logger with Sentry integration"
```

---

### Task 7: Update .env.local.example with Monitoring Variables

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Add Sentry environment variables**

Add to `.env.local.example`:

```bash
# Sentry Error Monitoring
# Get your DSN from https://sentry.io
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=greenkeeper-pro
SENTRY_AUTH_TOKEN=your-auth-token
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add Sentry environment variables to example"
```

---

### Task 8: Add Vercel Analytics

**Files:**
- Modify: `package.json` (install)
- Modify: `src/app/layout.tsx` (add component)

- [ ] **Step 1: Install Vercel Analytics**

```bash
npm install @vercel/analytics @vercel/speed-insights
```

- [ ] **Step 2: Add Analytics to root layout**

In `src/app/layout.tsx`, add imports:

```typescript
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
```

Then add the components inside the body, typically after the main content:

```typescript
// Inside the RootLayout component's return, after {children}:
<Analytics />
<SpeedInsights />
```

- [ ] **Step 3: Verify layout compiles**

Run: `npx tsc --noEmit src/app/layout.tsx`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/layout.tsx
git commit -m "monitoring: add Vercel Analytics and Speed Insights"
```

---

### Task 9: Create GitHub Secrets Documentation

**Files:**
- Create: `docs/deployment.md`

- [ ] **Step 1: Create deployment documentation**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: add deployment guide with secrets and configuration"
```

---

### Task 10: Add Typecheck Script to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add typecheck script**

Add to `scripts` in `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Verify script works**

Run: `npm run typecheck`

Expected: TypeScript check runs (may show errors to fix)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add typecheck script for CI"
```

---

### Task 11: Final Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full CI pipeline locally**

```bash
# Lint
npm run lint

# Typecheck
npm run typecheck

# Tests
npm run test:run

# Build
npm run build
```

Expected: All commands pass

- [ ] **Step 2: Verify Sentry is properly excluded in dev**

Run: `npm run dev`

Check console: Should NOT see Sentry initialization messages in development

- [ ] **Step 3: Verify GitHub workflow syntax**

Run: `npx yaml-lint .github/workflows/ci.yml` (if available) or use GitHub's online validator

Expected: Valid YAML syntax

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "ci: complete Plan 3 - DevOps & Monitoring

- GitHub Actions CI workflow (lint, typecheck, test, build, e2e)
- Vercel configuration with security headers and cron
- Sentry integration for error monitoring
- Structured logger with Sentry breadcrumbs
- Vercel Analytics and Speed Insights
- Deployment documentation"
```

---

## Summary

After completing Plan 3, you will have:

1. **GitHub Actions CI** - Automated lint, typecheck, test, and build on PRs
2. **Vercel Configuration** - Security headers, regions, and cron job for daily briefing
3. **Sentry Integration** - Client and server error tracking with source maps
4. **Structured Logger** - Production-ready logging with Sentry integration
5. **Vercel Analytics** - Performance monitoring and speed insights
6. **Deployment Documentation** - Clear guide for secrets and configuration

The application is now ready for reliable deployments with full observability. Plan 4 (Documentation & Launch) will finalize the project.
