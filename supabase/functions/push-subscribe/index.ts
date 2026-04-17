/**
 * push-subscribe — Deno edge function port of /api/push/subscribe.
 *
 * POST: upserts a web-push subscription for the authenticated user, keyed
 *       by endpoint. Body: { subscription: PushSubscriptionJSON, user_agent?: string }
 *
 * DELETE: removes a subscription by endpoint for the authenticated user.
 *         Body: { endpoint: string }
 *
 * Note: edge function names can't contain `/`, so the old /api/push/subscribe
 * route is called "push-subscribe" in the function registry. The client's
 * callApi("push-subscribe", ...) wrapper handles the naming.
 *
 * Secrets: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY
 *
 * Deploy: supabase functions deploy push-subscribe
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "POST") return handleSubscribe(req);
  if (req.method === "DELETE") return handleUnsubscribe(req);

  return jsonError("Method not allowed", 405);
});

async function handleSubscribe(req: Request): Promise<Response> {
  if (
    !Deno.env.get("VAPID_PRIVATE_KEY") ||
    !Deno.env.get("VAPID_PUBLIC_KEY")
  ) {
    return jsonError("Push not configured", 503);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const subscription = body?.subscription;
    const userAgent =
      typeof body?.user_agent === "string" ? body.user_agent : null;

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
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    };

    const supabase = getUserClient(req);
    const { data, error: upsertError } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" })
      .select("id")
      .single();

    if (upsertError) {
      console.error("[push-subscribe] upsert failed:", upsertError);
      return jsonError(
        upsertError.message || "Failed to save subscription",
        500,
      );
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

    const body = await req.json().catch(() => ({}));
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string" || !endpoint) {
      return jsonError("Missing endpoint", 400);
    }

    const supabase = getUserClient(req);
    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[push-subscribe] delete failed:", deleteError);
      return jsonError(
        deleteError.message || "Failed to delete subscription",
        500,
      );
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[push-subscribe DELETE] unexpected error:", err);
    return jsonError("Unexpected error", 500);
  }
}
