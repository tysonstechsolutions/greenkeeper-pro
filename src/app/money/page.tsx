"use client";

import Link from "next/link";
import { HUB_MONEY } from "@/lib/layout/app-catalog";
import { AreaPnlCard } from "@/components/features/money/area-pnl-card";

// The Money workspace: tools grid + the per-area P&L. Laid out directly
// (instead of via the shared HubPage) so the P&L card sits inside the same
// padded container as the grid.
export default function MoneyPage() {
  const items = HUB_MONEY.children ?? [];
  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">{HUB_MONEY.label}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Budgets, purchase requests, revenue, and assets — each area&apos;s
        finances stay separate.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 active:scale-95 active:bg-muted/40 transition-all"
          >
            <div
              className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm`}
            >
              <item.icon className="w-6 h-6" />
            </div>
            <span className="text-[13px] font-medium text-foreground text-center leading-tight">
              {item.label}
            </span>
          </Link>
        ))}
      </div>

      <AreaPnlCard />
    </div>
  );
}
