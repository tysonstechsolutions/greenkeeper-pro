"use client";

import Link from "next/link";
import {
  Wrench,
  FlaskConical,
  Camera,
  Droplets,
  Map,
  DollarSign,
  BarChart3,
  BookOpen,
  Settings,
  Users,
  Target,
  Cloud,
  Bell,
  Flag,
  Lightbulb,
  Coffee,
  Bot,
  Vote,
  ChevronRight,
  Smartphone,
  Car,
  Building,
  ShoppingCart,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";

// ── Types ──
interface QuickItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface ListItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEADERSHIP (super, asst_super, director)
// Sees everything: maintenance, operations, feedback, admin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const leadershipQuickAccess: QuickItem[] = [
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  { href: "/equipment", label: "Equipment", icon: Wrench, color: "from-orange-500 to-amber-600" },
  { href: "/chemicals", label: "Chemicals", icon: FlaskConical, color: "from-violet-500 to-purple-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/briefing", label: "Briefing", icon: Coffee, color: "from-amber-500 to-yellow-600" },
  { href: "/staff", label: "Staff", icon: Users, color: "from-blue-500 to-indigo-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
];

const leadershipOperations: ListItem[] = [
  { href: "/plan", label: "Annual Plan", description: "Goals & progress", icon: Target, iconColor: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  { href: "/irrigation", label: "Irrigation", description: "Zones & schedules", icon: Droplets, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
  { href: "/assistant", label: "AI Assistant", description: "Ask anything", icon: Bot, iconColor: "text-violet-600", bgColor: "bg-violet-500/10" },
];

const leadershipFeedback: ListItem[] = [
  { href: "/polls", label: "Polls", description: "Surveys & votes", icon: Vote, iconColor: "text-pink-600", bgColor: "bg-pink-500/10" },
  { href: "/feedback", label: "Feedback", description: "Golfer comments", icon: Lightbulb, iconColor: "text-amber-600", bgColor: "bg-amber-500/10" },
  { href: "/report-issue", label: "Report Issue", description: "Course problems", icon: Flag, iconColor: "text-red-600", bgColor: "bg-red-500/10" },
];

const leadershipAdmin: ListItem[] = [
  { href: "/budget", label: "Budget", description: "Expenses & tracking", icon: DollarSign, iconColor: "text-green-600", bgColor: "bg-green-500/10" },
  { href: "/reports", label: "Reports", description: "Analytics & exports", icon: BarChart3, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
  { href: "/knowledge", label: "Knowledge Base", description: "SOPs & documents", icon: BookOpen, iconColor: "text-orange-600", bgColor: "bg-orange-500/10" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOREMAN
// Sees maintenance + operations (staff/scheduling). No admin.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const foremanQuickAccess: QuickItem[] = [
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  { href: "/equipment", label: "Equipment", icon: Wrench, color: "from-orange-500 to-amber-600" },
  { href: "/chemicals", label: "Chemicals", icon: FlaskConical, color: "from-violet-500 to-purple-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/briefing", label: "Briefing", icon: Coffee, color: "from-amber-500 to-yellow-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/irrigation", label: "Irrigation", icon: Droplets, color: "from-blue-500 to-indigo-600" },
];

const foremanOperations: ListItem[] = [
  { href: "/staff", label: "Staff", description: "Team management", icon: Users, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
  { href: "/assistant", label: "AI Assistant", description: "Ask anything", icon: Bot, iconColor: "text-violet-600", bgColor: "bg-violet-500/10" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MECHANIC
// Sees maintenance (heavy on equipment). No ops, no admin.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const mechanicQuickAccess: QuickItem[] = [
  { href: "/equipment", label: "Equipment", icon: Wrench, color: "from-orange-500 to-amber-600" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/irrigation", label: "Irrigation", icon: Droplets, color: "from-blue-500 to-indigo-600" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREW / SEASONAL (laborers)
// Bare minimum: essentials for the job.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const crewQuickAccess: QuickItem[] = [
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/course-map", label: "Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/parking-lot", label: "Parking", icon: Car, color: "from-slate-500 to-gray-600" },
  { href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-500 to-orange-600" },
  { href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-500 to-green-600" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRO SHOP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const proQuickAccess: QuickItem[] = [
  { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-600" },
  { href: "/feedback", label: "Feedback", icon: Lightbulb, color: "from-amber-500 to-yellow-600" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function QuickGrid({ items }: { items: QuickItem[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center gap-2.5 p-3.5 rounded-2xl bg-card border border-border hover:border-primary/20 active:scale-95 active:bg-muted/30 transition-all"
        >
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm`}>
            <item.icon className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-muted-foreground text-center leading-tight">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

function SectionCard({ title, items, accent }: { title: string; items: ListItem[]; accent: string }) {
  return (
    <div className="mb-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/30">
          <div className={`w-1.5 h-4 rounded-full ${accent}`} />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        </div>
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/30 active:bg-muted/50 transition-colors group"
            >
              <div className={`w-10 h-10 rounded-lg ${item.bgColor} flex items-center justify-center shrink-0`}>
                <item.icon className={`w-5 h-5 ${item.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function BottomLinks({ showSettings = true }: { showSettings?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-3 mb-6">
      <Link href="/notifications" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-3 px-4 rounded-xl">
        <Bell className="w-4 h-4" />
        Notifications
      </Link>
      {showSettings && (
        <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-3 px-4 rounded-xl">
          <Settings className="w-4 h-4" />
          Settings
        </Link>
      )}
      <Link href="/install" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-3 px-4 rounded-xl">
        <Smartphone className="w-4 h-4" />
        Install App
      </Link>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE — completely role-driven views
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function MorePage() {
  const { isPro, isForeman, isMechanic, isCrew, profile } = useAuth();
  const isSeasonal = profile?.role === "seasonal";
  const isLaborer = isCrew || isSeasonal;

  // ── Pro Shop ──
  if (isPro) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-5">More</h1>
        <QuickGrid items={proQuickAccess} />
        <SectionCard
          title="Resources"
          accent="bg-primary"
          items={[
            { href: "/knowledge", label: "Knowledge Base", description: "SOPs & docs", icon: BookOpen, iconColor: "text-orange-600", bgColor: "bg-orange-500/10" },
          ]}
        />
        <BottomLinks />
      </div>
    );
  }

  // ── Crew / Seasonal (laborers) ──
  if (isLaborer) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-5">More</h1>
        <QuickGrid items={crewQuickAccess} />
        <SectionCard
          title="Resources"
          accent="bg-primary"
          items={[
            { href: "/knowledge", label: "Knowledge Base", description: "SOPs & guides", icon: BookOpen, iconColor: "text-orange-600", bgColor: "bg-orange-500/10" },
          ]}
        />
        <BottomLinks />
      </div>
    );
  }

  // ── Mechanic ──
  if (isMechanic) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-5">More</h1>
        <QuickGrid items={mechanicQuickAccess} />
        <SectionCard
          title="Resources"
          accent="bg-primary"
          items={[
            { href: "/knowledge", label: "Knowledge Base", description: "SOPs & manuals", icon: BookOpen, iconColor: "text-orange-600", bgColor: "bg-orange-500/10" },
          ]}
        />
        <BottomLinks />
      </div>
    );
  }

  // ── Foreman ──
  if (isForeman) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-5">More</h1>
        <QuickGrid items={foremanQuickAccess} />
        <SectionCard title="Operations" items={foremanOperations} accent="bg-blue-500" />
        <SectionCard
          title="Resources"
          accent="bg-primary"
          items={[
            { href: "/knowledge", label: "Knowledge Base", description: "SOPs & docs", icon: BookOpen, iconColor: "text-orange-600", bgColor: "bg-orange-500/10" },
          ]}
        />
        <BottomLinks />
      </div>
    );
  }

  // ── Leadership (super, asst_super, director) — sees everything ──
  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-5">More</h1>
      <QuickGrid items={leadershipQuickAccess} />
      <SectionCard title="Operations" items={leadershipOperations} accent="bg-blue-500" />
      <SectionCard title="Feedback" items={leadershipFeedback} accent="bg-pink-500" />
      <SectionCard title="Admin" items={leadershipAdmin} accent="bg-amber-500" />
      <BottomLinks />
    </div>
  );
}
