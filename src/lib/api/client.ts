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
  // Phase 2 — deployed on Supabase Edge Functions.
  "ai-assistant",
  "drone/upload",
  "extract-889",
  "extract-quote",
  "fix-instructions",
  "get-weather",
  "green-fix-instructions",
  "morning-route",
  "push/send",
  "push/subscribe",
  "spray-window",
  "translate",
  // Auth functions (pin-login, pin-signup) have a special return shape
  // (session tokens) handled at their callsites, not via callApi.
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
    const { data, error } = await supabase.functions.invoke(fnSlug, {
      body: payload as BodyInit | Record<string, unknown> | undefined,
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
