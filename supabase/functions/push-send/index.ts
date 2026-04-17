/**
 * push-send — Deno edge function port of /api/push/send.
 *
 * Dispatches a VAPID web-push to every subscription belonging to any user
 * in user_ids. Staff roles (super, asst_super, director, foreman) can push
 * to arbitrary users; everyone else can only push to themselves (self-test).
 *
 * Dead endpoints (410 Gone / 404) are pruned automatically.
 *
 * Deno imports the npm web-push library directly — no build step, no
 * transpilation, just runs.
 *
 * Body: { user_ids: string[], title: string, body: string, url?: string }
 * Secrets: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
 *
 * Deploy: supabase functions deploy push-send
 */
import webpush from "npm:web-push@3.6.7";
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const STAFF_ROLES = new Set(["super", "asst_super", "director", "foreman"]);

interface PushRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!vapidPrivate || !vapidPublic) {
    console.error("[push-send] VAPID keys not configured");
    return jsonError("Push not configured", 503);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const userIds: unknown = body?.user_ids;
    const title: unknown = body?.title;
    const messageBody: unknown = body?.body;
    const url: unknown = body?.url;

    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every((u) => typeof u === "string") ||
      typeof title !== "string" ||
      typeof messageBody !== "string" ||
      (url !== undefined && typeof url !== "string")
    ) {
      return jsonError("Invalid payload", 400);
    }

    const supabase = getUserClient(req);

    // Look up sender role to gate cross-user push
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = (profile as { role?: string } | null)?.role;
    const isStaff = typeof role === "string" && STAFF_ROLES.has(role);

    let targetUserIds = userIds as string[];
    if (!isStaff) {
      targetUserIds = targetUserIds.filter((id) => id === user.id);
      if (targetUserIds.length === 0) {
        return jsonError(
          "Forbidden: non-staff can only push to self",
          403,
        );
      }
    }

    // Fetch subscriptions
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", targetUserIds);

    if (subsErr) {
      console.error("[push-send] fetch subs failed:", subsErr);
      return jsonError(subsErr.message || "Failed to load subscriptions", 500);
    }
    if (!subs || subs.length === 0) {
      return jsonResponse({ sent: 0, failed: 0, pruned: 0 });
    }

    const payload = JSON.stringify({
      title,
      body: messageBody,
      url: typeof url === "string" ? url : undefined,
    });

    let sent = 0;
    let failed = 0;
    const prunedEndpoints: string[] = [];

    await Promise.all(
      (subs as PushRow[]).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          failed++;
          // Dead subscription — remove it
          if (statusCode === 404 || statusCode === 410) {
            prunedEndpoints.push(sub.endpoint);
          }
        }
      }),
    );

    if (prunedEndpoints.length > 0) {
      const { error: pruneErr } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", prunedEndpoints);
      if (pruneErr) {
        console.error("[push-send] prune failed:", pruneErr);
      }
    }

    return jsonResponse({
      sent,
      failed,
      pruned: prunedEndpoints.length,
    });
  } catch (err) {
    console.error("[push-send] unexpected error:", err);
    return jsonError("Unexpected error", 500);
  }
});
