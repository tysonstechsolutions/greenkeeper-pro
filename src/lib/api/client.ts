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

/**
 * Routes that have been migrated to Supabase Edge Functions.
 * Add a name here AFTER `supabase functions deploy <name>` succeeds.
 */
const EDGE_ROUTES: ReadonlySet<string> = new Set<string>([
  // Phase 2 progress — add routes here as they ship:
  // "translate",
  // "spray-window",
  // "push",
  // "ai-assistant",
  // ...
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

  if (EDGE_ROUTES.has(route)) {
    // Call Supabase Edge Function. `body` here is normalized: for GET we
    // send `{ query }`, for other verbs we send `body` merged with `query`.
    const supabase = createClient();
    const payload =
      method === "GET"
        ? { query: query ?? {} }
        : query
          ? { ...(body as Record<string, unknown>), query }
          : body;

    const { data, error } = await supabase.functions.invoke(route, {
      body: payload,
      headers,
      method: method === "GET" ? "POST" : method, // Edge Functions always use POST
    });

    if (error) {
      const apiErr: ApiError = Object.assign(
        new Error(`Edge function ${route} failed: ${error.message}`),
        {}
      );
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
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
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
