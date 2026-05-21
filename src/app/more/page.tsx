"use client";

import Link from "next/link";
import {
  Camera,
  Map,
  BookOpen,
  Settings,
  Users,
  Cloud,
  Bell,
  Flag,
  Coffee,
  Smartphone,
  Car,
  Building,
  ShoppingCart,
  FileText,
  Leaf,
  Bot,
  Archive,
  Mic,
  Phone,
  ClipboardSignature,
  ClipboardList,
  Scale,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppUsage } from "@/lib/hooks/useAppUsage";

// ── Types ──
interface AppItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind gradient classes for the icon tile. */
  color: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// APP CATALOGS BY ROLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Hidden per request: Maint Calendar, Annual Plan, Irrigation, Pin Sheet,
// Board Report, Drone Flights, Water Usage, Tournaments, Revenue, Capital
// Projects, Budget, Reports, IL RUP Records.
//
// Combined: Environmental + Inspections → "Environmental & Inspections"
// (entry routes to /environmental which now hosts the AST inspection
// monthly checklist alongside the existing log + buffer-zone tabs).

const leadershipApps: AppItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Coffee, color: "from-amber-500 to-yellow-600" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  // Assets is the unified entry — operational data (photos, parts,
  // service) is surfaced inline on /assets/view, and the FY26 inventory
  // workflow lives there too. The standalone "Equipment" entry was
  // removed when these were merged.
  { href: "/assets", label: "Assets", icon: Archive, color: "from-amber-600 to-yellow-700" },
  { href: "/staff", label: "Staff", icon: Users, color: "from-blue-500 to-indigo-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/voice-log", label: "Voice Log", icon: Mic, color: "from-violet-500 to-purple-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, color: "from-violet-500 to-fuchsia-600" },
  { href: "/purchase-requests", label: "Purchase Requests", icon: FileText, color: "from-blue-600 to-indigo-700" },
  { href: "/environmental", label: "Environmental & Inspections", icon: Leaf, color: "from-green-600 to-emerald-700" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-amber-700" },
  { href: "/vendors", label: "Vendors", icon: Phone, color: "from-purple-500 to-fuchsia-700" },
  { href: "/sow", label: "Statement of Work", icon: ClipboardSignature, color: "from-cyan-600 to-teal-700" },
  { href: "/sole-source", label: "Sole Source", icon: Scale, color: "from-indigo-500 to-violet-600" },
  { href: "/work-order", label: "Work Order", icon: Wrench, color: "from-orange-500 to-amber-600" },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList, color: "from-orange-600 to-amber-700" },
  { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-700" },
];

const foremanApps: AppItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Coffee, color: "from-amber-500 to-yellow-600" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  { href: "/assets", label: "Assets", icon: Archive, color: "from-amber-600 to-yellow-700" },
  { href: "/staff", label: "Staff", icon: Users, color: "from-blue-500 to-indigo-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/voice-log", label: "Voice Log", icon: Mic, color: "from-violet-500 to-purple-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, color: "from-violet-500 to-fuchsia-600" },
  { href: "/environmental", label: "Environmental & Inspections", icon: Leaf, color: "from-green-600 to-emerald-700" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-amber-700" },
  { href: "/work-order", label: "Work Order", icon: Wrench, color: "from-orange-500 to-amber-600" },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList, color: "from-orange-600 to-amber-700" },
  { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-700" },
];

const mechanicApps: AppItem[] = [
  { href: "/assets", label: "Assets", icon: Archive, color: "from-amber-600 to-yellow-700" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-amber-700" },
];

const crewApps: AppItem[] = [
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/course-map", label: "Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-amber-700" },
];

const proApps: AppItem[] = [
  { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-700" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-amber-700" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AppGrid({ items }: { items: AppItem[] }) {
  const { record, sortByUsage } = useAppUsage();
  const sorted = sortByUsage(items);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {sorted.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => record(item.href)}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 active:scale-95 active:bg-muted/40 transition-all"
        >
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm`}
          >
            <item.icon className="w-6 h-6" />
          </div>
          <span className="text-[12px] font-medium text-foreground text-center leading-tight">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

function BottomLinks({ showSettings = true }: { showSettings?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6 mb-4 flex-wrap">
      <Link
        href="/notifications"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2 px-3 rounded-xl"
      >
        <Bell className="w-4 h-4" />
        Notifications
      </Link>
      {showSettings && (
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2 px-3 rounded-xl"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
      )}
      <Link
        href="/install"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2 px-3 rounded-xl"
      >
        <Smartphone className="w-4 h-4" />
        Install App
      </Link>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function MorePage() {
  const { isPro, isForeman, isMechanic, isCrew, profile } = useAuth();
  const isSeasonal = profile?.role === "seasonal";
  const isLaborer = isCrew || isSeasonal;

  let apps: AppItem[];
  if (isPro) apps = proApps;
  else if (isLaborer) apps = crewApps;
  else if (isMechanic) apps = mechanicApps;
  else if (isForeman) apps = foremanApps;
  else apps = leadershipApps;

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">More</h1>
      <p className="text-xs text-muted-foreground mb-5">
        Most-used apps appear first. Tap to open.
      </p>

      <AppGrid items={apps} />

      <BottomLinks showSettings={!isPro && !isLaborer} />
    </div>
  );
}
