/**
 * push-send — Deno edge function that dispatches a push notification to
 * every subscription belonging to any user in `user_ids`. Handles both
 * shapes simultaneously:
 *
 *   - Web Push (VAPID) — uses the npm:web-push library.
 *   - Native FCM (Android now, iOS later) — uses FCM HTTP v1 with an
 *     OAuth 2.0 bearer token minted from a service account JSON set as
 *     the FCM_SERVICE_ACCOUNT secret.
 *
 * Staff roles (super, asst_super, director, foreman) can push to any
 * user; everyone else can only push to themselves (self-test).
 *
 * Dead subscriptions are pruned automatically (web: 404/410, fcm:
 * UNREGISTERED / INVALID_ARGUMENT).
 *
 * Body:
 *   { user_ids: string[], title: string, body: string, url?: string }
 *
 * Secrets:
 *   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT    — web push
 *   FCM_SERVICE_ACCOUNT                                    — native FCM
 *     (set to the raw JSON string of the service account key; no quoting)
 *
 * Deploy: supabase functions deploy push-send
 */
import webpush from "npm:web-push@3.6.7";
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const STAFF_ROLES = new Set(["super", "asst_super", "director", "foreman"]);

interface WebPushRow {
  id: string;
  user_id: string;
  platform: "web";
  endpoint: string;
  p256dh: string;
  auth: string;
}
interface FcmPushRow {
  id: string;
  user_id: string;
  platform: "android" | "ios";
  fcm_token: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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

    // Role gate — non-staff can only push to themselves.
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
        return jsonError("Forbidden: non-staff can only push to self", 403);
      }
    }

    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, platform, endpoint, p256dh, auth, fcm_token")
      .in("user_id", targetUserIds);

    if (subsErr) {
      console.error("[push-send] fetch subs failed:", subsErr);
      return jsonError(subsErr.message || "Failed to load subscriptions", 500);
    }
    if (!subs || subs.length === 0) {
      return jsonResponse({ sent: 0, failed: 0, pruned: 0 });
    }

    // Partition by platform.
    const webRows: WebPushRow[] = [];
    const fcmRows: FcmPushRow[] = [];
    for (const s of subs as Array<Record<string, unknown>>) {
      if (s.platform === "web" && typeof s.endpoint === "string") {
        webRows.push(s as unknown as WebPushRow);
      } else if (
        (s.platform === "android" || s.platform === "ios") &&
        typeof s.fcm_token === "string"
      ) {
        fcmRows.push(s as unknown as FcmPushRow);
      }
    }

    const payloadUrl = typeof url === "string" ? url : undefined;
    let sent = 0;
    let failed = 0;
    const prunedEndpoints: string[] = [];
    const prunedFcmTokens: string[] = [];

    // ── Web push ───────────────────────────────────────────────────────────
    if (webRows.length > 0) {
      const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
      const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
      const vapidSubject =
        Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

      if (vapidPrivate && vapidPublic) {
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

        const webPayload = JSON.stringify({
          title,
          body: messageBody,
          url: payloadUrl,
        });

        await Promise.all(
          webRows.map(async (sub) => {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                webPayload,
              );
              sent++;
            } catch (err: unknown) {
              failed++;
              const statusCode = (err as { statusCode?: number })?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                prunedEndpoints.push(sub.endpoint);
              }
            }
          }),
        );
      } else {
        console.warn("[push-send] VAPID not configured; skipping web push");
      }
    }

    // ── Native FCM ─────────────────────────────────────────────────────────
    if (fcmRows.length > 0) {
      const svcAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
      if (svcAccountRaw) {
        try {
          const svc = parseServiceAccount(svcAccountRaw);
          const accessToken = await getFcmAccessToken(svc);
          const fcmUrl = `https://fcm.googleapis.com/v1/projects/${svc.project_id}/messages:send`;

          await Promise.all(
            fcmRows.map(async (sub) => {
              try {
                const message = {
                  message: {
                    token: sub.fcm_token,
                    notification: { title, body: messageBody },
                    data: payloadUrl ? { url: payloadUrl } : undefined,
                    android: {
                      priority: "HIGH" as const,
                      notification: {
                        channel_id: "default",
                        click_action: payloadUrl ?? undefined,
                      },
                    },
                  },
                };
                const res = await fetch(fcmUrl, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(message),
                });
                if (res.ok) {
                  sent++;
                  return;
                }
                failed++;
                const errText = await res.text();
                if (
                  res.status === 404 ||
                  /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/i.test(errText)
                ) {
                  prunedFcmTokens.push(sub.fcm_token);
                }
              } catch (err) {
                failed++;
                console.error("[push-send] fcm dispatch error:", err);
              }
            }),
          );
        } catch (err) {
          console.error("[push-send] FCM setup failed:", err);
          failed += fcmRows.length;
        }
      } else {
        console.warn("[push-send] FCM_SERVICE_ACCOUNT not set; skipping native");
      }
    }

    // ── Prune dead subscriptions ──────────────────────────────────────────
    if (prunedEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", prunedEndpoints);
    }
    if (prunedFcmTokens.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("fcm_token", prunedFcmTokens);
    }

    return jsonResponse({
      sent,
      failed,
      pruned: prunedEndpoints.length + prunedFcmTokens.length,
    });
  } catch (err) {
    console.error("[push-send] unexpected error:", err);
    return jsonError("Unexpected error", 500);
  }
});

// ── FCM OAuth helpers ─────────────────────────────────────────────────────────

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

function parseServiceAccount(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw);
  if (
    !parsed.project_id ||
    !parsed.client_email ||
    !parsed.private_key ||
    !parsed.token_uri
  ) {
    throw new Error("Invalid service account JSON (missing required fields)");
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    // Service account keys embed real newlines as "\n" in the JSON string;
    // if someone pasted the key with literal "\n" chars fix it up.
    private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    token_uri: parsed.token_uri,
  };
}

// Tiny base64url helper (no padding).
function base64url(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Convert PKCS#8 PEM → CryptoKey for RS256 signing.
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    bin.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Cache the access token for ~50 minutes (tokens are valid for 1h).
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(svc: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 120 > now) {
    return cachedToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: svc.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: svc.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const unsigned =
    base64url(enc.encode(JSON.stringify(header))) +
    "." +
    base64url(enc.encode(JSON.stringify(claims)));

  const key = await importPrivateKey(svc.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(unsigned),
  );
  const jwt = unsigned + "." + base64url(new Uint8Array(sig));

  const res = await fetch(svc.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" +
      "&assertion=" +
      encodeURIComponent(jwt),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM token exchange failed: ${res.status} ${text}`);
  }
  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: access_token,
    expiresAt: Math.floor(Date.now() / 1000) + expires_in,
  };
  return access_token;
}
