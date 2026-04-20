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

    (async () => {
      try {
        // Dynamic imports are independent — parallelize so boot waits on
        // the slower of the two instead of their sum.
        const [{ Capacitor }, statusBarMod] = await Promise.all([
          import("@capacitor/core"),
          import("@capacitor/status-bar"),
        ]);
        if (!Capacitor.isNativePlatform()) return;
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
      } catch (err) {
        // Non-fatal — if the plugin isn't available (web dev, older
        // device) keep running with whatever the default is.
        console.warn("[CapacitorInit] StatusBar setup failed:", err);
      }
    })();
  }, []);

  return null;
}
