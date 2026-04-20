"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  MessageSquare,
  Wrench,
  Camera,
  Map,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Droplets,
  BookOpen,
  DollarSign,
  Users,
  Target,
  Cloud,
  Leaf,
  Car,
  Building,
  ShoppingCart,
  ClipboardCheck,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useChannels } from "@/lib/hooks/useChannels";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { RoleHidden } from "@/components/auth/role-guard";

// ── Primary: always visible, core daily tools ──
const primaryItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

// ── Maintenance: course care tools ──
const maintenanceItems = [
  { href: "/equipment", label: "Equipment", icon: Wrench },
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car },
  { href: "/clubhouse", label: "Clubhouse", icon: Building },
  { href: "/order-list", label: "Order List", icon: ShoppingCart },
  { href: "/weather", label: "Weather", icon: Cloud },
];

// ── Operations: staff, planning (managers only) ──
const operationsItems = [
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/plan", label: "Annual Plan", icon: Target },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
];

// ── Admin: budget, reports, settings (managers only) ──
const adminItems = [
  { href: "/budget", label: "Budget", icon: DollarSign },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItem({
  item,
  isActive,
  isCollapsed,
  badgeCount = 0,
}: {
  item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
  isActive: boolean;
  isCollapsed: boolean;
  badgeCount?: number;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative",
        isActive
          ? "bg-white/10 text-white shadow-sm shadow-black/10"
          : "text-white/60 hover:text-white/90 hover:bg-white/5"
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#B68D40]" />
      )}
      <div className="relative flex-shrink-0">
        <item.icon
          className={cn(
            "w-[18px] h-[18px] transition-colors",
            isActive ? "text-[#D4A853]" : "text-white/50 group-hover:text-white/80"
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

function NavSection({
  label,
  isCollapsed,
}: {
  label: string;
  isCollapsed: boolean;
}) {
  return (
    <>
      <div className="my-3 mx-3 border-t border-white/[0.06]" />
      {!isCollapsed && (
        <p className="px-3 mb-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-[0.1em]">
          {label}
        </p>
      )}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { totalUnread: messagesUnread, fetchChannels } = useChannels();
  const { unreadCount: notificationsUnread, fetchUnreadCount } = useNotifications();

  useEffect(() => {
    fetchChannels();
    fetchUnreadCount();
  }, [fetchChannels, fetchUnreadCount]);

  const badgeCounts: Record<string, number> = {
    "/messages": messagesUnread,
    "/notifications": notificationsUnread,
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-dvh transition-all duration-300 relative overflow-hidden",
        isCollapsed ? "w-[68px]" : "w-[260px]"
      )}
      style={{
        background: "linear-gradient(180deg, #1B4332 0%, #15352A 40%, #112B22 100%)",
      }}
    >
      {/* Subtle texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2l2 3.5-2 3zM0 20h2v2H0v-2z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Logo / Brand */}
      <div className="relative flex items-center h-16 px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#B68D40] to-[#D4A853] flex items-center justify-center shadow-lg shadow-black/20">
            <Leaf className="w-5 h-5 text-[#1B4332]" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-white text-sm tracking-tight leading-tight">
                VMGC
              </span>
              <span className="text-[10px] font-medium text-[#B68D40] uppercase tracking-[0.08em]">
                Pro
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 px-2 py-3 space-y-0.5 overflow-y-auto gk-scrollbar">
        {/* Primary — always visible */}
        <div className="space-y-0.5">
          {primaryItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              isCollapsed={isCollapsed}
              badgeCount={badgeCounts[item.href] || 0}
            />
          ))}
        </div>

        {/* Maintenance */}
        <NavSection label="Maintenance" isCollapsed={isCollapsed} />
        <div className="space-y-0.5">
          {maintenanceItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>

        {/* Operations — managers only */}
        <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
          <NavSection label="Operations" isCollapsed={isCollapsed} />
          <div className="space-y-0.5">
            {operationsItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        </RoleHidden>

        {/* Admin — managers only */}
        <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
          <NavSection label="Admin" isCollapsed={isCollapsed} />
          <div className="space-y-0.5">
            {adminItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        </RoleHidden>
      </nav>

      {/* Collapse Toggle */}
      <div className="relative p-2 border-t border-white/[0.06]">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center w-full p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
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
