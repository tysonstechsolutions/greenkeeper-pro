import { createBrowserClient } from "@supabase/ssr";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

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

/**
 * Watchdog: if a fetch has been pending for more than this long without
 * the full 12s timeout wrapper firing, something deeper is stuck (lock
 * contention, wedged websocket, hung TLS handshake). Signal a reset early
 * so the SupabaseRecovery component can reload rather than making the
 * user wait out the full timeout. 8s is twice the healthy-query p99 (~4s
 * on mobile) and half the hard timeout.
 */
const WATCHDOG_PENDING_MS = 8_000;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

function kickWatchdog() {
  if (typeof window === "undefined") return;
  if (watchdogTimer !== null) clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(() => {
    if (requestTelemetry.pending > 0) {
      recordBreadcrumb(
        "warn",
        `Watchdog: ${requestTelemetry.pending} request(s) pending for >${WATCHDOG_PENDING_MS}ms`,
      );
      window.dispatchEvent(new CustomEvent("supabase:reset-needed"));
    }
  }, WATCHDOG_PENDING_MS);
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

  const shortUrl = shortenUrl(url);
  const started = Date.now();
  requestTelemetry.pending++;
  recordBreadcrumb("fetch", `→ ${shortUrl}`);
  kickWatchdog();
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal });
    requestTelemetry.consecutiveTimeouts = 0;
    recordBreadcrumb(
      "fetch-done",
      `${resp.status} ${shortUrl} (${Date.now() - started}ms)`,
    );
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
      recordBreadcrumb(
        "timeout",
        `Timed out after ${FETCH_TIMEOUT_MS}ms: ${shortUrl}`,
      );
      maybeSignalReset();
    } else {
      requestTelemetry.lastError = {
        message: err instanceof Error ? err.message : String(err),
        at: Date.now(),
        url,
      };
      recordBreadcrumb(
        "error",
        `Fetch failed: ${shortUrl}`,
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    requestTelemetry.pending = Math.max(0, requestTelemetry.pending - 1);
    // If there are no more pending requests, cancel the watchdog — nothing
    // to watch for.
    if (requestTelemetry.pending === 0 && watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }
}

// Trim the Supabase domain prefix off URLs for more readable breadcrumbs.
function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? "?…" : "");
  } catch {
    return url;
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
      // fetch aborts at 12s, the promise rejects, downstream code gets
      // the error, and the app remains responsive.
      fetch: timeoutFetch,
    },
    auth: {
      // Disable the navigator.locks-based token-refresh lock. The lock
      // exists to serialize auth refreshes across multiple tabs / service
      // workers; on a single-screen Capacitor mobile app we only ever
      // have one page at a time, so the lock provides zero benefit and
      // caused real failures — an upload in mid-flight would wait up to
      // 5s for the lock, then get forcibly stolen, throwing
      //   "Lock broken by another request with the 'steal' option"
      // right in the middle of the Storage PUT.
      //
      // Supabase's lock option is `(name, timeout, fn) => Promise` — we
      // pass a no-op wrapper that just runs fn() immediately. If we ever
      // add multi-tab support (web + native simultaneously), revisit.
      lock: async (_name, _timeout, fn) => fn(),
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
