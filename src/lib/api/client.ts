/**
 * API client abstraction for Capacitor builds.
 *
 * Historically the app made direct `fetch("/api/<name>", ...)` calls to
 * Next.js API routes. Those routes don't exist in the Capacitor build — they
 * are being migrated to Supabase Edge Functions in Phase 2 of the migration.
 *
 * This module is a single seam so each call-site can be migrated in one
 * commit (search-replace `fetch("/api/` → `callApi("`) without touching the
 * body/response plumbing. When an Edge Function is ready, flip its route in
 * the `EDGE_ROUTES` set below and calls will transparently invoke it via
 * `supabase.functions.invoke(...)` instead.
 */
import { createClient } from "@/lib/supabase/client";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

/**
 * Long-running edge functions (AI / vision / report generators / large
 * uploads). For these we BYPASS supabase.functions.invoke and call the
 * function URL directly with a pre-fetched session token. The reason:
 * `supabase.functions.invoke` always awaits `auth.getSession()` first,
 * which sits on the navigator.locks auth lock. If that lock is held
 * (an abandoned holder from a hot-reload, a crashed prior request, or a
 * concurrent token refresh), the call hangs INDEFINITELY before any
 * fetch breadcrumb fires — exactly the "stuck reading quote" symptom.
 *
 * Pre-fetching the token once with a short timeout, then calling fetch
 * directly, sidesteps that. If the auth lock is held, we get a clean
 * timeout error instead of an indefinite hang.
 */
const SLOW_DIRECT_ROUTES: ReadonlySet<string> = new Set<string>([
  "extract-quote",
  "extract-pr",
  "extract-staff-doc",
  "audit-pr-fit",
  "extract-889",
  "ai-assistant",
  "fix-instructions",
  "green-fix-instructions",
  "task-directions",
  "translate",
  "daily-briefing",
  "morning-route",
  "drone/upload",
  "pro-shop-ai",
  "financial-advisor",
  "task-breakdown",
  "bulk-tasks",
  "dd-forms-ai",
]);
const AUTH_TOKEN_TIMEOUT_MS = 5_000;

/**
 * Routes that have been migrated to Supabase Edge Functions.
 * Add a name here AFTER `supabase functions deploy <name>` succeeds.
 */
const EDGE_ROUTES: ReadonlySet<string> = new Set<string>([
  // Phase 2 — deployed on Supabase Edge Functions.
  "ai-assistant",
  "drone/upload",
  "extract-889",
  "extract-quote",
  "extract-pr",
  "extract-staff-doc",
  "audit-pr-fit",
  "fix-instructions",
  "get-weather",
  "green-fix-instructions",
  "task-directions",
  "morning-route",
  "push/send",
  "push/subscribe",
  "spray-window",
  "translate",
  "pro-shop-ai",
  "financial-advisor",
  "task-breakdown",
  "bulk-tasks",
  "dd-forms-ai",
  // pin-signup returns plain JSON ({success, user, session?, error?}) and is
  // called through callApi by the add-staff sheet. pin-login is NOT here —
  // its session persistence is handled at its callsite via
  // supabase.functions.invoke directly (see /pin-login).
  "pin-signup",
]);

export interface CallApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Query params appended to the URL (GET) or forwarded as the body (Edge
   * functions receive them in `body.query`).
   */
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Return the raw Response object instead of JSON. Used for PDF/ZIP
   * downloads where we want the blob.
   */
  raw?: boolean;
}

export interface ApiError extends Error {
  status?: number;
}

