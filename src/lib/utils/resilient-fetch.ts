/**
 * Resilient Fetch Utilities
 *
 * Provides timeout-wrapped Supabase queries and retry logic
 * so pages fail gracefully instead of hanging forever.
 */

import { createClient } from "@/lib/supabase/client";

// Default timeout for Supabase queries (8 seconds)
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve
 * within `ms` milliseconds, it resolves with the fallback value
 * instead of hanging forever.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  fallback: T
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[resilient-fetch] Query timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err) {
    clearTimeout(timeoutId!);
    console.warn("[resilient-fetch] Query failed, returning fallback:", err);
    return fallback;
  }
}

/**
 * Safely execute a Supabase query with timeout and error handling.
 * Returns { data, error } — on timeout or network error, data is the
 * fallback and error is a descriptive string (never throws).
 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ data: T; error: string | null }> {
  try {
    const result = await withTimeout(queryFn(), timeoutMs, {
      data: fallback,
      error: { message: "Query timed out" } as { message: string },
    });

    if (result.error) {
      console.warn("[resilient-fetch] Query error:", result.error.message);
      return { data: result.data ?? fallback, error: result.error.message };
    }

    return { data: result.data ?? fallback, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[resilient-fetch] Unexpected error:", message);
    return { data: fallback, error: message };
  }
}

/**
 * Retry a function up to `maxRetries` times with exponential backoff.
 * Only retries on network/timeout errors, not on Supabase application errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[resilient-fetch] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Check if the browser is currently online.
 * Returns true if navigator.onLine is true or if navigator is unavailable.
 */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Returns the Supabase client, or null if we're definitely offline.
 * Useful for short-circuiting queries when there's no connectivity.
 */
export function getClientIfOnline() {
  if (!isOnline()) return null;
  return createClient();
}
