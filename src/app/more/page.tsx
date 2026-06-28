"use client";

import Link from "next/link";
import { Settings, Bell, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useView } from "@/lib/providers/view-provider";
import { useAppUsage } from "@/lib/hooks/useAppUsage";
import { getCatalog, type AppEntry } from "@/lib/layout/app-catalog";

// ──────────────────────────────────────────────────────────────────────────
// Mobile "More" grid. Reads the same shared catalog as the desktop sidebar
// (src/lib/layout/app-catalog.ts) so the two never drift. Every entry for
// the role is shown as a tile, most-used first.
// ──────────────────────────────────────────────────────────────────────────

function AppGrid({ items }: { items: AppEntry[] }) {
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

export default function MorePage() {
  const { isPro, isForeman, isMechanic, isCrew, profile } = useAuth();
  const { view } = useView();
  const isSeasonal = profile?.role === "seasonal";
  const isLaborer = isCrew || isSeasonal;

  const apps = getCatalog({ view, isPro, isForeman, isMechanic, isLaborer });

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
