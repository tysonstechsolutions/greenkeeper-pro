"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SLOW_VIEW_MS, trackUsage } from "@/lib/usage/track";

/**
 * Records one 'view' event per screen, with how long it took to settle.
 *
 * Mounted once in the app shell. Timing is measured to the first idle moment
 * after the route paints, which is a fair proxy for "the screen became useful"
 * — it captures the data load, not just the shell. Screens slower than
 * SLOW_VIEW_MS also emit a 'slow' event so they surface separately from
 * ordinary traffic in the review.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    const started = performance.now();
    let done = false;

    /**
     * `settled` distinguishes "the screen finished loading" from "the GM left
     * before it did". Only a settled view carries a duration — otherwise a
     * quick bounce would be recorded as a 3 ms load and drag the average down,
     * hiding the very slowness this is meant to find.
     */
    const record = (settled: boolean) => {
      if (done) return;
      done = true;
      const durationMs = settled ? performance.now() - started : undefined;
      void trackUsage({ kind: "view", route: pathname, durationMs });
      if (durationMs !== undefined && durationMs >= SLOW_VIEW_MS) {
        void trackUsage({ kind: "slow", route: pathname, durationMs });
      }
    };

    // Settle when the browser goes idle, with a hard ceiling so a screen that
    // never idles (polling, animation) still reports once.
    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    const settle = () => record(true);
    const ceiling = window.setTimeout(settle, 8000);
    if (typeof idle === "function") idle(settle, { timeout: 6000 });
    else window.setTimeout(settle, 1500);

    return () => {
      window.clearTimeout(ceiling);
      record(false);
    };
  }, [pathname]);

  return null;
}
