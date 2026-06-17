"use client";

import { useEffect } from "react";
import { hookConsoleForBreadcrumbs, recordBreadcrumb } from "@/lib/debug/breadcrumbs";

/**
 * Runs once on app boot to apply Capacitor-specific native tweaks that
 * have to happen at runtime (they can't be baked into capacitor.config.ts)
 * AND to install the app-wide breadcrumb recorder used by the debug panel.
 *
 * Renders nothing. Safe to include on every page.
 */
export function CapacitorInit() {
  useEffect(() => {
    // Breadcrumb recorder hooks console.error/warn/info so the debug panel
    // surfaces code that logs problems without throwing (most of our real
    // bugs). Idempotent — calling twice is a no-op.
    hookConsoleForBreadcrumbs();
    recordBreadcrumb("lifecycle", "App boot");

    // Synchronous fast-path for web/PWA: there is no native status bar to
    // clear, so collapse the body's 80px first-paint safe-area floor right
    // away (it would otherwise leave a permanent empty gap at the top of
    // every page). window.Capacitor only exists inside the native shell, so
    // its absence reliably means "web". The body padding falls back to
    // env(safe-area-inset-top), which is 0 in a normal browser and the real
    // notch inset in an installed PWA on a notched phone.
    const win = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    const isNativeSync = !!win.Capacitor?.isNativePlatform?.();
    if (!isNativeSync) {
      document.documentElement.style.setProperty("--min-safe-top", "0px");
    }

    (async () => {
      try {
        // Dynamic imports are independent — parallelize so boot waits on
        // the slower of the two instead of their sum.
        const [{ Capacitor }, statusBarMod] = await Promise.all([
          import("@capacitor/core"),
          import("@capacitor/status-bar"),
        ]);
        if (!Capacitor.isNativePlatform()) {
          // Authoritative web check (covers the case where the sync probe
          // above ran before the bridge attached). Idempotent.
          document.documentElement.style.setProperty("--min-safe-top", "0px");
          return;
        }
        const { StatusBar, Style } = statusBarMod;
        // These three calls have no ordering requirement between them —
        // fire together. Fixes "clock covers the back button" on Android
        // SDK 36 edge-to-edge; without setOverlaysWebView(false) the
        // WebView draws under the status bar.
        await Promise.all([
          StatusBar.setOverlaysWebView({ overlay: false }),
          StatusBar.setBackgroundColor({ color: "#1B4332" }),
          StatusBar.setStyle({ style: Style.Dark }),
        ]);
        // With overlays disabled the WebView now sits BELOW the status bar,
        // so the 80px first-paint floor is dead space. Collapse it to the
        // real inset: env(safe-area-inset-top) is 0 here (nothing overlaps),
        // or the true cutout height if a device still runs edge-to-edge.
        document.documentElement.style.setProperty("--min-safe-top", "0px");
      } catch (err) {
        // Non-fatal — if the plugin isn't available (web dev, older
        // device) keep running with whatever the default is. We leave
        // --min-safe-top untouched on failure so the 80px floor stays as a
        // safety net when StatusBar couldn't be configured.
        console.warn("[CapacitorInit] StatusBar setup failed:", err);
      }
    })();
  }, []);

  return null;
}
