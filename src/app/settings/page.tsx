"use client";

import Link from "next/link";
import { Settings, User, Bell, Palette, Database, Shield, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RoleVisible } from "@/components/auth/role-guard";

const settingsSections = [
  {
    title: "Profile",
    description: "Your account information",
    icon: User,
    href: "/settings/profile",
  },
  {
    title: "Notifications",
    description: "Push and email preferences",
    icon: Bell,
    href: "/settings/notifications",
  },
  {
    title: "Appearance",
    description: "Theme and display options",
    icon: Palette,
    href: "/settings/appearance",
  },
];

const adminSections = [
  {
    title: "Course Setup",
    description: "Course info, zones, holes",
    icon: Database,
    href: "/settings/course",
  },
  {
    title: "Staff & Permissions",
    description: "Manage team access",
    icon: Shield,
    href: "/settings/invite",
  },
];

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 pb-24">
      <PageHeader
        title="Settings"
        description="App configuration"
        icon={Settings}
      />

      <div className="space-y-3 max-w-2xl">
        {settingsSections.map((section) => (
          <Link
            key={section.title}
            href={section.href}
            className="flex items-center justify-between gap-4 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <section.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">{section.title}</h3>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </Link>
        ))}

        {/* Admin-only sections */}
        <RoleVisible visibleToRoles={["super", "asst_super"]}>
          <div className="pt-4 border-t border-border mt-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
              Administration
            </h2>
            {adminSections.map((section) => (
              <Link
                key={section.title}
                href={section.href}
                className="flex items-center justify-between gap-4 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors mb-3"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <section.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{section.title}</h3>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </RoleVisible>
      </div>

      {/* App Info */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>GreenKeeper Pro v0.1.0</p>
        <p>Veterans Memorial Golf Course</p>
      </div>
    </div>
  );
}
