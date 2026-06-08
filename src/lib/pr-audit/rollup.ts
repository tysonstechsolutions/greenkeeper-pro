/**
 * Per-cost-center, per-month spend rollup for the PR Audit budget dashboard.
 *
 * Takes the saved audits + the annual cost-center budgets and produces, for a
 * given federal fiscal year, one row per cost center: its annual budget, what's
 * been spent (APPROVED PRs only), what's still pending review, what's left, and
 * a 12-month (Oct→Sep) breakdown.
 *
 * "Spent" deliberately counts ONLY approved PRs; pending PRs are surfaced
 * separately so nothing is double-counted but the reviewer still sees what's
 * coming. `sent_back` PRs are excluded entirely. Amounts are summed per LINE
 * ITEM by that line's cost center, so a PR that spans cost centers is split
 * correctly across accounts (and its fee/tax lines count where they sit).
 */
import type { PrAudit, CostCenterBudget } from "@/types/database";
import { PR_COST_CENTERS } from "@/lib/pr-accounting-codes";
import {
  federalFiscalYearFromIso,
  fiscalMonthIndex,
  parseLocalDate,
  FISCAL_MONTH_LABELS,
} from "@/lib/pr-audit/fiscal-year";

export interface MonthlyAmount {
  /** 0 = Oct … 11 = Sep. */
  index: number;
  label: string;
  approved: number;
  pending: number;
}

export interface CostCenterRollup {
  cost_ctr: string;
  label: string;
  budget: number;
  spent: number; // approved only
  pending: number; // awaiting review
  remaining: number; // budget − spent
  percentUsed: number; // 0–100+ (rounded), 0 when no budget set
  byMonth: MonthlyAmount[];
  /** True for the 5 known golf-course cost centers; false for stragglers. */
  known: boolean;
}

export interface RollupTotals {
  budget: number;
  spent: number;
  pending: number;
  remaining: number;
  percentUsed: number;
}

const KNOWN_COST_CENTERS = PR_COST_CENTERS.map((c) => ({
  value: c.value,
  label: c.label,
}));
const KNOWN_VALUES = new Set(KNOWN_COST_CENTERS.map((c) => c.value));
const KNOWN_LABELS = new Map(KNOWN_COST_CENTERS.map((c) => [c.value, c.label]));

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
    approved: 0,
    pending: 0,
  }));
}

/**
 * Build one rollup row per cost center for the given federal fiscal year.
 * Always includes the 5 known cost centers (so every account shows even with
 * zero activity), plus any other cost center that actually appears in the data.
 */
export function buildCostCenterRollup(
  audits: PrAudit[],
  budgets: CostCenterBudget[],
  fiscalYear: number,
): CostCenterRollup[] {
  // Seed accumulators for every known cost center.
  const acc = new Map<
    string,
    { spent: number; pending: number; byMonth: MonthlyAmount[]; known: boolean; label: string }
  >();
  for (const c of KNOWN_COST_CENTERS) {
    acc.set(c.value, {
      spent: 0,
      pending: 0,
      byMonth: emptyMonths(),
      known: true,
      label: c.label,
    });
  }

  for (const audit of audits) {
    if (audit.review_status === "sent_back") continue;
    if (!audit.pr_date) continue;
    if (federalFiscalYearFromIso(audit.pr_date) !== fiscalYear) continue;

    const monthIdx = fiscalMonthIndex(parseLocalDate(audit.pr_date));
    const isApproved = audit.review_status === "approved";

    for (const item of audit.items ?? []) {
      const code = (item.cost_ctr ?? "").trim() || "__unassigned__";
      let entry = acc.get(code);
      if (!entry) {
        entry = {
          spent: 0,
          pending: 0,
          byMonth: emptyMonths(),
          known: KNOWN_VALUES.has(code),
          label:
            KNOWN_LABELS.get(code) ??
            (code === "__unassigned__" ? "Unassigned / invalid" : code),
        };
        acc.set(code, entry);
      }
      const amount = r2(num(item.qty) * num(item.unit_price));
      if (isApproved) {
        entry.spent = r2(entry.spent + amount);
        entry.byMonth[monthIdx].approved = r2(
          entry.byMonth[monthIdx].approved + amount,
        );
      } else {
        // pending
        entry.pending = r2(entry.pending + amount);
        entry.byMonth[monthIdx].pending = r2(
          entry.byMonth[monthIdx].pending + amount,
        );
      }
    }
  }

  const budgetByCode = new Map<string, number>();
  for (const b of budgets) {
    if (b.fiscal_year === fiscalYear) {
      budgetByCode.set(b.cost_ctr, num(b.annual_amount));
    }
  }

  const rows: CostCenterRollup[] = [];
  for (const [code, entry] of acc.entries()) {
    const budget = budgetByCode.get(code) ?? 0;
    const spent = r2(entry.spent);
    const pending = r2(entry.pending);
    const remaining = r2(budget - spent);
    const percentUsed = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    rows.push({
      cost_ctr: code === "__unassigned__" ? "" : code,
      label: entry.label,
      budget,
      spent,
      pending,
      remaining,
      percentUsed,
      byMonth: entry.byMonth,
      known: entry.known,
    });
  }

  // Known cost centers first (in canonical order), then any stragglers by spend.
  const order = new Map(KNOWN_COST_CENTERS.map((c, i) => [c.value, i]));
  rows.sort((a, b) => {
    const ai = order.has(a.cost_ctr) ? (order.get(a.cost_ctr) as number) : 999;
    const bi = order.has(b.cost_ctr) ? (order.get(b.cost_ctr) as number) : 999;
    if (ai !== bi) return ai - bi;
    return b.spent - a.spent;
  });
  return rows;
}

/** Sum a set of rollup rows into the dashboard's top-line totals. */
export function rollupTotals(rows: CostCenterRollup[]): RollupTotals {
  const budget = r2(rows.reduce((s, r) => s + r.budget, 0));
  const spent = r2(rows.reduce((s, r) => s + r.spent, 0));
  const pending = r2(rows.reduce((s, r) => s + r.pending, 0));
  const remaining = r2(budget - spent);
  const percentUsed = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  return { budget, spent, pending, remaining, percentUsed };
}
