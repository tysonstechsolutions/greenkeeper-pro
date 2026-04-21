import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout";
import { OfflineSyncIndicator } from "@/components/features/offline/offline-sync-indicator";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { AuthGate } from "@/components/auth/auth-gate";
import { CapacitorInit } from "@/components/capacitor-init";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
        style={{
          /*
            Top padding defends against Android edge-to-edge mode (API 35+)
            where the WebView would otherwise render under the status bar
            and the system clock / battery icon would cover our header.
            CapacitorInit also calls StatusBar.setOverlaysWebView({overlay:
            false}) so the WebView is actually placed below the bar; this
            env() padding is a fallback for the case where the plugin call
            hasn't run yet (first paint) or failed. Use max() with a 28px
            floor because env(safe-area-inset-top) is 0 on Android devices
            that don't report insets, and 28px covers the typical ~24dp
            status bar height.
          */
          paddingTop: "max(env(safe-area-inset-top, 0px), 28px)",
          /* Bottom padding handled by bottom-nav safe-area-bottom class */
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <CapacitorInit />
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
