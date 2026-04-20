"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { stripTrailingSlash } from "@/lib/utils/page-title";

/**
 * Pages where the primary "create" FAB sits at `bottom-24 right-4` — the
 * same mobile slot the chat bubble uses. Rather than layer two floating
 * buttons on top of each other, we suppress the chat bubble on these
 * routes. Users can still reach the AI assistant via the More menu.
 */
const ROUTES_WITH_FAB = new Set([
  "/tasks",
  "/schedule",
  "/equipment",
  "/chemicals",
  "/photos",
  "/assets",
]);

/**
 * Floating chat bubble that links to the AI assistant page.
 * Hidden on the assistant page itself, public routes, routes with their
 * own FAB, and for non-staff roles.
 */
export function ChatBubble() {
  const pathname = usePathname();
  const { profile } = useAuth();

  // Hide on assistant page (already there)
  if (pathname === "/assistant") return null;

  if (ROUTES_WITH_FAB.has(stripTrailingSlash(pathname))) return null;

  // Only show for roles that can access the assistant
  const allowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "foreman" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  if (!allowed) return null;

  return (
    <Link
      href="/assistant"
      className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      aria-label="Open AI Assistant"
    >
      <Bot className="w-5 h-5" />
    </Link>
  );
}
