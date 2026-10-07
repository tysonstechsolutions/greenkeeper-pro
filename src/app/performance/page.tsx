"use client";

// Performance: the restaurant, the bar, and the pro shop against their cost
// of goods targets (35%, 25%, 65%). Sales and cost by month, this year
// against last, the next six months, every item's cost against its price
// with a recommended price, and what to do — worked out from the US Foods
// and vendor invoices, the RecTrac sales reports, and the month-end counts.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, Info, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { GM_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectAll } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import type { CostPurchase, CostSale, MonthEndCount } from "@/lib/restaurant/food-cost";
import {
  AREAS,
  AREA_LABELS,
  AREA_TARGET,
  addMonths,
  areaMonths,
  areaSummaries,
  costBook,
  fiscalYear,
  fiscalYearLabel,
  itemCostByMonth,
  monthName,
  outlook,
  pricedItems,
  recommendations,
  unsoldPurchases,
  yearOverYear,
  type Area,
  type AreaMonth,
  type CountLine,
  type ItemSale,
  type PricedItem,
  type PurchaseLineLite,
  type Recommendation,
} from "@/lib/performance/performance";
import {
  blocksFromRows,
  officialForArea,
  officialNotes,
  type StoredBudgetLine,
  type StoredBudgetReport,
} from "@/lib/sap/budget-store";
import type { BudgetBlock } from "@/lib/sap/budget-report";
import { COST_CARDS, cardCostFor, priceCard, type LatestPrice } from "@/lib/restaurant/cost-cards";
import { loadCardPrices } from "@/lib/restaurant/load-card-prices";

const SalesChart = dynamic(() => import("./performance-charts").then((m) => m.SalesChart), {
  ssr: false,
  loading: () => <div className="h-56" />,
});
const CostPctChart = dynamic(() => import("./performance-charts").then((m) => m.CostPctChart), {
  ssr: false,
  loading: () => <div className="h-56" />,
});

