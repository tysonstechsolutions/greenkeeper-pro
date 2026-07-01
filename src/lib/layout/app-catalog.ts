import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  CalendarClock,
  Archive,
  ShoppingCart,
  Map as MapIcon,
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
  Activity,
  ListChecks,
  Package,
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
//   /tasks — still reachable via deep links.
// Routes deleted entirely: /priority, /plan, /spray-window, /drone,
//   /water-usage, /feedback, /compliance, /checklists, /inspections,
//   /work-order (singular, superseded by /work-orders), /messages, /polls,
//   /chemicals, /equipment-checkout, and /equipment (list — operational data
//   now lives on /assets; the /equipment/view detail route remains).
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
   * Section this entry belongs to. Both the desktop sidebar and the mobile
   * "More" grid render entries under these labels, in GROUP_ORDER, in the
   * order they appear in the catalog — STABLE, never resorted by usage.
   * Ungrouped entries fall into a trailing "Apps" bucket.
   */
  group?: string;
  /**
   * When set, this entry is a HUB: in the menus it renders as a single link
   * to `href` (a landing page), and that page renders these children as a
   * card grid. The member tools keep their own routes — the hub just groups
   * them so the menu has fewer top-level entries.
   */
  children?: AppEntry[];
}

// ── Section labels ─────────────────────────────────────────────────────────
// One color family per section so color MEANS something in the menus:
// planning=sky, course=teal, money=honey/amber, paperwork=slate,
// people=indigo, reference=violet. Alerts stay red.
export const GROUPS = {
  planning: "Planning",
  course: "Course & Field",
  money: "Money & Assets",
  paperwork: "Paperwork",
  people: "People & Events",
  reference: "Reference & AI",
} as const;

/** Render order for sections in the sidebar and the More grid. */
export const GROUP_ORDER: string[] = [
  GROUPS.planning,
  GROUPS.course,
  GROUPS.money,
  GROUPS.paperwork,
  GROUPS.people,
  GROUPS.reference,
];

