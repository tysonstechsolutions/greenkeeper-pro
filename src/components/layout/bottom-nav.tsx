"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChannels } from "@/lib/hooks/useChannels";
import { useEffect } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

// All routes that fall under "More" section
const moreRoutes = [
  "/more",
  "/diagnostics",
  "/plan",
  "/course-map",
  "/weather",
  "/photos",
  "/equipment",
  "/chemicals",
  "/irrigation",
  "/staff",
  "/budget",
  "/reports",
  "/knowledge",
  "/settings",
  "/notifications",
];

export function BottomNav() {
  const pathname = usePathname();
  const { totalUnread, fetchChannels } = useChannels();

  // Fetch unread count on mount
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Check if current path is in "more" section
  const isMoreActive = moreRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/more"
              ? isMoreActive
              : pathname === item.href || pathname.startsWith(item.href + "/");

          const badgeCount = item.href === "/messages" ? totalUnread : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-destructive text-destructive-foreground text-[10px] font-medium rounded-full flex items-center justify-center">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
