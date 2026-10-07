/**
 * How the restaurant, the bar, and the pro shop are doing against their cost
 * of goods targets (35%, 25%, 65% of sales): month by month, this fiscal year
 * against last, where the next six months are headed, what each item costs
 * against what it sells for, and what to do about it.
 *
 * Cost of goods by area:
 *   restaurant, bar  start count + purchases − end count when both month-end
 *                    counts are in, else purchases (lib/restaurant/food-cost)
 *   pro shop         what was sold × each item's cost on the count sheets
 *                    (pro shop purchases aren't in yet)
 *
 * Pure: the Performance page loads the rows and hands them here.
 */
import {
  costByPeriod,
  markVendorGaps,
  withInventory,
  type CostPurchase,
  type CostSale,
  type MonthEndCount,
} from "@/lib/restaurant/food-cost";
import { matchCost, productWords, type CostItem } from "./match";

export type Area = "restaurant" | "bar" | "pro_shop";

export const AREAS: Area[] = ["restaurant", "bar", "pro_shop"];

export const AREA_LABELS: Record<Area, string> = {
  restaurant: "Restaurant",
  bar: "Bar",
  pro_shop: "Pro shop",
};

/** Cost of goods targets, % of sales. The same every year. */
export const AREA_TARGET: Record<Area, number> = { restaurant: 35, bar: 25, pro_shop: 65 };

/** revenue_entries.category for each area. */
export const AREA_SALES_CATEGORY: Record<Area, string> = {
  restaurant: "food_beverage",
  bar: "bar",
  pro_shop: "pro_shop",
};

