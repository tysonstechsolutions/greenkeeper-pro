import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  CalendarClock,
  Archive,
  ShoppingCart,
  Map,
  Droplets,
  Car,
  Building,
  Users,
  Camera,
  Mic,
  Cloud,
  Bot,
  FileText,
  FilePlus,
  ClipboardCheck,
  Leaf,
  BookOpen,
  Phone,
  ClipboardSignature,
  Scale,
  Wrench,
  FolderOpen,
  Library,
  ShieldCheck,
  Flag,
  Wallet,
  BarChart3,
  Landmark,
  HardHat,
  Trophy,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import type { AppView } from "@/lib/providers/view-provider";

// ──────────────────────────────────────────────────────────────────────────
// SHARED APP CATALOG — single source of truth for both the desktop sidebar
// (src/components/layout/sidebar.tsx) and the mobile "More" grid
// (src/app/more/page.tsx). Previously these two files each hardcoded their
// own role→app lists and had drifted out of sync; they now both read from
// here so a menu change is made in exactly one place.
//
// `pinned: true` items render in the sidebar's always-on top section (and
// keep their order). Everything else is sorted by usage. The mobile grid
// shows every entry for the role.
//
// Routes intentionally NOT listed here (kept in code, hidden from menus):
//   /tasks, /messages, /polls — still reachable via deep links.
// Routes deleted entirely: /priority, /plan, /spray-window, /drone,
//   /water-usage, /feedback, /compliance, /checklists, /inspections,
//   /work-order (singular, superseded by /work-orders).
// ──────────────────────────────────────────────────────────────────────────

export interface AppEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind gradient for the mobile grid icon tile. */
  color: string;
  /** Pinned items sit in the sidebar's top section and are never reordered. */
  pinned?: boolean;
  /**
   * When set, this entry is a HUB: in the menus it renders as a single link
   * to `href` (a landing page), and that page renders these children as a
   * card grid. The member tools keep their own routes — the hub just groups
   * them so the menu has fewer top-level entries.
   */
  children?: AppEntry[];
}

export type CatalogKey =
  | "leadership"
  | "foreman"
  | "mechanic"
  | "crew"
  | "pro"
  | "gm"
  | "bdh";

// Reusable entries (same metadata everywhere they appear).
const DASHBOARD: AppEntry = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-amber-500 to-yellow-600", pinned: true };
const SCHEDULE: AppEntry = { href: "/schedule", label: "Schedule", icon: Calendar, color: "from-blue-500 to-indigo-600", pinned: true };
const CREATE_PR: AppEntry = { href: "/purchase-requests/new", label: "Create PR", icon: FilePlus, color: "from-amber-500 to-yellow-600", pinned: true };

