/**
 * Per-cost-center, per-month spend rollup for the PR Audit budget dashboard.
 *
 * Takes the saved audits + the annual cost-center budgets and produces, for a
 * given federal fiscal year, one row per cost center: its annual budget, what's
 * committed (spent), what's still in the pipeline, what's left, and a 12-month
 * (Oct→Sep) breakdown.
 *
 * "Spent" = money committed = the order has been placed or beyond
 * (ordered / received / receipt_signed). "Pipeline" = pending + sent_up (his
 * boss hasn't approved/ordered it yet). `sent_back` is excluded entirely.
 * Amounts are summed per LINE ITEM by that line's cost center, so a PR that
 * spans cost centers is split correctly across accounts.
 *
 * Cost centers come from the DB (passed in); when omitted it falls back to the
 * built-in golf-course list so the dashboard works before the code tables exist.
 */
import type { PrAudit, CostCenterBudget } from "@/types/database";
import { PR_COST_CENTERS } from "@/lib/pr-accounting-codes";
import {
  federalFiscalYearFromIso,
  fiscalMonthIndex,
  parseLocalDate,
  FISCAL_MONTH_LABELS,
} from "@/lib/pr-audit/fiscal-year";

/** A cost center to seed the rollup with (from the DB, or the built-in list). */
export interface RollupCostCenter {
  code: string;
  label: string;
  categoryId: string | null;
  category: string | null;
}

export interface MonthlyAmount {
  index: number; // 0 = Oct … 11 = Sep
  label: string;
  spent: number;
  pipeline: number;
}

export interface CostCenterRollup {
  cost_ctr: string;
  label: string;
  category: string | null;
  categoryId: string | null;
  budget: number; // annual (sum of the 12 monthly budgets, or legacy annual)
  /** Budget per fiscal month (index 0 = Oct … 11 = Sep). */
  monthlyBudget: number[];
  spent: number; // committed: ordered + received + receipt_signed
  pending: number; // in pipeline: pending + sent_up
  remaining: number; // budget − spent
  percentUsed: number; // 0–100+ (rounded), 0 when no budget set
  byMonth: MonthlyAmount[];
  /** True for cost centers on the seed list; false for stragglers in the data. */
  known: boolean;
}

/** A single fiscal month's totals across a set of rollup rows. */
export interface MonthTotals {
  budget: number;
  spent: number;
  pipeline: number;
  remaining: number;
  percentUsed: number;
}

export interface RollupTotals {
  budget: number;
  spent: number;
  pending: number;
  remaining: number;
  percentUsed: number;
}

/** Statuses whose dollars count as committed/spent. */
const SPENT_STATUSES = new Set<PrAudit["review_status"]>([
  "ordered",
  "received",
  "receipt_signed",
]);

/** Default seed list (built-in golf-course cost centers) — all "Golf Course". */
const DEFAULT_COST_CENTERS: RollupCostCenter[] = PR_COST_CENTERS.map((c) => ({
  code: c.value,
  label: c.label,
  categoryId: null,
  category: "Golf Course",
}));

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyMonths(): MonthlyAmount[] {
  return FISCAL_MONTH_LABELS.map((label, index) => ({
    index,
    label,
    spent: 0,
    pipeline: 0,
  }));
}

/**
 * Build one rollup row per cost center for the given federal fiscal year.
 * Always includes the seed cost centers (so every account shows even with zero
 * activity), plus any other cost center that actually appears in the data.
 */
