"use client";

import { useState, useEffect, useCallback } from "react";
import { WifiOff, X } from "lucide-react";

/**
 * A small banner that appears when the browser is offline.
 * Dismissable, re-appears if the user goes offline again.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine); // eslint-disable-line react-hooks/set-state-in-effect -- hydration-safe browser API read

    const handleOffline = () => {
      setIsOffline(true);
      setDismissed(false); // re-show on new offline event
    };
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  if (!isOffline || dismissed) return null;

  return (
    <div className="bg-yellow-500 text-yellow-950 text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You&apos;re offline &mdash; changes will sync when you reconnect</span>
      <button
        onClick={dismiss}
        className="ml-2 p-0.5 rounded hover:bg-yellow-600/30 transition-colors"
        aria-label="Dismiss offline notice"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
