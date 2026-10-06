/**
 * Turn a RecTrac flash report into what gets saved: one revenue entry per
 * day (so the Revenue and money pages see the sales) and one row per item
 * per day (for best sellers, prices, and cost per item). Pure.
 */
import type { FlashReport } from "./rectrac-flash";

export type SalesOutlet = "restaurant" | "bar" | "pro_shop";

/** revenue_entries.category for each outlet's sales. */
export const SALES_CATEGORY: Record<SalesOutlet, string> = {
  restaurant: "food_beverage",
  bar: "bar",
  pro_shop: "pro_shop",
};

export const SALES_OUTLET_LABELS: Record<SalesOutlet, string> = {
  restaurant: "Buckley's restaurant",
  bar: "Buckley's bar",
  pro_shop: "Pro shop",
};

export interface FlashImportPlan {
  outlet: SalesOutlet;
  begin: string;
  end: string;
  total: number;
  days: { entry_date: string; amount: number; items: number }[];
  itemDays: {
    sale_date: string;
    inventory_code: string;
    description: string;
    qty: number;
    gross: number;
    discount: number;
    net: number;
  }[];
  /** Sales by month, for the preview. */
  months: { month: string; total: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function planFlashImport(report: FlashReport, outlet: SalesOutlet): FlashImportPlan {
  const days = new Map<string, { amount: number; items: number }>();
  const items = new Map<string, FlashImportPlan["itemDays"][number]>();
  for (const s of report.sales) {
    const d = days.get(s.date) ?? { amount: 0, items: 0 };
    d.amount += s.net;
    d.items += s.qty;
    days.set(s.date, d);
    const k = `${s.date}|${s.inventoryCode}|${s.description}`;
    const it = items.get(k) ?? {
      sale_date: s.date,
      inventory_code: s.inventoryCode,
      description: s.description,
      qty: 0,
      gross: 0,
      discount: 0,
      net: 0,
    };
    it.qty += s.qty;
    it.gross += s.fee;
    it.discount += s.discount;
    it.net += s.net;
    items.set(k, it);
  }
  const months = new Map<string, number>();
  for (const [d, v] of days) months.set(d.slice(0, 7), (months.get(d.slice(0, 7)) ?? 0) + v.amount);
  const dayList = [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([entry_date, v]) => ({ entry_date, amount: r2(v.amount), items: r2(v.items) }))
    // A day of refunds that net to nothing isn't a sale.
    .filter((d) => d.amount !== 0);
  const dates = [...days.keys()].sort();
  return {
    outlet,
    begin: report.begin ?? dates[0],
    end: report.end ?? dates[dates.length - 1],
    total: r2(dayList.reduce((s, d) => s + d.amount, 0)),
    days: dayList,
    itemDays: [...items.values()]
      .map((i) => ({ ...i, qty: r2(i.qty), gross: r2(i.gross), discount: r2(i.discount), net: r2(i.net) }))
      .filter((i) => i.qty !== 0 || i.net !== 0),
    months: [...months.entries()].sort().map(([month, total]) => ({ month, total: r2(total) })),
  };
}

/** Revenue entry rows for a plan (sales_report_id added at save time). */
export function revenueRows(plan: FlashImportPlan, reportId: string, userId: string | null) {
  return plan.days.map((d) => ({
    entry_date: d.entry_date,
    category: SALES_CATEGORY[plan.outlet],
    amount: d.amount,
    description: `RecTrac ${SALES_OUTLET_LABELS[plan.outlet]} sales (${d.items} items)`,
    source: "pos_upload",
    report_area: plan.outlet,
    sales_report_id: reportId,
    created_by: userId,
  }));
}
