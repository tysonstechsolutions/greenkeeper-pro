/**
 * Buckley's cost of goods, kept apart for the restaurant and the bar (they
 * have separate targets): what each bought (food + alcohol, net of credits)
 * against what each sold (Food & Beverage revenue for the restaurant, Bar
 * revenue for the bar), by week and by month, plus what the money went to
 * and which prices moved.
 *
 * Pure: the food cost page loads the rows and hands them here.
 */
import { OUTLET_COGS_TARGET, type Outlet } from "./coding";

/** Restaurant target, kept for older callers. */
export const FOOD_COST_TARGET_PCT = OUTLET_COGS_TARGET.restaurant;

/** revenue_entries.category that is each outlet's sales. */
export const OUTLET_SALES_CATEGORY: Record<Outlet, string> = {
  restaurant: "food_beverage",
  bar: "bar",
};
/** A price move this big (either way) between orders is worth a look. */
export const PRICE_CHANGE_PCT = 3;

export interface CostPurchase {
  purchase_date: string;
  amount: number;
  food_amount?: number | null;
  alcohol_amount?: number | null;
  supplies_amount?: number | null;
  /** Food + alcohol that went to the bar (null on older or hand-typed rows). */
  bar_cogs_amount?: number | null;
  vendor?: string | null;
}

export interface CostSale {
  entry_date: string;
  amount: number;
  /** revenue_entries.category; missing means Food & Beverage. */
  category?: string;
}

export interface CostLine {
  purchase_date: string;
  kind: "invoice" | "credit";
  product_number: string;
  description: string;
  pack_size: string | null;
  qty: number;
  unit_price: number;
  extended: number;
  category: string;
  /** Bar or restaurant; missing means restaurant (alcohol means bar). */
  outlet?: Outlet | null;
}

