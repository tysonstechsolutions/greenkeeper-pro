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
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // 1. Don't let the WebView draw under the status bar. This is the
        //    direct fix for "the clock covers the back button".
        await StatusBar.setOverlaysWebView({ overlay: false });
        // 2. Re-assert background + style. With overlay off these
        //    determine the status bar's own pixels (not the WebView's).
        await StatusBar.setBackgroundColor({ color: "#1B4332" });
        await StatusBar.setStyle({ style: Style.Dark });
      } catch (err) {
        // Non-fatal — if the plugin isn't available (web dev, older device)
        // we just keep running with whatever the default is.
        console.warn("[CapacitorInit] StatusBar setup failed:", err);
      }
    })();
  }, []);

  return null;
}
