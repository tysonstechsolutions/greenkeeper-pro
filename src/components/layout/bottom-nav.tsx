"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  MessageSquare,
  MoreHorizontal,
  Store,
  Flag,
  Map,
  Home,
  Users,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChannels } from "@/lib/hooks/useChannels";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEffect } from "react";

const maintenanceNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

const proNavItems = [
  { href: "/pro-dashboard", label: "Dashboard", icon: Store },
  { href: "/report-issue", label: "Report", icon: Flag },
  { href: "/course-map", label: "Map", icon: Map },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

const memberNavItems = [
  { href: "/member/home", label: "Home", icon: Home },
  { href: "/member/tee-times", label: "Book", icon: Calendar },
  { href: "/member/community", label: "Community", icon: Users },
  { href: "/member/feedback", label: "Rate", icon: Star },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

const moreRoutes = [
  "/more", "/diagnostics", "/plan", "/course-map", "/weather", "/photos",
  "/equipment", "/chemicals", "/irrigation", "/staff", "/budget", "/reports",
  "/knowledge", "/settings", "/notifications", "/feedback", "/pro-dashboard",
  "/briefing", "/assistant", "/scoreboard", "/checklists", "/shift-swap",
  "/equipment-checkout", "/observations", "/member/conditions",
];

export function BottomNav() {
  const pathname = usePathname();
  const { totalUnread, fetchChannels } = useChannels();
  const { isPro, isMember } = useAuth();

  const navItems = isMember ? memberNavItems : isPro ? proNavItems : maintenanceNavItems;

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const isMoreActive = moreRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom">
      {/* Frosted glass background */}
      <div className="bg-background/80 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
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
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground/70 hover:text-foreground"
                )}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute top-1.5 w-1 h-1 rounded-full bg-[#B68D40]" />
                )}
                <div className="relative mt-1">
                  <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground/60"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
