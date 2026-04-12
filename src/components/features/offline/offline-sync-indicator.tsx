"use client";

/**
 * Listens for service-worker messages posted by the Supabase mutation
 * background-sync queue and surfaces a transient banner when offline
 * changes get replayed. No external toast library dependency — this is a
 * minimal fixed-position banner styled with project Tailwind conventions.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Banner =
  | { kind: "replayed"; count: number }
  | { kind: "auth-expired"; count: number }
  | { kind: "permanent-failure"; count: number };

interface QueueReplayedMessage {
  type: "queue-replayed";
  count: number;
}

interface OfflineAuthExpiredMessage {
  type: "offline-auth-expired";
  urls: string[];
}

interface QueuePermanentFailureMessage {
  type: "queue-permanent-failure";
  count: number;
}

type SWMessage =
  | QueueReplayedMessage
  | OfflineAuthExpiredMessage
  | QueuePermanentFailureMessage;

function isSWMessage(data: unknown): data is SWMessage {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: unknown }).type;
  return (
    type === "queue-replayed" ||
    type === "offline-auth-expired" ||
    type === "queue-permanent-failure"
  );
}

export function OfflineSyncIndicator() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handler = (event: MessageEvent) => {
      if (!isSWMessage(event.data)) return;
      if (event.data.type === "queue-replayed") {
        setBanner({ kind: "replayed", count: event.data.count });
      } else if (event.data.type === "offline-auth-expired") {
        setBanner({ kind: "auth-expired", count: event.data.urls.length });
      } else if (event.data.type === "queue-permanent-failure") {
        setBanner({ kind: "permanent-failure", count: event.data.count });
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, []);

  useEffect(() => {
    // TODO I-5: auth-expired and permanent-failure banners should probably
    // stay visible until dismissed, since the user needs to take action.
    // Logged as a follow-up — requires a design-system banner component.
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;

  const text =
    banner.kind === "replayed"
      ? `${banner.count} offline ${banner.count === 1 ? "change" : "changes"} synced`
      : banner.kind === "auth-expired"
      ? `${banner.count} offline ${banner.count === 1 ? "change" : "changes"} need you to sign in again`
      : `${banner.count} offline ${banner.count === 1 ? "change" : "changes"} rejected by server`;

  const variantClasses =
    banner.kind === "replayed"
      ? "bg-primary text-primary-foreground"
      : banner.kind === "auth-expired"
      ? "bg-destructive text-destructive-foreground"
      : "bg-orange-600 text-white";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-50 px-4 py-2 rounded-full shadow-lg text-sm font-medium max-w-[90vw] text-center",
        variantClasses,
      )}
    >
      {text}
    </div>
  );
}
