"use client";

// Buckley's food cost: food + alcohol bought (US Foods invoices, net of
// credits) against food & beverage sales, by week and month. Also where the
// money went and which prices moved between orders.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { GM_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { directSelectAll } from "@/lib/supabase/rest";
import { addDaysLocal, todayLocal } from "@/lib/utils/date";
import {
  FOOD_COST_TARGET_PCT,
  PRICE_CHANGE_PCT,
  costByPeriod,
  priceChanges,
  topItems,
  type CostLine,
  type CostPeriod,
  type CostPurchase,
  type CostSale,
} from "@/lib/restaurant/food-cost";

/** How far back the page looks. */
const LOOKBACK_DAYS = 400;

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function weekLabel(monday: string): string {
  const d = new Date(`${monday}T12:00:00`);
  return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

interface LineRow {
  product_number: string;
  description: string;
  pack_size: string | null;
  qty: number;
  unit_price: number;
  extended: number;
  category: string;
  restaurant_purchases: { purchase_date: string; kind: "invoice" | "credit" | null } | null;
}

function PctBadge({ p }: { p: CostPeriod }) {
  if (p.status === "no_sales") {
    return <span className="text-xs text-muted-foreground">no sales entered</span>;
  }
  const high = p.status === "high";
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
        high
          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      }`}
    >
      {p.pct}%{high ? " · high" : ""}
    </span>
  );
}

function PeriodTable({ periods, label }: { periods: CostPeriod[]; label: (key: string) => string }) {
  if (periods.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  }
  return (
    <div className="gk-card divide-y divide-border/50">
      {periods.map((p) => (
        <div key={p.key} className="px-4 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{label(p.key)}</span>
            <PctBadge p={p} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            Bought {money(p.cogs)} · Sold {money(p.sales)}
            {p.supplies ? ` · Supplies ${money(p.supplies)} (not in food cost)` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function FoodCostContent() {
  const [purchases, setPurchases] = useState<CostPurchase[]>([]);
  const [sales, setSales] = useState<CostSale[]>([]);
  const [lines, setLines] = useState<CostLine[]>([]);
  const [linesMissing, setLinesMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "week">("month");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = addDaysLocal(todayLocal(), -LOOKBACK_DAYS);
    try {
      const [p, s] = await Promise.all([
        directSelectAll<CostPurchase>("restaurant_purchases", {
          columns: "*",
          filters: [`purchase_date=gte.${since}`],
          orderBy: [{ column: "purchase_date", ascending: false }, { column: "id" }],
          label: "foodCost.purchases",
        }),
        directSelectAll<CostSale>("revenue_entries", {
          columns: "entry_date,amount",
          filters: ["category=eq.food_beverage", `entry_date=gte.${since}`],
          orderBy: [{ column: "entry_date", ascending: false }, { column: "id" }],
          label: "foodCost.sales",
        }),
      ]);
      setPurchases(p);
      setSales(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    try {
      const l = await directSelectAll<LineRow>("restaurant_purchase_lines", {
        columns:
          "product_number,description,pack_size,qty,unit_price,extended,category,restaurant_purchases!inner(purchase_date,kind)",
        filters: [`restaurant_purchases.purchase_date=gte.${since}`],
        orderBy: [{ column: "id" }],
        label: "foodCost.lines",
      });
      setLines(
        l
          .filter((r) => r.restaurant_purchases)
          .map((r) => ({
            purchase_date: r.restaurant_purchases!.purchase_date,
            kind: r.restaurant_purchases!.kind === "credit" ? "credit" : "invoice",
            product_number: r.product_number,
            description: r.description,
            pack_size: r.pack_size,
            qty: Number(r.qty),
            unit_price: Number(r.unit_price),
            extended: Number(r.extended),
            category: r.category,
          })),
      );
      setLinesMissing(false);
    } catch {
      // The line-item table arrives with the 2026-10-06 database update.
      setLines([]);
      setLinesMissing(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const periods = useMemo(() => costByPeriod(purchases, sales, view), [purchases, sales, view]);
  const recentLines = useMemo(() => {
    const since = addDaysLocal(todayLocal(), -90);
    return lines.filter((l) => l.purchase_date >= since);
  }, [lines]);
  const top = useMemo(() => topItems(recentLines.filter((l) => l.category !== "supplies"), 10), [recentLines]);
  const changes = useMemo(() => priceChanges(lines).slice(0, 15), [lines]);
  const latest = periods.find((p) => p.status !== "no_sales") ?? periods[0] ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {latest && (
        <div className="gk-card p-4">
          <p className="text-xs text-muted-foreground">
            {view === "month" ? monthLabel(latest.key) : weekLabel(latest.key)}
          </p>
          <p className="text-3xl font-bold tabular-nums mt-1">
            {latest.pct == null ? "—" : `${latest.pct}%`}
          </p>
          <p className="text-sm text-muted-foreground">
            food cost · target {FOOD_COST_TARGET_PCT}% or less
          </p>
          {latest.status === "high" && (
            <p className="text-sm text-red-700 dark:text-red-400 mt-2">
              Above target. Check portions, waste, and the price changes below.
            </p>
          )}
        </div>
      )}

      {sales.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No food &amp; beverage sales entered yet, so food cost % can&apos;t be worked out. Add them on{" "}
          <Link href="/revenue/" className="underline font-medium">
            Revenue
          </Link>{" "}
          (category Food &amp; Beverage).
        </p>
      )}
      {purchases.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No purchases yet.{" "}
          <Link href="/restaurant/purchases/" className="underline font-medium">
            Import your US Foods invoices
          </Link>{" "}
          to get started.
        </p>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="gk-section-label">Food cost by {view}</p>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-3 py-1.5 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {v === "month" ? "Monthly" : "Weekly"}
              </button>
            ))}
          </div>
        </div>
        <PeriodTable periods={periods} label={view === "month" ? monthLabel : weekLabel} />
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Food cost = food + alcohol bought (credits taken off) ÷ food &amp; beverage sales. Paper goods,
          gloves, and cleaning supplies are shown but left out.
        </p>
      </section>

      {linesMissing ? (
        <p className="text-sm text-muted-foreground">
          Top items and price changes appear once the database update (20261006120000_operations_upgrade.sql)
          is run and invoices are imported.
        </p>
      ) : (
        <>
          <section>
            <p className="gk-section-label mb-2">Where the money went (last 90 days)</p>
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Import invoices to see this.</p>
            ) : (
              <div className="gk-card divide-y divide-border/50">
                {top.map((t) => (
                  <div key={t.product_number} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{t.description}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.qty} × {t.pack_size ?? "case"} · #{t.product_number}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{money(t.spend)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="gk-section-label mb-2">Price changes ({PRICE_CHANGE_PCT}% or more since the last order)</p>
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No price moves yet.</p>
            ) : (
              <div className="gk-card divide-y divide-border/50">
                {changes.map((c) => {
                  const up = c.changePct > 0;
                  return (
                    <div key={c.product_number} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{c.description}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {money(c.before)} ({c.beforeDate}) → {money(c.now)} ({c.nowDate})
                        </span>
                      </span>
                      <span
                        className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                          up ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {up ? "+" : ""}
                        {c.changePct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <button
        onClick={load}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );
}

export default function FoodCostPage() {
  return (
    <RoleGuard allowedRoles={withFbManager(GM_ROLES)}>
      <div className="gk-page mx-auto">
        <h1 className="mb-1">Food Cost</h1>
        <p className="text-sm text-muted-foreground mb-5">
          What Buckley&apos;s buys against what it sells. Purchases come from{" "}
          <Link href="/restaurant/purchases/" className="underline">
            Restaurant Purchases
          </Link>
          , sales from Revenue.
        </p>
        <FoodCostContent />
      </div>
    </RoleGuard>
  );
}
