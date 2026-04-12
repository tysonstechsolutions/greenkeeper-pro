/**
 * Server-side Web Push helper.
 *
 * Configures `web-push` with VAPID keys from env vars on module load and
 * exposes `sendPushToUsers` which fetches all stored push subscriptions
 * for the given user_ids and fires a native push to each.
 *
 * VAPID keys must be set on Vercel env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (mailto:admin@example.com)
 *
 * Generate keys once with:
 *   npx web-push generate-vapid-keys
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    console.error("Failed to configure web-push VAPID details:", err);
  }
}

export function isPushConfigured(): boolean {
  return vapidConfigured;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
}

export interface SendPushResult {
  sent: number;
  failed: number;
  prunedEndpoints: string[];
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a web push to every stored subscription for the given user IDs.
 * Prunes (410 Gone / 404) subscriptions from the DB automatically.
 */
export async function sendPushToUsers(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userIds: string[];
  title: string;
  body: string;
  url?: string;
}): Promise<SendPushResult> {
  const { supabase, userIds, title, body, url } = params;

  if (!vapidConfigured) {
    console.error(
      "[push] sendPushToUsers called but VAPID keys are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT."
    );
    return { sent: 0, failed: userIds.length, prunedEndpoints: [] };
  }

  if (userIds.length === 0) {
    return { sent: 0, failed: 0, prunedEndpoints: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) {
    console.error("[push] Failed to fetch subscriptions:", error);
    return { sent: 0, failed: userIds.length, prunedEndpoints: [] };
  }

  const subs = (data as StoredSubscription[] | null) ?? [];
  if (subs.length === 0) {
    return { sent: 0, failed: 0, prunedEndpoints: [] };
  }

  const payload: PushPayload = { title, body, url };
  const payloadString = JSON.stringify(payload);

  let sent = 0;
  let failed = 0;
  const prunedEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadString
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 410 Gone or 404 Not Found = subscription is dead, prune it.
        if (statusCode === 410 || statusCode === 404) {
          prunedEndpoints.push(sub.endpoint);
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } catch (pruneErr) {
            console.error("[push] Failed to prune dead subscription:", pruneErr);
          }
        } else {
          console.error(
            `[push] sendNotification failed (status=${statusCode ?? "unknown"})`,
            err
          );
        }
      }
    })
  );

  return { sent, failed, prunedEndpoints };
}
