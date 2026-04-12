"use client";

/**
 * Listens for service-worker messages posted by the Supabase mutation
 * background-sync queue and surfaces a transient banner when offline
 * changes get replayed. No external toast library dependency — this is a
 * minimal fixed-position banner styled to match the rest of the app.
 */

import { useEffect, useState } from "react";

type Banner =
  | { kind: "replayed"; count: number }
  | { kind: "auth-expired"; count: number };

interface QueueReplayedMessage {
  type: "queue-replayed";
  count: number;
}

interface OfflineAuthExpiredMessage {
  type: "offline-auth-expired";
  urls: string[];
}

type SWMessage = QueueReplayedMessage | OfflineAuthExpiredMessage;

function isSWMessage(data: unknown): data is SWMessage {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: unknown }).type;
  return type === "queue-replayed" || type === "offline-auth-expired";
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
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, []);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;

  const text =
    banner.kind === "replayed"
      ? `${banner.count} offline ${banner.count === 1 ? "change" : "changes"} synced`
      : `${banner.count} offline ${banner.count === 1 ? "change" : "changes"} need you to sign in again`;

  const bg = banner.kind === "replayed" ? "#1B4332" : "#7f1d1d";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(env(safe-area-inset-bottom) + 88px)",
        transform: "translateX(-50%)",
        background: bg,
        color: "#ffffff",
        padding: "10px 16px",
        borderRadius: 9999,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontSize: 14,
        fontWeight: 500,
        zIndex: 9999,
        maxWidth: "90vw",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}
