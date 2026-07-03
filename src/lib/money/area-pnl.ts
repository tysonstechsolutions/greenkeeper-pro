// Per-area P&L math — pure and deterministic (the AI never touches this).
//
// Inputs are the SERVER-SIDE monthly rollup views (revenue_monthly_rollup,
// pr_spend_monthly_rollup — see 20260702_money_rollups.sql), not raw rows:
// the project's PostgREST max_rows caps any raw fetch at 1000 rows, which
// would silently truncate a fiscal year of daily POS uploads. The rollups
// are dozens of rows per year and can never truncate. The spend view also
// honors PR reconciliation (actual_amount scales each line pro-rata).

import {
  areaForCostCenter,
  areaForRevenueCategory,
  MONEY_AREAS,
  type MoneyArea,
} from "./areas";

/** One row of revenue_monthly_rollup. `month` is 'YYYY-MM-01'. */
export interface RevenueRollupRow {
  month: string;
  category: string;
  total: number;
}

/** One row of pr_spend_monthly_rollup. `month` is 'YYYY-MM-01'. */
export interface SpendRollupRow {
  month: string;
  cost_ctr: string | null;
  total: number;
}

export type PnlBucket = MoneyArea | "unassigned";

export interface AreaPnlRow {
  area: PnlBucket;
  revenue: number;
  spend: number;
  net: number;
}

export interface AreaPnl {
  /** Current calendar month. */
  month: AreaPnlRow[];
  /** Federal fiscal year to date (Oct 1 – Sep 30). */
  fiscalYear: AreaPnlRow[];
  monthLabel: string;
  fiscalYearLabel: string;
}

/** Federal FY start (Oct 1) for the FY containing `d`. */
export function fiscalYearStart(d: Date): Date {
  const y = d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 9, 1);
}

/** First-of-month key matching the rollup views' `month` column. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyBuckets(): Map<PnlBucket, { revenue: number; spend: number }> {
  const m = new Map<PnlBucket, { revenue: number; spend: number }>();
  for (const a of MONEY_AREAS) m.set(a, { revenue: 0, spend: 0 });
  m.set("unassigned", { revenue: 0, spend: 0 });
  return m;
}

function accumulate(
  buckets: Map<PnlBucket, { revenue: number; spend: number }>,
  revenue: RevenueRollupRow[],
  spend: SpendRollupRow[],
  fromMonth: string,
  toMonth: string,
): void {
  for (const r of revenue) {
    if (r.month < fromMonth || r.month > toMonth) continue;
    buckets.get(areaForRevenueCategory(r.category))!.revenue += Number(r.total) || 0;
  }
  for (const s of spend) {
    if (s.month < fromMonth || s.month > toMonth) continue;
    buckets.get(areaForCostCenter(s.cost_ctr))!.spend += Number(s.total) || 0;
  }
}

function toRows(
  buckets: Map<PnlBucket, { revenue: number; spend: number }>,
): AreaPnlRow[] {
  const rows: AreaPnlRow[] = [];
  for (const [area, b] of buckets) {
    const revenue = round2(b.revenue);
    const spend = round2(b.spend);
    // The unassigned bucket only appears when something actually landed in
    // it — silence is fine when every code mapped.
    if (area === "unassigned" && revenue === 0 && spend === 0) continue;
    rows.push({ area, revenue, spend, net: round2(revenue - spend) });
  }
  return rows;
}

/** Compute the per-area P&L for the month and fiscal year containing `today`. */
export function computeAreaPnl(
  revenue: RevenueRollupRow[],
  spend: SpendRollupRow[],
  today: Date,
): AreaPnl {
  const thisMonth = monthKey(today);
  const fyMonth = monthKey(fiscalYearStart(today));

  const monthBuckets = emptyBuckets();
  accumulate(monthBuckets, revenue, spend, thisMonth, thisMonth);
  const fyBuckets = emptyBuckets();
  accumulate(fyBuckets, revenue, spend, fyMonth, thisMonth);

  const fyStartYear = fiscalYearStart(today).getFullYear();
  return {
    month: toRows(monthBuckets),
    fiscalYear: toRows(fyBuckets),
    monthLabel: today.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    fiscalYearLabel: `FY${String(fyStartYear + 1).slice(2)} to date`,
  };
}