export function buildCostCenterRollup(
  audits: PrAudit[],
  budgets: CostCenterBudget[],
  fiscalYear: number,
  costCenters: RollupCostCenter[] = DEFAULT_COST_CENTERS,
): CostCenterRollup[] {
  const seedOrder = new Map(costCenters.map((c, i) => [c.code, i]));
  const seedByCode = new Map(costCenters.map((c) => [c.code, c]));

  interface Acc {
    spent: number;
    pending: number;
    byMonth: MonthlyAmount[];
    known: boolean;
    label: string;
    category: string | null;
    categoryId: string | null;
  }
  const acc = new Map<string, Acc>();
  for (const c of costCenters) {
    acc.set(c.code, {
      spent: 0,
      pending: 0,
      byMonth: emptyMonths(),
      known: true,
      label: c.label,
      category: c.category,
      categoryId: c.categoryId,
    });
  }

  for (const audit of audits) {
    if (audit.review_status === "sent_back") continue;
    if (!audit.pr_date) continue;
    if (federalFiscalYearFromIso(audit.pr_date) !== fiscalYear) continue;

    const monthIdx = fiscalMonthIndex(parseLocalDate(audit.pr_date));
    const isSpent = SPENT_STATUSES.has(audit.review_status);

    for (const item of audit.items ?? []) {
      const code = (item.cost_ctr ?? "").trim() || "__unassigned__";
      let entry = acc.get(code);
      if (!entry) {
        const seed = seedByCode.get(code);
        entry = {
          spent: 0,
          pending: 0,
          byMonth: emptyMonths(),
          known: !!seed,
          label:
            seed?.label ??
            (code === "__unassigned__" ? "Unassigned / invalid" : code),
          category: seed?.category ?? null,
          categoryId: seed?.categoryId ?? null,
        };
        acc.set(code, entry);
      }
      const amount = r2(num(item.qty) * num(item.unit_price));
      if (isSpent) {
        entry.spent = r2(entry.spent + amount);
        entry.byMonth[monthIdx].spent = r2(entry.byMonth[monthIdx].spent + amount);
      } else {
        entry.pending = r2(entry.pending + amount);
        entry.byMonth[monthIdx].pipeline = r2(
          entry.byMonth[monthIdx].pipeline + amount,
        );
      }
    }
  }

  // Build each cost center's monthly budget (fiscal order Oct→Sep) + annual.
  const fyBudgets = budgets.filter((b) => b.fiscal_year === fiscalYear);
  const budgetFor = (code: string): { monthly: number[]; annual: number } => {
    const monthly = new Array<number>(12).fill(0);
    let hasMonthly = false;
    let legacyAnnual = 0;
    for (const b of fyBudgets) {
      if (b.cost_ctr !== code) continue;
      if (b.month == null) {
        legacyAnnual = r2(legacyAnnual + num(b.annual_amount));
      } else {
        const fi = (b.month - 10 + 12) % 12; // calendar month → fiscal index
        monthly[fi] = r2(monthly[fi] + num(b.annual_amount));
        hasMonthly = true;
      }
    }
    if (!hasMonthly) {
      // Legacy whole-year amount → spread evenly so the monthly view still works.
      const per = legacyAnnual > 0 ? r2(legacyAnnual / 12) : 0;
      return { monthly: monthly.map(() => per), annual: legacyAnnual };
    }
    return { monthly, annual: r2(monthly.reduce((s, x) => s + x, 0)) };
  };

  const rows: CostCenterRollup[] = [];
  for (const [code, entry] of acc.entries()) {
    const { monthly, annual } = budgetFor(code);
    const spent = r2(entry.spent);
    const remaining = r2(annual - spent);
    const percentUsed = annual > 0 ? Math.round((spent / annual) * 100) : 0;
    rows.push({
      cost_ctr: code === "__unassigned__" ? "" : code,
      label: entry.label,
      category: entry.category,
      categoryId: entry.categoryId,
      budget: annual,
      monthlyBudget: monthly,
      spent,
      pending: r2(entry.pending),
      remaining,
      percentUsed,
      byMonth: entry.byMonth,
      known: entry.known,
    });
  }

  rows.sort((a, b) => {
    const ai = seedOrder.has(a.cost_ctr)
      ? (seedOrder.get(a.cost_ctr) as number)
      : 9999;
    const bi = seedOrder.has(b.cost_ctr)
      ? (seedOrder.get(b.cost_ctr) as number)
      : 9999;
    if (ai !== bi) return ai - bi;
    return b.spent - a.spent;
  });
  return rows;
}

/** Sum a set of rollup rows into the dashboard's annual top-line totals. */
export function rollupTotals(rows: CostCenterRollup[]): RollupTotals {
  const budget = r2(rows.reduce((s, r) => s + r.budget, 0));
  const spent = r2(rows.reduce((s, r) => s + r.spent, 0));
  const pending = r2(rows.reduce((s, r) => s + r.pending, 0));
  const remaining = r2(budget - spent);
  const percentUsed = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  return { budget, spent, pending, remaining, percentUsed };
}

/** A single cost center's budget/spend for one fiscal month (index 0=Oct…11=Sep). */
export function monthFor(row: CostCenterRollup, fiscalIdx: number): MonthTotals {
  const budget = r2(row.monthlyBudget[fiscalIdx] ?? 0);
  const m = row.byMonth[fiscalIdx];
  const spent = r2(m?.spent ?? 0);
  const pipeline = r2(m?.pipeline ?? 0);
  return {
    budget,
    spent,
    pipeline,
    remaining: r2(budget - spent),
    percentUsed: budget > 0 ? Math.round((spent / budget) * 100) : 0,
  };
}

/** Sum rollup rows into one fiscal month's top-line totals. */
export function rollupMonthTotals(
  rows: CostCenterRollup[],
  fiscalIdx: number,
): MonthTotals {
  const budget = r2(rows.reduce((s, r) => s + (r.monthlyBudget[fiscalIdx] ?? 0), 0));
  const spent = r2(rows.reduce((s, r) => s + (r.byMonth[fiscalIdx]?.spent ?? 0), 0));
  const pipeline = r2(rows.reduce((s, r) => s + (r.byMonth[fiscalIdx]?.pipeline ?? 0), 0));
  return {
    budget,
    spent,
    pipeline,
    remaining: r2(budget - spent),
    percentUsed: budget > 0 ? Math.round((spent / budget) * 100) : 0,
  };
}
