"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { callApi } from "@/lib/api/client";

export type PushPermission = "default" | "granted" | "denied";

export interface UsePushSubscriptionReturn {
  permission: PushPermission;
  isSubscribed: boolean;
  isConfigured: boolean;
  loading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * Convert a base64 URL-safe public key string to a Uint8Array.
 * Required for pushManager.subscribe's applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output as Uint8Array<ArrayBuffer>;
}

/**
 * Client hook for push subscriptions across both platforms.
 *
 * On Capacitor native (Android): registers with FCM via
 * @capacitor/push-notifications, sends the resulting device token to
 * `push/subscribe` with platform="android". No VAPID key needed — FCM
 * handles signing.
 *
 * On web: uses the existing PushManager + VAPID flow. Requires
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 *
 * Both paths hit the same edge function + same `push_subscriptions` table;
 * push-send branches on `platform` at dispatch time.
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const isNative = Capacitor.isNativePlatform();
  // Native doesn't need VAPID; web does.
  const isConfigured = isNative || Boolean(VAPID_PUBLIC_KEY);

  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Hydrate state on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isNative) {
      // Capacitor: check + mirror the OS-level permission. We consider the
      // user "subscribed" if we've got a saved FCM token we can re-read
      // from Preferences (set by subscribe() below).
      let cancelled = false;
      (async () => {
        try {
          const { PushNotifications } = await import("@capacitor/push-notifications");
          const { Preferences } = await import("@capacitor/preferences");
          const { receive } = await PushNotifications.checkPermissions();
          if (!cancelled) {
            setPermission((receive === "granted" ? "granted" : "default") as PushPermission);
          }
          const { value } = await Preferences.get({ key: "fcm_token" });
          if (!cancelled) setIsSubscribed(Boolean(value));
        } catch {
          /* swallow — native push is optional */
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Web path
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission as PushPermission);
    }
    if (
      !("serviceWorker" in navigator) ||
      typeof window.PushManager === "undefined"
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) {
          setIsSubscribed(existing !== null);
        }
      } catch {
        // swallow — hook is optional
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNative]);

  // ── Subscribe ─────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (isNative) {
      setLoading(true);
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const { Preferences } = await import("@capacitor/preferences");

        // Request permission if not already granted.
        let perm = (await PushNotifications.checkPermissions()).receive;
        if (perm !== "granted") {
          perm = (await PushNotifications.requestPermissions()).receive;
        }
        setPermission((perm === "granted" ? "granted" : "denied") as PushPermission);
        if (perm !== "granted") {
          setError("Permission denied");
          return false;
        }

        // Capacitor emits 'registration' once FCM hands us a token.
        // We register the handler FIRST, then call register() so we
        // don't miss the event on a fast device.
        const tokenPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("FCM registration timed out")),
            15_000,
          );

          void PushNotifications.addListener("registration", (token) => {
            clearTimeout(timeout);
            resolve(token.value);
          });

          void PushNotifications.addListener("registrationError", (err) => {
            clearTimeout(timeout);
            reject(new Error(err.error || "FCM registration error"));
          });
        });

        await PushNotifications.register();
        const fcmToken = await tokenPromise;

        await Preferences.set({ key: "fcm_token", value: fcmToken });

        await callApi("push/subscribe", {
          method: "POST",
          body: {
            platform: "android",
            fcm_token: fcmToken,
            user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        });

        setIsSubscribed(true);
        return true;
      } catch (err) {
        console.error("[usePushSubscription] native subscribe failed:", err);
        setError(err instanceof Error ? err.message : "Subscribe failed");
        return false;
      } finally {
        setLoading(false);
      }
    }

    // Web path
    if (!VAPID_PUBLIC_KEY) {
      setError("Push not configured");
      return false;
    }
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      typeof window.PushManager === "undefined" ||
      typeof Notification === "undefined"
    ) {
      setError("Push not supported in this browser");
      return false;
    }

    setLoading(true);
    try {
      let perm: PushPermission = Notification.permission as PushPermission;
      if (perm === "default") {
        perm = (await Notification.requestPermission()) as PushPermission;
        setPermission(perm);
      }
      if (perm !== "granted") {
        setError("Permission denied");
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await callApi("push/subscribe", {
        method: "POST",
        body: {
          platform: "web",
          subscription: sub.toJSON(),
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[usePushSubscription] subscribe failed:", err);
      setError(err instanceof Error ? err.message : "Subscribe failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  // ── Unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (isNative) {
      setLoading(true);
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const { Preferences } = await import("@capacitor/preferences");
        const { value: token } = await Preferences.get({ key: "fcm_token" });

        // Tell the server to forget this token.
        if (token) {
          await callApi("push/subscribe", {
            method: "DELETE",
            body: { fcm_token: token },
          }).catch(() => {});
        }

        // Unregister locally so we get a fresh token next subscribe().
        try {
          await PushNotifications.removeAllListeners();
          await PushNotifications.unregister();
        } catch {
          /* some platforms don't support unregister — safe to ignore */
        }

        await Preferences.remove({ key: "fcm_token" });
        setIsSubscribed(false);
        return true;
      } catch (err) {
        console.error("[usePushSubscription] native unsubscribe failed:", err);
        setError(err instanceof Error ? err.message : "Unsubscribe failed");
        return false;
      } finally {
        setLoading(false);
      }
    }

    // Web path
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return false;
    }

    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return true;
      }

      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      await callApi("push/subscribe", {
        method: "DELETE",
        body: { endpoint },
      }).catch(() => {
        // DB cleanup is best-effort
      });

      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error("[usePushSubscription] unsubscribe failed:", err);
      setError(err instanceof Error ? err.message : "Unsubscribe failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  return {
    permission,
    isSubscribed,
    isConfigured,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
