/**
 * Pure helpers for the monthly cost-center budget ENTRY screen.
 *
 * The budget screen lets the GM enter an annual amount per cost center that is
 * split evenly across the 12 fiscal months (Oct→Sep), with optional per-month
 * tweaks for seasonal spending. These helpers convert between that fiscal-month
 * view and the `cost_center_budgets` rows we persist (one row per calendar month
 * 1-12, matching `20260608_pr_audit_monthly_budget.sql`).
 *
 * Kept free of React / DB so it's 100% unit-testable, and it stays in lock-step
 * with the rollup's reverse mapping (`(month - 10 + 12) % 12`).
 */

function r2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Split an annual amount evenly across 12 fiscal months (index 0 = Oct …
 * 11 = Sep), to the cent, so the 12 values sum EXACTLY back to the annual.
 * Any leftover cents are spread one-each across the earliest months, so there's
 * never rounding drift between the entered annual and the stored months.
 */
export function splitAnnualToMonths(annual: number): number[] {
  const cents = Math.round((Number(annual) || 0) * 100);
  if (cents <= 0) return new Array(12).fill(0);
  const base = Math.floor(cents / 12);
  const remainder = cents - base * 12; // 0..11 extra cents to distribute
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const extra = i < remainder ? 1 : 0;
    out.push((base + extra) / 100);
  }
  return out;
}

/**
 * Convert a fiscal month index (0 = Oct … 11 = Sep) to a calendar month
 * number (1-12). The inverse of the rollup's `(month - 10 + 12) % 12`.
 *   0 (Oct) → 10, 2 (Dec) → 12, 3 (Jan) → 1, 11 (Sep) → 9
 */
export function fiscalIndexToCalendarMonth(fiscalIdx: number): number {
  return ((fiscalIdx + 9) % 12) + 1;
}

export interface MonthlyBudgetRowsInput {
  fiscalYear: number;
  costCtr: string;
  /** 12 amounts in FISCAL order (index 0 = Oct … 11 = Sep). */
  monthly: number[];
  createdBy: string | null;
}

export interface MonthlyBudgetRow {
  fiscal_year: number;
  cost_ctr: string;
  /** Calendar month 1-12. */
  month: number;
  annual_amount: number;
  created_by: string | null;
}

/**
 * Build the `cost_center_budgets` rows for one cost center's monthly budget.
 * Emits one row per NON-ZERO fiscal month (the rollup fills missing months with
 * zero), so a seasonal budget stores only the months it actually uses.
 */
export function buildMonthlyBudgetRows(
  input: MonthlyBudgetRowsInput,
): MonthlyBudgetRow[] {
  const rows: MonthlyBudgetRow[] = [];
  input.monthly.forEach((amt, fiscalIdx) => {
    const amount = r2(amt);
    if (amount > 0) {
      rows.push({
        fiscal_year: input.fiscalYear,
        cost_ctr: input.costCtr,
        month: fiscalIndexToCalendarMonth(fiscalIdx),
        annual_amount: amount,
        created_by: input.createdBy,
      });
    }
  });
  return rows;
}

/**
 * Reconstruct a cost center's 12 fiscal-month budget (index 0 = Oct … 11 = Sep)
 * from its stored rows. Monthly rows fill their fiscal slot; if a cost center
 * has only a legacy whole-year row (month = null), it's spread evenly so the
 * entry grid still shows something sensible.
 */
export function monthlyFromRows(
  rows: ReadonlyArray<{ cost_ctr: string; month: number | null; annual_amount: number }>,
  costCtr: string,
): number[] {
  const monthly = new Array<number>(12).fill(0);
  let hasMonthly = false;
  let legacyAnnual = 0;
  for (const row of rows) {
    if (row.cost_ctr !== costCtr) continue;
    const amt = Number(row.annual_amount) || 0;
    if (row.month == null) {
      legacyAnnual += amt;
    } else {
      const fiscalIdx = (row.month - 10 + 12) % 12; // calendar → fiscal
      monthly[fiscalIdx] = r2(monthly[fiscalIdx] + amt);
      hasMonthly = true;
    }
  }
  if (!hasMonthly && legacyAnnual > 0) {
    return splitAnnualToMonths(legacyAnnual);
  }
  return monthly.map(r2);
}
