/**
 * pin-login — Deno edge function port of /api/auth/pin-login.
 *
 * Verifies a 4-6 digit PIN and signs the user in. The shared PIN password
 * is server-side only (PIN_USER_PASSWORD secret); the PIN itself is the
 * real auth factor.
 *
 * Flow:
 *   1. IP-based rate limit (5 attempts per minute per isolate).
 *   2. Admin client looks up the active pin → user_id.
 *   3. Admin client fetches the user's email from profiles.
 *   4. Anon client calls signInWithPassword — returns a session.
 *   5. Return { session, user, redirectPath } to the client, which then
 *      calls supabase.auth.setSession(...) to apply it.
 *
 * Auth: public (unauthenticated caller).
 * Secrets needed: PIN_USER_PASSWORD
 *
 * Deploy:  supabase functions deploy pin-login --no-verify-jwt
 *
 * The --no-verify-jwt flag is important — by default Supabase rejects
 * unauthenticated requests to edge functions. Login has to be reachable
 * pre-auth, so we turn that off and do our own rate-limiting + validation.
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PIN_USER_PASSWORD = Deno.env.get("PIN_USER_PASSWORD") ??
  Deno.env.get("NEXT_PIN_USER_PASSWORD") ?? "";

// ── Rate limit (per-isolate, resets when Deno recycles) ─────────────────────

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  if (!PIN_USER_PASSWORD) {
    console.error("PIN_USER_PASSWORD secret is not set");
    return jsonError(
      "PIN login is not configured. Contact your administrator.",
      500,
    );
  }

  // Rate-limit by IP
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return jsonError(
      "Too many PIN attempts. Please wait a minute and try again.",
      429,
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin : "";

    if (!pin || pin.length < 4 || pin.length > 6) {
      return jsonError("Please enter a valid 4-6 digit PIN", 400);
    }

    const admin = getAdminClient();

    // 1. Find the PIN → user_id
    const { data: pinRecord, error: pinErr } = await admin
      .from("pin_codes")
      .select("user_id, is_active")
      .eq("pin", pin)
      .eq("is_active", true)
      .single();

    if (pinErr || !pinRecord) {
      // Diagnostic logging — surfaces RLS / permission errors that the
      // legacy code silently treated as "no match". Keep until pin-login
      // is proven stable in production, then tighten back to data-only.
      console.error("PIN lookup failed:", {
        pinLen: pin.length,
        errCode: pinErr?.code,
        errMsg: pinErr?.message,
        errDetails: pinErr?.details,
        errHint: pinErr?.hint,
        hasRecord: !!pinRecord,
      });
      return jsonError("Invalid PIN. Please try again.", 401);
    }

    // 2. Fetch the user's email + profile
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name, role")
      .eq("id", (pinRecord as { user_id: string }).user_id)
      .single();

    if (!profile) {
      return jsonError(
        "User account not found. Contact your superintendent.",
        404,
      );
    }
    const p = profile as { email: string; full_name: string; role: string };

    // 3. Sign in via anon client — returns a session
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await anon.auth
      .signInWithPassword({
        email: p.email,
        password: PIN_USER_PASSWORD,
      });

    if (authError || !authData.session) {
      console.error(
        "PIN auth sign-in failed:",
        authError?.message,
        "code:",
        authError?.code,
        "status:",
        authError?.status,
      );
      return jsonError(
        "PIN login failed. Please contact your superintendent.",
        401,
      );
    }

    // 4. All roles land on /dashboard — the old /pro-dashboard route was
    //    removed when we consolidated to a single dashboard.
    const redirectPath = "/dashboard";

    return jsonResponse({
      success: true,
      user: {
        id: authData.user?.id,
        name: p.full_name,
        role: p.role,
      },
      // The client applies this via supabase.auth.setSession({ access_token, refresh_token }).
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
        expires_at: authData.session.expires_at,
        token_type: authData.session.token_type,
      },
      redirectPath,
    });
  } catch (err) {
    console.error("PIN login error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