const CALENDAR: AppEntry = { href: "/calendar", label: "Calendar", icon: CalendarDays, color: "from-sky-500 to-indigo-600" };
const ASSETS: AppEntry = { href: "/assets", label: "Assets", icon: Archive, color: "from-amber-600 to-yellow-700" };
const ORDER_LIST: AppEntry = { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" };
const COURSE_MAP: AppEntry = { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" };
const SPRINKLER_MAP: AppEntry = { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets, color: "from-cyan-500 to-blue-600" };
const PARKING: AppEntry = { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" };
const CLUBHOUSE: AppEntry = { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" };
const STAFF: AppEntry = { href: "/staff", label: "Staff", icon: Users, color: "from-blue-500 to-indigo-600" };
const PRO_SHOP: AppEntry = { href: "/pro-shop-schedule", label: "Pro Shop Schedule", icon: CalendarClock, color: "from-sky-600 to-indigo-600" };
const PHOTOS: AppEntry = { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" };
const VOICE_LOG: AppEntry = { href: "/voice-log", label: "Voice Log", icon: Mic, color: "from-violet-500 to-purple-600" };
const WEATHER: AppEntry = { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" };
const ASSISTANT: AppEntry = { href: "/assistant", label: "AI Assistant", icon: Bot, color: "from-violet-500 to-fuchsia-600" };
const PURCHASE_REQUESTS: AppEntry = { href: "/purchase-requests", label: "Purchase Requests", icon: FileText, color: "from-blue-600 to-indigo-700" };
const PR_AUDIT: AppEntry = { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck, color: "from-cyan-600 to-blue-700" };
const ENVIRONMENTAL: AppEntry = { href: "/environmental", label: "Environmental & Inspections", icon: Leaf, color: "from-green-600 to-emerald-700" };
const KNOWLEDGE: AppEntry = { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-amber-700" };
const VENDORS: AppEntry = { href: "/vendors", label: "Vendors", icon: Phone, color: "from-purple-500 to-fuchsia-700" };
const SOW: AppEntry = { href: "/sow", label: "Statement of Work", icon: ClipboardSignature, color: "from-cyan-600 to-teal-700" };
const SOLE_SOURCE: AppEntry = { href: "/sole-source", label: "Sole Source", icon: Scale, color: "from-indigo-500 to-violet-600" };
const WORK_ORDERS: AppEntry = { href: "/work-orders", label: "Work Orders", icon: Wrench, color: "from-orange-600 to-amber-700" };
const DOCUMENTS: AppEntry = { href: "/documents", label: "Documents", icon: FolderOpen, color: "from-slate-500 to-gray-600" };
const AI_LIBRARY: AppEntry = { href: "/ai-library", label: "AI Library", icon: Library, color: "from-violet-500 to-purple-600" };
const STANDARDS_PLAN: AppEntry = { href: "/standards-plan", label: "Standards Plan", icon: ShieldCheck, color: "from-emerald-500 to-teal-600" };
const REPORT_ISSUE: AppEntry = { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-700" };

// GM / BDH (business + admin) entries.
const GM_DASHBOARD: AppEntry = { href: "/gm", label: "Dashboard", icon: LayoutDashboard, color: "from-amber-500 to-yellow-600", pinned: true };
const BUDGET: AppEntry = { href: "/budget", label: "Budget", icon: Wallet, color: "from-emerald-600 to-green-700", pinned: true };
const REPORTS: AppEntry = { href: "/reports", label: "Reports", icon: BarChart3, color: "from-blue-600 to-indigo-700", pinned: true };
const BOARD_REPORT: AppEntry = { href: "/reports/monthly-board", label: "Board Report", icon: BarChart3, color: "from-blue-600 to-indigo-700" };
const REVENUE: AppEntry = { href: "/revenue", label: "Revenue", icon: Landmark, color: "from-amber-600 to-yellow-700" };
const TOURNAMENTS: AppEntry = { href: "/tournaments", label: "Tournaments", icon: Trophy, color: "from-yellow-500 to-amber-600" };
const CAPITAL_PROJECTS: AppEntry = { href: "/capital-projects", label: "Capital Projects", icon: HardHat, color: "from-orange-600 to-amber-700" };
const ONBOARDING: AppEntry = { href: "/onboarding", label: "Onboarding & SOPs", icon: GraduationCap, color: "from-teal-500 to-emerald-600" };
const SF52: AppEntry = { href: "/staff/sf52", label: "SF-52", icon: FileText, color: "from-slate-600 to-gray-700" };

// ── Hubs ──────────────────────────────────────────────────────────────────
// Each hub is one menu entry that opens a landing page (the matching route in
// src/app/<hub>/page.tsx) showing its `children` as cards. Member tools keep
// their own routes; the hub only collapses several menu entries into one.

export const HUB_COURSE: AppEntry = {
  href: "/grounds",
  label: "Course & Grounds",
  icon: Map,
  color: "from-teal-500 to-cyan-600",
  children: [COURSE_MAP, PARKING, SPRINKLER_MAP, CLUBHOUSE],
};

export const HUB_PAPERWORK: AppEntry = {
  href: "/paperwork",
  label: "Paperwork",
  icon: ClipboardSignature,
  color: "from-cyan-600 to-teal-700",
  children: [SOW, SOLE_SOURCE, DOCUMENTS, WORK_ORDERS, SF52, ENVIRONMENTAL],
};

export const HUB_PROCUREMENT: AppEntry = {
  href: "/procurement",
  label: "Procurement",
  icon: ShoppingCart,
  color: "from-emerald-500 to-green-600",
  children: [PURCHASE_REQUESTS, PR_AUDIT, VENDORS, ORDER_LIST],
};

/** Hub lookup by route, so the hub pages can render their own card grid. */
export const HUBS: Record<string, AppEntry> = {
  [HUB_COURSE.href]: HUB_COURSE,
  [HUB_PAPERWORK.href]: HUB_PAPERWORK,
  [HUB_PROCUREMENT.href]: HUB_PROCUREMENT,
};

export const APP_CATALOG: Record<CatalogKey, AppEntry[]> = {
  leadership: [
    DASHBOARD,
    SCHEDULE,
    CREATE_PR,
    CALENDAR,
    ASSETS,
    HUB_COURSE,
    HUB_PAPERWORK,
    HUB_PROCUREMENT,
    STAFF,
    PRO_SHOP,
    PHOTOS,
    VOICE_LOG,
    WEATHER,
    ASSISTANT,
    KNOWLEDGE,
    AI_LIBRARY,
    STANDARDS_PLAN,
    REPORT_ISSUE,
  ],
  foreman: [
    DASHBOARD,
    SCHEDULE,
    ASSETS,
    ORDER_LIST,
    HUB_COURSE,
    STAFF,
    PHOTOS,
    VOICE_LOG,
    WEATHER,
    ASSISTANT,
    ENVIRONMENTAL,
    KNOWLEDGE,
    WORK_ORDERS,
    STANDARDS_PLAN,
    REPORT_ISSUE,
  ],
  mechanic: [
    DASHBOARD,
    SCHEDULE,
    ASSETS,
    ORDER_LIST,
    HUB_COURSE,
    PHOTOS,
    WEATHER,
    KNOWLEDGE,
  ],
  crew: [
    DASHBOARD,
    SCHEDULE,
    WEATHER,
    PHOTOS,
    HUB_COURSE,
    ORDER_LIST,
    KNOWLEDGE,
  ],
  pro: [
    DASHBOARD,
    { ...REPORT_ISSUE, pinned: true },
    COURSE_MAP,
    SPRINKLER_MAP,
    WEATHER,
    PHOTOS,
    KNOWLEDGE,
  ],
  gm: [
    GM_DASHBOARD,
    BUDGET,
    { ...PURCHASE_REQUESTS, pinned: true },
    REPORTS,
    CREATE_PR,
    CALENDAR,
    HUB_PROCUREMENT,
    HUB_PAPERWORK,
    BOARD_REPORT,
    REVENUE,
    TOURNAMENTS,
    CLUBHOUSE,
    CAPITAL_PROJECTS,
    STANDARDS_PLAN,
    AI_LIBRARY,
    STAFF,
    ONBOARDING,
    REPORT_ISSUE,
  ],
  bdh: [
    { ...PR_AUDIT, pinned: true },
    { ...PURCHASE_REQUESTS, pinned: true },
    BUDGET,
    REPORTS,
    REVENUE,
    CAPITAL_PROJECTS,
    TOURNAMENTS,
    WORK_ORDERS,
  ],
};

export interface RoleFlags {
  view: AppView;
  isPro: boolean;
  isForeman: boolean;
  isMechanic: boolean;
  isLaborer: boolean;
}

/** Resolve which catalog a user sees from their view + role flags. */
export function resolveCatalogKey({
  view,
  isPro,
  isForeman,
  isMechanic,
  isLaborer,
}: RoleFlags): CatalogKey {
  if (view === "gm") return "gm";
  if (view === "bdh") return "bdh";
  if (isPro) return "pro";
  if (isLaborer) return "crew";
  if (isMechanic) return "mechanic";
  if (isForeman) return "foreman";
  return "leadership";
}

export function getCatalog(flags: RoleFlags): AppEntry[] {
  return APP_CATALOG[resolveCatalogKey(flags)];
}
