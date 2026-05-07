/**
 * Direct PostgREST fetch helpers.
 *
 * Why: supabase-js's query builder has been hanging silently on PATCH/INSERT
 * calls issued immediately after a Storage upload. The query builder's
 * `await builder.then()` never fires `fetch`, no breadcrumb, no timeout, no
 * error — it just blocks forever. Reproduced three builds in a row on
 * the asset photo upload path (see `uploadPhoto: uploaded ...` followed by
 * 51+ seconds of dead silence in the debug log).
 *
 * These helpers bypass supabase-js entirely. They:
 *   - read the current access token straight from localStorage
 *   - build the PostgREST HTTP request by hand
 *   - use the native window.fetch with a hard AbortController timeout
 *   - record breadcrumbs at every step so any failure is visible
 *
 * The RLS policies on the tables still apply — the access token is real,
 * just we're not routing the call through the supabase-js builder queue.
 */

import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface DirectFetchOptions {
  /** Operation label for breadcrumbs, e.g. "patch fy26_assets.condition_photos" */
  label: string;
  /** Timeout in ms. Default 15s. */
  timeoutMs?: number;
  /** Extra headers (e.g. Prefer: return=representation) */
  headers?: Record<string, string>;
}

/**
 * Cached session shape — what supabase-js writes to localStorage. The
 * library has additional fields we don't care about; we just declare what
 * we read. All fields are optional because corrupt/partial caches happen.
 */
