"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText } from "lucide-react";
import { HUB_MONEY } from "@/lib/layout/app-catalog";
import { AreaPnlCard } from "@/components/features/money/area-pnl-card";
import { FinancialAlertBanner } from "@/components/features/financial-watch/financial-alert-banner";
import { FinancialWatchCard } from "@/components/features/financial-watch/financial-watch-card";
import { useFinancialWatch } from "@/lib/financial-watch/load";
import { directSelectCount } from "@/lib/supabase/rest";

// The Money workspace. It absorbed the old GM Dashboard (/gm), which was a
// second door to the same tools: the financial alert, the financial watch
// card, and the live purchase-request counts now sit here above the tools
// grid and the per-area P&L. Laid out directly (instead of via the shared
// HubPage) so everything shares one padded container.
export default function MoneyPage() {
  const items = HUB_MONEY.children ?? [];
  const { watch, loading: watchLoading } = useFinancialWatch();
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      directSelectCount("purchase_requests", ["status=in.(submitted,sent)"], "money.prs-awaiting"),
      directSelectCount("purchase_requests", ["status=neq.draft", "completed_at=is.null"], "money.prs-active"),
    ])
      .then(([pending, open]) => {
        if (cancelled) return;
        setAwaiting(pending);
        setActive(open);
      })
      .catch(() => {
        if (cancelled) return;
        setAwaiting(null);
        setActive(null);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      {/* Proactive alert — surfaces critical/warning finances before they're sought */}
      <FinancialAlertBanner watch={watch} />

      <h1 className="text-xl font-bold mb-1">{HUB_MONEY.label}</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Budgets, purchase requests, revenue, and assets — each area&apos;s
        finances stay separate.
      </p>

      <div className="mb-3">
        <FinancialWatchCard watch={watch} loading={watchLoading} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <PrCount href="/purchase-requests" icon={FileText} label="Awaiting approval" value={awaiting} hint="purchase requests" />
        <PrCount href="/purchase-requests" icon={ClipboardCheck} label="Open PRs" value={active} hint="not yet received" />
      </div>

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

function PrCount({ href, icon: Icon, label, value, hint }: {
  href: string;
  icon: typeof FileText;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <Link href={href} className="gk-card p-4 block">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-3xl font-bold text-foreground leading-none tabular-nums">{value ?? "—"}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>
    </Link>
  );
}
