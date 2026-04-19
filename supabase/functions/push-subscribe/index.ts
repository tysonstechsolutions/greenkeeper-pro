/**
 * push-subscribe — Deno edge function that records a push subscription for
 * the authenticated user. Handles both Web Push (VAPID) and native FCM
 * (Android today, iOS later) in a single endpoint.
 *
 * POST  Body shapes:
 *   Web:     { platform: "web", subscription: PushSubscriptionJSON, user_agent? }
 *   Native:  { platform: "android" | "ios", fcm_token: string, user_agent? }
 *   Legacy (pre-Phase-3.3 web clients): { subscription: ... }  // no platform field
 *
 * DELETE Body shapes:
 *   Web:    { endpoint: string }
 *   Native: { fcm_token: string }
 *
 * Function names can't contain "/" so /api/push/subscribe becomes
 * push-subscribe in the function registry. callApi("push/subscribe", ...)
 * translates the name on the client side.
 *
 * Secrets needed:
 *   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY — for web push (enforced by push-send)
 *   No secrets needed here for FCM; the Android client registers directly
 *   with FCM and only sends the resulting token through this endpoint.
 *
 * Deploy: supabase functions deploy push-subscribe
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

type Platform = "web" | "android" | "ios";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "POST") return handleSubscribe(req);
  if (req.method === "DELETE") return handleUnsubscribe(req);

  return jsonError("Method not allowed", 405);
});

async function handleSubscribe(req: Request): Promise<Response> {
  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const userAgent =
      typeof body?.user_agent === "string" ? body.user_agent : null;

    // Infer platform from the shape if the client didn't send it.
    const declared = typeof body?.platform === "string"
      ? (body.platform as string).toLowerCase()
      : null;
    const platform: Platform = declared === "android" || declared === "ios"
      ? declared
      : "web";

    const supabase = getUserClient(req);
    const nowIso = new Date().toISOString();

    // ── Native (FCM) ────────────────────────────────────────────────────
    if (platform === "android" || platform === "ios") {
      const fcmToken =
        typeof body?.fcm_token === "string" ? body.fcm_token.trim() : "";
      if (!fcmToken) return jsonError("Missing fcm_token", 400);

      const row = {
        user_id: user.id,
        platform,
        fcm_token: fcmToken,
        endpoint: null,
        p256dh: null,
        auth: null,
        user_agent: userAgent,
        last_used_at: nowIso,
      };

      const { data, error } = await supabase
        .from("push_subscriptions")
        .upsert(row, { onConflict: "fcm_token" })
        .select("id")
        .single();

      if (error) {
        console.error("[push-subscribe] native upsert failed:", error);
        return jsonError(error.message || "Failed to save subscription", 500);
      }
      return jsonResponse({ success: true, id: data?.id ?? null });
    }

    // ── Web (VAPID) ──────────────────────────────────────────────────────
    if (
      !Deno.env.get("VAPID_PRIVATE_KEY") ||
      !Deno.env.get("VAPID_PUBLIC_KEY")
    ) {
      return jsonError("Web push not configured on server", 503);
    }

    const subscription = body?.subscription as
      | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      | undefined;

    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      !subscription.keys ||
      typeof subscription.keys.p256dh !== "string" ||
      typeof subscription.keys.auth !== "string"
    ) {
      return jsonError("Invalid subscription payload", 400);
    }

    const row = {
      user_id: user.id,
      platform: "web" as const,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      fcm_token: null,
      user_agent: userAgent,
      last_used_at: nowIso,
    };

    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" })
      .select("id")
      .single();

    if (error) {
      console.error("[push-subscribe] web upsert failed:", error);
      return jsonError(error.message || "Failed to save subscription", 500);
    }
    return jsonResponse({ success: true, id: data?.id ?? null });
  } catch (err) {
    console.error("[push-subscribe] unexpected error:", err);
    return jsonError("Unexpected error", 500);
  }
}

async function handleUnsubscribe(req: Request): Promise<Response> {
  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    const fcmToken =
      typeof body?.fcm_token === "string" ? body.fcm_token : null;

    if (!endpoint && !fcmToken) {
      return jsonError("Missing endpoint or fcm_token", 400);
    }

    const supabase = getUserClient(req);
    let query = supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id);

    query = fcmToken
      ? query.eq("fcm_token", fcmToken)
      : query.eq("endpoint", endpoint!);

    const { error } = await query;
    if (error) {
      console.error("[push-subscribe] delete failed:", error);
      return jsonError(error.message || "Failed to delete subscription", 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[push-subscribe DELETE] unexpected error:", err);
    return jsonError("Unexpected error", 500);
  }
}
