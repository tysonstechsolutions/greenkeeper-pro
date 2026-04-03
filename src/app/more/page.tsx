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
  Stethoscope,
  Target,
  Cloud,
  Bell,
  Flag,
  Lightbulb,
  Coffee,
  Trophy,
  ArrowLeftRight,
  Bot,
  Vote,
  ChevronRight,
  Smartphone,
} from "lucide-react";
import { RoleHidden } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";

// ── Types ──
interface QuickItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string; // gradient classes
}

interface ListItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string; // text color
  bgColor: string; // bg color
}

// ── QUICK ACCESS: 2x4 grid of most-used features ──
const quickAccess: QuickItem[] = [
  { href: "/diagnostics", label: "Course Doctor", icon: Stethoscope, color: "from-emerald-500 to-green-600" },
  { href: "/equipment", label: "Equipment", icon: Wrench, color: "from-orange-500 to-amber-600" },
  { href: "/chemicals", label: "Chemicals", icon: FlaskConical, color: "from-violet-500 to-purple-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
  { href: "/course-map", label: "Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/irrigation", label: "Irrigation", icon: Droplets, color: "from-blue-500 to-indigo-600" },
  { href: "/briefing", label: "Briefing", icon: Coffee, color: "from-amber-500 to-yellow-600" },
];

// ── OPERATIONS: managers only ──
const operationsItems: ListItem[] = [
  { href: "/staff", label: "Staff", description: "Team management", icon: Users, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
  { href: "/plan", label: "Annual Plan", description: "Goals & progress", icon: Target, iconColor: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  { href: "/shift-swap", label: "Shift Swap", description: "Swaps & approvals", icon: ArrowLeftRight, iconColor: "text-amber-600", bgColor: "bg-amber-500/10" },
  { href: "/scoreboard", label: "Scoreboard", description: "Performance", icon: Trophy, iconColor: "text-yellow-600", bgColor: "bg-yellow-500/10" },
  { href: "/assistant", label: "AI Assistant", description: "Ask anything", icon: Bot, iconColor: "text-violet-600", bgColor: "bg-violet-500/10" },
];

// ── MEMBERS: managers only ──
const membersItems: ListItem[] = [
  { href: "/member-insights", label: "Member Insights", description: "Engagement data", icon: Users, iconColor: "text-indigo-600", bgColor: "bg-indigo-500/10" },
  { href: "/polls", label: "Polls", description: "Surveys & votes", icon: Vote, iconColor: "text-pink-600", bgColor: "bg-pink-500/10" },
  { href: "/feedback", label: "Feedback", description: "Golfer comments", icon: Lightbulb, iconColor: "text-amber-600", bgColor: "bg-amber-500/10" },
  { href: "/report-issue", label: "Report Issue", description: "Course problems", icon: Flag, iconColor: "text-red-600", bgColor: "bg-red-500/10" },
];

// ── ADMIN ──
const adminItems: ListItem[] = [
  { href: "/budget", label: "Budget", description: "Expenses", icon: DollarSign, iconColor: "text-green-600", bgColor: "bg-green-500/10" },
  { href: "/reports", label: "Reports", description: "Analytics", icon: BarChart3, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
  { href: "/knowledge", label: "Knowledge Base", description: "SOPs", icon: BookOpen, iconColor: "text-orange-600", bgColor: "bg-orange-500/10" },
];

// ── Pro Shop quick access ──
const proQuickAccess: QuickItem[] = [
  { href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-rose-600" },
  { href: "/feedback", label: "Feedback", icon: Lightbulb, color: "from-amber-500 to-yellow-600" },
  { href: "/course-map", label: "Map", icon: Map, color: "from-teal-500 to-cyan-600" },
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/diagnostics", label: "Course Doctor", icon: Stethoscope, color: "from-emerald-500 to-green-600" },
  { href: "/photos", label: "Photos", icon: Camera, color: "from-pink-500 to-rose-600" },
];

// ── Member quick access ──
const memberQuickAccess: QuickItem[] = [
  { href: "/weather", label: "Weather", icon: Cloud, color: "from-sky-500 to-blue-600" },
  { href: "/course-map", label: "Map", icon: Map, color: "from-teal-500 to-cyan-600" },
];

// ── Quick Access Grid ──
function QuickGrid({ items }: { items: QuickItem[] }) {
  return (
    <div className="grid grid-cols-4 gap-2.5 mb-6">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-primary/20 active:scale-95 active:bg-muted/30 transition-all"
        >
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm`}>
            <item.icon className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-muted-foreground text-center leading-tight">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ── Compact List Section (inside a card container) ──
function SectionCard({ title, items, accent }: { title: string; items: ListItem[]; accent: string }) {
  return (
    <div className="mb-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Section header */}
        <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/30`}>
          <div className={`w-1.5 h-4 rounded-full ${accent}`} />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        </div>

        {/* Items */}
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/30 active:bg-muted/50 transition-colors group"
            >
              <div className={`w-9 h-9 rounded-lg ${item.bgColor} flex items-center justify-center shrink-0`}>
                <item.icon className={`w-4.5 h-4.5 ${item.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MorePage() {
  const { isPro, isMember } = useAuth();

  // ── Member view ──
  if (isMember) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-5">More</h1>
        <QuickGrid items={memberQuickAccess} />
        <SectionCard
          title="Account"
          accent="bg-primary"
          items={[
            { href: "/settings/profile", label: "My Profile", description: "Your info", icon: Settings, iconColor: "text-gray-600", bgColor: "bg-gray-500/10" },
            { href: "/notifications", label: "Notifications", description: "All alerts", icon: Bell, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
          ]}
        />
        <BottomLinks />
      </div>
    );
  }

  // ── Pro Shop view ──
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
            { href: "/notifications", label: "Notifications", description: "All alerts", icon: Bell, iconColor: "text-blue-600", bgColor: "bg-blue-500/10" },
            { href: "/settings", label: "Settings", description: "App config", icon: Settings, iconColor: "text-gray-600", bgColor: "bg-gray-500/10" },
          ]}
        />
        <BottomLinks />
      </div>
    );
  }

  // ── Staff / Management view ──
  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-5">More</h1>

      {/* Quick access grid — most used, always visible */}
      <QuickGrid items={quickAccess} />

      {/* Operations — managers only */}
      <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
        <SectionCard title="Operations" items={operationsItems} accent="bg-blue-500" />
      </RoleHidden>

      {/* Members — managers only */}
      <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
        <SectionCard title="Members" items={membersItems} accent="bg-pink-500" />
      </RoleHidden>

      {/* Admin */}
      <SectionCard title="Admin" items={adminItems} accent="bg-amber-500" />

      {/* Bottom quick links */}
      <div className="flex items-center justify-center gap-6 mt-2 mb-4">
        <Link href="/notifications" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2">
          <Bell className="w-3.5 h-3.5" />
          Notifications
        </Link>
        <Link href="/settings" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2">
          <Settings className="w-3.5 h-3.5" />
          Settings
        </Link>
        <Link href="/install" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2">
          <Smartphone className="w-3.5 h-3.5" />
          Install App
        </Link>
      </div>
    </div>
  );
}

// Bottom utility links (for member/pro views)
function BottomLinks() {
  return (
    <div className="flex items-center justify-center gap-6 mt-2">
      <Link href="/install" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground active:opacity-70 transition-colors py-2">
        <Smartphone className="w-3.5 h-3.5" />
        Install App
      </Link>
    </div>
  );
}