interface CachedSessionShape {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: {
    id?: string;
    email?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * Synchronous read of the persisted Supabase session from localStorage.
 * The single source of truth for everything in this file that needs auth
 * info without going through supabase-js's auth manager.
 *
 * Returns null on SSR, missing project URL, missing session, or parse
 * error. Never throws. Never blocks.
 */
function readCachedSession(): CachedSessionShape | null {
  if (typeof window === "undefined") return null;
  const match = SUPABASE_URL.match(/https?:\/\/([^./]+)\.supabase\./);
  if (!match) return null;
  const key = `sb-${match[1]}-auth-token`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CachedSessionShape;
  } catch {
    return null;
  }
}

/**
 * Read the current Supabase session's access token directly from
 * localStorage. Bypasses `supabase.auth.getSession()` entirely — that
 * call goes through supabase-js's auth manager which has been the source
 * of the silent hangs we've been chasing.
 *
 * Synchronous. No network, no navigator.locks, no auth-state event
 * propagation.
 */
function getAccessTokenSync(): string | null {
  return readCachedSession()?.access_token ?? null;
}

/**
 * Read the signed-in user's id from the cached session. Drop-in
 * replacement for `(await supabase.auth.getUser()).data.user?.id` that
 * can't wedge.
 *
 * Most call-sites only need the user id (for setting `created_by`,
 * `owner_id`, etc.) — this saves them from the auth-wrapper round trip.
 */
export function getCachedUserId(): string | null {
  return readCachedSession()?.user?.id ?? null;
}

/**
 * Read the signed-in user from the cached session. Drop-in replacement
 * for `(await supabase.auth.getUser()).data.user`.
 *
 * Returns the user shape supabase persisted (id + email + metadata) — not
 * a full Supabase `User` instance, but enough for everything we use
 * `auth.getUser()` for in this codebase.
 */
export function getCachedUser(): { id: string; email?: string } | null {
  const u = readCachedSession()?.user;
  if (!u || typeof u.id !== "string") return null;
  return { id: u.id, email: typeof u.email === "string" ? u.email : undefined };
}

/**
 * True when there's a non-expired cached session present. Use this in
 * place of `await supabase.auth.getSession()` when all you need is a
 * yes/no signed-in check (e.g. before issuing a write that requires RLS).
 */
export function hasValidCachedSession(): boolean {
  const s = readCachedSession();
  if (!s?.access_token) return false;
  if (typeof s.expires_at === "number") {
    // 30s safety buffer.
    if (Date.now() / 1000 >= s.expires_at - 30) return false;
  }
  return true;
}

function buildHeaders(
  accessToken: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

function buildUrl(path: string): string {
  // Normalize leading slashes.
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const pathPart = path.replace(/^\/+/, "");
  return `${base}/${pathPart}`;
}

async function directFetch(
  method: string,
  path: string,
  body: unknown,
  opts: DirectFetchOptions,
): Promise<unknown> {
  const url = buildUrl(path);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  recordBreadcrumb("fetch", `direct ${method} ${path} (${opts.label})`);

  const accessToken = getAccessTokenSync();
  if (!accessToken) {
    recordBreadcrumb("error", `${opts.label}: no access token in localStorage`);
    throw new Error(
      "You're not signed in. Please close and reopen the app to sign in again.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("timeout", "TimeoutError"));
  }, timeoutMs);

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: buildHeaders(accessToken, opts.headers),
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const elapsed = Date.now() - started;

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      recordBreadcrumb(
        "error",
        `${opts.label}: HTTP ${res.status} in ${elapsed}ms — ${text.slice(0, 120)}`,
      );
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    recordBreadcrumb(
      "fetch-done",
      `direct ${method} ${path} → ${res.status} (${elapsed}ms)`,
    );

    // Empty-body responses (e.g. PATCH with Prefer:return=minimal) — don't
    // try to JSON-parse "".
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return null;
  } catch (err) {
    const elapsed = Date.now() - started;
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      recordBreadcrumb(
        "timeout",
        `${opts.label}: aborted after ${elapsed}ms (limit ${timeoutMs}ms)`,
      );
    } else {
      recordBreadcrumb(
        "error",
        `${opts.label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * PATCH a single row identified by the column/value pair. Mirrors
 * `supabase.from(table).update(patch).eq(idColumn, idValue)`.
 *
 * Uses `Prefer: return=minimal` so there's no response body — faster and
 * avoids any ambiguity about result parsing. Throws on non-2xx.
 */
export async function directPatchRow(
  table: string,
  idColumn: string,
  idValue: string,
  patch: Record<string, unknown>,
  label: string,
): Promise<void> {
  const path = `rest/v1/${table}?${encodeURIComponent(idColumn)}=eq.${encodeURIComponent(idValue)}`;
  await directFetch("PATCH", path, patch, {
    label,
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * PATCH a row and return the updated row. Like supabase-js's
 * `.update(...).eq(...).select().single()`.
 */
export async function directPatchRowReturning<T = unknown>(
  table: string,
  idColumn: string,
  idValue: string,
  patch: Record<string, unknown>,
  label: string,
): Promise<T> {
  const path = `rest/v1/${table}?${encodeURIComponent(idColumn)}=eq.${encodeURIComponent(idValue)}`;
  const result = (await directFetch("PATCH", path, patch, {
    label,
    headers: { Prefer: "return=representation" },
  })) as T[] | T;
  if (Array.isArray(result)) return result[0] as T;
  return result as T;
}

/**
 * INSERT a single row. Returns the inserted row (via Prefer:return=representation).
 */
export async function directInsertRow<T = unknown>(
  table: string,
  row: Record<string, unknown>,
  label: string,
): Promise<T> {
  const path = `rest/v1/${table}`;
  const result = await directFetch("POST", path, row, {
    label,
    headers: { Prefer: "return=representation" },
  }) as T[] | T;
  // PostgREST returns an array even for single-row inserts.
  if (Array.isArray(result)) return result[0] as T;
  return result as T;
}

/**
 * GET a single row by id. Mirrors `supabase.from(table).select(...).eq(idColumn, idValue).single()`.
 * Returns null if not found (rather than throwing).
 */
export async function directSelectRow<T = unknown>(
  table: string,
  idColumn: string,
  idValue: string,
  columns: string,
  label: string,
): Promise<T | null> {
  const path = `rest/v1/${table}?select=${encodeURIComponent(columns)}&${encodeURIComponent(idColumn)}=eq.${encodeURIComponent(idValue)}&limit=1`;
  const result = (await directFetch("GET", path, null, { label })) as T[] | null;
  if (!Array.isArray(result) || result.length === 0) return null;
  return result[0] as T;
}

export interface DirectListOrder {
  column: string;
  ascending?: boolean;
  /**
   * Controls NULL ordering. Mirrors supabase-js's `nullsFirst` option:
   *   undefined  → PostgREST default (nullsfirst on asc, nullslast on desc)
   *   true       → append `.nullsfirst`
   *   false      → append `.nullslast`
   */
  nullsFirst?: boolean;
}

export interface DirectListOptions {
  columns?: string;
  /** Each filter is `column=<operator>.<value>` — e.g. `status=eq.verified_present`. */
  filters?: string[];
  orderBy?: DirectListOrder[];
  limit?: number;
  /** PostgREST `or=(x.eq.1,y.eq.2)` filter — pass the inside parens string. */
  or?: string;
  label: string;
}

/**
 * GET multiple rows with optional filters + ordering + limit. Equivalent to
 * `supabase.from(table).select(columns).eq(...).order(...).limit(...)`.
 */
export async function directSelectList<T = unknown>(
  table: string,
  options: DirectListOptions,
): Promise<T[]> {
  const {
    columns = "*",
    filters = [],
    orderBy = [],
    limit,
    or,
    label,
  } = options;

  const qs: string[] = [];
  qs.push(`select=${encodeURIComponent(columns)}`);
  for (const f of filters) qs.push(f);
  if (or) qs.push(`or=(${or})`);
  for (const o of orderBy) {
    const dir = o.ascending === false ? "desc" : "asc";
    let clause = `${encodeURIComponent(o.column)}.${dir}`;
    if (o.nullsFirst === true) clause += ".nullsfirst";
    else if (o.nullsFirst === false) clause += ".nullslast";
    qs.push(`order=${clause}`);
  }
  if (typeof limit === "number") qs.push(`limit=${limit}`);

  const path = `rest/v1/${table}?${qs.join("&")}`;
  const result = (await directFetch("GET", path, null, { label })) as T[] | null;
  return Array.isArray(result) ? result : [];
}

/**
 * DELETE a row identified by column=value. Mirrors
 * `supabase.from(table).delete().eq(idColumn, idValue)`.
 */
export async function directDeleteRow(
  table: string,
  idColumn: string,
  idValue: string,
  label: string,
): Promise<void> {
  const path = `rest/v1/${table}?${encodeURIComponent(idColumn)}=eq.${encodeURIComponent(idValue)}`;
  await directFetch("DELETE", path, null, {
    label,
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * INSERT multiple rows in one request. Mirrors `.insert([...])`.
 * Returns the inserted rows.
 */
export async function directInsertRows<T = unknown>(
  table: string,
  rows: Record<string, unknown>[],
  label: string,
): Promise<T[]> {
  if (rows.length === 0) return [];
  const path = `rest/v1/${table}`;
  const result = (await directFetch("POST", path, rows, {
    label,
    headers: { Prefer: "return=representation" },
  })) as T[] | T;
  return Array.isArray(result) ? (result as T[]) : [result as T];
}

/**
 * PATCH multiple rows by an arbitrary filter set (compound WHERE).
 * Each filter is `column=<operator>.<value>` (PostgREST string syntax).
 * Mirrors `supabase.from(t).update(patch).eq("a", x).eq("b", y).gte(...)`.
 */
export async function directPatchByFilter(
  table: string,
  filters: string[],
  patch: Record<string, unknown>,
  label: string,
): Promise<void> {
  if (filters.length === 0) {
    throw new Error(
      `directPatchByFilter(${label}): refusing to PATCH all rows — at least one filter is required`,
    );
  }
  const path = `rest/v1/${table}?${filters.join("&")}`;
  await directFetch("PATCH", path, patch, {
    label,
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * DELETE multiple rows by an arbitrary filter set. Mirrors
 * `supabase.from(t).delete().eq("a", x).eq("b", y)`.
 */
export async function directDeleteByFilter(
  table: string,
  filters: string[],
  label: string,
): Promise<void> {
  if (filters.length === 0) {
    throw new Error(
      `directDeleteByFilter(${label}): refusing to DELETE all rows — at least one filter is required`,
    );
  }
  const path = `rest/v1/${table}?${filters.join("&")}`;
  await directFetch("DELETE", path, null, {
    label,
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * Get a row count via PostgREST's `Prefer: count=exact` header.
 * Equivalent to `supabase.from(t).select("*", { count: "exact", head: true })`.
 *
 * Returns 0 if the response doesn't include a parseable count.
 */
export async function directSelectCount(
  table: string,
  filters: string[],
  label: string,
): Promise<number> {
  const qs = ["select=*", "limit=0", ...filters];
  const path = `rest/v1/${table}?${qs.join("&")}`;
  // We need access to response headers — directFetch returns parsed JSON.
  // Replicate the auth-token + apikey handshake here for one-off count.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  // Defer to localStorage for the user JWT — same pattern useProfiles uses.
  let token = "";
  try {
    const keys = Object.keys(localStorage).filter((k) => k.includes("auth-token"));
    for (const k of keys) {
      const v = JSON.parse(localStorage.getItem(k) ?? "null");
      if (v?.access_token) {
        token = v.access_token;
        break;
      }
    }
  } catch {
    // SSR or no localStorage — token stays empty, request will use anon role.
  }
  const res = await fetch(`${supabaseUrl}/${path}`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    throw new Error(`directSelectCount(${label}): ${res.status} ${res.statusText}`);
  }
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const total = parseInt(range.split("/")[1] ?? "0", 10);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Upload a file to a Supabase Storage bucket via direct fetch. Bypasses
 * the supabase-js storage client, which has been occasionally leaving
 * the auth layer in a weird state after a successful upload (second
 * upload sometimes hangs pre-fetch). This variant only talks to the
 * Storage REST endpoint directly with a raw bearer token.
 *
 * Returns the object path on success. Throws on non-2xx.
 */
export async function directStorageUpload(
  bucket: string,
  path: string,
  file: File,
  label: string,
): Promise<string> {
  const url = buildUrl(`storage/v1/object/${bucket}/${path}`);
  const timeoutMs = 30_000; // storage uploads can legitimately take a while on cell data

  recordBreadcrumb(
    "fetch",
    `direct POST storage/${bucket}/${path} (${Math.round(file.size / 1024)}KB, ${label})`,
  );

  const accessToken = getAccessTokenSync();
  if (!accessToken) {
    recordBreadcrumb("error", `${label}: no access token for storage upload`);
    throw new Error(
      "You're not signed in. Please close and reopen the app to sign in again.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("timeout", "TimeoutError"));
  }, timeoutMs);

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "3600",
        "x-upsert": "false",
      },
      body: file,
      signal: controller.signal,
    });
    const elapsed = Date.now() - started;

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      recordBreadcrumb(
        "error",
        `${label}: storage HTTP ${res.status} in ${elapsed}ms — ${text.slice(0, 160)}`,
      );
      throw new Error(`Storage upload HTTP ${res.status}: ${text}`);
    }

    recordBreadcrumb(
      "fetch-done",
      `direct POST storage/${bucket}/${path} → ${res.status} (${elapsed}ms)`,
    );
    return path;
  } catch (err) {
    const elapsed = Date.now() - started;
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      recordBreadcrumb(
        "timeout",
        `${label}: storage upload aborted after ${elapsed}ms`,
      );
    } else if (!(err instanceof Error && err.message.startsWith("Storage upload HTTP"))) {
      recordBreadcrumb(
        "error",
        `${label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the public URL for an object in a public bucket. Equivalent to
 * supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl.
 */
export function publicStorageUrl(bucket: string, path: string): string {
  const base = SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Delete one or more objects from a Storage bucket via direct fetch.
 * Mirrors `supabase.storage.from(bucket).remove(paths)`. Throws on non-2xx.
 */
export async function directStorageDelete(
  bucket: string,
  paths: string[],
  label: string,
): Promise<void> {
  const url = buildUrl(`storage/v1/object/${bucket}`);
  const timeoutMs = 15_000;

  recordBreadcrumb(
    "fetch",
    `direct DELETE storage/${bucket} [${paths.length} path(s)] (${label})`,
  );

  const accessToken = getAccessTokenSync();
  if (!accessToken) {
    recordBreadcrumb("error", `${label}: no access token for storage delete`);
    throw new Error(
      "You're not signed in. Please close and reopen the app to sign in again.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("timeout", "TimeoutError"));
  }, timeoutMs);

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ prefixes: paths }),
      signal: controller.signal,
    });
    const elapsed = Date.now() - started;

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      recordBreadcrumb(
        "error",
        `${label}: storage DELETE HTTP ${res.status} in ${elapsed}ms — ${text.slice(0, 160)}`,
      );
      throw new Error(`Storage delete HTTP ${res.status}: ${text}`);
    }

    recordBreadcrumb(
      "fetch-done",
      `direct DELETE storage/${bucket} → ${res.status} (${elapsed}ms)`,
    );
  } catch (err) {
    const elapsed = Date.now() - started;
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      recordBreadcrumb(
        "timeout",
        `${label}: storage delete aborted after ${elapsed}ms`,
      );
    } else if (!(err instanceof Error && err.message.startsWith("Storage delete HTTP"))) {
      recordBreadcrumb(
        "error",
        `${label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
