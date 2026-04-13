"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePushSubscription } from "@/lib/hooks/usePushSubscription";

const DISMISS_KEY = "vmgc_push_optin_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function PushOptInCard() {
  const { isConfigured, isSubscribed, permission, loading, subscribe, error } =
    usePushSubscription();
  // null = pre-hydration; we render nothing so the server markup (also nothing)
  // matches the first client paint, avoiding a React hydration mismatch.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const ts = window.localStorage.getItem(DISMISS_KEY);
      const recent = !!ts && Date.now() - Number(ts) < DISMISS_TTL_MS;
      setDismissed(recent); // eslint-disable-line react-hooks/set-state-in-effect -- hydration-safe localStorage read
    } catch {
      setDismissed(false); // eslint-disable-line react-hooks/set-state-in-effect -- hydration-safe fallback
    }
  }, []);

  const handleEnable = async () => {
    await subscribe();
  };

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  // Pre-hydration: render nothing to match SSR output.
  if (dismissed === null) return null;
  // Hidden in these cases:
  //  - VAPID not configured
  //  - already subscribed
  //  - user previously denied
  //  - dismissed within last 7 days
  if (!isConfigured) return null;
  if (isSubscribed) return null;
  if (permission === "denied") return null;
  if (dismissed) return null;

  return (
    <div className="gk-card relative flex items-start gap-3 p-4 border border-emerald-500/20 bg-emerald-500/5">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0 pr-6">
        <div className="font-semibold text-sm text-foreground">
          Get notified on your phone
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Never miss a task or message from the crew.
        </div>
        {error ? (
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
            {error}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleEnable}
          disabled={loading}
          className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium"
        >
          {loading ? "Enabling..." : "Enable notifications"}
        </button>
      </div>
    </div>
  );
}
