"use client";

import { useEffect } from "react";

/**
 * Runs once on app boot to apply Capacitor-specific native tweaks that
 * have to happen at runtime (they can't be baked into capacitor.config.ts).
 *
 * Currently: pushes the Android status bar OUT of the WebView so the
 * system clock / battery icon stop covering our header. We target Android
 * SDK 36 which ships edge-to-edge enforcement by default — meaning the
 * WebView extends under the status bar unless we explicitly opt out here.
 * Without this, `env(safe-area-inset-top)` can't save us because Android's
 * status bar is drawn on top of whatever the WebView renders.
 *
 * Renders nothing. Safe to include on every page.
 */
export function CapacitorInit() {
  useEffect(() => {
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
