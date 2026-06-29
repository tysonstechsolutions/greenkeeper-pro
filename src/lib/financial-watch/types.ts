/**
 * Financial Watch — type contract.
 *
 * The engine (engine.ts) is a set of PURE functions: raw rows + a `now` date
 * in, a structured `FinancialWatch` result out. No fetching, no AI, no random
 * or wall-clock reads (now is injected). This same result shape is what the
 * Phase-2 AI analyst will read, so it doubles as the AI's data contract.
 *
 * Three independent lenses, deliberately NOT merged — they use different
 * fiscal years and dimensions and would be wrong to add together:
 *   - operating  : budget_items + expenses   (CALENDAR year, 12 categories)
 *   - procurement: pr_audits + cost-center budgets (FEDERAL FY Oct–Sep, 5 CCs)
 *   - revenue    : revenue_entries            (CALENDAR year, 8 sources)
 */
import type { BudgetCategory, ExpenseStatus } from "@/types/database";
import type { CostCenterRollup } from "@/lib/pr-audit/rollup";

// ── Flags ────────────────────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";
export type FlagLens = "operating" | "procurement" | "revenue" | "overall";

/** One thing the watchdog wants the GM to know. */
export interface Flag {
  /** Stable id, e.g. "operating:over-budget:fuel" — lets the UI dedupe/key. */
  id: string;
  severity: Severity;
  lens: FlagLens;
  /** Short headline, e.g. "Fuel over budget". */
  title: string;
  /** One or two sentences WITH the real numbers. */
  detail: string;
  /** Suggested fix / next step. Optional. */
  action?: string;
  /** Optional headline figure (e.g. dollars over) for sorting/emphasis. */
  metric?: number;
}

export type LineStatus = "ok" | "watch" | "over";

// ── Inputs (minimal row shapes the engine needs) ─────────────────────────────

export interface BudgetItemInput {
  id: string;
  fiscal_year: number;
  category: BudgetCategory;
  budgeted_amount: number;
  /** 1–12 for a monthly allocation; null for an annual one. */
  month: number | null;
}

export interface ExpenseInput {
  amount: number;
  expense_date: string; // YYYY-MM-DD
  status: ExpenseStatus;
  /** Links to a BudgetItem.id; null = unbucketed (counts to total, not a category). */
  budget_item_id: string | null;
  vendor: string | null;
  description: string;
}

export interface RevenueEntryInput {
  entry_date: string; // YYYY-MM-DD
  category: string;
  amount: number;
  rounds_count: number | null;
}

export interface FinancialWatchInput {
  /** Injected for determinism/testability. */
  now: Date;
  /** Calendar year the operating budget + revenue lenses analyze. */
  calendarYear: number;
  /** Federal fiscal year the procurement lens analyzes (Oct–Sep). */
  fiscalYear: number;
  budgetItems: BudgetItemInput[];
  expenses: ExpenseInput[];
  /** Current + prior calendar year, so YoY can be computed. */
  revenueEntries: RevenueEntryInput[];
  /** Pre-computed by buildCostCenterRollup (trusted committed-spend math). */
  procurement: CostCenterRollup[];
}

// ── Per-lens outputs ─────────────────────────────────────────────────────────

export interface CategoryBudgetAnalysis {
  category: BudgetCategory;
  budgeted: number;
  spent: number;
  remaining: number;
  /** spent/budgeted as a percent, NOT clamped (so >100 is visible). 0 if no budget. */
  percentUsed: number;
  /** consumedFraction / elapsedFraction; null when no budget or year not started. */
  paceRatio: number | null;
  /** Linear projection of full-year spend at the current rate; null if not projectable. */
  projectedSpend: number | null;
  /** projectedSpend - budgeted; null if not projectable. */
  projectedOverUnder: number | null;
  status: LineStatus;
}

export interface OperatingAnalysis {
  calendarYear: number;
  /** Fraction of the calendar year elapsed as of `now`, clamped [0,1]. */
  elapsedFraction: number;
  totalBudgeted: number;
  totalSpent: number; // approved+paid expenses, INCLUDING unbucketed
  remaining: number;
  percentUsed: number;
  paceRatio: number | null;
  projectedSpend: number | null;
  projectedOverUnder: number | null;
  /** Approved+paid spend with no budget_item_id (data-quality signal). */
  unbucketedSpent: number;
  pendingCount: number;
  pendingTotal: number;
  byCategory: CategoryBudgetAnalysis[];
  /** Approved+paid spend per calendar month (index 0 = Jan … 11 = Dec). */
  monthlySpend: number[];
  flags: Flag[];
}

export interface RevenueCategoryBreakdown {
  category: string;
  amount: number;
  /** Share of YTD revenue, 0–1. */
  share: number;
}

export interface RevenueAnalysis {
  calendarYear: number;
  elapsedFraction: number;
  ytdTotal: number;
  mtdTotal: number;
  /** Same-period (Jan 1 → same day) revenue last year; null if no prior data. */
  priorYtdTotal: number | null;
  /** (ytd - priorYtd)/priorYtd; null if no prior baseline. */
  yoyChange: number | null;
  byCategory: RevenueCategoryBreakdown[];
  /** Revenue per calendar month this year (index 0 = Jan … 11 = Dec). */
  monthly: number[];
  ytdRounds: number;
  revenuePerRound: number | null;
  /** Whether a revenue target exists (no target system yet → always false). */
  hasTarget: boolean;
  flags: Flag[];
}

export interface CostCenterAnalysis {
  costCtr: string;
  label: string;
  budget: number;
  spent: number; // committed (ordered+)
  pending: number; // pipeline
  remaining: number;
  percentUsed: number;
  paceRatio: number | null;
  projectedSpend: number | null;
  projectedOverUnder: number | null;
  status: LineStatus;
}

export interface ProcurementAnalysis {
  fiscalYear: number;
  /** Fraction of the federal FY (Oct 1 → Sep 30) elapsed as of `now`. */
  elapsedFraction: number;
  totalBudget: number;
  totalSpent: number;
  totalPending: number;
  remaining: number;
  percentUsed: number;
  paceRatio: number | null;
  projectedSpend: number | null;
  projectedOverUnder: number | null;
  byCostCenter: CostCenterAnalysis[];
  /** Committed spend on line items with no/unknown cost center. */
  unassignedSpent: number;
  flags: Flag[];
}

export type OverallStatus = "ok" | "watch" | "alert";

export interface FinancialHeadline {
  /** revenue YTD − operating spend YTD; null if no revenue data. */
  netPositionYtd: number | null;
  criticalCount: number;
  warningCount: number;
  topFlags: Flag[];
  overallStatus: OverallStatus;
}

export interface FinancialWatch {
  generatedAt: string; // ISO
  operating: OperatingAnalysis;
  revenue: RevenueAnalysis;
  procurement: ProcurementAnalysis;
  /** All lens flags, merged and sorted (critical → warning → info). */
  flags: Flag[];
  headline: FinancialHeadline;
}
