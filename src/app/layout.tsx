import type { Metadata, Viewport } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout";
import { OfflineSyncIndicator } from "@/components/features/offline/offline-sync-indicator";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { AuthGate } from "@/components/auth/auth-gate";
import { CapacitorInit } from "@/components/capacitor-init";
import { SupabaseRecovery } from "@/components/supabase-recovery";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VMGC",
  description: "Championship Course Management for Veterans Memorial Golf Course",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VMGC",
    startupImage: [
      {
        url: "/icons/apple-touch-icon.svg",
        media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  },
  applicationName: "VMGC",
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icons/icon-192x192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1B4332",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Safe Area Insets */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Apply the saved theme BEFORE first paint. Without this, the
            "dark"/"system" choice made in /settings/appearance only lasted
            until the next launch — nothing re-applied the class at boot, so
            the app always started light. Mirrors the settings page exactly:
            stored "dark"/"light" wins; "system" or nothing follows the OS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var dark=t==="dark"||((t===null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${outfit.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
        style={{
          /*
            Top padding defends against Android edge-to-edge mode (API 35+)
            where the WebView would otherwise render under the status bar
            and the system clock / battery icon would cover our header.

            Defense in depth (any one of these is sufficient on its own):
              1. android/app/src/main/res/values-v35/styles.xml opts the
                 activity out of Android-15 edge-to-edge enforcement, so the
                 WebView naturally sits below the system bars.
              2. CapacitorInit calls StatusBar.setOverlaysWebView({overlay:
                 false}) for older Android.
              3. This env() padding catches the gap if the plugin call
                 hasn't run yet (first paint) or is ignored on the device.

            The 80px floor is the FIRST-PAINT DEFAULT only. It protects the
            header before JS runs (when we can't yet tell native from web).
            Once CapacitorInit determines the platform it lowers
            --min-safe-top to 0px, collapsing this to the real
            env(safe-area-inset-top): 0 on web/PWA and on overlay:false
            Android (no dead gap), or the true cutout height if edge-to-edge
            ever slips through. If StatusBar setup throws, the var is left at
            80px so the protective floor remains. This removes the ~80px of
            empty space that used to sit above the header on every page.
          */
          paddingTop: "max(env(safe-area-inset-top, 0px), var(--min-safe-top, 80px))",
          /* Bottom padding handled by bottom-nav safe-area-bottom class */
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <CapacitorInit />
        <SupabaseRecovery />
        <AuthProvider>
          <AuthGate>
            <AppShell>{children}</AppShell>
            <OfflineSyncIndicator />
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