/** Count-sheet categories whose items are sold as they come (a can, a candy bar, a sleeve of balls). */
const SOLD_AS_IS: Record<Area, (category: string | null) => boolean> = {
  restaurant: (c) => /^(BEVERAGES?|SNACKS?|CHIPS?|CANDY)$/i.test(c ?? ""),
  bar: (c) => /^(BEER|SPECIAL|SELTZER|WINE)$/i.test(c ?? ""),
  pro_shop: () => true,
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (cost: number, sales: number) => (sales > 0 ? Math.round((cost / sales) * 1000) / 10 : null);

// ── Months and fiscal years ────────────────────────────────────────────────

/** The fiscal year a date falls in (Oct 1 – Sep 30). Oct 2026 is FY27 → 2027. */
export function fiscalYear(isoDateOrMonth: string): number {
  const [y, m] = isoDateOrMonth.split("-").map(Number);
  return m >= 10 ? y + 1 : y;
}

export function fiscalYearLabel(fy: number): string {
  return `FY${String(fy % 100).padStart(2, "0")}`;
}

/** "2026-03" → "2025-03". */
export function sameMonthLastYear(key: string): string {
  const [y, m] = key.split("-");
  return `${Number(y) - 1}-${m}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Month keys from a to b inclusive (yyyy-mm). */
export function monthRange(a: string, b: string): string[] {
  const out: string[] = [];
  for (let k = a; k <= b; k = addMonths(k, 1)) out.push(k);
  return out;
}

// ── Item sales and costs ───────────────────────────────────────────────────

export interface ItemSale {
  outlet: string;
  sale_date: string;
  description: string;
  qty: number;
  net: number;
}

export interface CountLine {
  outlet: string;
  month_end: string;
  description: string;
  category: string | null;
  unit_cost: number;
}

/** Each item's latest cost from the count sheets for one area (sold-as-is items only). */
/**
 * Pours in a bottle of liquor: 1.5 oz pours from a 750 ml bottle unless the
 * count sheet names a 1 L or 1.75 L bottle.
 */
export function poursPerBottle(description: string): number {
  if (/1\.75\s?L\b|\bHANDLE\b/i.test(description)) return 39.4;
  if (/\b1\s?L\b|\bLITER\b/i.test(description)) return 22.5;
  return 16.9;
}

const isLiquor = (category: string | null) => /^LIQUOR$/i.test(category ?? "");

/** RTC shirts and hoodies come to the pro shop free: a $0 cost is real, not missing. */
const isFreeStock = (area: Area, description: string) => area === "pro_shop" && /^RTC\b/i.test(description.trim());

export function costBook(lines: CountLine[], area: Area): CostItem[] {
  const latest = new Map<string, CountLine>();
  for (const l of lines) {
    const liquor = area === "bar" && isLiquor(l.category);
    const costed = Number(l.unit_cost) > 0 || (Number(l.unit_cost) === 0 && isFreeStock(area, l.description));
    if (l.outlet !== area || !costed || !(SOLD_AS_IS[area](l.category) || liquor)) continue;
    if (liquor) {
      const key = `${l.description.trim().toUpperCase()}|`;
      const prev = latest.get(key);
      if (!prev || l.month_end > prev.month_end) latest.set(key, l);
      continue;
    }
    // 2-liter bottles and liters of mix are poured, not sold one to a sale.
    if (area !== "pro_shop" && /\b2\s?L\b|\/2L\b|\bLITER\b/i.test(l.description)) continue;
    // One cost per name and unit cost (a sleeve and a dozen are both kept).
    const key = `${l.description.trim().toUpperCase()}|${area === "pro_shop" ? Math.round(Number(l.unit_cost) * 100) : ""}`;
    const prev = latest.get(key);
    if (!prev || l.month_end > prev.month_end) latest.set(key, l);
  }
  return [...latest.values()].map((l) =>
    area === "bar" && isLiquor(l.category)
      ? { description: l.description, category: l.category, unitCost: r2(Number(l.unit_cost) / poursPerBottle(l.description)), bottleCost: Number(l.unit_cost) }
      : { description: l.description, category: l.category, unitCost: Number(l.unit_cost) },
  );
}

export interface PricedItem {
  description: string;
  qty: number;
  sales: number;
  /** Average price each (sales ÷ qty). */
  price: number;
  unitCost: number | null;
  /** Cost % at today's price. */
  costPct: number | null;
  /** Lowest price that meets the target, rounded up to a quarter. */
  recommended: number | null;
  /** Extra a year at the recommended price, at the same quantity. */
  extraPerYear: number;
  costFrom: string[];
  /**
   * The count-sheet cost is well above the price: almost always counted in a
   * different unit (a 15-pack counted, a sleeve sold). No recommendation.
   */
  unitMismatch?: boolean;
}

/** Above this many times the price, a cost is in a different unit than the sale. */
const MISMATCH = 1.2;

/** Round a price up to the next quarter. */
export function quarterUp(n: number): number {
  return Math.ceil(n * 4 - 1e-9) / 4;
}

/**
 * Every item sold in an area over the period, with what it costs, its cost %,
 * and the price that would bring it to target. Biggest sellers first.
 */
export function pricedItems(
  sales: ItemSale[],
  book: CostItem[],
  area: Area,
  /** A cost from somewhere other than the count sheets (the restaurant's cost cards), tried first. */
  costOf?: (description: string) => { unitCost: number; from: string[] } | null,
): PricedItem[] {
  const target = AREA_TARGET[area] / 100;
  const byItem = new Map<string, { description: string; qty: number; sales: number }>();
  for (const s of sales) {
    if (s.outlet !== area) continue;
    const key = s.description.trim().toUpperCase();
    const it = byItem.get(key) ?? { description: s.description.trim(), qty: 0, sales: 0 };
    it.qty += Number(s.qty);
    it.sales += Number(s.net);
    byItem.set(key, it);
  }
  const out: PricedItem[] = [];
  for (const it of byItem.values()) {
    if (!(it.qty > 0) || !(it.sales > 0)) continue;
    const price = it.sales / it.qty;
    const m = costOf?.(it.description) ?? matchCost(it.description, book, price);
    const unitCost = m ? r2(m.unitCost) : null;
    const costPct = unitCost != null ? Math.round((unitCost / price) * 1000) / 10 : null;
    const unitMismatch = unitCost != null && unitCost > price * MISMATCH;
    let recommended: number | null = null;
    let extraPerYear = 0;
    if (unitCost != null && costPct != null && costPct > AREA_TARGET[area] && !unitMismatch) {
      recommended = quarterUp(unitCost / target);
      extraPerYear = r2((recommended - price) * it.qty);
    }
    out.push({
      description: it.description,
      qty: r2(it.qty),
      sales: r2(it.sales),
      price: r2(price),
      unitCost,
      costPct,
      recommended,
      extraPerYear,
      costFrom: m?.from ?? [],
      ...(unitMismatch ? { unitMismatch: true } : {}),
    });
  }
  return out.sort((a, b) => b.sales - a.sales);
}

/**
 * Cost of what was sold, by month, from item costs: for the pro shop (no
 * purchases yet) and to check the bar against its counts. Sales of items
 * without a cost are filled in at the matched items' cost %.
 */
export function itemCostByMonth(
  sales: ItemSale[],
  book: CostItem[],
  area: Area,
): Map<string, { cost: number; sales: number; matchedSales: number }> {
  const cache = new Map<string, number | null>();
  const months = new Map<string, { matchedCost: number; sales: number; matchedSales: number }>();
  for (const s of sales) {
    if (s.outlet !== area) continue;
    const key = s.description.trim().toUpperCase();
    if (!cache.has(key)) {
      const price = Number(s.qty) ? Number(s.net) / Number(s.qty) : null;
      const unit = matchCost(s.description, book, price)?.unitCost ?? null;
      // A cost in a different unit than the sale would throw the month off: leave it out.
      cache.set(key, unit != null && price != null && price > 0 && unit > price * MISMATCH ? null : unit);
    }
    const unit = cache.get(key) ?? null;
    const m = months.get(s.sale_date.slice(0, 7)) ?? { matchedCost: 0, sales: 0, matchedSales: 0 };
    m.sales += Number(s.net);
    if (unit != null) {
      m.matchedCost += unit * Number(s.qty);
      m.matchedSales += Number(s.net);
    }
    months.set(s.sale_date.slice(0, 7), m);
  }
  const out = new Map<string, { cost: number; sales: number; matchedSales: number }>();
  for (const [k, m] of months) {
    const scaled = m.matchedSales > 0 ? (m.matchedCost / m.matchedSales) * m.sales : 0;
    out.set(k, { cost: r2(scaled), sales: r2(m.sales), matchedSales: r2(m.matchedSales) });
  }
  return out;
}

// ── Months for one area ────────────────────────────────────────────────────

export type CostBasis = "inventory" | "purchases" | "item cost" | "none";

export interface AreaMonth {
  key: string;
  sales: number;
  /** Null when there's nothing to work it out from. */
  cost: number | null;
  pct: number | null;
  basis: CostBasis;
  lastYearSales: number | null;
  /** Bar months with no beer or liquor invoice (cost too low). */
  vendorGap?: boolean;
}

export interface PerformanceInput {
  purchases: CostPurchase[];
  sales: CostSale[];
  counts: MonthEndCount[];
  countLines: CountLine[];
  itemSales: ItemSale[];
}

export function areaMonths(area: Area, input: PerformanceInput, through: string): AreaMonth[] {
  const salesByMonth = new Map<string, number>();
  for (const s of input.sales) {
    if ((s.category ?? "food_beverage") !== AREA_SALES_CATEGORY[area]) continue;
    const k = s.entry_date.slice(0, 7);
    salesByMonth.set(k, (salesByMonth.get(k) ?? 0) + Number(s.amount));
  }

  // A count sheet that came in empty ($0) is a missing count, not an empty shelf.
  const counts = input.counts.filter((c) => Number(c.total) > 0);
  const cost = new Map<string, { cost: number | null; basis: CostBasis; vendorGap?: boolean }>();
  if (area === "pro_shop") {
    for (const [k, v] of itemCostByMonth(input.itemSales, costBook(input.countLines, area), area)) {
      if (!(v.matchedSales > 0) || !(v.sales > 0)) {
        cost.set(k, { cost: null, basis: "none" });
        continue;
      }
      // The items' cost rate, across all of the month's sales (some may be typed in by hand).
      const monthSales = salesByMonth.get(k) ?? v.sales;
      cost.set(k, { cost: r2((v.cost / v.sales) * monthSales), basis: "item cost" });
    }
  } else {
    const periods = costByPeriod(input.purchases, [], "month", area);
    const vendorIn = input.purchases.some(
      (p) => !/us foods/i.test(p.vendor ?? "US Foods") && Number(p.bar_cogs_amount ?? p.alcohol_amount ?? 0) > 0,
    );
    let withCounts = area === "restaurant" || vendorIn ? withInventory(periods, counts, area) : periods;
    if (area === "bar") withCounts = markVendorGaps(withCounts, input.purchases);
    for (const p of withCounts) {
      cost.set(p.key, {
        cost: p.cogs,
        basis: p.basis === "inventory" ? "inventory" : "purchases",
        vendorGap: area === "bar" ? p.vendorGap : undefined,
      });
    }
  }

  const keys = [...new Set([...salesByMonth.keys(), ...cost.keys()])].filter((k) => k <= through).sort();
  if (!keys.length) return [];
  return monthRange(keys[0], through).map((key) => {
    const sales = r2(salesByMonth.get(key) ?? 0);
    const c = cost.get(key);
    const lastYear = salesByMonth.get(sameMonthLastYear(key));
    return {
      key,
      sales,
      cost: c?.cost ?? null,
      pct: c?.cost != null ? pct(c.cost, sales) : null,
      basis: c?.basis ?? "none",
      lastYearSales: lastYear != null ? r2(lastYear) : null,
      ...(c?.vendorGap ? { vendorGap: true } : {}),
    };
  });
}

// ── Summaries ──────────────────────────────────────────────────────────────

export interface PeriodSummary {
  label: string;
  sales: number;
  cost: number;
  /** Sales in months that have a cost (the % is worked out on these). */
  costedSales: number;
  pct: number | null;
  months: number;
}

export function summarize(months: AreaMonth[], label: string): PeriodSummary {
  const costed = months.filter((m) => m.cost != null);
  const cost = r2(costed.reduce((s, m) => s + (m.cost ?? 0), 0));
  const costedSales = r2(costed.reduce((s, m) => s + m.sales, 0));
  return {
    label,
    sales: r2(months.reduce((s, m) => s + m.sales, 0)),
    cost,
    costedSales,
    pct: pct(cost, costedSales),
    months: months.length,
  };
}

/** The last 12 months, and this fiscal year to date against the same stretch last year. */
/**
 * This fiscal year so far against the same months a year earlier, counting
 * only months that have sales reports in both years (so a year with two
 * months of reports isn't set against twelve).
 */
export function yearOverYear(months: AreaMonth[], through: string): { now: number; before: number; months: number; change: number } | null {
  const fyStart = `${fiscalYear(through) - 1}-10`;
  const both = months.filter((m) => m.key >= fyStart && m.key <= through && m.lastYearSales != null && m.lastYearSales > 0);
  if (!both.length) return null;
  const now = r2(both.reduce((s, m) => s + m.sales, 0));
  const before = r2(both.reduce((s, m) => s + (m.lastYearSales ?? 0), 0));
  return { now, before, months: both.length, change: Math.round((now / before - 1) * 100) };
}

export function areaSummaries(months: AreaMonth[], through: string) {
  const last12 = months.filter((m) => m.key > addMonths(through, -12) && m.key <= through);
  const prior12 = months.filter((m) => m.key > addMonths(through, -24) && m.key <= addMonths(through, -12));
  const fy = fiscalYear(through);
  const fyStart = `${fy - 1}-10`;
  const ytd = months.filter((m) => m.key >= fyStart && m.key <= through);
  const lastYtd = months.filter((m) => m.key >= sameMonthLastYear(fyStart) && m.key <= sameMonthLastYear(through));
  return {
    last12: summarize(last12, "Last 12 months"),
    prior12: prior12.length ? summarize(prior12, "The 12 months before") : null,
    fytd: summarize(ytd, `${fiscalYearLabel(fy)} so far`),
    lastFytd: lastYtd.length ? summarize(lastYtd, `${fiscalYearLabel(fy - 1)} same months`) : null,
  };
}

// ── Outlook ────────────────────────────────────────────────────────────────

export interface OutlookMonth {
  key: string;
  expectedSales: number;
  /** Cost at the last 12 months' cost %. */
  expectedCost: number | null;
  /** Cost if the area hits its target. */
  targetCost: number;
}

export interface Outlook {
  months: OutlookMonth[];
  /** This year's recent sales ÷ the same months last year (1 = same as last year). */
  trend: number | null;
  trendMonths: string[];
  pctUsed: number | null;
}

/**
 * The next six months: last year's sales for each month, scaled by how the
 * last three months compare with the same months a year earlier. Seasons
 * (the course closed Nov–Mar, Buckley's open all year) come from last year's
 * pattern itself.
 */
export function outlook(months: AreaMonth[], area: Area, through: string, ahead = 6): Outlook {
  const byKey = new Map(months.map((m) => [m.key, m]));
  const recent = [0, 1, 2].map((i) => addMonths(through, -i)).filter((k) => {
    const now = byKey.get(k);
    const before = byKey.get(sameMonthLastYear(k));
    return now && before && before.sales > 0;
  });
  const nowSum = recent.reduce((s, k) => s + (byKey.get(k)?.sales ?? 0), 0);
  const thenSum = recent.reduce((s, k) => s + (byKey.get(sameMonthLastYear(k))?.sales ?? 0), 0);
  const trend = thenSum > 0 ? Math.min(2, Math.max(0.2, nowSum / thenSum)) : null;
  const last12 = summarize(months.filter((m) => m.key > addMonths(through, -12) && m.key <= through), "");
  const usePct = last12.pct;
  const target = AREA_TARGET[area] / 100;
  return {
    trend: trend != null ? Math.round(trend * 100) / 100 : null,
    trendMonths: recent,
    pctUsed: usePct,
    months: Array.from({ length: ahead }, (_, i) => {
      const key = addMonths(through, i + 1);
      const base = byKey.get(sameMonthLastYear(key))?.sales ?? 0;
      const expectedSales = r2(base * (trend ?? 1));
      return {
        key,
        expectedSales,
        expectedCost: usePct != null ? r2(expectedSales * (usePct / 100)) : null,
        targetCost: r2(expectedSales * target),
      };
    }),
  };
}

// ── Recommendations ────────────────────────────────────────────────────────

export type RecLevel = "act" | "watch" | "info";

export interface Recommendation {
  level: RecLevel;
  title: string;
  detail: string;
  /** Dollars a year at stake, for sorting. */
  dollars: number;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export interface RecommendationInput {
  area: Area;
  months: AreaMonth[];
  through: string;
  items: PricedItem[];
  /** Latest month-end count for the area, for months of stock. */
  latestCount: { month_end: string; total: number } | null;
  outlook: Outlook;
  /** Purchased products (bar) with no sale under a matching name. */
  unsoldPurchases?: { description: string; spend: number }[];
  /** What the month's sales should have cost, from item costs (bar check). */
  monthItemCost?: Map<string, number>;
}

export function recommendations(input: RecommendationInput): Recommendation[] {
  const { area, months, through, items } = input;
  const target = AREA_TARGET[area];
  const out: Recommendation[] = [];
  const last12 = summarize(months.filter((m) => m.key > addMonths(through, -12) && m.key <= through), "");

  // 1. Where cost stands against target.
  if (last12.pct != null && last12.costedSales > 0) {
    const over = r2(last12.cost - last12.costedSales * (target / 100));
    if (last12.pct > target * 2) {
      out.push({
        level: "act",
        title: `Cost is ${last12.pct}% of sales, target ${target}%`,
        detail: `That's ${money(over)} more cost than the target allows on ${money(last12.costedSales)} of sales over the last 12 months — too far off for prices alone. First make sure every sale is in (event and ticket sales, other registers, items rung under another area) and that product bought for events or other areas isn't counted here. Then work the item list below.`,
        dollars: over,
      });
    } else if (last12.pct > target) {
      const raise = Math.round((last12.pct / target - 1) * 100);
      out.push({
        level: "act",
        title: `Cost is ${last12.pct}% of sales, target ${target}%`,
        detail: `Over the last 12 months that's ${money(over)} more cost than the target allows on ${money(last12.costedSales)} of sales. Closing it takes prices about ${raise}% higher on average, ${money(over)} less spent, or a mix — the item list below shows where.`,
        dollars: over,
      });
    } else {
      out.push({
        level: "info",
        title: `On target: ${last12.pct}% against ${target}%`,
        detail: `Cost over the last 12 months is ${money(Math.abs(over))} under what the target allows. Keep ordering to sales and keep prices where they are.`,
        dollars: 0,
      });
    }
  }

  // 2. Prices below target.
  const low = items.filter((i) => i.recommended != null && i.extraPerYear > 0).sort((a, b) => b.extraPerYear - a.extraPerYear);
  if (low.length) {
    const total = r2(low.reduce((s, i) => s + i.extraPerYear, 0));
    const top = low
      .slice(0, 4)
      .map((i) => `${i.description} ${money2(i.price)} → ${money2(i.recommended!)}`)
      .join(", ");
    out.push({
      level: "act",
      title: `${low.length} item${low.length === 1 ? " is" : "s are"} priced under the ${target}% target`,
      detail: `Raising them to the recommended price brings in about ${money(total)} more a year at the same sales: ${top}${low.length > 4 ? ", and more in the list below." : "."}`,
      dollars: total,
    });
  }

  const mismatched = items.filter((i) => i.unitMismatch);
  if (mismatched.length) {
    out.push({
      level: "info",
      title: `${mismatched.length} item${mismatched.length === 1 ? " is" : "s are"} counted in a different unit than sold`,
      detail: `${mismatched
        .slice(0, 4)
        .map((i) => `${i.description} (counted at ${money2(i.unitCost!)}, sells for ${money2(i.price)})`)
        .join(", ")}. Count them the way they're sold (by the sleeve, the can) so their cost can be checked.`,
      dollars: 0,
    });
  }

  // 3. Bar: cost from the counts vs what the sales should have cost.
  if (area === "bar") {
    const checked = months.filter((m) => m.basis === "inventory" && !m.vendorGap && m.key > addMonths(through, -12));
    const theoretical = r2(
      checked.reduce((s, m) => s + itemsCostFor(m.key, input), 0),
    );
    const actual = r2(checked.reduce((s, m) => s + (m.cost ?? 0), 0));
    if (checked.length && theoretical > 0 && actual > theoretical * 1.1) {
      out.push({
        level: "act",
        title: `${money(actual - theoretical)} of bar product isn't showing up in sales`,
        detail: `In the ${checked.length} month${checked.length === 1 ? "" : "s"} with full counts and invoices, the counts say ${money(actual)} was used, but what was rung up should only have used ${money(theoretical)}. The gap is free or comped drinks, spills and breakage, drinks rung under the wrong button, or product walking out. Spot-check the cooler against sales weekly.`,
        dollars: actual - theoretical,
      });
    }
    const unsold = (input.unsoldPurchases ?? []).filter((u) => u.spend >= 100).sort((a, b) => b.spend - a.spend);
    if (unsold.length) {
      const total = r2(unsold.reduce((s, u) => s + u.spend, 0));
      out.push({
        level: "act",
        title: `${money(total)} bought that never shows up in bar sales by name`,
        detail: `${unsold
          .slice(0, 5)
          .map((u) => `${u.description} (${money(u.spend)})`)
          .join(", ")}. If they're rung under Domestic or Import Beer, give them their own buttons so they can be priced and tracked. If they aren't being rung at all, that's lost sales. Something just given its own buttons (like Cutwater by flavor) drops off this list as its sales reports come in.`,
        dollars: total,
      });
    }
  }

  // 4. Stock going into the slow months.
  if (input.latestCount && input.latestCount.total > 0) {
    const next = input.outlook.months.slice(0, 3);
    const monthlyUse = next.reduce((s, m) => s + (m.expectedCost ?? m.targetCost), 0) / Math.max(1, next.length);
    if (monthlyUse > 0) {
      const monthsOfStock = Math.round((input.latestCount.total / monthlyUse) * 10) / 10;
      if (monthsOfStock > 2) {
        const howLong = monthsOfStock > 12 ? "more than a year of stock" : `about ${monthsOfStock} months of stock`;
        out.push({
          level: "watch",
          title: `${money(input.latestCount.total)} on the shelf is ${howLong}`,
          detail: `At the sales expected over the next three months, that's more than you need. Order only what sells through, especially ahead of the course closing Nov–Mar, so money isn't tied up and product doesn't date out.`,
          dollars: input.latestCount.total,
        });
      }
    }
  }

  // 5. Sales trend.
  if (input.outlook.trend != null && input.outlook.trend < 0.85) {
    const drop = Math.round((1 - input.outlook.trend) * 100);
    out.push({
      level: "watch",
      title: `Sales are down about ${drop}% from last year`,
      detail: `The last ${input.outlook.trendMonths.length} months sold ${drop}% less than the same months a year ago. Fixed costs stay, so cost % climbs. Worth looking at hours, the menu, and promotions (events, specials, league nights).`,
      dollars: 0,
    });
  }

  // 6. Missing data that makes the numbers wrong.
  if (area === "bar") {
    const gaps = months.filter((m) => m.vendorGap && m.key > addMonths(through, -12) && m.sales > 0).map((m) => monthName(m.key));
    if (gaps.length) {
      out.push({
        level: "info",
        title: "Bar months missing beer or liquor invoices",
        detail: `${gaps.join(", ")}: without those invoices the bar cost for those months is too low. Add them on Purchases.`,
        dollars: 0,
      });
    }
  }
  if (area === "pro_shop") {
    const costed = months.filter((m) => m.basis === "item cost").length;
    out.push({
      level: "info",
      title: "Pro shop cost comes from item costs",
      detail: `Until pro shop purchases (PRs) are in, cost is what was sold times each item's cost on the count sheets (${costed} month${costed === 1 ? "" : "s"} so far). Items without a cost on the sheets are filled in at the same rate.`,
      dollars: 0,
    });
  }
  if (area === "restaurant") {
    const uncosted = items.filter((i) => i.unitCost == null && i.sales > 0);
    const share = r2(uncosted.reduce((s, i) => s + i.sales, 0));
    if (share > 0) {
      out.push({
        level: "info",
        title: "Cooked items need a recipe cost",
        detail: `${money(share)} of sales (burgers, hot dogs, fries…) are made to order, so no single cost is on the count sheets. Add plate costs to get a price for each.`,
        dollars: 0,
      });
    }
  }

  const order: Record<RecLevel, number> = { act: 0, watch: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level] || b.dollars - a.dollars);
}

