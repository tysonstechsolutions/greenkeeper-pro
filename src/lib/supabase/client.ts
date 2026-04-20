import { createBrowserClient } from "@supabase/ssr";

// NOTE: We intentionally don't pass a Database generic to createBrowserClient.
// Our hand-written `Database` type in `./database` doesn't match Supabase's
// `GenericSchema` constraint, which causes the strict client generic to
// collapse Row/Insert/Update into `never` and forces `as any` casts throughout
// the codebase. Leaving the generic as the default `any` lets `.from(anyString)`
// work without casts, and individual hooks layer their own strongly-typed
// Row interfaces from `./database` on top of the results where it matters.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

// ── Diagnostics + recovery for Capacitor WebView ────────────────────────────
// A single hung Supabase request — a stalled auth refresh on flaky mobile
// data, a WebView fetch that never resolves — used to wedge the entire app:
// every subsequent query waits for the same auth lock, and nothing loads
// until the user force-quits the process. We fix that here with two things:
//
//   1. A fetch wrapper that enforces a hard timeout on every request. If
//      the network is bad, the request ABORTS instead of hanging forever.
//      The lock the auth client holds is released on the abort, so the
//      next query can proceed.
//
//   2. A stuck-request counter + recovery signal. If we see too many
//      consecutive timeouts, the module dispatches a `supabase:reset`
//      event. A UI component (the debug/reset overlay) can listen and
//      offer the user a one-tap Reset — calling resetClient() creates a
//      fresh client instance without reloading the WebView.

const FETCH_TIMEOUT_MS = 12_000;
// Fire the reset-needed event after even a single timeout. Waiting for 3
// consecutive timeouts means 36+ seconds of a hung app before the user sees
// any affordance — long past when they'll force-quit out of frustration.
const STUCK_THRESHOLD = 1;

// Pending request counter, exposed so diagnostic UI can show "N requests
// in flight" without reaching into Supabase internals.
const requestTelemetry = {
  pending: 0,
  consecutiveTimeouts: 0,
  lastError: null as { message: string; at: number; url: string } | null,
};

export function getSupabaseTelemetry() {
  return { ...requestTelemetry };
}

function maybeSignalReset() {
  if (requestTelemetry.consecutiveTimeouts < STUCK_THRESHOLD) return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("supabase:reset-needed"));
}

async function timeoutFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  // Respect an upstream AbortController while layering our own timeout on top.
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort(upstreamSignal.reason);
    else upstreamSignal.addEventListener("abort", () =>
      controller.abort(upstreamSignal.reason),
    );
  }
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, FETCH_TIMEOUT_MS);

  requestTelemetry.pending++;
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal });
    requestTelemetry.consecutiveTimeouts = 0;
    return resp;
  } catch (err) {
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      requestTelemetry.consecutiveTimeouts++;
      requestTelemetry.lastError = {
        message: `Timed out after ${FETCH_TIMEOUT_MS}ms`,
        at: Date.now(),
        url,
      };
      maybeSignalReset();
    } else {
      requestTelemetry.lastError = {
        message: err instanceof Error ? err.message : String(err),
        at: Date.now(),
        url,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
    requestTelemetry.pending = Math.max(0, requestTelemetry.pending - 1);
  }
}

function buildClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return createBrowserClient("https://placeholder.supabase.co", "placeholder-key");
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      // Every request goes through our timeout wrapper. Without this a
      // stalled mobile fetch could wedge the entire client: every
      // subsequent request queues behind the hung one. With the wrapper,
      // fetch aborts at 15s, the promise rejects, downstream code gets
      // the error, and the app remains responsive. auth-js's default
      // 5s lockAcquireTimeout also releases orphaned locks automatically.
      fetch: timeoutFetch,
    },
  });
}

export function createClient() {
  // During build/prerender, env vars may not be available.
  // Return a cached instance if we already have one.
  if (clientInstance) return clientInstance;

  if (!supabaseUrl || !supabaseAnonKey) {
    // In production builds, this can happen during static page generation.
    // Return a stub client that won't crash but also won't work.
    // Pages that actually need Supabase are client-side rendered anyway.
    if (typeof window === "undefined") {
      // Server-side during build: return a minimal client with placeholder values
      // that will be replaced at runtime when real env vars are present.
      return buildClient();
    }
    // Client-side without env vars is a real problem
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  clientInstance = buildClient();
  return clientInstance;
}

/**
 * Tear down the memoized Supabase client and force the next createClient()
 * call to build a fresh one. Use this as an escape hatch when the app
 * believes the client is wedged (too many consecutive timeouts). Pairs
 * with the `supabase:reset-needed` event and the debug-overlay Reset
 * button so the user never has to kill the app to recover.
 *
 * IMPORTANT: consumers that cached the old client instance will hold onto
 * a dead reference. After reset, call supabase.auth.onAuthStateChange
 * listeners to rehydrate session-dependent state.
 */
export function resetClient() {
  clientInstance = null;
  requestTelemetry.pending = 0;
  requestTelemetry.consecutiveTimeouts = 0;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("supabase:reset-complete"));
  }
}
