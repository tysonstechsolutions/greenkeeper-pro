"use client";

import Link from "next/link";
import {
  Settings,
  User,
  Bell,
  Palette,
  Database,
  Shield,
  ChevronRight,
  Leaf,
  Briefcase,
  Landmark,
  HelpCircle,
  FileText,
  Smartphone,
  Lock,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useView } from "@/lib/providers/view-provider";
import { cn } from "@/lib/utils";
import { RoleVisible } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePwaInstall } from "@/lib/hooks/usePwaInstall";
import { roleLabels } from "@/lib/hooks/useProfiles";
import type { UserRole } from "@/types/database";

const settingsSections = [
  {
    title: "Profile",
    description: "Name, photo, and contact info",
    icon: User,
    href: "/settings/profile",
    color: "from-blue-500 to-blue-600",
  },
  {
    title: "Notifications",
    description: "Push alerts and email preferences",
    icon: Bell,
    href: "/settings/notifications",
    color: "from-amber-500 to-orange-500",
  },
  {
    title: "Appearance",
    description: "Theme and display options",
    icon: Palette,
    href: "/settings/appearance",
    color: "from-violet-500 to-purple-600",
  },
  {
    title: "Install App",
    description: "Add VMGC to your home screen",
    icon: Smartphone,
    href: "/install",
    color: "from-teal-500 to-cyan-600",
  },
];

const adminSections = [
  {
    title: "Course Setup",
    description: "Course info, zones, and holes",
    icon: Database,
    href: "/settings/course",
    color: "from-emerald-500 to-emerald-600",
  },
  {
    title: "Staff & Permissions",
    description: "Add and manage team members",
    icon: Shield,
    href: "/staff",
    color: "from-red-500 to-rose-600",
  },
  {
    title: "Morning Briefing",
    description: "Customize daily briefing content",
    icon: FileText,
    href: "/settings/briefing",
    color: "from-sky-500 to-cyan-600",
  },
];

export default function SettingsPage() {
  const { profile, loading } = useAuth();
  const { view, setView } = useView();
  const { isInstalled } = usePwaInstall();

  // Hide the "Install App" row once running as an installed standalone app.
  const generalSections = isInstalled
    ? settingsSections.filter((s) => s.href !== "/install")
    : settingsSections;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";

  const roleName = profile?.role
    ? roleLabels[profile.role as UserRole] || profile.role
    : "Staff";

  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      <PageHeader
        title="Settings"
        description="App configuration"
        icon={Settings}
      />

      {/* Profile Card */}
      <div className="gk-animate-in gk-animate-in-1 mb-6">
        <Link
          href="/settings/profile"
          className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 active:bg-muted/30 transition-all group"
        >
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center shrink-0 shadow-md">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || ""}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-white">{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base truncate">
              {profile?.display_name || profile?.full_name || "Set up your profile"}
            </p>
            <p className="text-sm text-muted-foreground">{roleName}</p>
            {profile?.email && (
              <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                {profile.email}
              </p>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
        </Link>
      </div>

      {/* App view switch */}
      <div className="gk-animate-in gk-animate-in-1 mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          App view
        </h2>
        <div className="bg-card rounded-xl border border-border p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => setView("super")}
            className={cn(
              "flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition",
              view === "super"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <Leaf className="w-4 h-4" />
            Superintendent
          </button>
          <button
            onClick={() => setView("gm")}
            className={cn(
              "flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition",
              view === "gm"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <Briefcase className="w-4 h-4" />
            General Manager
          </button>
          <button
            onClick={() => setView("bdh")}
            className={cn(
              "flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition",
              view === "bdh"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <Landmark className="w-4 h-4" />
            Business Division Head
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          Switch between turf operations and business/admin. Same data either way.
        </p>
      </div>

      {/* General Settings */}
      <div className="gk-animate-in gk-animate-in-2 mb-6">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          General
        </h2>
        <div className="space-y-2">
          {generalSections.map((section) => (
            <Link
              key={section.title}
              href={section.href}
              className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/20 active:bg-muted/30 transition-all group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center shadow-sm shrink-0`}>
                <section.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{section.title}</h3>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Admin-only sections */}
      <RoleVisible visibleToRoles={["super", "asst_super"]}>
        <div className="gk-animate-in gk-animate-in-3 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            Administration
          </h2>
          <div className="space-y-2">
            {adminSections.map((section) => (
              <Link
                key={section.title}
                href={section.href}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/20 active:bg-muted/30 transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center shadow-sm shrink-0`}>
                  <section.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{section.title}</h3>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </RoleVisible>

      {/* Support */}
      <div className="gk-animate-in gk-animate-in-4 mb-8">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
          Support
        </h2>
        <div className="space-y-2">
          <Link
            href="/report-issue"
            className="flex items-center gap-4 p-3.5 bg-card rounded-xl border border-border hover:border-primary/20 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-sm shrink-0">
              <HelpCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">Report an Issue</h3>
              <p className="text-xs text-muted-foreground">Get help or report a bug</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </Link>

          <button
            onClick={() => {
              try {
                localStorage.removeItem("gk_unlocked");
              } catch {
                // ignore
              }
              window.location.reload();
            }}
            className="w-full flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/20 active:bg-muted/30 transition-all group text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-sm shrink-0">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">Lock app</h3>
              <p className="text-xs text-muted-foreground">
                Require the PIN again on this device
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* App Info */}
      <div className="gk-animate-in gk-animate-in-5 text-center space-y-1">
        <div className="flex items-center justify-center gap-2 text-muted-foreground/60">
          <Leaf className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">VMGC</span>
        </div>
        <p className="text-[11px] text-muted-foreground/40">v0.1.0 · Veterans Memorial Golf Course</p>
      </div>
    </div>
  );
}