function money(n: number, cents = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

// ── Loading ────────────────────────────────────────────────────────────────

interface Loaded {
  purchases: CostPurchase[];
  sales: CostSale[];
  counts: MonthEndCount[];
  countLines: CountLine[];
  itemSales: ItemSale[];
  purchaseLines: PurchaseLineLite[];
  /** Latest US Foods prices for the cost cards' products (the restaurant's menu item costs). */
  cardPrices: Map<string, LatestPrice>;
  /** The latest SAP budget report and its Buckley's / merchandise cost centers. */
  sap: { report: StoredBudgetReport; blocks: BudgetBlock[] } | null;
  /** Tables that aren't there yet (a database update not run). */
  missing: string[];
  error: string | null;
}

type CountLineRow = { description: string; category: string | null; unit_cost: number; inventory_valuations: { outlet: string; month_end: string } | null };
type PurchaseLineRow = { description: string; extended: number; category: string; outlet?: string | null; restaurant_purchases: { purchase_date: string } | null };

/** Two years back (for last year's same months) through today. */
async function loadAll(since: string, areas: Area[]): Promise<Loaded> {
  const out: Loaded = { purchases: [], sales: [], counts: [], countLines: [], itemSales: [], purchaseLines: [], cardPrices: new Map(), sap: null, missing: [], error: null };
  const categories = areas.map((a) => ({ restaurant: "food_beverage", bar: "bar", pro_shop: "pro_shop" })[a]).join(",");
  const soft = <T,>(name: string, p: Promise<T[]>) =>
    p.catch((e) => {
      out.missing.push(name);
      console.warn(`performance: ${name}`, e);
      return [] as T[];
    });
  try {
    const [purchases, sales] = await Promise.all([
      directSelectAll<CostPurchase>("restaurant_purchases", {
        columns: "*",
        filters: [`purchase_date=gte.${since}`],
        orderBy: [{ column: "purchase_date" }, { column: "id" }],
        pageSize: 1000,
        label: "performance.purchases",
      }),
      directSelectAll<CostSale>("revenue_entries", {
        columns: "entry_date,amount,category",
        filters: [`category=in.(${categories})`, `entry_date=gte.${since}`],
        orderBy: [{ column: "entry_date" }, { column: "id" }],
        pageSize: 1000,
        label: "performance.sales",
      }),
    ]);
    out.purchases = purchases;
    out.sales = sales;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  const [counts, countLines, itemSales, purchaseLines] = await Promise.all([
    soft(
      "month-end counts",
      directSelectAll<MonthEndCount>("inventory_valuations", {
        columns: "outlet,month_end,total",
        filters: [`month_end=gte.${since}`],
        orderBy: [{ column: "month_end" }, { column: "id" }],
        label: "performance.counts",
      }),
    ),
    soft(
      "count sheet items",
      directSelectAll<CountLineRow>("inventory_valuation_lines", {
        columns: "description,category,unit_cost,inventory_valuations!inner(outlet,month_end)",
        filters: [`inventory_valuations.month_end=gte.${since}`],
        orderBy: [{ column: "id" }],
        pageSize: 1000,
        label: "performance.countLines",
      }),
    ),
    soft(
      "item sales",
      directSelectAll<ItemSale>("sales_item_days", {
        columns: "outlet,sale_date,description,qty,net",
        filters: [`sale_date=gte.${since}`, `outlet=in.(${areas.join(",")})`],
        orderBy: [{ column: "sale_date" }, { column: "id" }],
        pageSize: 1000,
        label: "performance.itemSales",
      }),
    ),
    soft(
      "purchase items",
      directSelectAll<PurchaseLineRow>("restaurant_purchase_lines", {
        columns: "description,extended,category,outlet,restaurant_purchases!inner(purchase_date)",
        filters: [`restaurant_purchases.purchase_date=gte.${since}`, "category=eq.alcohol"],
        orderBy: [{ column: "id" }],
        pageSize: 1000,
        label: "performance.purchaseLines",
      }),
    ),
  ]);
  out.counts = counts;
  out.countLines = countLines
    .filter((l) => l.inventory_valuations)
    .map((l) => ({
      outlet: l.inventory_valuations!.outlet,
      month_end: l.inventory_valuations!.month_end,
      description: l.description,
      category: l.category,
      unit_cost: Number(l.unit_cost),
    }));
  out.itemSales = itemSales;
  out.purchaseLines = purchaseLines
    .filter((l) => l.restaurant_purchases)
    .map((l) => ({
      purchase_date: l.restaurant_purchases!.purchase_date,
      description: l.description,
      extended: Number(l.extended),
      category: l.category,
      outlet: l.outlet ?? null,
    }));
  if (areas.includes("restaurant")) {
    // No invoices on file yet: the cards fall back to their own prices.
    out.cardPrices = await loadCardPrices().catch(() => new Map<string, LatestPrice>());
  }
  out.sap = await loadSap(areas);
  return out;
}

/** The latest SAP report's official numbers, if any have been saved. */
async function loadSap(areas: Area[]): Promise<Loaded["sap"]> {
  try {
    const reports = await directSelectAll<StoredBudgetReport>("sap_budget_reports", {
      columns: "id,fiscal_year,period,period_name,run_date,source_file",
      orderBy: [{ column: "fiscal_year", ascending: false }, { column: "period", ascending: false }, { column: "id" }],
      label: "performance.sapReports",
    });
    const report = reports[0];
    if (!report) return null;
    const centers = areas.includes("pro_shop") ? "20091,20086" : "20091";
    const rows = await directSelectAll<StoredBudgetLine>("sap_budget_lines", {
      columns: "cost_center,cost_center_name,activity,section,code,label,level,line_no,month_actual,month_plan,month_prior,ytd_actual,ytd_plan,ytd_prior",
      filters: [`report_id=eq.${report.id}`, `cost_center=in.(${centers})`],
      orderBy: [{ column: "line_no" }, { column: "id" }],
      pageSize: 1000,
      label: "performance.sapLines",
    });
    return { report, blocks: blocksFromRows(rows) };
  } catch {
    // Not run the SAP database update yet, or nothing saved: the page works without it.
    return null;
  }
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function StatusTag({ pct, target }: { pct: number | null; target: number }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">no cost yet</span>;
  const over = pct > target;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        over ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      }`}
    >
      {over ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {over ? `${Math.round((pct - target) * 10) / 10} pts over` : "On target"}
    </span>
  );
}

function Tile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="gk-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

const REC_STYLE: Record<Recommendation["level"], { icon: typeof Info; tone: string; label: string }> = {
  act: { icon: AlertTriangle, tone: "text-red-700 dark:text-red-400", label: "Do" },
  watch: { icon: Eye, tone: "text-amber-700 dark:text-amber-400", label: "Watch" },
  info: { icon: Info, tone: "text-muted-foreground", label: "Note" },
};

function Recommendations({ recs }: { recs: Recommendation[] }) {
  if (!recs.length) return <p className="text-sm text-muted-foreground">Nothing to flag yet.</p>;
  return (
    <ol className="gk-card divide-y divide-border/60">
      {recs.map((r) => {
        const s = REC_STYLE[r.level];
        return (
          <li key={r.title} className="px-4 py-3 flex gap-3">
            <s.icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.tone}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                <span className={`text-[11px] uppercase tracking-wide mr-1.5 ${s.tone}`}>{s.label}</span>
                {r.title}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{r.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PriceTable({ items, target }: { items: PricedItem[]; target: number }) {
  const [onlyLow, setOnlyLow] = useState(true);
  const [all, setAll] = useState(false);
  const list = onlyLow ? items.filter((i) => i.recommended != null) : items;
  const shown = all ? list : list.slice(0, 25);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Which items">
        <button
          type="button"
          aria-pressed={onlyLow}
          onClick={() => setOnlyLow(true)}
          className={`px-3 py-1 rounded-full border ${onlyLow ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
        >
          Priced under target ({items.filter((i) => i.recommended != null).length})
        </button>
        <button
          type="button"
          aria-pressed={!onlyLow}
          onClick={() => setOnlyLow(false)}
          className={`px-3 py-1 rounded-full border ${!onlyLow ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
        >
          Every item ({items.length})
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {onlyLow ? `Every item with a cost on the count sheets is at or under the ${target}% target.` : "No item sales yet."}
        </p>
      ) : (
        <div className="gk-card overflow-x-auto">
          <table className="w-full text-sm" aria-label="Item prices">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-3 py-2">Item</th>
                <th className="text-right font-medium px-2 py-2">Sold</th>
                <th className="text-right font-medium px-2 py-2">Price</th>
                <th className="text-right font-medium px-2 py-2">Cost</th>
                <th className="text-right font-medium px-2 py-2">Cost %</th>
                <th className="text-right font-medium px-2 py-2">Charge</th>
                <th className="text-right font-medium px-3 py-2">More a year</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.description} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-1.5">
                    {i.description}
                    {i.unitMismatch && <span className="block text-[11px] text-amber-700 dark:text-amber-400">counted in a different unit</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{i.qty}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(i.price, true)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{i.unitCost == null ? "—" : money(i.unitCost, true)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${i.costPct != null && i.costPct > target ? "text-red-700 dark:text-red-400 font-semibold" : ""}`}>
                    {i.costPct == null || i.unitMismatch ? "—" : `${i.costPct}%`}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{i.recommended == null ? "" : money(i.recommended, true)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{i.extraPerYear > 0 ? money(i.extraPerYear) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 25 && (
        <button type="button" className="text-sm underline" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        Sold and price are the last 12 months. Cost is the latest cost on the month-end count sheets. &ldquo;Charge&rdquo;
        is the lowest price (to the next quarter) that puts the item at the {target}% target; &ldquo;more a year&rdquo; is
        what that brings in at the same sales.
      </p>
    </div>
  );
}

const BASIS_LABEL: Record<AreaMonth["basis"], string> = {
  inventory: "counts + purchases",
  purchases: "purchases only",
  "item cost": "item costs",
  none: "—",
};

function MonthTable({ months, target }: { months: AreaMonth[]; target: number }) {
  return (
    <div className="gk-card overflow-x-auto">
      <table className="w-full text-sm" aria-label="Month by month">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border">
            <th className="text-left font-medium px-3 py-2">Month</th>
            <th className="text-right font-medium px-2 py-2">Sales</th>
            <th className="text-right font-medium px-2 py-2">Year before</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-2 py-2">Cost %</th>
            <th className="text-left font-medium px-3 py-2">Cost from</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((m) => (
            <tr key={m.key} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-1.5">{monthName(m.key)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(m.sales)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{m.lastYearSales == null ? "—" : money(m.lastYearSales)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{m.cost == null ? "—" : money(m.cost)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${m.pct != null && m.pct > target ? "text-red-700 dark:text-red-400 font-semibold" : ""}`}>
                {m.pct == null ? "—" : `${m.pct}%`}
              </td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">
                {BASIS_LABEL[m.basis]}
                {m.vendorGap ? " · no beer/liquor invoices" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function PerformanceContent() {
  const { isFbManager } = useAuth();
  const areas: Area[] = isFbManager ? ["restaurant", "bar"] : AREAS;
  const [area, setArea] = useState<Area>("restaurant");
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);

  // The last full month; this month is still filling in.
  const through = addMonths(todayLocal().slice(0, 7), -1);
  const since = `${addMonths(through, -24)}-01`;

  const load = useCallback(() => {
    setLoading(true);
    loadAll(since, areas).then((d) => {
      setData(d);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- areas only changes with isFbManager
  }, [since, isFbManager]);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const input = { purchases: data.purchases, sales: data.sales, counts: data.counts, countLines: data.countLines, itemSales: data.itemSales };
    const months = areaMonths(area, input, through);
    const last12Months = months.filter((m) => m.key > addMonths(through, -12));
    const summaries = areaSummaries(months, through);
    const book = costBook(data.countLines, area);
    const yearAgo = `${addMonths(through, -11)}-01`;
    // Restaurant menu items cost what their cost card says (bottles, candy, and chips come from the counts).
    const cards = area === "restaurant" ? COST_CARDS.map((c) => priceCard(c, data.cardPrices)) : [];
    const fromCard = (description: string) => {
      const p = cardCostFor(description, cards);
      return p ? { unitCost: p.cost, from: [`Cost card: ${p.card.name}`] } : null;
    };
    const items = pricedItems(data.itemSales.filter((s) => s.sale_date >= yearAgo), book, area, area === "restaurant" ? fromCard : undefined);
    const look = outlook(months, area, through);
    const latestCount =
      data.counts
        .filter((c) => c.outlet === area && Number(c.total) > 0)
        .sort((a, b) => b.month_end.localeCompare(a.month_end))[0] ?? null;
    const monthItemCost = new Map([...itemCostByMonth(data.itemSales, book, area)].map(([k, v]) => [k, v.cost]));
    const recs = recommendations({
      area,
      months,
      through,
      items,
      latestCount: latestCount ? { month_end: latestCount.month_end, total: Number(latestCount.total) } : null,
      outlook: look,
      unsoldPurchases: area === "bar" ? unsoldPurchases(data.purchaseLines, data.itemSales, yearAgo) : undefined,
      monthItemCost,
    });
    const official = data.sap ? officialForArea(data.sap.report, data.sap.blocks, area) : null;
    if (official) {
      const fyStart = `${official.fiscalYear - 1}-10`;
      const entered = months.filter((m) => m.key >= fyStart && m.key <= official.through).reduce((s, m) => s + m.sales, 0);
      const order = { act: 0, watch: 1, info: 2 };
      recs.push(...officialNotes(official, entered, AREA_TARGET[area], fiscalYearLabel(official.fiscalYear)));
      recs.sort((a, b) => order[a.level] - order[b.level] || b.dollars - a.dollars);
    }
    return { months, last12Months, summaries, items, look, recs, official };
  }, [data, area, through]);

  if (loading || !data || !view) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const target = AREA_TARGET[area];
  const { last12, fytd } = view.summaries;
  const fy = fiscalYear(through);
  const yoy = yearOverYear(view.months, through);

  return (
    <div className="space-y-6">
      {data.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {data.error}
        </div>
      )}
      {data.missing.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Couldn&apos;t load {data.missing.join(", ")}. If a database update hasn&apos;t been run, check{" "}
          <Link href="/settings/system-health/" className="underline">System Health</Link>.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Area">
        {areas.map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={a === area}
            onClick={() => setArea(a)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
              a === area ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            }`}
          >
            {AREA_LABELS[a]} <span className="font-normal opacity-80">· {AREA_TARGET[a]}%</span>
          </button>
        ))}
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Reload">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${view.official ? "lg:grid-cols-4" : ""}`}>
        <Tile
          label="Cost of sales, last 12 months"
          value={last12.pct == null ? "—" : `${last12.pct}%`}
          sub={`Target ${target}% or less · ${money(last12.cost)} cost on ${money(last12.costedSales)}`}
        >
          <StatusTag pct={last12.pct} target={target} />
        </Tile>
        <Tile label="Sales, last 12 months" value={money(last12.sales)} sub={`Through ${monthName(through)}`} />
        <Tile
          label={`${fiscalYearLabel(fy)} (Oct–Sep) so far`}
          value={money(fytd.sales)}
          sub={fytd.pct == null ? "sales" : `sales · cost ${fytd.pct}%`}
        >
          {yoy && (
            <span className={`inline-flex items-start gap-1 text-xs font-medium ${yoy.change < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {yoy.change < 0 ? <TrendingDown className="w-3.5 h-3.5 shrink-0" /> : <TrendingUp className="w-3.5 h-3.5 shrink-0" />}
              {yoy.change > 0 ? "+" : ""}
              {yoy.change}% in the {yoy.months} month{yoy.months === 1 ? "" : "s"} with reports both years ({money(yoy.before)} → {money(yoy.now)})
            </span>
          )}
        </Tile>
        {view.official && (
          <Tile
            label={`Official (SAP), ${fiscalYearLabel(view.official.fiscalYear)} through ${view.official.periodName}`}
            value={view.official.pct == null ? "—" : `${view.official.pct}%`}
            sub={`${view.official.cogs == null || view.official.cogs <= 0 ? "No cost posted" : `${money(view.official.cogs)} cost`} on ${money(view.official.sales)} sales`}
          >
            <span className="flex flex-wrap items-center gap-2">
              <StatusTag pct={view.official.pct} target={target} />
              <Link href="/budget/sap/" className="text-xs underline text-muted-foreground">SAP Report</Link>
            </span>
          </Tile>
        )}
      </div>

      <section aria-labelledby="recs">
        <h2 id="recs" className="text-lg font-semibold mb-2">What to do</h2>
        <Recommendations recs={view.recs} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="gk-card p-4">
          <h2 className="text-base font-semibold">Sales by month</h2>
          <p className="text-xs text-muted-foreground mb-2">Last 12 months, beside the same month a year earlier.</p>
          <SalesChart months={view.last12Months} />
        </div>
        <div className="gk-card p-4">
          <h2 className="text-base font-semibold">Cost of sales by month</h2>
          <p className="text-xs text-muted-foreground mb-2">
            Green at or under the {target}% target, red over. Months over 200% are cut off; the table below has the exact figure.
          </p>
          <CostPctChart months={view.last12Months} target={target} />
        </div>
      </section>

      <section aria-labelledby="outlook">
        <h2 id="outlook" className="text-lg font-semibold mb-1">Next six months</h2>
        <p className="text-xs text-muted-foreground mb-2">
          Last year&apos;s sales for each month
          {view.look.trend != null
            ? `, times ${view.look.trend} (how the last ${view.look.trendMonths.length} month${view.look.trendMonths.length === 1 ? "" : "s"} compare with a year earlier)`
            : ""}
          . The course closes Nov–Mar, so those months follow last winter.
        </p>
        <div className="gk-card overflow-x-auto">
          <table className="w-full text-sm" aria-label="Outlook">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-3 py-2">Month</th>
                <th className="text-right font-medium px-2 py-2">Expected sales</th>
                <th className="text-right font-medium px-2 py-2">Cost at today&apos;s {view.look.pctUsed ?? "—"}%</th>
                <th className="text-right font-medium px-3 py-2">Cost at {target}%</th>
              </tr>
            </thead>
            <tbody>
              {view.look.months.map((m) => (
                <tr key={m.key} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-1.5">{monthName(m.key)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(m.expectedSales)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{m.expectedCost == null ? "—" : money(m.expectedCost)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(m.targetCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="prices">
        <h2 id="prices" className="text-lg font-semibold mb-2">Prices</h2>
        <PriceTable items={view.items} target={target} />
      </section>

      <section aria-labelledby="months">
        <h2 id="months" className="text-lg font-semibold mb-2">Month by month</h2>
        <MonthTable months={view.months} target={target} />
        <p className="text-xs text-muted-foreground mt-2">
          {area === "pro_shop"
            ? "Pro shop cost is what was sold times each item's cost on the count sheets, until pro shop purchases are in."
            : "Cost is the start count + purchases − the end count when both counts are in; otherwise what was bought that month."}{" "}
          Upload sales on <Link href="/revenue/" className="underline">Revenue</Link>, invoices on{" "}
          <Link href="/restaurant/purchases/" className="underline">Purchases</Link>, and counts on{" "}
          <Link href="/restaurant/inventory-values/" className="underline">Month-End Inventory</Link>.
        </p>
      </section>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <RoleGuard allowedRoles={withFbManager(GM_ROLES)}>
      <div className="gk-page mx-auto">
        <h1 className="mb-1">Performance</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Restaurant, bar, and pro shop sales and cost of goods against their targets, with prices to charge and what to
          do next.
        </p>
        <PerformanceContent />
      </div>
    </RoleGuard>
  );
}
