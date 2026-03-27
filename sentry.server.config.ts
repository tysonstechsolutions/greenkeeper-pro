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
