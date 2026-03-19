"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  MessageSquare,
  Wrench,
  FlaskConical,
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
  Stethoscope,
  Target,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useChannels } from "@/lib/hooks/useChannels";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { RoleHidden } from "@/components/auth/role-guard";

const mainNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

const courseNavItems = [
  { href: "/diagnostics", label: "Course Doctor", icon: Stethoscope },
  { href: "/plan", label: "Annual Plan", icon: Target },
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/weather", label: "Weather", icon: Cloud },
  { href: "/photos", label: "Photos", icon: Camera },
];

const operationsNavItems = [
  { href: "/equipment", label: "Equipment", icon: Wrench },
  { href: "/chemicals", label: "Chemicals", icon: FlaskConical },
  { href: "/irrigation", label: "Irrigation", icon: Droplets },
];

// Management-only operations items
const managementOperationsItems = [
  { href: "/staff", label: "Staff", icon: Users },
];

const managementNavItems = [
  { href: "/budget", label: "Budget", icon: DollarSign },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get unread counts for badges
  const { totalUnread: messagesUnread, fetchChannels } = useChannels();
  const { unreadCount: notificationsUnread, fetchUnreadCount } = useNotifications();

  // Fetch counts on mount
  useEffect(() => {
    fetchChannels();
    fetchUnreadCount();
  }, [fetchChannels, fetchUnreadCount]);

  // Badge counts for nav items
  const badgeCounts: Record<string, number> = {
    "/messages": messagesUnread,
    "/notifications": notificationsUnread,
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">GK</span>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground text-sm">
                GreenKeeper Pro
              </span>
              <span className="text-xs text-muted-foreground">
                Course Management
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {/* Primary Navigation */}
        <div className="space-y-1">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const badgeCount = badgeCounts[item.href] || 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {isCollapsed && badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-destructive text-destructive-foreground text-[10px] font-medium rounded-full flex items-center justify-center">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex items-center justify-between flex-1">
                    <span>{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="min-w-[20px] h-[20px] px-1.5 bg-destructive text-destructive-foreground text-xs font-medium rounded-full flex items-center justify-center">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {/* Course Section */}
        <div className="my-4 border-t border-sidebar-border" />
        {!isCollapsed && (
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Course
          </p>
        )}
        <div className="space-y-1">
          {courseNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Operations Section */}
        <div className="my-4 border-t border-sidebar-border" />
        {!isCollapsed && (
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Operations
          </p>
        )}
        <div className="space-y-1">
          {operationsNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
          {/* Management-only operations items */}
          <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
            {managementOperationsItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </RoleHidden>
        </div>

        {/* Management Section - Hidden from crew/seasonal */}
        <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
          <div className="my-4 border-t border-sidebar-border" />
          {!isCollapsed && (
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Management
            </p>
          )}
          <div className="space-y-1">
            {managementNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </RoleHidden>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center w-full p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 mr-2" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
