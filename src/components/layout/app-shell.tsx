"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { OnlineStatus } from "@/components/ui/online-status";
import { PwaInstallCapture } from "@/lib/hooks/usePwaInstall";
import { ChatBubble } from "@/components/features/ai/chat-bubble";
import { ErrorBoundary } from "@/components/error-boundary";
import { DebugOverlay } from "@/components/debug-overlay";
import { useKeyboardScroll } from "@/lib/hooks/useKeyboardScroll";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";
import { stripTrailingSlash } from "@/lib/utils/page-title";

// Routes that should NOT show the app shell (sidebar, header, bottom nav)
const PUBLIC_ROUTES = ["/login", "/pin-login", "/join", "/install", "/offline"];

function isPublicRoute(pathname: string): boolean {
  const normalized = stripTrailingSlash(pathname);
  if (PUBLIC_ROUTES.includes(normalized)) return true;
  if (normalized.startsWith("/invite/")) return true;
  return false;
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isPublic = isPublicRoute(pathname);

  // Auto-scroll focused inputs above the virtual keyboard on mobile
  useKeyboardScroll();

  // Navigation breadcrumb — every pathname change becomes a log entry the
  // debug panel can surface. Catches silent nav failures (click registered,
  // pathname never changed) by simply NOT showing up after a click event.
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      recordBreadcrumb(
        "nav",
        `${prevPathRef.current ?? "(initial)"} → ${pathname}`,
      );
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  // Public pages get a clean layout with no chrome. We still mount the
  // DebugOverlay here so users can diagnose login-page hangs and trigger
  // a client reset without killing the app.
  if (isPublic) {
    return (
      <div className="min-h-screen bg-background">
        <OnlineStatus />
        {/* Capture the install prompt even on public routes (it can fire on
            the login screen) so Settings → Install App can offer one-tap
            install later. Renders nothing. */}
        <PwaInstallCapture />
        <main>{children}</main>
        <DebugOverlay />
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-background overflow-x-hidden">
      {/* PWA Online Status Banner */}
      <OnlineStatus />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />

        {/* Page content — wrapped in an ErrorBoundary so a crash inside one
            page doesn't leave the whole shell wedged with invisible broken
            event handlers. The boundary resets on route change via `key`. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0">
          <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />

      {/* Floating AI Chat Bubble */}
      {user && <ChatBubble />}

      {/* Capture the PWA install prompt (no auto-popup — the install entry
          point now lives in Settings → Install App). Renders nothing. */}
      <PwaInstallCapture />

      {/* Floating debug overlay — diagnoses "nothing loads" hangs and
          exposes a one-tap "Reset app state" escape hatch without a
          full app kill. Shows a red pulsing icon if errors are captured. */}
      {user && <DebugOverlay />}
    </div>
  );
}