/** The outlet a line counts toward. */
export function lineOutlet(l: Pick<CostLine, "outlet" | "category">): Outlet {
  if (l.outlet) return l.outlet;
  return l.category === "alcohol" ? "bar" : "restaurant";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cost of goods for each outlet, and supplies, for one purchase. Hand-typed
 * rows count as restaurant food. Without a bar figure, alcohol is the bar.
 */
export function purchaseSplit(p: CostPurchase): { cogs: number; restaurant: number; bar: number; supplies: number } {
  if (p.food_amount == null && p.alcohol_amount == null && p.supplies_amount == null) {
    const amount = Number(p.amount);
    return { cogs: amount, restaurant: amount, bar: 0, supplies: 0 };
  }
  const cogs = Number(p.food_amount ?? 0) + Number(p.alcohol_amount ?? 0);
  const bar = p.bar_cogs_amount != null ? Number(p.bar_cogs_amount) : Number(p.alcohol_amount ?? 0);
  return { cogs, restaurant: r2(cogs - bar), bar: r2(bar), supplies: Number(p.supplies_amount ?? 0) };
}

/** Monday of the week a date falls in (yyyy-mm-dd). */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export type CostStatus = "good" | "high" | "no_sales";

export interface CostPeriod {
  /** yyyy-mm for a month, the Monday for a week. */
  key: string;
  cogs: number;
  supplies: number;
  sales: number;
  /** Food cost %, null without sales. */
  pct: number | null;
  status: CostStatus;
  /**
   * How cogs was worked out: from purchases alone, or with the month-end
   * counts (starting + purchases − ending). Monthly only.
   */
  basis?: "purchases" | "inventory";
  purchases?: number;
  startInventory?: number;
  endInventory?: number;
}

export interface MonthEndCount {
  outlet: string;
  /** yyyy-mm-dd */
  month_end: string;
  total: number;
}

/** "2026-03" → "2026-02". */
function previousMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * True cost of goods for months that have both counts: what was on hand at
 * the start (last month's count) plus what was bought, less what's left at
 * the end. Months without both counts keep the purchases figure. Monthly
 * periods only (newest first, as costByPeriod returns them).
 */
export function withInventory(periods: CostPeriod[], counts: MonthEndCount[], outlet: Outlet): CostPeriod[] {
  const byMonth = new Map(
    counts.filter((c) => c.outlet === outlet).map((c) => [c.month_end.slice(0, 7), Number(c.total)]),
  );
  // A month with counts but no purchases still has a cost (stock was used).
  const keys = new Set(periods.map((p) => p.key));
  const extra: CostPeriod[] = [];
  for (const k of byMonth.keys()) {
    if (!keys.has(k) && byMonth.has(previousMonth(k))) {
      extra.push({ key: k, cogs: 0, supplies: 0, sales: 0, pct: null, status: "no_sales" });
    }
  }
  return [...periods, ...extra]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((p) => {
      const start = byMonth.get(previousMonth(p.key));
      const end = byMonth.get(p.key);
      if (start == null || end == null) return { ...p, basis: "purchases" as const, purchases: p.cogs };
      const cogs = r2(start + p.cogs - end);
      const pct = p.sales > 0 ? Math.round((cogs / p.sales) * 1000) / 10 : null;
      return {
        ...p,
        basis: "inventory" as const,
        purchases: p.cogs,
        startInventory: start,
        endInventory: end,
        cogs,
        pct,
        status: statusFor(pct, OUTLET_COGS_TARGET[outlet]),
      };
    });
}

function statusFor(pct: number | null, target: number): CostStatus {
  if (pct == null) return "no_sales";
  return pct > target ? "high" : "good";
}

/**
 * One outlet's cost and sales by month or week, newest first. Supplies are
 * shown with the restaurant (they're Buckley's, but never in a COGS %).
 */
export function costByPeriod(
  purchases: CostPurchase[],
  sales: CostSale[],
  by: "month" | "week",
  outlet: Outlet = "restaurant",
): CostPeriod[] {
  const keyOf = (iso: string) => (by === "month" ? iso.slice(0, 7) : weekStart(iso));
  const map = new Map<string, { cogs: number; supplies: number; sales: number }>();
  const at = (k: string) => {
    let v = map.get(k);
    if (!v) map.set(k, (v = { cogs: 0, supplies: 0, sales: 0 }));
    return v;
  };
  for (const p of purchases) {
    const s = purchaseSplit(p);
    const cogs = outlet === "bar" ? s.bar : s.restaurant;
    const supplies = outlet === "restaurant" ? s.supplies : 0;
    if (!cogs && !supplies) continue;
    const v = at(keyOf(p.purchase_date));
    v.cogs += cogs;
    v.supplies += supplies;
  }
  const salesCategory = OUTLET_SALES_CATEGORY[outlet];
  for (const s of sales) {
    if ((s.category ?? "food_beverage") !== salesCategory) continue;
    at(keyOf(s.entry_date)).sales += Number(s.amount);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => {
      const pct = v.sales > 0 ? Math.round((v.cogs / v.sales) * 1000) / 10 : null;
      return {
        key,
        cogs: r2(v.cogs),
        supplies: r2(v.supplies),
        sales: r2(v.sales),
        pct,
        status: statusFor(pct, OUTLET_COGS_TARGET[outlet]),
      };
    });
}

export interface TopItem {
  product_number: string;
  description: string;
  pack_size: string | null;
  qty: number;
  spend: number;
  category: string;
}

/** Where the money went: items by net spend (credits taken off), biggest first. */
export function topItems(lines: CostLine[], limit = 10): TopItem[] {
  const map = new Map<string, TopItem>();
  for (const l of lines) {
    const t = map.get(l.product_number) ?? {
      product_number: l.product_number,
      description: l.description,
      pack_size: l.pack_size,
      qty: 0,
      spend: 0,
      category: l.category,
    };
    t.qty += Number(l.qty);
    t.spend += Number(l.extended);
    // Invoice wording beats credit memo wording (credits run the brand in).
    if (l.kind === "invoice") {
      t.description = l.description;
      t.pack_size = l.pack_size ?? t.pack_size;
    }
    map.set(l.product_number, t);
  }
  return [...map.values()]
    .map((t) => ({ ...t, qty: r2(t.qty), spend: r2(t.spend) }))
    .filter((t) => t.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

export interface PriceChange {
  product_number: string;
  description: string;
  pack_size: string | null;
  before: number;
  beforeDate: string;
  now: number;
  nowDate: string;
  changePct: number;
}

/**
 * Items whose case price moved at least PRICE_CHANGE_PCT between their last
 * two orders (invoices only), biggest move first.
 */
export function priceChanges(lines: CostLine[], minPct = PRICE_CHANGE_PCT): PriceChange[] {
  const byItem = new Map<string, CostLine[]>();
  for (const l of lines) {
    if (l.kind !== "invoice" || !(Number(l.unit_price) > 0)) continue;
    const list = byItem.get(l.product_number) ?? [];
    list.push(l);
    byItem.set(l.product_number, list);
  }
  const out: PriceChange[] = [];
  for (const list of byItem.values()) {
    list.sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
    const last = list[list.length - 1];
    // The most recent earlier order on a different day.
    const prev = [...list].reverse().find((l) => l.purchase_date < last.purchase_date);
    if (!prev) continue;
    const before = Number(prev.unit_price);
    const now = Number(last.unit_price);
    const changePct = Math.round(((now - before) / before) * 1000) / 10;
    if (Math.abs(changePct) < minPct) continue;
    out.push({
      product_number: last.product_number,
      description: last.description,
      pack_size: last.pack_size,
      before,
      beforeDate: prev.purchase_date,
      now,
      nowDate: last.purchase_date,
      changePct,
    });
  }
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}
