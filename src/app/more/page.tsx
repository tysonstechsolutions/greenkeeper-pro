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
  ChevronRight,
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
} from "lucide-react";
import { RoleHidden } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";

// ── MAINTENANCE: day-to-day course care ──
const maintenanceItems = [
  { href: "/diagnostics", label: "Course Doctor", description: "AI diagnostics & observations", icon: Stethoscope },
  { href: "/equipment", label: "Equipment", description: "Inventory & maintenance", icon: Wrench },
  { href: "/chemicals", label: "Chemicals", description: "Products & applications", icon: FlaskConical },
  { href: "/irrigation", label: "Irrigation", description: "Zones & schedules", icon: Droplets },
  { href: "/photos", label: "Photos", description: "Course documentation", icon: Camera },
  { href: "/weather", label: "Weather", description: "Forecasts & alerts", icon: Cloud },
  { href: "/course-map", label: "Course Map", description: "Interactive map view", icon: Map },
];

// ── OPERATIONS: scheduling, staff, planning ──
const operationsItems = [
  { href: "/briefing", label: "Morning Briefing", description: "Daily priorities & conditions", icon: Coffee },
  { href: "/staff", label: "Staff", description: "Team management", icon: Users },
  { href: "/shift-swap", label: "Shift Swap", description: "Request & approve swaps", icon: ArrowLeftRight },
  { href: "/plan", label: "Annual Plan", description: "Goals & progress tracking", icon: Target },
  { href: "/scoreboard", label: "Scoreboard", description: "Staff performance & streaks", icon: Trophy },
  { href: "/assistant", label: "AI Assistant", description: "Ask anything about the course", icon: Bot },
];

// ── MEMBERS: golfer-facing features ──
const membersItems = [
  { href: "/member-insights", label: "Member Insights", description: "Golfer engagement & feedback", icon: Users },
  { href: "/polls", label: "Community Polls", description: "Member surveys & votes", icon: Vote },
  { href: "/feedback", label: "Golfer Feedback", description: "Log customer feedback", icon: Lightbulb },
  { href: "/report-issue", label: "Report Issue", description: "Alert about course problems", icon: Flag },
];

// ── ADMIN: budget, reports, settings ──
const adminItems = [
  { href: "/budget", label: "Budget", description: "Expenses & tracking", icon: DollarSign },
  { href: "/reports", label: "Reports", description: "Analytics & exports", icon: BarChart3 },
  { href: "/knowledge", label: "Knowledge Base", description: "SOPs & documents", icon: BookOpen },
  { href: "/notifications", label: "Notifications", description: "View all notifications", icon: Bell },
  { href: "/settings", label: "Settings", description: "App configuration", icon: Settings },
];

// ── Pro Shop view (simplified) ──
const proItems = [
  { href: "/report-issue", label: "Report Issue", description: "Alert maintenance about problems", icon: Flag },
  { href: "/feedback", label: "Golfer Feedback", description: "Log customer feedback", icon: Lightbulb },
  { href: "/course-map", label: "Course Map", description: "Interactive map view", icon: Map },
  { href: "/weather", label: "Weather", description: "Forecasts & alerts", icon: Cloud },
  { href: "/diagnostics", label: "Course Doctor", description: "Active diagnoses", icon: Stethoscope },
  { href: "/photos", label: "Photos", description: "Course documentation", icon: Camera },
  { href: "/knowledge", label: "Knowledge Base", description: "SOPs & documents", icon: BookOpen },
];

// ── Member view (minimal) ──
const memberCourseItems = [
  { href: "/weather", label: "Weather", description: "Forecasts & conditions", icon: Cloud },
  { href: "/course-map", label: "Course Map", description: "View the course layout", icon: Map },
];

const memberAccountItems = [
  { href: "/settings/profile", label: "My Profile", description: "Update your information", icon: Settings },
  { href: "/notifications", label: "Notifications", description: "View all notifications", icon: Bell },
];

interface MenuItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MenuSectionProps {
  title: string;
  items: MenuItem[];
}

function MenuSection({ title, items }: MenuSectionProps) {
  return (
    <div className="mb-7">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">
        {title}
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between p-4 bg-card rounded-xl border border-border hover:border-primary/20 active:bg-muted/40 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-[15px]">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function MorePage() {
  const { isPro, isMember } = useAuth();

  // Member sees a minimal menu
  if (isMember) {
    return (
      <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">More</h1>
        <MenuSection title="Course" items={memberCourseItems} />
        <MenuSection title="Account" items={memberAccountItems} />
      </div>
    );
  }

  // Pro sees a simplified menu
  if (isPro) {
    return (
      <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">More</h1>
        <MenuSection title="Pro Shop Tools" items={proItems} />
        <MenuSection title="Admin" items={[
          { href: "/notifications", label: "Notifications", description: "View all notifications", icon: Bell },
          { href: "/settings", label: "Settings", description: "App configuration", icon: Settings },
        ]} />
      </div>
    );
  }

  // Staff / management menu — 4 clean categories
  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">More</h1>

      <MenuSection title="Maintenance" items={maintenanceItems} />

      <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
        <MenuSection title="Operations" items={operationsItems} />
      </RoleHidden>

      <RoleHidden hiddenFromRoles={["crew", "seasonal"]}>
        <MenuSection title="Members" items={membersItems} />
      </RoleHidden>

      <MenuSection title="Admin" items={adminItems} />
    </div>
  );
}
