import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the VMGC GreenKeeper Android app.
 *
 * Notes:
 * - `webDir` points at the Next.js static-export output (`out/`).
 *   That directory is produced by `npm run build` once next.config.ts
 *   has `output: "export"` set (see MIGRATION-TO-CAPACITOR.md step 2).
 * - `bundledWebRuntime` is false — Capacitor 5+ defaults.
 * - No `server.url` is set: the web assets ship inside the APK so the
 *   app does NOT need Vercel or any hosted site to run.
 */
const config: CapacitorConfig = {
  appId: "com.vmgc.greenkeeper",
  appName: "VMGC GreenKeeper",
  webDir: "out",
  android: {
    // Use HTTPS-style scheme for localhost so Supabase cookies + CORS behave.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1B4332",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1B4332",
    },
    Camera: {
      // Request the minimal set of permissions users will see on first use.
      // We grant READ/WRITE on Android 10+ via scoped storage automatically.
    },
  },
};

export default config;
