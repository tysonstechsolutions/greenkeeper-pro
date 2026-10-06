/**
 * Buckley's order guide: the items it usually buys from US Foods, worked out
 * from imported invoices — how often, how many per order, the last price —
 * and the purchase request lines for an order built from it.
 *
 * Pure. The order guide page loads invoice lines and hands them here.
 */
import { CC, SITE, recommendGlAccount } from "@/lib/accounting/recommend";
import type { PurchaseRequestItem } from "@/types/database";

export interface GuideSourceLine {
  purchase_id: string;
  purchase_date: string;
  kind: "invoice" | "credit";
  product_number: string;
  description: string;
  brand: string | null;
  pack_size: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  category: string;
}

export interface GuideItem {
  product_number: string;
  description: string;
  brand: string | null;
  pack_size: string | null;
  unit: string;
  category: string;
  /** Orders it was on. */
  timesOrdered: number;
  /** Typical amount per order (rounded, at least 1). */
  usualQty: number;
  lastPrice: number;
  lastOrdered: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Items bought on invoices, most often ordered first. Credits don't count as orders. */
export function buildOrderGuide(lines: GuideSourceLine[]): GuideItem[] {
  const by = new Map<string, GuideSourceLine[]>();
  for (const l of lines) {
    if (l.kind !== "invoice" || !(Number(l.qty) > 0)) continue;
    const list = by.get(l.product_number) ?? [];
    list.push(l);
    by.set(l.product_number, list);
  }
  const items: GuideItem[] = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
    const last = list[list.length - 1];
    const orders = new Map<string, number>();
    for (const l of list) orders.set(l.purchase_id, (orders.get(l.purchase_id) ?? 0) + Number(l.qty));
    const qtys = [...orders.values()].sort((a, b) => a - b);
    const median = qtys[Math.floor((qtys.length - 1) / 2)];
    items.push({
      product_number: last.product_number,
      description: last.description,
      brand: last.brand,
      pack_size: last.pack_size,
      unit: last.unit ?? "CS",
      category: last.category,
      timesOrdered: orders.size,
      usualQty: Math.max(1, Math.round(median)),
      lastPrice: Number(last.unit_price),
      lastOrdered: last.purchase_date,
    });
  }
  return items.sort(
    (a, b) =>
      b.timesOrdered - a.timesOrdered ||
      b.lastOrdered.localeCompare(a.lastOrdered) ||
      a.description.localeCompare(b.description),
  );
}

/** US Foods unit codes → the unit words the purchase request form uses. */
const UNIT_WORDS: Record<string, string> = { CS: "Case", EA: "Each", BX: "Box", PK: "Pack", LB: "Pound", GA: "Gallon", DZ: "Dozen" };

/** G/L for an order guide item: resale food or alcohol, else what the supply is. */
export function guideGlAccount(item: Pick<GuideItem, "category" | "description">): string {
  if (item.category === "alcohol") return "151120";
  if (item.category === "food") return "151110";
  const rec = recommendGlAccount(item.description, CC.buckleys);
  // Food words inside a supply's name ("BAG, FOOD STRG") don't make it resale.
  return rec && !rec.code.startsWith("1511") ? rec.code : "701000";
}

export interface OrderPick {
  item: GuideItem;
  qty: number;
}

/** Purchase request lines for the picked items, coded for Buckley's. */
export function orderToPrItems(picks: OrderPick[]): PurchaseRequestItem[] {
  return picks
    .filter((p) => p.qty > 0)
    .map((p, i) => ({
      item: i + 1,
      site: SITE.buckleys,
      cost_ctr: CC.buckleys,
      gl_acct: guideGlAccount(p.item),
      description: [p.item.description, p.item.brand, p.item.pack_size].filter(Boolean).join(" · "),
      part_number: p.item.product_number,
      qty: p.qty,
      unit: UNIT_WORDS[p.item.unit] ?? p.item.unit,
      unit_price: r2(p.item.lastPrice),
    }));
}

export function orderTotal(picks: OrderPick[]): number {
  return r2(picks.reduce((s, p) => s + Math.max(0, p.qty) * p.item.lastPrice, 0));
}

/** A plain-text order list (to read off when ordering on the US Foods site). */
export function orderText(picks: OrderPick[]): string {
  const rows = picks
    .filter((p) => p.qty > 0)
    .map((p) => `${p.qty} ${p.item.unit}  #${p.item.product_number}  ${p.item.description}${p.item.pack_size ? ` (${p.item.pack_size})` : ""}`);
  return [`Buckley's US Foods order — ${rows.length} items, about $${orderTotal(picks).toFixed(2)}`, ...rows].join("\n");
}

// ── Handing an order to the purchase request form ─────────────────────────

export const PR_PREFILL_KEY = "gk.prPrefill";

export interface PrPrefill {
  vendorName: string;
  items: PurchaseRequestItem[];
  justification?: string;
}

export function savePrPrefill(prefill: PrPrefill): void {
  try {
    sessionStorage.setItem(PR_PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    /* private mode: the form just opens blank */
  }
}

/** Read and clear the hand-off. Null when there isn't one (or it's malformed). */
export function takePrPrefill(): PrPrefill | null {
  try {
    const raw = sessionStorage.getItem(PR_PREFILL_KEY);
    sessionStorage.removeItem(PR_PREFILL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PrPrefill;
    if (!v || typeof v.vendorName !== "string" || !Array.isArray(v.items)) return null;
    return v;
  } catch {
    return null;
  }
}
