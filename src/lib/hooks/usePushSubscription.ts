"use client";

import { useCallback, useEffect, useState } from "react";
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
 * Client hook for managing Web Push subscriptions.
 *
 * - `isConfigured`: whether the NEXT_PUBLIC_VAPID_PUBLIC_KEY is defined
 * - `permission`: current Notification.permission
 * - `isSubscribed`: whether the current browser has an active PushSubscription
 * - `subscribe()`: requests permission, subscribes, POSTs to /api/push/subscribe
 * - `unsubscribe()`: unsubscribes, DELETEs from /api/push/subscribe
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const isConfigured = Boolean(VAPID_PUBLIC_KEY);

  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (!isConfigured) {
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
      // Request permission if needed
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

      try {
        await callApi("push/subscribe", {
          method: "POST",
          body: {
            subscription: sub.toJSON(),
            user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Subscribe failed");
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[usePushSubscription] subscribe failed:", err);
      setError(err instanceof Error ? err.message : "Subscribe failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

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
  }, []);

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
