/**
 * pin-signup — Deno edge function port of /api/auth/pin-signup.
 *
 * Creates a new PIN-authenticated user from an invite token:
 *   1. Validate invite token (not used, not expired).
 *   2. Confirm the chosen PIN isn't already in use.
 *   3. Create the auth.users row via admin client (skips email confirm).
 *   4. Upsert the profiles row (idempotent in case a trigger already ran).
 *   5. Insert pin_codes row.
 *   6. Mark invite used.
 *   7. Sign the new user in and return a session for the client to apply.
 *
 * Auth: public (unauthenticated caller — the invite token is the gate).
 * Secrets needed: PIN_USER_PASSWORD
 *
 * Deploy:  supabase functions deploy pin-signup --no-verify-jwt
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PIN_USER_PASSWORD = Deno.env.get("PIN_USER_PASSWORD") ??
  Deno.env.get("NEXT_PIN_USER_PASSWORD") ?? "";

type InviteRecord = {
  id: string;
  token: string;
  role: string;
  email: string | null;
  expires_at: string;
  used_by: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "user";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  if (!PIN_USER_PASSWORD) {
    return jsonError(
      "PIN signup is not configured. Contact your administrator.",
      500,
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown;
      fullName?: unknown;
      phone?: unknown;
      pin?: unknown;
    };

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phone = typeof body.phone === "string" && body.phone.trim()
      ? body.phone.trim()
      : null;
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";

    if (!token) return jsonError("Missing invite token.", 400);
    if (!fullName || fullName.length < 2) {
      return jsonError("Please enter your full name.", 400);
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return jsonError("PIN must be 4–6 digits.", 400);
    }

    const admin = getAdminClient();

    // 1. Validate invite
    const { data: inviteData } = await admin
      .from("invites")
      .select("id, token, role, email, expires_at, used_by")
      .eq("token", token)
      .single();

    if (!inviteData) {
      return jsonError("Invalid or expired invite.", 400);
    }
    const invite = inviteData as InviteRecord;
    if (invite.used_by) {
      return jsonError("This invite has already been used.", 400);
    }
    if (new Date(invite.expires_at) < new Date()) {
      return jsonError("This invite has expired.", 400);
    }

    // 2. PIN uniqueness
    const { data: existingPin } = await admin
      .from("pin_codes")
      .select("pin")
      .eq("pin", pin)
      .eq("is_active", true)
      .maybeSingle();

    if (existingPin) {
      return jsonError(
        "That PIN is already in use. Please pick a different one.",
        409,
      );
    }

    // 3. Derive auth email
    const email = invite.email && invite.email.includes("@")
      ? invite.email
      : `${slugify(fullName)}.${pin}@vmgc.mil`;

    // 4. Create auth user (admin API bypasses email confirmation)
    const { data: createData, error: createError } = await admin.auth.admin
      .createUser({
        email,
        password: PIN_USER_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: invite.role,
        },
      });

    if (createError || !createData.user) {
      console.error("PIN signup: auth createUser failed", createError);
      return jsonError(
        createError?.message || "Failed to create account.",
        400,
      );
    }

    const newUser = createData.user;

    // 5. Upsert profile (trigger may have already inserted)
    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: newUser.id,
          email,
          full_name: fullName,
          phone,
          role: invite.role,
        },
        { onConflict: "id" },
      );
    if (profileError) {
      console.error("PIN signup: profile upsert failed", profileError);
    }

    // 6. Insert pin_codes row
    const { error: pinError } = await admin
      .from("pin_codes")
      .insert({
        pin,
        user_id: newUser.id,
        is_active: true,
      });
    if (pinError) {
      console.error("PIN signup: pin_codes insert failed", pinError);
      return jsonError(
        "Account created but PIN could not be set. Contact your administrator.",
        500,
      );
    }

    // 7. Mark invite used
    await admin
      .from("invites")
      .update({ used_by: newUser.id, used_at: new Date().toISOString() })
      .eq("id", invite.id);

    // 8. Sign the new user in so the client can apply the session
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: signInError } = await anon.auth
      .signInWithPassword({
        email,
        password: PIN_USER_PASSWORD,
      });

    if (signInError) {
      console.error("PIN signup: sign-in after signup failed", signInError);
      // Non-fatal: account exists, user can go to /pin-login.
    }

    // All roles land on /dashboard — /pro-dashboard was removed.
    const redirectPath = "/dashboard";

    return jsonResponse({
      success: true,
      user: { id: newUser.id, name: fullName, role: invite.role },
      session: authData?.session
        ? {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
          expires_at: authData.session.expires_at,
          token_type: authData.session.token_type,
        }
        : null,
      redirectPath,
    });
  } catch (err) {
    console.error("PIN signup error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
