"use client";

import Link from "next/link";
import { Settings, Bell, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppUsage } from "@/lib/hooks/useAppUsage";
import { getCatalog, groupCatalog, type AppEntry } from "@/lib/layout/app-catalog";

// ──────────────────────────────────────────────────────────────────────────
// Mobile "More" grid. Reads the same shared catalog as the desktop sidebar
// (src/lib/layout/app-catalog.ts) so the two never drift. Entries render
// under stable section labels (same sections as the sidebar) — a menu that
// reshuffles itself by usage is harder to learn than one that stays put.
// ──────────────────────────────────────────────────────────────────────────

function AppGrid({ items }: { items: AppEntry[] }) {
  const { record } = useAppUsage();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {items.map((item) => (
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

export default function MorePage() {
  const { isPro, isForeman, isMechanic, isCrew, profile } = useAuth();
  const isSeasonal = profile?.role === "seasonal";
  const isLaborer = isCrew || isSeasonal;

  const apps = getCatalog({ isPro, isForeman, isMechanic, isLaborer });
  const pinned = apps.filter((item) => item.pinned);
  const sections = groupCatalog(apps.filter((item) => !item.pinned));

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-5">More</h1>

      {pinned.length > 0 && (
        <div className="mb-6">
          <p className="gk-section-label mb-2.5">Daily</p>
          <AppGrid items={pinned} />
        </div>
      )}

      {sections.map((section) => (
        <div key={section.label} className="mb-6">
          <p className="gk-section-label mb-2.5">{section.label}</p>
          <AppGrid items={section.items} />
        </div>
      ))}

      <BottomLinks showSettings={!isPro && !isLaborer} />
    </div>
  );
}
