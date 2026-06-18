"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  MessageSquare,
  Camera,
  Map,
  Settings,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Users,
  Cloud,
  Leaf,
  Car,
  Building,
  ShoppingCart,
  Bot,
  FilePlus,
  Phone,
  Archive,
  FileText,
  Mic,
  Bell,
  Flag,
  ClipboardSignature,
  ClipboardCheck,
  Scale,
  Wrench,
  ShieldCheck,
  Flame,
  Droplets,
  Wallet,
  BarChart3,
  Trophy,
  Landmark,
  HardHat,
  Vote,
  GraduationCap,
  Library,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/providers/view-provider";
import { useState, useEffect } from "react";
import { useChannels } from "@/lib/hooks/useChannels";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppUsage } from "@/lib/hooks/useAppUsage";

// ──────────────────────────────────────────────────────────────────────────
// App catalog — mirrors src/app/more/page.tsx so the sidebar and the
// mobile More grid stay in sync. Hidden routes per user request: Maint
// Calendar, Annual Plan, Irrigation, Pin Sheet, Board Report, Drone
// Flights, Water Usage, Tournaments, Revenue, Capital Projects, Budget,
// Reports, IL RUP Records. Inspections + Environmental are merged.
// ──────────────────────────────────────────────────────────────────────────

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Route is shown as a "primary" pinned item, never re-ordered. */
  pinned?: boolean;
}

const leadershipPinned: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pinned: true },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, pinned: true },
  { href: "/schedule", label: "Schedule", icon: Calendar, pinned: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, pinned: true },
  { href: "/purchase-requests/new", label: "Create PR", icon: FilePlus, pinned: true },
];

const leadershipApps: SidebarItem[] = [
  // Assets is the unified entry point — operational data (photos, parts,
  // service, inspections) is shown inline on /assets/view alongside the
  // FY26 inventory tracking. The standalone "Equipment" item was removed
  // when the two views were merged.
  { href: "/assets", label: "Assets", icon: Archive },
  { href: "/order-list", label: "Order List", icon: ShoppingCart },
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car },
  { href: "/clubhouse", label: "Clubhouse", icon: Building },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/voice-log", label: "Voice Log", icon: Mic },
  { href: "/weather", label: "Weather", icon: Cloud },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/purchase-requests", label: "Purchase Requests", icon: FileText },
  { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck },
  { href: "/environmental", label: "Environmental & Inspections", icon: Leaf },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/vendors", label: "Vendors", icon: Phone },
  { href: "/sow", label: "Statement of Work", icon: ClipboardSignature },
  { href: "/sole-source", label: "Sole Source", icon: Scale },
  { href: "/work-orders", label: "Work Orders", icon: Wrench },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/ai-library", label: "AI Library", icon: Library },
  { href: "/priority", label: "Priority Queue", icon: Flame },
  { href: "/standards-plan", label: "Standards Plan", icon: ShieldCheck },
  { href: "/report-issue", label: "Report Issue", icon: Flag },
];

const foremanPinned: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pinned: true },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, pinned: true },
  { href: "/schedule", label: "Schedule", icon: Calendar, pinned: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, pinned: true },
];

const foremanApps: SidebarItem[] = [
  { href: "/assets", label: "Assets", icon: Archive },
  { href: "/order-list", label: "Order List", icon: ShoppingCart },
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car },
  { href: "/clubhouse", label: "Clubhouse", icon: Building },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/voice-log", label: "Voice Log", icon: Mic },
  { href: "/weather", label: "Weather", icon: Cloud },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/environmental", label: "Environmental & Inspections", icon: Leaf },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/work-orders", label: "Work Orders", icon: Wrench },
  { href: "/priority", label: "Priority Queue", icon: Flame },
  { href: "/standards-plan", label: "Standards Plan", icon: ShieldCheck },
  { href: "/report-issue", label: "Report Issue", icon: Flag },
];

const mechanicPinned: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pinned: true },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, pinned: true },
  { href: "/schedule", label: "Schedule", icon: Calendar, pinned: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, pinned: true },
];

const mechanicApps: SidebarItem[] = [
  { href: "/assets", label: "Assets", icon: Archive },
  { href: "/order-list", label: "Order List", icon: ShoppingCart },
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car },
  { href: "/clubhouse", label: "Clubhouse", icon: Building },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/weather", label: "Weather", icon: Cloud },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
];

const crewPinned: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pinned: true },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, pinned: true },
  { href: "/schedule", label: "Schedule", icon: Calendar, pinned: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, pinned: true },
];

