"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { resetClient } from "@/lib/supabase/client";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

/**
 * Auto-recovery for stuck Supabase state.
 *
 * The pain the user reported: after navigating between screens for a while,
 * lists (tasks, assets, course-map observations) stop populating when you
 * come back to them. Only a full app restart fixes it. The root cause is
 * that the Supabase client can get into a wedged state (a hung fetch
 * holding the navigator.locks auth lock, a stale realtime subscription,
 * etc.), and while the client already emits a `supabase:reset-needed`
 * event on timeout, the only listener was a button in the dev-only debug
 * panel — the user would never see it.
 *
 * This component handles recovery end-to-end:
 *   1. Listens for `supabase:reset-needed` events from the client's
 *      timeout wrapper.
 *   2. Shows a small "Reconnecting…" banner so the user knows what's
 *      happening (otherwise a silent reload feels like a crash).
 *   3. Calls `resetClient()` to tear down the wedged singleton.
 *   4. Force-reloads the current page after a short beat. The reload
 *      preserves the Supabase session (it's in localStorage) so the user
 *      lands back on the same URL already logged in — same outcome as
 *      closing + reopening the app, but automatic.
 *
 * Circuit breaker: if we already reset in the last 20s, don't reset again
 * — that's a genuine network outage and hammering reload doesn't help.
 */
const MIN_INTERVAL_MS = 20_000;

export function SupabaseRecovery() {
  const [banner, setBanner] = useState<string | null>(null);
  const lastResetAtRef = useRef<number>(0);

  useEffect(() => {
    let bannerTimer: number | null = null;
    let reloadTimer: number | null = null;

    const onStuck = () => {
      const now = Date.now();
      if (now - lastResetAtRef.current < MIN_INTERVAL_MS) {
        // Recently reset and it didn't fix things — probably offline.
        // Don't reload again, but leave a banner up so the user knows
        // the app noticed.
        setBanner("Still can't reach the server. Check your connection.");
        if (bannerTimer !== null) window.clearTimeout(bannerTimer);
        bannerTimer = window.setTimeout(() => setBanner(null), 5000);
        recordBreadcrumb(
          "warn",
          "Supabase stuck again within 20s — not auto-reloading",
        );
        return;
      }

      lastResetAtRef.current = now;
      recordBreadcrumb("reset", "Auto-recovery: resetting Supabase client");
      setBanner("Reconnecting…");
      resetClient();
      // Give the event loop a beat so in-flight promises reject and the
      // UI paints the banner before the page yanks out from under it.
      reloadTimer = window.setTimeout(() => {
        try {
          window.location.reload();
        } catch {
          // Fallback: wipe the banner so the user isn't stuck staring at it.
          setBanner(null);
        }
      }, 600);
    };

    window.addEventListener("supabase:reset-needed", onStuck);
    return () => {
      window.removeEventListener("supabase:reset-needed", onStuck);
      if (bannerTimer !== null) window.clearTimeout(bannerTimer);
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    };
  }, []);

  if (!banner) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[70] flex justify-center pointer-events-none"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-orange-600 text-white text-sm font-medium shadow-lg">
        {banner.startsWith("Reconnect") ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        {banner}
      </div>
    </div>
  );
}