/**
 * Find the user's current access token without going through gotrue's
 * navigator.locks-protected getSession(). The reasons:
 *
 *   1. supabase-js's auth lock can be held indefinitely by an abandoned
 *      holder (a hot-reload mid-refresh, a crashed prior call, a tab
 *      that closed without releasing). Once held, every subsequent
 *      auth.getSession() call hangs for the lock — including the one
 *      inside supabase.functions.invoke(), which is what made
 *      "Reading quote with Claude" stall indefinitely with no
 *      breadcrumbs to indicate why.
 *
 *   2. The session is stored as plain JSON in localStorage under
 *      sb-<project-ref>-auth-token (this codebase explicitly uses
 *      @supabase/supabase-js's createClient with default localStorage
 *      storage — see src/lib/supabase/client.ts). Reading it directly
 *      is instant and lock-free.
 *
 * Strategy:
 *   - Try localStorage first. If a non-expired session is there, use it.
 *   - If localStorage is empty or stale, fall back to a 5s-bounded
 *     auth.getSession() call. (The lock is usually free; only abandoned
 *     holders cause the indefinite hang we're guarding against.)
 *   - If both fail, return the anon key so the request still goes out.
 *     Auth-required edge functions will return 401, which surfaces a
 *     clean error instead of a hang.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveAccessToken(supabase: any, supabaseUrl: string, anonKey: string): Promise<string> {
  // 1. Direct localStorage read — instant, no lock.
  if (typeof window !== "undefined" && supabaseUrl) {
    try {
      const projectRef = supabaseUrl.match(/^https?:\/\/([^.]+)\./)?.[1];
      if (projectRef) {
        const raw = window.localStorage.getItem(`sb-${projectRef}-auth-token`);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            access_token?: string;
            expires_at?: number;
          };
          if (parsed?.access_token) {
            // expires_at is unix-seconds. Treat as valid if it's still in the
            // future with a 30s safety margin. If expired, fall through so
            // gotrue can refresh.
            const expiresAt = (parsed.expires_at ?? 0) * 1000;
            if (!expiresAt || expiresAt - Date.now() > 30_000) {
              return parsed.access_token;
            }
          }
        }
      }
    } catch {
      // Corrupt JSON, blocked storage, etc. — fall through.
    }
  }

  // 2. gotrue getSession() with a hard timeout — covers the case where
  //    localStorage is empty, the session is expiring, or a refresh is
  //    needed.
  try {
    const sessionPromise = supabase.auth.getSession();
    const result = await Promise.race([
      sessionPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `auth.getSession() timed out after ${AUTH_TOKEN_TIMEOUT_MS}ms (auth lock likely held by abandoned holder)`,
              ),
            ),
          AUTH_TOKEN_TIMEOUT_MS,
        ),
      ),
    ]);
    const sessionToken = (
      result as { data?: { session?: { access_token?: string } } }
    )?.data?.session?.access_token;
    if (sessionToken) return sessionToken;
  } catch (err) {
    recordBreadcrumb(
      "warn",
      `[callApi] auth fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Last resort.
  return anonKey;
}

/**
 * Build a query string from an object. Skips undefined values.
 */
function buildQuery(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return "";
  const entries = Object.entries(query).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  const params = new URLSearchParams();
  for (const [k, v] of entries) params.set(k, String(v));
  return `?${params.toString()}`;
}

/**
 * Call a migrated endpoint by name.
 *
 *   await callApi<MyResp>("ai-assistant", { method: "POST", body: { prompt } });
 *
 * For GET requests, include `query: { foo: "bar" }`.
 * For binary downloads (PDFs, zips), pass `raw: true` and use the returned
 * Response directly.
 */
