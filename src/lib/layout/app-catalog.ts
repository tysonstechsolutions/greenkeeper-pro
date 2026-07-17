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
  Fuel,
  Sunrise,
  UtensilsCrossed,
  Store,
  UserRoundCog,
  Target,
  type LucideIcon,
} from "lucide-react";

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
//   /chemicals, and /equipment-checkout. The old equipment list is retired,
//   while /equipment is the read-only readiness dashboard and /equipment/view
//   remains the unit-detail route.
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
  /**
   * Extra search terms for the global command palette (⌘K). The label is
   * always searched; keywords let shorthand ("PR", "PTO") and synonyms match
   * an entry that wouldn't otherwise contain the typed text.
   */
  keywords?: string[];
}

// ── Section labels ─────────────────────────────────────────────────────────
// One color family per section so color MEANS something in the menus:
// planning=sky, course=teal, money=honey/amber, paperwork=slate,
// people=indigo, reference=violet. Alerts stay red.
export const GROUPS = {
  workspaces: "Workspaces",
  planning: "Planning",
  course: "Course & Field",
  money: "Money & Assets",
  paperwork: "Paperwork",
  people: "People & Events",
  reference: "Reference & AI",
} as const;

/** Render order for sections in the sidebar and the More grid. */
export const GROUP_ORDER: string[] = [
  GROUPS.workspaces,
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
  | "pro";

// Reusable entries (same metadata everywhere they appear).
// Daily anchors (pinned) wear the brand green; every other entry's color
// comes from its section's family so the More grid reads as organized
// shelves instead of confetti.
const DASHBOARD: AppEntry = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-emerald-600 to-green-700", pinned: true };
// Operations — one normalized command center for every actionable source.
const TODAY: AppEntry = { href: "/operations", label: "Operations", icon: Sunrise, color: "from-emerald-600 to-green-700", pinned: true, keywords: ["today", "command center", "work", "priorities"] };
// Dashboard re-homed inside Course & Range for the leadership view (other
// views keep the pinned DASHBOARD above).
const TURF_DASHBOARD: AppEntry = { ...DASHBOARD, pinned: false, label: "Turf Dashboard", group: GROUPS.course };
const SCHEDULE: AppEntry = { href: "/schedule", label: "Schedule", icon: Calendar, color: "from-emerald-600 to-green-700", pinned: true, keywords: ["time off", "pto", "vacation", "shifts", "crew"] };
const MY_DAY: AppEntry = { href: "/my-day", label: "My Work", icon: ListChecks, color: "from-emerald-600 to-green-700", pinned: true, keywords: ["to do", "todo", "tasks", "checklist", "my day"] };
const CREATE_PR: AppEntry = { href: "/purchase-requests/new", label: "Create PR", icon: FilePlus, color: "from-amber-500 to-yellow-600", pinned: true, keywords: ["new pr", "purchase request", "buy", "order"] };

const CALENDAR: AppEntry = { href: "/calendar", label: "Calendar", icon: CalendarDays, color: "from-sky-500 to-blue-600", group: GROUPS.planning };
const WEATHER: AppEntry = { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600", group: GROUPS.planning };
const STANDARDS_PLAN: AppEntry = { href: "/standards-plan", label: "Standards Plan", icon: ShieldCheck, color: "from-sky-600 to-blue-700", group: GROUPS.planning };
// The live scorecard (DB-backed). /standards-plan remains the original static
// FY24 assessment view; this is the same standards, owned and evaluated.
const PROGRAM_STANDARDS: AppEntry = { href: "/standards", label: "Program Standards", icon: Target, color: "from-sky-600 to-blue-700", group: GROUPS.planning, pinned: true, keywords: ["scorecard", "gaps", "navy", "standards", "score", "compliance"] };

const COURSE_MAP: AppEntry = { href: "/course-map", label: "Course Map", icon: MapIcon, color: "from-teal-500 to-emerald-600", group: GROUPS.course };
const SPRINKLER_MAP: AppEntry = { href: "/irrigation/map", label: "Sprinkler Map", icon: Droplets, color: "from-teal-500 to-cyan-600", group: GROUPS.course };
const PARKING: AppEntry = { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-teal-600 to-emerald-700", group: GROUPS.course };
const CLUBHOUSE: AppEntry = { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-teal-600 to-emerald-700", group: GROUPS.course };
const PHOTOS: AppEntry = { href: "/photos", label: "Photos", icon: Camera, color: "from-teal-500 to-cyan-600", group: GROUPS.course };
const VOICE_LOG: AppEntry = { href: "/voice-log", label: "Voice Log", icon: Mic, color: "from-teal-500 to-cyan-600", group: GROUPS.course };
const ENVIRONMENTAL: AppEntry = { href: "/environmental", label: "Environmental & Inspections", icon: Leaf, color: "from-teal-600 to-emerald-700", group: GROUPS.course };
const REPORT_ISSUE: AppEntry = { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-700", group: GROUPS.course };
const EQUIPMENT: AppEntry = { href: "/equipment", label: "Equipment", icon: Wrench, color: "from-amber-500 to-yellow-600", group: GROUPS.course };

const ASSETS: AppEntry = { href: "/assets", label: "Assets", icon: Archive, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
const IMPORT_ASSETS: AppEntry = { href: "/assets/import", label: "Import Assets", icon: FilePlus, color: "from-amber-600 to-yellow-700", group: GROUPS.money };
const ORDER_LIST: AppEntry = { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
const PURCHASE_REQUESTS: AppEntry = { href: "/purchase-requests", label: "Purchase Requests", icon: FileText, color: "from-amber-500 to-yellow-600", group: GROUPS.money, keywords: ["pr", "prs", "receipt", "reconcile"] };
const PR_AUDIT: AppEntry = { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck, color: "from-amber-600 to-yellow-700", group: GROUPS.money };
const VENDORS: AppEntry = { href: "/vendors", label: "Vendors", icon: Phone, color: "from-amber-600 to-yellow-700", group: GROUPS.money };
// Fuel refill log — Reladyne deliveries. Money-side (spend tracking) but the
// tanks physically live on the course, so it appears in both hubs.
const FUEL: AppEntry = { href: "/fuel", label: "Fuel Log", icon: Fuel, color: "from-amber-500 to-yellow-600", group: GROUPS.money };

const SOW: AppEntry = { href: "/sow", label: "Statement of Work", icon: ClipboardSignature, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const SOLE_SOURCE: AppEntry = { href: "/sole-source", label: "Sole Source", icon: Scale, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const WORK_ORDERS: AppEntry = { href: "/work-orders", label: "Work Orders", icon: Wrench, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };
const DOCUMENTS: AppEntry = { href: "/documents", label: "Documents", icon: FolderOpen, color: "from-slate-500 to-slate-700", group: GROUPS.paperwork };

// Phase 4 — Restaurant & Pro Shop modules.
const RESTAURANT_INVENTORY: AppEntry = { href: "/restaurant/inventory", label: "Inventory Count", icon: ClipboardCheck, color: "from-amber-500 to-orange-600", group: GROUPS.money };
const PRO_SHOP_INVENTORY: AppEntry = { href: "/pro-shop/inventory", label: "Inventory Count", icon: ClipboardCheck, color: "from-indigo-500 to-blue-600", group: GROUPS.money };
const RESTAURANT_PURCHASES: AppEntry = { href: "/restaurant/purchases", label: "Purchases", icon: ShoppingCart, color: "from-amber-500 to-orange-600", group: GROUPS.money };
const DUTY_LOG: AppEntry = { href: "/duty-log", label: "Duty & Cleaning Log", icon: ListChecks, color: "from-amber-500 to-orange-600", group: GROUPS.course };

const STAFF: AppEntry = { href: "/staff", label: "Staff", icon: Users, color: "from-indigo-500 to-blue-600", group: GROUPS.people, keywords: ["employees", "team", "people", "1:1", "one on one"] };
const DUTY_OWNERSHIP: AppEntry = { href: "/operations/duties", label: "Duty Ownership", icon: UserRoundCog, color: "from-indigo-500 to-blue-600", group: GROUPS.people };
const CERTIFICATIONS: AppEntry = { href: "/certifications", label: "Certifications", icon: GraduationCap, color: "from-indigo-500 to-blue-600", group: GROUPS.people };
const ONEONONE_INSIGHTS: AppEntry = { href: "/staff/insights", label: "1:1 Insights", icon: BarChart3, color: "from-indigo-500 to-blue-600", group: GROUPS.people, keywords: ["one on one", "1:1", "themes", "morale", "concerns"] };
const PRO_SHOP: AppEntry = { href: "/pro-shop-schedule", label: "Pro Shop Schedule", icon: CalendarClock, color: "from-indigo-500 to-blue-600", group: GROUPS.people };
const PRO_SHOP_DUTIES: AppEntry = { href: "/pro-shop-schedule/duties", label: "Shop Duties", icon: ListChecks, color: "from-indigo-500 to-blue-600", group: GROUPS.people };

const ASSISTANT: AppEntry = { href: "/assistant", label: "AI Assistant", icon: Bot, color: "from-violet-500 to-purple-600", group: GROUPS.reference };
const KNOWLEDGE: AppEntry = { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-violet-500 to-purple-600", group: GROUPS.reference };
const AI_LIBRARY: AppEntry = { href: "/ai-library", label: "AI Library", icon: Library, color: "from-violet-500 to-purple-600", group: GROUPS.reference };

// Business + admin entries. The GM dashboard survives the view merge as a
// regular Money tool — same page, just reached through the workspace now.
const GM_DASHBOARD: AppEntry = { href: "/gm", label: "GM Dashboard", icon: LayoutDashboard, color: "from-amber-500 to-yellow-600", group: GROUPS.money };
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
  label: "Course & Range",
  icon: MapIcon,
  color: "from-teal-500 to-emerald-600",
  group: GROUPS.workspaces,
  children: [
    TURF_DASHBOARD,
    EQUIPMENT,
    COURSE_MAP,
    SPRINKLER_MAP,
    PARKING,
    CLUBHOUSE,
    WORK_ORDERS,
    ENVIRONMENTAL,
    FUEL,
    PHOTOS,
    VOICE_LOG,
    WEATHER,
    CALENDAR,
    STANDARDS_PLAN,
    REPORT_ISSUE,
  ],
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

// ── Workspace hubs (Operation Blueprint Phase 1) ──────────────────────────
// The leadership view organizes around the real businesses: Course & Range
// (HUB_COURSE above), Restaurant, Pro Shop, Money, People & Paperwork.
// Restaurant and Pro Shop have CUSTOM landing pages (duties + obligations +
// these children as link cards); Money and People render the plain hub grid.

export const HUB_RESTAURANT: AppEntry = {
  href: "/restaurant",
  label: "Restaurant",
  icon: UtensilsCrossed,
  color: "from-amber-500 to-orange-600",
  group: GROUPS.workspaces,
  children: [RESTAURANT_INVENTORY, RESTAURANT_PURCHASES, DUTY_LOG, REVENUE, ORDER_LIST, CLUBHOUSE, CALENDAR],
};

export const HUB_PRO_SHOP: AppEntry = {
  href: "/pro-shop",
  label: "Pro Shop",
  icon: Store,
  color: "from-indigo-500 to-blue-600",
  group: GROUPS.workspaces,
  children: [PRO_SHOP, PRO_SHOP_INVENTORY, PRO_SHOP_DUTIES, TOURNAMENTS, REVENUE],
};

export const HUB_MONEY: AppEntry = {
  href: "/money",
  label: "Money",
  icon: Wallet,
  color: "from-amber-500 to-yellow-600",
  group: GROUPS.workspaces,
  children: [
    GM_DASHBOARD,
    FINANCIAL_WATCH,
    BUDGET,
    REVENUE,
    PURCHASE_REQUESTS,
    PR_AUDIT,
    ORDER_LIST,
    FUEL,
    VENDORS,
    CAPITAL_PROJECTS,
    REPORTS,
    BOARD_REPORT,
    ASSETS,
    IMPORT_ASSETS,
  ],
};

export const HUB_PEOPLE: AppEntry = {
  href: "/people",
  label: "People & Paperwork",
  icon: Users,
  color: "from-indigo-500 to-blue-600",
  group: GROUPS.workspaces,
  children: [STAFF, ONEONONE_INSIGHTS, DUTY_OWNERSHIP, CERTIFICATIONS, ONBOARDING, HUB_PAPERWORK, DOCUMENTS, KNOWLEDGE],
};

/** Hub lookup by route, so the hub pages can render their own card grid. */
export const HUBS: Record<string, AppEntry> = {
  [HUB_COURSE.href]: HUB_COURSE,
  [HUB_PAPERWORK.href]: HUB_PAPERWORK,
  [HUB_PROCUREMENT.href]: HUB_PROCUREMENT,
  [HUB_LIBRARY.href]: HUB_LIBRARY,
  [HUB_RESTAURANT.href]: HUB_RESTAURANT,
  [HUB_PRO_SHOP.href]: HUB_PRO_SHOP,
  [HUB_MONEY.href]: HUB_MONEY,
  [HUB_PEOPLE.href]: HUB_PEOPLE,
};

export const APP_CATALOG: Record<CatalogKey, AppEntry[]> = {
  // The Operation Blueprint layout: four daily anchors + five workspaces.
  // Everything else is reachable INSIDE a workspace (hub children), so the
  // menu stays six doors instead of twenty entries.
  leadership: [
    TODAY,
    PROGRAM_STANDARDS,
    MY_DAY,
    SCHEDULE,
    CREATE_PR,
    HUB_COURSE,
    HUB_RESTAURANT,
    HUB_PRO_SHOP,
    HUB_MONEY,
    HUB_PEOPLE,
    ASSISTANT,
    AI_LIBRARY,
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
};

export interface RoleFlags {
  isPro: boolean;
  isForeman: boolean;
  isMechanic: boolean;
  isLaborer: boolean;
}

/** Resolve which catalog a user sees from their role flags. */
export function resolveCatalogKey({
  isPro,
  isForeman,
  isMechanic,
  isLaborer,
}: RoleFlags): CatalogKey {
  if (isPro) return "pro";
  if (isLaborer) return "crew";
  if (isMechanic) return "mechanic";
  if (isForeman) return "foreman";
  return "leadership";
}

export function getCatalog(flags: RoleFlags): AppEntry[] {
  return APP_CATALOG[resolveCatalogKey(flags)];
}

/**
 * Every unique navigable entry across ALL role catalogs plus hub children,
 * deduped by href — the page/tool index for the global search palette (⌘K).
 * Hubs themselves are included (they're real landing pages) alongside their
 * members, so both "Money" and "Purchase Requests" are findable. Because the
 * app runs as one unified view, searching every role's catalog just means the
 * palette can reach everything regardless of how a tool is normally menued.
 */
export function getAllSearchableEntries(): AppEntry[] {
  const seen = new Set<string>();
  const out: AppEntry[] = [];
  const visit = (entries: AppEntry[]) => {
    for (const entry of entries) {
      if (!seen.has(entry.href)) {
        seen.add(entry.href);
        out.push(entry);
      }
      if (entry.children) visit(entry.children);
    }
  };
  for (const key of Object.keys(APP_CATALOG) as CatalogKey[]) {
    visit(APP_CATALOG[key]);
  }
  visit(Object.values(HUBS));
  return out;
}
