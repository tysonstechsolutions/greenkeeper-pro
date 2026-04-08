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
  "/more", "/plan", "/course-map", "/weather", "/photos",
  "/equipment", "/chemicals", "/irrigation", "/staff", "/budget", "/reports",
  "/knowledge", "/settings", "/notifications", "/feedback", "/pro-dashboard",
  "/briefing", "/assistant", "/checklists",
  "/equipment-checkout", "/member/conditions",
  "/polls", "/report-issue", "/member-insights", "/install",
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/80 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
      {/* Nav content */}
      <div>
        <div className="flex items-center justify-around h-[72px] px-1 max-w-lg mx-auto">
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
                  "flex flex-col items-center justify-center flex-1 py-2 rounded-xl transition-all relative",
                  "min-w-[64px] min-h-[56px]", // Minimum 48px+ touch targets
                  "active:scale-95 active:bg-primary/5", // Haptic-feel press feedback
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground/60"
                )}
              >
                {/* Active pill background */}
                {isActive && (
                  <span className="absolute inset-x-2 top-1 bottom-1 rounded-xl bg-primary/8" />
                )}
                <div className="relative z-10">
                  <item.icon
                    className={cn(
                      "w-6 h-6 transition-all",
                      isActive ? "text-primary" : "text-muted-foreground/60"
                    )}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-xs font-medium mt-0.5 relative z-10",
                  isActive ? "text-primary font-semibold" : "text-muted-foreground/60"
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
