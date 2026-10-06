"use client";

// Buckley's cost of goods, restaurant and bar kept apart (separate targets):
// food + alcohol bought (US Foods invoices, net of credits) against each
// outlet's sales, by week and month. Also where the money went and which
// prices moved between orders.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { GM_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { directSelectAll } from "@/lib/supabase/rest";
import { addDaysLocal, todayLocal } from "@/lib/utils/date";
import { OUTLET_COGS_TARGET, OUTLET_LABELS, type Outlet } from "@/lib/restaurant/coding";
import {
  PRICE_CHANGE_PCT,
  costByPeriod,
  lineOutlet,
  withInventory,
  markVendorGaps,
  priceChanges,
  topItems,
  type CostLine,
  type CostPeriod,
  type CostPurchase,
  type CostSale,
  type MonthEndCount,
} from "@/lib/restaurant/food-cost";

/** How far back the page looks. */
const LOOKBACK_DAYS = 400;

const OUTLETS: Outlet[] = ["restaurant", "bar"];

/** Where each outlet's sales are entered. */
const SALES_HINT: Record<Outlet, string> = {
  restaurant: "the restaurant RecTrac report (category Food & Beverage)",
  bar: "the bar RecTrac report (category Bar)",
};

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
  outlet?: Outlet | null;
  restaurant_purchases: { purchase_date: string; kind: "invoice" | "credit" | null } | null;
}

interface FoodCostData {
  purchases: CostPurchase[] | null;
  sales: CostSale[] | null;
  error: string | null;
  lines: CostLine[];
  linesMissing: boolean;
  /** Month-end counts (empty before the 2026-10-08 update). */
  counts: MonthEndCount[];
}

const LINE_COLUMNS =
  "product_number,description,pack_size,qty,unit_price,extended,category,restaurant_purchases!inner(purchase_date,kind)";