const crewApps: SidebarItem[] = [
  { href: "/weather", label: "Weather", icon: Cloud },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets },
  { href: "/parking-lot", label: "Parking", icon: Car },
  { href: "/clubhouse", label: "Clubhouse", icon: Building },
  { href: "/order-list", label: "Order List", icon: ShoppingCart },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
];

const proPinned: SidebarItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, pinned: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, pinned: true },
  { href: "/report-issue", label: "Report Issue", icon: Flag, pinned: true },
];

const proApps: SidebarItem[] = [
  { href: "/course-map", label: "Course Map", icon: Map },
  { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets },
  { href: "/weather", label: "Weather", icon: Cloud },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
];

// General Manager view — business / admin catalog.
const gmPinned: SidebarItem[] = [
  { href: "/gm", label: "Dashboard", icon: LayoutDashboard, pinned: true },
  { href: "/budget", label: "Budget", icon: Wallet, pinned: true },
  { href: "/purchase-requests", label: "Purchase Requests", icon: FileText, pinned: true },
  { href: "/reports", label: "Reports", icon: BarChart3, pinned: true },
  { href: "/purchase-requests/new", label: "Create PR", icon: FilePlus, pinned: true },
];

const gmApps: SidebarItem[] = [
  { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck },
  { href: "/reports/monthly-board", label: "Board Report", icon: BarChart3 },
  { href: "/revenue", label: "Revenue", icon: Landmark },
  { href: "/vendors", label: "Vendors", icon: Phone },
  { href: "/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/clubhouse", label: "Clubhouse", icon: Building },
  { href: "/capital-projects", label: "Capital Projects", icon: HardHat },
  { href: "/standards-plan", label: "Standards Plan", icon: ShieldCheck },
  { href: "/sole-source", label: "Sole Source", icon: Scale },
  { href: "/sow", label: "Statement of Work", icon: ClipboardSignature },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/ai-library", label: "AI Library", icon: Library },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/onboarding", label: "Onboarding & SOPs", icon: GraduationCap },
  { href: "/polls", label: "Polls", icon: Vote },
  { href: "/order-list", label: "Order List", icon: ShoppingCart },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/report-issue", label: "Report Issue", icon: Flag },
];

// Business Division Head view — purchase requests, PR audit + cross-business finances.
const bdhPinned: SidebarItem[] = [
  { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck, pinned: true },
  { href: "/purchase-requests", label: "Purchase Requests", icon: FileText, pinned: true },
  { href: "/budget", label: "Budget", icon: Wallet, pinned: true },
  { href: "/reports", label: "Reports", icon: BarChart3, pinned: true },
];

const bdhApps: SidebarItem[] = [
  { href: "/revenue", label: "Revenue", icon: Landmark },
  { href: "/capital-projects", label: "Capital Projects", icon: HardHat },
  { href: "/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/work-orders", label: "Work Orders", icon: Wrench },
];

// ──────────────────────────────────────────────────────────────────────────
// Components
// ──────────────────────────────────────────────────────────────────────────

function NavItem({
  item,
  isActive,
  isCollapsed,
  badgeCount = 0,
  onClick,
}: {
  item: SidebarItem;
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

  const { totalUnread: messagesUnread, fetchChannels } = useChannels();
  const { unreadCount: notificationsUnread, fetchUnreadCount } =
    useNotifications();
  const { record, sortByUsage } = useAppUsage();

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

  // Pick role-appropriate catalog
  let pinned: SidebarItem[];
  let apps: SidebarItem[];
  if (view === "gm") {
    pinned = gmPinned;
    apps = gmApps;
  } else if (view === "bdh") {
    pinned = bdhPinned;
    apps = bdhApps;
  } else if (isPro) {
    pinned = proPinned;
    apps = proApps;
  } else if (isLaborer) {
    pinned = crewPinned;
    apps = crewApps;
  } else if (isMechanic) {
    pinned = mechanicPinned;
    apps = mechanicApps;
  } else if (isForeman) {
    pinned = foremanPinned;
    apps = foremanApps;
  } else {
    pinned = leadershipPinned;
    apps = leadershipApps;
  }

  const sortedApps = sortByUsage(apps);

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
        {sortedApps.length > 0 && (
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
          {sortedApps.map((item) => (
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
          item={{ href: "/notifications", label: "Notifications", icon: Bell }}
          isActive={isActive("/notifications")}
          isCollapsed={isCollapsed}
          badgeCount={notificationsUnread}
          onClick={() => record("/notifications")}
        />
        {!isPro && !isLaborer && (
          <NavItem
            item={{ href: "/settings", label: "Settings", icon: Settings }}
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
