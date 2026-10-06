/**
 * Buckley's food cost: what the restaurant bought (food + alcohol, net of
 * credits) against what it sold (food & beverage revenue), by week and by
 * month, plus what the money went to and which prices moved.
 *
 * Pure: the food cost page loads the rows and hands them here.
 */

/** Above this, food cost is flagged. Typical for a casual grill: 28–35%. */
export const FOOD_COST_TARGET_PCT = 35;
/** A price move this big (either way) between orders is worth a look. */
export const PRICE_CHANGE_PCT = 3;

export interface CostPurchase {
  purchase_date: string;
  amount: number;
  food_amount?: number | null;
  alcohol_amount?: number | null;
  supplies_amount?: number | null;
}

export interface CostSale {
  entry_date: string;
  amount: number;
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
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Food + alcohol (cost of goods) and supplies for one purchase. Hand-typed rows count as food. */
export function purchaseSplit(p: CostPurchase): { cogs: number; supplies: number } {
  if (p.food_amount == null && p.alcohol_amount == null && p.supplies_amount == null) {
    return { cogs: Number(p.amount), supplies: 0 };
  }
  return {
    cogs: Number(p.food_amount ?? 0) + Number(p.alcohol_amount ?? 0),
    supplies: Number(p.supplies_amount ?? 0),
  };
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
}

function statusFor(pct: number | null): CostStatus {
  if (pct == null) return "no_sales";
  return pct > FOOD_COST_TARGET_PCT ? "high" : "good";
}

/** Group purchases and sales by month or week, newest first. */
export function costByPeriod(
  purchases: CostPurchase[],
  sales: CostSale[],
  by: "month" | "week",
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
    const v = at(keyOf(p.purchase_date));
    v.cogs += s.cogs;
    v.supplies += s.supplies;
  }
  for (const s of sales) at(keyOf(s.entry_date)).sales += Number(s.amount);
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => {
      const pct = v.sales > 0 ? Math.round((v.cogs / v.sales) * 1000) / 10 : null;
      return { key, cogs: r2(v.cogs), supplies: r2(v.supplies), sales: r2(v.sales), pct, status: statusFor(pct) };
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