export async function callApi<T = unknown>(
  route: string,
  options: CallApiOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {}, query, raw = false } = options;

  // FormData bodies (file uploads) get passed through verbatim.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (EDGE_ROUTES.has(route)) {
    // Supabase Edge Function. JSON bodies are normalized; FormData passes through.
    const supabase = createClient();
    let payload: unknown;
    if (isFormData) {
      payload = body;
    } else if (method === "GET") {
      payload = { query: query ?? {} };
    } else if (query) {
      payload = { ...(body as Record<string, unknown>), query };
    } else {
      payload = body;
    }

    // Edge function slugs use dashes; translate any slash in the route name
    // (e.g. "drone/upload" -> "drone-upload", "push/send" -> "push-send").
    const fnSlug = route.replace(/\//g, "-");

    // ── Slow-route direct fetch path ────────────────────────────────────
    // For long-running endpoints, skip supabase.functions.invoke (which
    // awaits auth.getSession() and can hang on a held navigator.locks
    // auth lock). Pre-fetch the token with a short timeout, then call
    // fetch directly so timeoutFetch breadcrumbs fire.
    if (SLOW_DIRECT_ROUTES.has(route)) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const accessToken = await resolveAccessToken(supabase, supabaseUrl, anonKey);

      const url = `${supabaseUrl}/functions/v1/${fnSlug}`;
      const directHeaders: Record<string, string> = {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...headers,
      };
      const directBody = isFormData
        ? (payload as FormData)
        : payload === undefined
          ? undefined
          : JSON.stringify(payload);

      // 90s ceiling — matches the slow-endpoint timeout in the supabase
      // client. Anthropic vision typically returns in 10-30s; the function's
      // own internal Anthropic timeout is 60s.
      const SLOW_ROUTE_TIMEOUT_MS = 90_000;
      const ac = new AbortController();
      const timer = setTimeout(
        () => ac.abort(new DOMException("Slow route timed out", "TimeoutError")),
        SLOW_ROUTE_TIMEOUT_MS,
      );
      const started = Date.now();
      recordBreadcrumb("fetch", `→ /functions/v1/${fnSlug} (slow direct)`);

      let res: Response;
      try {
        res = await fetch(url, {
          method: method === "GET" ? "POST" : method,
          headers: directHeaders,
          body: directBody,
          signal: ac.signal,
        });
      } catch (err) {
        recordBreadcrumb(
          "error",
          `Fetch failed: /functions/v1/${fnSlug}`,
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      } finally {
        clearTimeout(timer);
      }
      recordBreadcrumb(
        "fetch-done",
        `${res.status} /functions/v1/${fnSlug} (${Date.now() - started}ms)`,
      );

      if (!res.ok) {
        let message = `Edge function ${route} failed: ${res.status} ${res.statusText}`;
        try {
          const errBody = (await res.json()) as { error?: string; message?: string };
          if (errBody.error) message = errBody.error;
          else if (errBody.message) message = errBody.message;
        } catch {
          /* body wasn't JSON */
        }
        const apiErr: ApiError = Object.assign(new Error(message), {
          status: res.status,
        });
        throw apiErr;
      }
      // Slow routes always return JSON in this codebase. (Add raw-blob
      // handling here if a future slow route returns binary.)
      return (await res.json()) as T;
    }

    // ── Default path: supabase-js invoke ────────────────────────────────
    const { data, error } = await supabase.functions.invoke(fnSlug, {
      body: payload as BodyInit | Record<string, unknown> | undefined,
      headers,
      method: method === "GET" ? "POST" : method, // Edge Functions always use POST
    });

    if (error) {
      // FunctionsHttpError carries the raw Response in `context`. Prefer the
      // function's own {error|message} body over the generic supabase-js
      // message — same convention as the slow-direct path above.
      let message = `Edge function ${route} failed: ${error.message}`;
      let status: number | undefined;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        status = ctx.status;
        try {
          const errBody = (await ctx.json()) as { error?: string; message?: string };
          if (errBody.error) message = errBody.error;
          else if (errBody.message) message = errBody.message;
        } catch {
          /* body wasn't JSON */
        }
      }
      const apiErr: ApiError = Object.assign(new Error(message), { status });
      throw apiErr;
    }
    return data as T;
  }

  // Legacy path: fall through to a classic fetch. In the Capacitor build
  // this will 404 until the route is migrated — which is the signal to add
  // it to EDGE_ROUTES above. In the Vercel/main build it still hits the
  // Next.js API route.
  const url = `/api/${route}${buildQuery(query)}`;
  const res = await fetch(url, {
    method,
    headers: {
      // Don't set Content-Type for FormData — browser sets it w/ boundary.
      ...(body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  if (raw) {
    // Caller wants the Response — don't consume the body.
    if (!res.ok) {
      const apiErr: ApiError = Object.assign(
        new Error(`${route} failed: ${res.statusText}`),
        { status: res.status }
      );
      throw apiErr;
    }
    return res as unknown as T;
  }

  if (!res.ok) {
    let message = `${route} failed: ${res.statusText}`;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody.error) message = errBody.error;
      else if (errBody.message) message = errBody.message;
    } catch {
      /* body wasn't JSON */
    }
    const apiErr: ApiError = Object.assign(new Error(message), { status: res.status });
    throw apiErr;
  }

  return (await res.json()) as T;
}