export interface PurchaseLineLite {
  purchase_date: string;
  description: string;
  extended: number;
  outlet: string | null;
  category: string;
}

/** Words that name a kind of drink, not a brand. */
const NOT_A_BRAND = new Set(["LIGHT", "LAGER", "ALE", "IPA", "BEER", "SERVICE", "DELIVERY", "CHARGE"]);

/**
 * Bar purchases (by brand) that never show up in bar sales over the same
 * stretch: bought but rung under a generic button, or not rung at all.
 * Biggest first. A purchase counts as sold when its brand is in a sale's
 * name ("Cutwater Lemon Drop"), or its flavor is, for drinks rung up by
 * flavor: a flavor of two or more words all in one sale ("Lime Margarita"),
 * or a sale of two or more words all from the flavor ("Mai Tai").
 */
export function unsoldPurchases(lines: PurchaseLineLite[], itemSales: ItemSale[], since: string): { description: string; spend: number }[] {
  const sold = itemSales.filter((s) => s.outlet === "bar" && s.sale_date >= since).map((s) => new Set(productWords(s.description)));
  const soldWords = new Set(sold.flatMap((w) => [...w]));
  const byBrand = new Map<string, { spend: number; example: string }>();
  for (const l of lines) {
    if (l.purchase_date < since || l.category !== "alcohol" || (l.outlet && l.outlet !== "bar")) continue;
    const words = productWords(l.description);
    const brand = words.find((w) => !NOT_A_BRAND.has(w));
    if (!brand || soldWords.has(brand)) continue;
    const flavor = words.filter((w) => w !== brand && !NOT_A_BRAND.has(w));
    const flavorSet = new Set(flavor);
    // The whole flavor in one sale ("Lime Margarita"), or a sale that is all flavor ("Mai Tai" of "Tiki Mai Tai").
    const soldByFlavor = (s: Set<string>) => {
      const own = [...s].filter((w) => !NOT_A_BRAND.has(w));
      return flavor.every((w) => s.has(w)) || (own.length >= 2 && own.every((w) => flavorSet.has(w)));
    };
    if (flavor.length >= 2 && sold.some(soldByFlavor)) continue;
    const b = byBrand.get(brand) ?? { spend: 0, example: l.description };
    b.spend += Number(l.extended);
    byBrand.set(brand, b);
  }
  return [...byBrand.entries()]
    .filter(([, b]) => b.spend > 0)
    .map(([brand, b]) => ({
      description: `${brand.length <= 3 ? brand : brand[0] + brand.slice(1).toLowerCase()} (${b.example})`,
      spend: r2(b.spend),
    }))
    .sort((a, b) => b.spend - a.spend);
}

function itemsCostFor(month: string, input: RecommendationInput): number {
  return input.monthItemCost?.get(month) ?? 0;
}

function money2(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function monthName(key: string, withYear = true): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", withYear ? { month: "short", year: "numeric" } : { month: "short" });
}
