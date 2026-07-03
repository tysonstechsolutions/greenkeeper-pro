"use client";

// Per-area P&L — each business keeps separate finances (worksheet hard rule).
// Deterministic: revenue by category→area, committed PR spend by cost
// center→area. Unknown codes surface as "Unassigned" instead of hiding.

import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { directSelectList } from "@/lib/supabase/rest";
import {
  computeAreaPnl,
  fiscalYearStart,
  monthKey,
  type AreaPnlRow,
  type RestaurantSpendRow,
  type RevenueRollupRow,
  type SpendRollupRow,
} from "@/lib/money/area-pnl";
import { AREA_LABELS } from "@/lib/money/areas";

// Full cents — rounding In/Out/Net independently to whole dollars can make
// a row visibly fail its own arithmetic (In − Out ≠ Net by $1).
function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function PnlTable({ title, rows }: { title: string; rows: AreaPnlRow[] }) {
  const totals = rows.reduce(
    (t, r) => ({
      revenue: t.revenue + r.revenue,
      spend: t.spend + r.spend,
      net: t.net + r.net,
    }),
    { revenue: 0, spend: 0, net: 0 },
  );
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium py-1">Area</th>
              <th className="text-right font-medium py-1">In</th>
              <th className="text-right font-medium py-1">Out</th>
              <th className="text-right font-medium py-1">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.area} className="border-t border-border/50">
                <td
                  className={cn(
                    "py-1.5 pr-2",
                    r.area === "unassigned" && "text-warning-foreground",
                  )}
                >
                  {AREA_LABELS[r.area]}
                </td>
                <td className="py-1.5 text-right tabular-nums">{money(r.revenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(r.spend)}</td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums font-semibold",
                    r.net > 0 ? "text-success" : r.net < 0 ? "text-destructive" : "",
                  )}
                >
                  {money(r.net)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular-nums">{money(totals.revenue)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(totals.spend)}</td>
              <td
                className={cn(
                  "py-1.5 text-right tabular-nums",
                  totals.net > 0 ? "text-success" : totals.net < 0 ? "text-destructive" : "",
                )}
              >
                {money(totals.net)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AreaPnlCard() {
  const [revenue, setRevenue] = useState<RevenueRollupRow[] | null>(null);
  const [spend, setSpend] = useState<SpendRollupRow[] | null>(null);
  const [restaurantSpend, setRestaurantSpend] = useState<RestaurantSpendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Monthly rollup VIEWS, not raw rows: a fiscal year is at most
        // 12 months × a handful of categories/cost-centers, so these can
        // never hit the PostgREST max_rows truncation cliff.
        const fyMonth = monthKey(fiscalYearStart(new Date()));
        const [rev, spendRows, restSpend] = await Promise.all([
          directSelectList<RevenueRollupRow>("revenue_monthly_rollup", {
            columns: "month,category,total",
            filters: [`month=gte.${fyMonth}`],
            orderBy: [{ column: "month", ascending: true }],
            limit: 500,
            label: "areaPnl.revenue",
          }),
          directSelectList<SpendRollupRow>("pr_spend_monthly_rollup", {
            columns: "month,cost_ctr,total",
            filters: [`month=gte.${fyMonth}`],
            orderBy: [{ column: "month", ascending: true }],
            limit: 500,
            label: "areaPnl.spend",
          }),
          directSelectList<RestaurantSpendRow>("restaurant_spend_monthly_rollup", {
            columns: "month,total",
            filters: [`month=gte.${fyMonth}`],
            orderBy: [{ column: "month", ascending: true }],
            limit: 500,
            label: "areaPnl.restaurantSpend",
          }),
        ]);
        if (cancelled) return;
        setRevenue(rev);
        setSpend(spendRows);
        setRestaurantSpend(restSpend);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pnl = useMemo(
    () =>
      revenue && spend && restaurantSpend
        ? computeAreaPnl(revenue, spend, restaurantSpend, new Date())
        : null,
    [revenue, spend, restaurantSpend],
  );

  const fyNet = pnl ? pnl.fiscalYear.reduce((s, r) => s + r.net, 0) : 0;

  return (
    <div className="gk-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-sm">Per-area P&amp;L</p>
          <p className="text-xs text-muted-foreground">
            Revenue in vs committed PR spend out — each area separate.
          </p>
        </div>
        {pnl && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md border",
              fyNet >= 0
                ? "bg-success/10 text-success border-success/30"
                : "bg-destructive/10 text-destructive border-destructive/30",
            )}
          >
            {fyNet >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {money(fyNet)} {pnl.fiscalYearLabel}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !pnl ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          <PnlTable title={pnl.monthLabel} rows={pnl.month} />
          <PnlTable title={pnl.fiscalYearLabel} rows={pnl.fiscalYear} />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        Spend counts PRs (sent/approved/received) by cost-center code — using
        the reconciled receipt amount when one is recorded — plus logged
        restaurant purchases (US Foods invoices on the Restaurant page).
      </p>
    </div>
  );
}
