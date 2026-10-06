/**
 * Where each US Foods line goes: the Buckley's restaurant or bar (separate
 * COGS targets), and the cost center and G/L it's charged to.
 *
 *   Food      → 20091 / 151110 (resale food), restaurant unless marked bar
 *   Alcohol   → 20091 / 151120 (resale alcohol), always bar
 *   Supplies  → 20091 / G/L by type (701005 cleaning, else 701000 supplies),
 *               never part of either COGS
 *
 * Pure. Bar items are remembered per product number (restaurant_product_outlets).
 */
import { CC, codeLabel, recommendGlAccount } from "@/lib/accounting/recommend";
import type { PurchaseCategory } from "./usfoods";

export type Outlet = "restaurant" | "bar";

export const OUTLET_LABELS: Record<Outlet, string> = {
  restaurant: "Restaurant",
  bar: "Bar",
};

/** COGS targets (% of that outlet's sales). Above it is flagged. */
export const OUTLET_COGS_TARGET: Record<Outlet, number> = {
  restaurant: 35,
  bar: 25,
};

export const BUCKLEYS_COST_CENTER = CC.buckleys;
export const GL_RESALE_FOOD = "151110";
export const GL_RESALE_ALCOHOL = "151120";
export const GL_SUPPLIES = "701000";

/** Mixers that only the bar uses, marked Bar until someone says otherwise. */
const BAR_MIXERS = /^BAR MIX\b|\bTONIC\b|\bSODA CLUB\b|\bCLUB SODA\b|\bGRENADINE\b|\bBITTERS\b|\bBLDY MARY\b|\bBLOODY MARY\b|\bMRITA\b|\bMARGARITA\b|\bSWEET (& )?SOUR\b|\bSOUR MIX\b|\bCHERRY, MARASCHINO\b|\bOLIVE, COCKTAIL\b/;

/**
 * Bar or restaurant for a line: alcohol is always bar; otherwise what was
 * remembered for the product; otherwise bar mixers go to the bar; else restaurant.
 */
export function outletFor(
  line: { productNumber?: string; product_number?: string; category: PurchaseCategory | string; description?: string },
  remembered: ReadonlyMap<string, Outlet>,
): Outlet {
  if (line.category === "alcohol") return "bar";
  const pn = line.productNumber ?? line.product_number ?? "";
  const known = remembered.get(pn);
  if (known) return known;
  return line.category === "food" && BAR_MIXERS.test((line.description ?? "").toUpperCase()) ? "bar" : "restaurant";
}

/** G/L for a line from what it is. Supplies never land on a resale account. */
export function glFor(line: { category: PurchaseCategory | string; description: string }): string {
  if (line.category === "alcohol") return GL_RESALE_ALCOHOL;
  if (line.category === "food") return GL_RESALE_FOOD;
  const rec = recommendGlAccount(line.description, BUCKLEYS_COST_CENTER);
  return rec && !rec.code.startsWith("1511") ? rec.code : GL_SUPPLIES;
}

export interface CodedLine {
  outlet: Outlet;
  cost_ctr: string;
  gl_acct: string;
}

export function codeLine(
  line: { productNumber?: string; product_number?: string; category: PurchaseCategory | string; description: string },
  remembered: ReadonlyMap<string, Outlet>,
): CodedLine {
  return { outlet: outletFor(line, remembered), cost_ctr: BUCKLEYS_COST_CENTER, gl_acct: glFor(line) };
}

/** Does this line count toward an outlet's COGS (food and alcohol do, supplies don't)? */
export function isCogs(category: string): boolean {
  return category === "food" || category === "alcohol";
}

export interface CodingRow {
  cost_ctr: string;
  gl_acct: string;
  /** "20091 · 151110 — RESALE INVENTORY FOOD" */
  label: string;
  amount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Totals by cost center + G/L, for writing up the invoice (biggest first).
 * Anything the lines don't explain (fuel surcharge, rounding) goes on
 * food, the way categoryTotals does.
 */
export function codingSummary(
  lines: { cost_ctr: string | null; gl_acct: string | null; extended: number }[],
  total?: number,
): CodingRow[] {
  const map = new Map<string, { cost_ctr: string; gl_acct: string; amount: number }>();
  for (const l of lines) {
    const cc = l.cost_ctr || BUCKLEYS_COST_CENTER;
    const gl = l.gl_acct || GL_RESALE_FOOD;
    const k = `${cc}|${gl}`;
    const row = map.get(k) ?? { cost_ctr: cc, gl_acct: gl, amount: 0 };
    row.amount += Number(l.extended);
    map.set(k, row);
  }
  if (total != null) {
    const sum = [...map.values()].reduce((s, r) => s + r.amount, 0);
    const left = r2(total - sum);
    if (left !== 0) {
      const k = `${BUCKLEYS_COST_CENTER}|${GL_RESALE_FOOD}`;
      const row = map.get(k) ?? { cost_ctr: BUCKLEYS_COST_CENTER, gl_acct: GL_RESALE_FOOD, amount: 0 };
      row.amount += left;
      map.set(k, row);
    }
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      amount: r2(r.amount),
      label: `${r.cost_ctr} · ${codeLabel("gl_account", r.gl_acct)}`,
    }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** Bar food + alcohol on an invoice (its bar COGS). */
export function barCogs(lines: { outlet: string; category: string; extended: number }[]): number {
  return r2(lines.filter((l) => l.outlet === "bar" && isCogs(l.category)).reduce((s, l) => s + Number(l.extended), 0));
}
