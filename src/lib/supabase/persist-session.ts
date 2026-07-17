/**
 * Directly persist a Supabase session to localStorage, bypassing
 * `supabase.auth.setSession()`.
 *
 * Why: setSession on this app has been consistently hanging on first PIN
 * login. Under the hood setSession does three things:
 *   1. Write tokens to the auth storage (synchronous, fast)
 *   2. Call getUser() to decode user info (network round trip)
 *   3. Notify every onAuthStateChange listener (acquires navigator.locks,
 *      triggers realtime reconnects, etc. — this is where it hangs)
 *
 * Step 1 is all we actually need for the user to "be logged in" from the
 * next page load's perspective. Steps 2 and 3 can happen later, after
 * we've redirected. The AuthProvider's `getSession()` call on mount reads
 * from storage — if the tokens are there, the user is authenticated.
 *
 * This helper writes the exact same JSON shape that supabase-js's
 * internal _saveSession writes, under the same storage key, then returns.
 * On the destination page (/dashboard), AuthProvider re-initializes,
 * calls getSession(), finds the tokens, fetches the user — everything
 * works without a 5+ second "Verifying..." block.
 *
 * Storage key format is `sb-<project-ref>-auth-token` where <project-ref>
 * is the subdomain of the Supabase project URL.
 */

import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

interface SessionInput {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
}

interface JwtClaims {
  sub?: string;
  email?: string;
  phone?: string;
  aud?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  iat?: number;
  exp?: number;
}

/**
 * Decode the payload section of a JWT without verifying the signature.
 * Returns null if the token is malformed.
 */
function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    // Base64url → base64, then atob, then JSON.parse.
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Derive the localStorage key Supabase uses for session storage from
 * NEXT_PUBLIC_SUPABASE_URL. `https://abcdefghij.supabase.co` → `sb-abcdefghij-auth-token`.
 */
export function supabaseAuthStorageKey(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const projectRef = hostname.split(".")[0];
    if (!projectRef) throw new Error("Missing project reference");
    return `sb-${projectRef}-auth-token`;
  } catch {
    throw new Error(
      "Could not derive Supabase storage key from NEXT_PUBLIC_SUPABASE_URL",
    );
  }
}

function getStorageKey(): string {
  return supabaseAuthStorageKey(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

/**
 * Write a session to localStorage in the exact shape supabase-js expects.
 * Call this immediately after a successful login and follow it with a
 * hard navigation (`window.location.href = "/dashboard"`) — do NOT call
 * `supabase.auth.setSession` as well, it will re-serialize the same data
 * and can hang on the onAuthStateChange notification path.
 *
 * Returns synchronously on success; throws on bad config.
 */
export function persistSessionDirect(session: SessionInput): void {
  if (typeof window === "undefined") return;

  const claims = decodeJwt(session.access_token);
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = session.expires_in ?? (claims?.exp ? claims.exp - now : 3600);
  const expiresAt = session.expires_at ?? claims?.exp ?? now + expiresIn;

  // Shape mirrors supabase-js's Session type. `user` is populated from
  // JWT claims so AuthProvider's getSession() can hand it to React
  // context immediately — no follow-up getUser() network call needed
  // for the login-page handoff.
  const user = claims?.sub
    ? {
        id: claims.sub,
        aud: claims.aud ?? "authenticated",
        role: claims.role ?? "authenticated",
        email: claims.email ?? null,
        phone: claims.phone ?? null,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
        created_at: claims.iat
          ? new Date(claims.iat * 1000).toISOString()
          : new Date().toISOString(),
      }
    : null;

  const sessionBlob = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: session.token_type ?? "bearer",
    user,
    provider_token: null,
    provider_refresh_token: null,
  };

  try {
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(sessionBlob));
    recordBreadcrumb(
      "lifecycle",
      `persistSessionDirect: stored at ${key} (user ${user?.id ?? "unknown"})`,
    );
  } catch (err) {
    recordBreadcrumb(
      "error",
      `persistSessionDirect: localStorage write failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}