/** Everything the page shows, loaded together. Never throws. */
async function fetchFoodCost(): Promise<FoodCostData> {
  const since = addDaysLocal(todayLocal(), -LOOKBACK_DAYS);
  const out: FoodCostData = { purchases: null, sales: null, error: null, lines: [], linesMissing: false, counts: [] };
  out.counts = await directSelectAll<MonthEndCount>("inventory_valuations", {
    columns: "outlet,month_end,total",
    filters: [`month_end=gte.${addDaysLocal(since, -40)}`],
    orderBy: [{ column: "month_end", ascending: false }, { column: "id" }],
    label: "foodCost.inventory",
  }).catch(() => []);
  try {
    const [p, s] = await Promise.all([
      directSelectAll<CostPurchase>("restaurant_purchases", {
        columns: "*",
        filters: [`purchase_date=gte.${since}`],
        orderBy: [{ column: "purchase_date", ascending: false }, { column: "id" }],
        label: "foodCost.purchases",
      }),
      directSelectAll<CostSale>("revenue_entries", {
        columns: "entry_date,amount,category",
        filters: ["category=in.(food_beverage,bar)", `entry_date=gte.${since}`],
        orderBy: [{ column: "entry_date", ascending: false }, { column: "id" }],
        label: "foodCost.sales",
      }),
    ]);
    out.purchases = p;
    out.sales = s;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  const loadLines = (columns: string) =>
    directSelectAll<LineRow>("restaurant_purchase_lines", {
      columns,
      filters: [`restaurant_purchases.purchase_date=gte.${since}`],
      orderBy: [{ column: "id" }],
      label: "foodCost.lines",
    });
  try {
    // The bar column arrives with the 2026-10-07 update. Without it, alcohol is the bar.
    const l = await loadLines(`outlet,${LINE_COLUMNS}`).catch(() => loadLines(LINE_COLUMNS));
    out.lines = l
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
        outlet: r.outlet ?? null,
      }));
  } catch {
    // The line-item table arrives with the 2026-10-06 database update.
    out.linesMissing = true;
  }
  return out;
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
            {p.basis === "inventory"
              ? `Cost ${money(p.cogs)} (start ${money(p.startInventory ?? 0)} + bought ${money(p.purchases ?? 0)} − end ${money(p.endInventory ?? 0)}) · Sold ${money(p.sales)}`
              : `Bought ${money(p.cogs)} · Sold ${money(p.sales)}`}
            {p.supplies ? ` · Supplies ${money(p.supplies)} (not in COGS)` : ""}
          </p>
          {p.vendorGap && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              No beer or liquor invoices this month, so this cost is too low. Add them on Purchases.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** The latest period with sales (else the latest), for the headline. */
function latestOf(periods: CostPeriod[]): CostPeriod | null {
  return periods.find((p) => p.status !== "no_sales") ?? periods[0] ?? null;
}

function FoodCostContent() {
  const [purchases, setPurchases] = useState<CostPurchase[]>([]);
  const [sales, setSales] = useState<CostSale[]>([]);
  const [lines, setLines] = useState<CostLine[]>([]);
  const [linesMissing, setLinesMissing] = useState(false);
  const [counts, setCounts] = useState<MonthEndCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "week">("month");
  const [outlet, setOutlet] = useState<Outlet>("restaurant");

  const load = useCallback(() => {
    fetchFoodCost().then((d) => {
      if (d.purchases) setPurchases(d.purchases);
      if (d.sales) setSales(d.sales);
      setError(d.error);
      setLines(d.lines);
      setLinesMissing(d.linesMissing);
      setCounts(d.counts);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Bar beer, wine, and liquor come from other vendors. Until any of their
  // invoices are in, bar purchases are only the mixers on US Foods invoices,
  // so a count-based bar cost would be wrong: keep the bar on purchases.
  const barPurchasesIn = useMemo(
    () => purchases.some((p) => !/us foods/i.test(p.vendor ?? "US Foods") && Number(p.bar_cogs_amount ?? p.alcohol_amount ?? 0) > 0),
    [purchases],
  );
  const byOutlet = useMemo(() => {
    const rest = costByPeriod(purchases, sales, view, "restaurant");
    const bar = costByPeriod(purchases, sales, view, "bar");
    return {
      restaurant: view === "month" ? withInventory(rest, counts, "restaurant") : rest,
      bar: view === "month" && barPurchasesIn ? markVendorGaps(withInventory(bar, counts, "bar"), purchases) : bar,
    };
  }, [purchases, sales, view, counts, barPurchasesIn]);
  const periods = byOutlet[outlet];
  const outletLines = useMemo(() => lines.filter((l) => lineOutlet(l) === outlet), [lines, outlet]);
  const top = useMemo(() => {
    const since = addDaysLocal(todayLocal(), -90);
    return topItems(outletLines.filter((l) => l.purchase_date >= since && l.category !== "supplies"), 10);
  }, [outletLines]);
  const changes = useMemo(() => priceChanges(outletLines).slice(0, 15), [outletLines]);
  const outletHasSales = sales.some((s) => (s.category ?? "food_beverage") === (outlet === "bar" ? "bar" : "food_beverage"));

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

      {/* Both outlets at a glance; tap one to see its detail. */}
      <div className="grid grid-cols-2 gap-3">
        {OUTLETS.map((o) => {
          const latest = latestOf(byOutlet[o]);
          const selected = o === outlet;
          return (
            <button
              key={o}
              onClick={() => setOutlet(o)}
              aria-pressed={selected}
              className={`gk-card p-4 text-left transition-colors ${selected ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
            >
              <p className="text-sm font-semibold">{OUTLET_LABELS[o]}</p>
              <p className="text-3xl font-bold tabular-nums mt-1">{latest?.pct == null ? "—" : `${latest.pct}%`}</p>
              <p className="text-xs text-muted-foreground">
                {latest ? (view === "month" ? monthLabel(latest.key) : weekLabel(latest.key)) : "no data"} · target{" "}
                {OUTLET_COGS_TARGET[o]}% or less
              </p>
              {latest?.status === "high" && (
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mt-1">Above target</p>
              )}
            </button>
          );
        })}
      </div>

      {!outletHasSales && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No {OUTLET_LABELS[outlet].toLowerCase()} sales entered yet, so its COGS % can&apos;t be worked out. Upload{" "}
          {SALES_HINT[outlet]} on{" "}
          <Link href="/revenue/" className="underline font-medium">
            Revenue
          </Link>
          .
        </p>
      )}
      {outlet === "bar" && !barPurchasesIn && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Bar beer, wine, and liquor invoices aren&apos;t in yet, so bar cost is only the mixers bought from US Foods.
          Once the bar vendor invoices are imported, bar cost uses the month-end counts too.
        </p>
      )}
      {view === "month" && counts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Import the monthly count sheets on{" "}
          <Link href="/restaurant/inventory-values/" className="underline font-medium">
            Month-End Inventory
          </Link>{" "}
          for true cost of goods (starting inventory + purchases − ending inventory).
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
          <p className="gk-section-label">
            {OUTLET_LABELS[outlet]} COGS by {view}
          </p>
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
          {outlet === "bar"
            ? "Bar COGS = alcohol plus items marked Bar on the invoices (credits taken off) ÷ Bar sales."
            : "Restaurant COGS = food bought, less items marked Bar (credits taken off) ÷ Food & Beverage sales."}{" "}
          Paper goods, gloves, and cleaning supplies are shown with the restaurant but left out of COGS. Mark an item
          Bar on Restaurant Purchases.
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
            <p className="gk-section-label mb-2">
              {OUTLET_LABELS[outlet]}: where the money went (last 90 days)
            </p>
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
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
        onClick={() => {
          setLoading(true);
          load();
        }}
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
        <h1 className="mb-1">Food &amp; Bar Cost</h1>
        <p className="text-sm text-muted-foreground mb-5">
          What Buckley&apos;s restaurant and bar each buy against what each sells. Purchases come from{" "}
          <Link href="/restaurant/purchases/" className="underline">
            Restaurant Purchases
          </Link>
          , sales from the RecTrac reports on Revenue.
        </p>
        <FoodCostContent />
      </div>
    </RoleGuard>
  );
}