/** Bucket a catalog into labeled sections, preserving catalog order. */
export function groupCatalog(
  items: AppEntry[],
): { label: string; items: AppEntry[] }[] {
  const buckets = new Map<string, AppEntry[]>();
  for (const item of items) {
    const label = item.group ?? "Apps";
    const bucket = buckets.get(label);
    if (bucket) bucket.push(item);
    else buckets.set(label, [item]);
  }
  const out: { label: string; items: AppEntry[] }[] = [];
  for (const label of [...GROUP_ORDER, "Apps"]) {
    const bucket = buckets.get(label);
    if (bucket) {
      out.push({ label, items: bucket });
      buckets.delete(label);
    }
  }
  // Any label not in GROUP_ORDER still renders rather than vanishing.
  for (const [label, bucket] of buckets) out.push({ label, items: bucket });
  return out;
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
// Daily anchors (pinned) wear the brand green; every other entry's color
// comes from its section's family so the More grid reads as organized
// shelves instead of confetti.
const DASHBOARD: AppEntry = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-emerald-600 to-green-700", pinned: true };
const SCHEDULE: AppEntry = { href: "/schedule", label: "Schedule", icon: Calendar, color: "from-emerald-600 to-green-700", pinned: true };
const MY_DAY: AppEntry = { href: "/my-day", label: "My Day", icon: ListChecks, color: "from-emerald-600 to-green-700", pinned: true };
const CREATE_PR: AppEntry = { href: "/purchase-requests/new", label: "Create PR", icon: FilePlus, color: "from-amber-500 to-yellow-600", pinned: true };

const CALENDAR: AppEntry = { href: "/calendar", label: "Calendar", icon: CalendarDays, color: "from-sky-500 to-blue-600", group: GROUPS.planning };
const WEATHER: AppEntry = { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600", group: GROUPS.planning };
const STANDARDS_PLAN: AppEntry = { href: "/standards-plan", label: "Standards Plan", icon: ShieldCheck, color: "from-sky-600 to-blue-700", group: GROUPS.planning };

const COURSE_MAP: AppEntry = { href: "/course-map", label: "Course Map", icon: MapIcon, color: "from-teal-500 to-emerald-600", group: GROUPS.course };
const SPRINKLER_MAP: AppEntry = { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets, color: "from-teal-500 to-cyan-600", group: GROUPS.course };
const PARKING: AppEntry = { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-teal-600 to-emerald-700", group: GROUPS.course };
const CLUBHOUSE: AppEntry = { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-teal-600 to-emerald-700", group: GROUPS.course };
const PHOTOS: AppEntry = { href: "/photos", label: "Photos", icon: Camera, color: "from-teal-500 to-cyan-600", group: GROUPS.course };
const VOICE_LOG: AppEntry = { href: "/voice-log", label: "Voice Log", icon: Mic, color: "from-teal-500 to-cyan-600", group: GROUPS.course };
const ENVIRONMENTAL: AppEntry = { href: "/environmental", label: "Environmental & Inspections", icon: Leaf, color: "from-teal-600 to-emerald-700", group: GROUPS.course };
const REPORT_ISSUE: AppEntry = { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-700", group: GROUPS.course };

const ASSETS: AppEntry = { href: "/assets", label: "Assets", icon: Archive, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
const ORDER_LIST: AppEntry = { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
const PURCHASE_REQUESTS: AppEntry = { href: "/purchase-requests", label: "Purchase Requests", icon: FileText, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
const PR_AUDIT: AppEntry = { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck, color: "from-amber-600 to-yellow-700", group: GROUPS.money };
const VENDORS: AppEntry = { href: "/vendors", label: "Vendors", icon: Phone, color: "from-amber-600 to-yellow-700", group: GROUPS.money };

const SOW: AppEntry = { href: "/sow", label: "Statement of Work", icon: ClipboardSignature, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const SOLE_SOURCE: AppEntry = { href: "/sole-source", label: "Sole Source", icon: Scale, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const WORK_ORDERS: AppEntry = { href: "/work-orders", label: "Work Orders", icon: Wrench, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const DOCUMENTS: AppEntry = { href: "/documents", label: "Documents", icon: FolderOpen, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };

const STAFF: AppEntry = { href: "/staff", label: "Staff", icon: Users, color: "from-indigo-500 to-blue-600", group: GROUPS.people };
const PRO_SHOP: AppEntry = { href: "/pro-shop-schedule", label: "Pro Shop Schedule", icon: CalendarClock, color: "from-indigo-500 to-blue-600", group: GROUPS.people };

const ASSISTANT: AppEntry = { href: "/assistant", label: "AI Assistant", icon: Bot, color: "from-violet-500 to-purple-600", group: GROUPS.reference };
const KNOWLEDGE: AppEntry = { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-violet-500 to-purple-600", group: GROUPS.reference };
const AI_LIBRARY: AppEntry = { href: "/ai-library", label: "AI Library", icon: Library, color: "from-violet-500 to-purple-600", group: GROUPS.reference };

// GM / BDH (business + admin) entries.
const GM_DASHBOARD: AppEntry = { href: "/gm", label: "Dashboard", icon: LayoutDashboard, color: "from-emerald-600 to-green-700", pinned: true };
const FINANCIAL_WATCH: AppEntry = { href: "/financial-watch", label: "Financial Watch", icon: Activity, color: "from-amber-500 to-yellow-600", pinned: true, group: GROUPS.money };
const BUDGET: AppEntry = { href: "/budget", label: "Budget", icon: Wallet, color: "from-amber-500 to-yellow-600", pinned: true, group: GROUPS.money };
const REPORTS: AppEntry = { href: "/reports", label: "Reports", icon: BarChart3, color: "from-amber-600 to-yellow-700", pinned: true, group: GROUPS.money };
const BOARD_REPORT: AppEntry = { href: "/reports/monthly-board", label: "Board Report", icon: BarChart3, color: "from-amber-600 to-yellow-700", group: GROUPS.money };
const REVENUE: AppEntry = { href: "/revenue", label: "Revenue", icon: Landmark, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
const CAPITAL_PROJECTS: AppEntry = { href: "/capital-projects", label: "Capital Projects", icon: HardHat, color: "from-amber-600 to-yellow-700", group: GROUPS.money };
const TOURNAMENTS: AppEntry = { href: "/tournaments", label: "Tournaments", icon: Trophy, color: "from-indigo-500 to-blue-600", group: GROUPS.people };
const ONBOARDING: AppEntry = { href: "/onboarding", label: "Onboarding & SOPs", icon: GraduationCap, color: "from-violet-500 to-purple-600", group: GROUPS.reference };
const SF52: AppEntry = { href: "/staff/sf52", label: "SF-52", icon: FileText, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const DD200: AppEntry = { href: "/dd-forms/200", label: "DD-200 (Property Loss)", icon: FileText, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const DD2212: AppEntry = { href: "/dd-forms/2212", label: "2212 (Disposition)", icon: FileText, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const DISPOSITION_PACKET: AppEntry = { href: "/dd-forms/packet", label: "Disposition Packet", icon: Package, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };

// ── Hubs ──────────────────────────────────────────────────────────────────
// Each hub is one menu entry that opens a landing page (the matching route in
// src/app/<hub>/page.tsx) showing its `children` as cards. Member tools keep
// their own routes; the hub only collapses several menu entries into one.

export const HUB_COURSE: AppEntry = {
  href: "/grounds",
  label: "Course & Grounds",
  icon: MapIcon,
  color: "from-teal-500 to-emerald-600",
  group: GROUPS.course,
  children: [COURSE_MAP, PARKING, SPRINKLER_MAP, CLUBHOUSE],
};

export const HUB_PAPERWORK: AppEntry = {
  href: "/paperwork",
  label: "Paperwork",
  icon: ClipboardSignature,
  color: "from-slate-500 to-slate-700",
  group: GROUPS.paperwork,
  children: [SOW, SOLE_SOURCE, WORK_ORDERS, SF52, DD200, DD2212, DISPOSITION_PACKET, ENVIRONMENTAL],
};

export const HUB_PROCUREMENT: AppEntry = {
  href: "/procurement",
  label: "Procurement",
  icon: ShoppingCart,
  color: "from-amber-500 to-yellow-600",
  group: GROUPS.money,
  children: [PURCHASE_REQUESTS, PR_AUDIT, VENDORS, ORDER_LIST],
};

// Library = the "reference shelf": the knowledge base, every generated
// document, the onboarding/SOP packet builder, and the reusable-AI-answer
// store. Grouping them gives leadership/GM one menu entry instead of three or
// four. Crew/foreman/mechanic/pro keep Knowledge Base as a direct top-level
// entry (it's their primary field reference), so they don't get this hub.
export const HUB_LIBRARY: AppEntry = {
  href: "/library",
  label: "Library",
  icon: Library,
  color: "from-violet-500 to-purple-600",
  group: GROUPS.reference,
  children: [KNOWLEDGE, DOCUMENTS, ONBOARDING, AI_LIBRARY],
};

/** Hub lookup by route, so the hub pages can render their own card grid. */
export const HUBS: Record<string, AppEntry> = {
  [HUB_COURSE.href]: HUB_COURSE,
  [HUB_PAPERWORK.href]: HUB_PAPERWORK,
  [HUB_PROCUREMENT.href]: HUB_PROCUREMENT,
  [HUB_LIBRARY.href]: HUB_LIBRARY,
};

export const APP_CATALOG: Record<CatalogKey, AppEntry[]> = {
  leadership: [
    DASHBOARD,
    MY_DAY,
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
    HUB_LIBRARY,
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
    MY_DAY,
    FINANCIAL_WATCH,
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
    HUB_LIBRARY,
    STAFF,
    REPORT_ISSUE,
  ],
  bdh: [
    { ...PR_AUDIT, pinned: true },
    { ...PURCHASE_REQUESTS, pinned: true },
    FINANCIAL_WATCH,
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
