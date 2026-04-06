"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { OnlineStatus } from "@/components/ui/online-status";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { ChatBubble } from "@/components/features/ai/chat-bubble";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* PWA Online Status Banner */}
      <OnlineStatus />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />

      {/* AI Chat Bubble */}
      {user && <ChatBubble />}

      {/* PWA Install Prompt */}
      <InstallPrompt />
    </div>
  );
}
