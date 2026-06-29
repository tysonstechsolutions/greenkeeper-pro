"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Leaf,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/providers/view-provider";
import { useState, useEffect } from "react";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppUsage } from "@/lib/hooks/useAppUsage";
import { getCatalog, type AppEntry } from "@/lib/layout/app-catalog";

// ──────────────────────────────────────────────────────────────────────────
// Desktop sidebar. The role/view → app lists live in the shared catalog
// (src/lib/layout/app-catalog.ts) so this stays in sync with the mobile
// "More" grid automatically. Pinned entries render in the top section; the
// rest are sorted by usage.
// ──────────────────────────────────────────────────────────────────────────

function NavItem({
  item,
  isActive,
  isCollapsed,
  badgeCount = 0,
  onClick,
}: {
  item: AppEntry;
  isActive: boolean;
  isCollapsed: boolean;
  badgeCount?: number;
  onClick?: () => void;
}) {
  const isCreatePr = item.href === "/purchase-requests/new";

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 relative",
        isCollapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2",
        isActive
          ? "bg-white/10 text-white"
          : isCreatePr
            ? "bg-[#D4A853]/10 text-[#D4A853] hover:bg-[#D4A853]/15"
            : "text-white/70 hover:text-white hover:bg-white/5",
      )}
      title={isCollapsed ? item.label : undefined}
    >
      <div className="relative flex-shrink-0">
        <item.icon
          className={cn(
            "w-5 h-5 transition-colors",
            isActive
              ? "text-[#D4A853]"
              : isCreatePr
                ? "text-[#D4A853]"
                : "text-white/60 group-hover:text-white/90",
          )}
        />
        {isCollapsed && badgeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#1B4332]">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </div>
      {!isCollapsed && (
        <div className="flex items-center justify-between flex-1 min-w-0">
          <span className="truncate">{item.label}</span>
          {badgeCount > 0 && (
            <span className="min-w-[20px] h-[20px] px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { isPro, isForeman, isMechanic, isCrew, profile } = useAuth();
  const { view } = useView();
  const isSeasonal = profile?.role === "seasonal";
  const isLaborer = isCrew || isSeasonal;

  const { unreadCount: notificationsUnread, fetchUnreadCount } =
    useNotifications();
  const { record, sortByUsage } = useAppUsage();

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  const badgeCounts: Record<string, number> = {
    "/notifications": notificationsUnread,
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  // Role/view-appropriate catalog → split into pinned + usage-sorted apps.
  const catalog = getCatalog({ view, isPro, isForeman, isMechanic, isLaborer });
  const pinned = catalog.filter((item) => item.pinned);
  const apps = sortByUsage(catalog.filter((item) => !item.pinned));

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-dvh transition-all duration-300 relative",
        isCollapsed ? "w-[72px]" : "w-[260px]",
      )}
      style={{
        background:
          "linear-gradient(180deg, #1B4332 0%, #15352A 50%, #112B22 100%)",
      }}
    >
      {/* Logo */}
      <div className="relative flex items-center h-16 px-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#B68D40] to-[#D4A853] flex items-center justify-center shadow-md shadow-black/20 shrink-0">
            <Leaf className="w-5 h-5 text-[#1B4332]" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-white text-sm tracking-tight leading-tight">
                VMGC
              </span>
              <span className="text-[10px] font-medium text-[#D4A853] uppercase tracking-[0.1em]">
                GreenKeeper Pro
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 px-2.5 py-3 space-y-1 overflow-y-auto gk-scrollbar">
        {/* Pinned (always-on, role-specific shortcuts) */}
        <div className="space-y-0.5">
          {pinned.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              isCollapsed={isCollapsed}
              badgeCount={badgeCounts[item.href] || 0}
              onClick={() => record(item.href)}
            />
          ))}
        </div>

        {/* Divider + label */}
        {apps.length > 0 && (
          <>
            <div className="my-3 mx-1 border-t border-white/[0.08]" />
            {!isCollapsed && (
              <p className="px-2 mb-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-[0.12em]">
                Apps
              </p>
            )}
          </>
        )}

        {/* Apps (sorted by usage) */}
        <div className="space-y-0.5">
          {apps.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              isCollapsed={isCollapsed}
              badgeCount={badgeCounts[item.href] || 0}
              onClick={() => record(item.href)}
            />
          ))}
        </div>
      </nav>

      {/* Footer: Notifications + Settings */}
      <div className="relative px-2.5 py-2 border-t border-white/[0.08] space-y-0.5">
        <NavItem
          item={{
            href: "/notifications",
            label: "Notifications",
            icon: Bell,
            color: "",
          }}
          isActive={isActive("/notifications")}
          isCollapsed={isCollapsed}
          badgeCount={notificationsUnread}
          onClick={() => record("/notifications")}
        />
        {!isPro && !isLaborer && (
          <NavItem
            item={{
              href: "/settings",
              label: "Settings",
              icon: Settings,
              color: "",
            }}
            isActive={isActive("/settings")}
            isCollapsed={isCollapsed}
            onClick={() => record("/settings")}
          />
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="relative p-2 border-t border-white/[0.08]">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center w-full p-2 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/5 transition-all"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
