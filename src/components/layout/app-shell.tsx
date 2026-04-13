"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { OnlineStatus } from "@/components/ui/online-status";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { ChatBubble } from "@/components/features/ai/chat-bubble";
import { useKeyboardScroll } from "@/lib/hooks/useKeyboardScroll";

// Routes that should NOT show the app shell (sidebar, header, bottom nav)
const PUBLIC_ROUTES = ["/login", "/pin-login", "/join", "/install", "/offline"];

function isPublicRoute(pathname: string): boolean {
  // Exact matches
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  // Prefix matches for invite tokens: /invite/[token]
  if (pathname.startsWith("/invite/")) return true;
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

  // Public pages get a clean layout with no chrome
  if (isPublic) {
    return (
      <div className="min-h-screen bg-background">
        <OnlineStatus />
        <main>{children}</main>
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />

      {/* Floating AI Chat Bubble */}
      {user && <ChatBubble />}

      {/* PWA Install Prompt */}
      <InstallPrompt />
    </div>
  );
}
