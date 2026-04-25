"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { stripTrailingSlash } from "@/lib/utils/page-title";

/**
 * Routes (and their subroutes) whose own UI conflicts with the floating
 * chat bubble. Matched by exact-equality OR `pathname.startsWith(route + "/")`,
 * so adding "/tasks" suppresses the bubble on /tasks/new, /tasks/edit, etc.
 * — those subroutes have their own bottom action bars that the bubble was
 * landing on top of. Users can still reach the AI assistant via /more.
 */
const ROUTES_WITH_FAB = [
  "/tasks",
  "/schedule",
  "/equipment",
  "/chemicals",
  "/photos",
  "/assets",
  "/parking-lot", // page-level FAB at bottom-24 right-4 — direct collision with bubble
  "/polls/manage", // refresh FAB at bottom-8 right-8 collides with bubble on desktop
];

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

  const path = stripTrailingSlash(pathname);
  const suppressedByOwnFAB = ROUTES_WITH_FAB.some(
    (r) => path === r || path.startsWith(r + "/"),
  );
  if (suppressedByOwnFAB) return null;

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
      data-chat-bubble
      className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      aria-label="Open AI Assistant"
    >
      <Bot className="w-5 h-5" />
    </Link>
  );
}
