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
} from "lucide-react";
import { RoleHidden, RoleVisible } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";

const courseItems = [
  { href: "/diagnostics", label: "Course Doctor", description: "AI-powered turf diagnostics", icon: Stethoscope },
  { href: "/plan", label: "Annual Plan", description: "Goals & progress tracking", icon: Target },
  { href: "/course-map", label: "Course Map", description: "Interactive map view", icon: Map },
  { href: "/weather", label: "Weather", description: "Forecasts & alerts", icon: Cloud },
  { href: "/photos", label: "Photos", description: "Course documentation", icon: Camera },
];

const operationsItems = [
  { href: "/equipment", label: "Equipment", description: "Inventory & maintenance", icon: Wrench },
  { href: "/chemicals", label: "Chemicals", description: "Products & applications", icon: FlaskConical },
  { href: "/irrigation", label: "Irrigation", description: "Zones & schedules", icon: Droplets },
];

// Management-only operations items
const managementOperationsItems = [
  { href: "/staff", label: "Staff", description: "Team management", icon: Users },
];

const managementItems = [
  { href: "/budget", label: "Budget", description: "Expenses & tracking", icon: DollarSign },
  { href: "/reports", label: "Reports", description: "Analytics & exports", icon: BarChart3 },
  { href: "/knowledge", label: "Knowledge Base", description: "SOPs & documents", icon: BookOpen },
  { href: "/member-insights", label: "Member Insights", description: "Golfer engagement & feedback", icon: Users },
];

const systemItems = [
  { href: "/notifications", label: "Notifications", description: "View all notifications", icon: Bell },
  { href: "/settings", label: "Settings", description: "App configuration", icon: Settings },
];

// Pro-specific items
const proItems = [
  { href: "/report-issue", label: "Report Issue", description: "Alert maintenance about problems", icon: Flag },
  { href: "/feedback", label: "Golfer Feedback", description: "Log customer feedback", icon: Lightbulb },
  { href: "/course-map", label: "Course Map", description: "Interactive map view", icon: Map },
  { href: "/weather", label: "Weather", description: "Forecasts & alerts", icon: Cloud },
  { href: "/diagnostics", label: "Course Doctor", description: "Active diagnoses", icon: Stethoscope },
  { href: "/photos", label: "Photos", description: "Course documentation", icon: Camera },
  { href: "/knowledge", label: "Knowledge Base", description: "SOPs & documents", icon: BookOpen },
];

// Member-specific items
const memberItems = [
  { href: "/weather", label: "Weather", description: "Forecasts & conditions", icon: Cloud },
  { href: "/course-map", label: "Course Map", description: "View the course layout", icon: Map },
];

const memberSystemItems = [
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
    <div className="mb-6">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
        {title}
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
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
      <div className="p-4 md:p-6 pb-24">
        <h1 className="text-2xl font-semibold mb-6">More</h1>
        <MenuSection title="Course" items={memberItems} />
        <MenuSection title="Account" items={memberSystemItems} />
      </div>
    );
  }

  // Pro sees a simplified menu
  if (isPro) {
    return (
      <div className="p-4 md:p-6 pb-24">
        <h1 className="text-2xl font-semibold mb-6">More</h1>
        <MenuSection title="Pro Shop Tools" items={proItems} />
        <MenuSection title="System" items={systemItems} />
      </div>
    );
  }

  // Regular maintenance staff menu
  return (
    <div className="p-4 md:p-6 pb-24">
      <h1 className="text-2xl font-semibold mb-6">More</h1>

      <MenuSection title="Course" items={courseItems} />

      {/* Operations - with management items hidden from crew/seasonal */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
          Operations
        </h2>
        <div className="space-y-2">
          {operationsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </Link>
          ))}
          <RoleHidden hiddenFromRoles={["crew", "seasonal", "pro"]}>
            {managementOperationsItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Link>
            ))}
          </RoleHidden>
        </div>
      </div>

      {/* Management - hidden from crew/seasonal/pro */}
      <RoleHidden hiddenFromRoles={["crew", "seasonal", "pro"]}>
        <MenuSection title="Management" items={managementItems} />
      </RoleHidden>

      <MenuSection title="System" items={systemItems} />
    </div>
  );
}
