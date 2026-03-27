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
