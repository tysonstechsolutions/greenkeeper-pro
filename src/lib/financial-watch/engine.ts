/**
 * Financial Watch — deterministic analysis engine.
 *
 * Pure functions only: raw rows + an injected `now` in, structured metrics +
 * ranked flags out. No fetching, no AI, no wall-clock/random reads. This is the
 * trustworthy backbone — the AI layer (Phase 2) narrates THIS output and never
 * invents its own figures.
 */
import type { BudgetCategory, ExpenseStatus } from "@/types/database";
import { parseLocalDate, fiscalYearShort } from "@/lib/pr-audit/fiscal-year";
import type { CostCenterRollup } from "@/lib/pr-audit/rollup";
import { formatLocalDate } from "@/lib/utils/date";
import { inSeason } from "@/lib/utils/season";
import { categoryLabel } from "./labels";
import type {
  BudgetItemInput,
  ExpenseInput,
  RevenueEntryInput,
  CategoryBudgetAnalysis,
  OperatingAnalysis,
  RevenueAnalysis,
  RevenueCategoryBreakdown,
  ProcurementAnalysis,
  CostCenterAnalysis,
  Flag,
  Severity,
  LineStatus,
  FinancialWatchInput,
  FinancialWatch,
  FinancialHeadline,
  OverallStatus,
} from "./types";

// ── Tunable thresholds ───────────────────────────────────────────────────────

/** A line is "pacing high" once it's spending this many × faster than time. */
const PACE_WATCH = 1.25;
/** Don't judge pace until at least this fraction of the period has elapsed. */
const MIN_ELAPSED_FOR_PACE = 0.15;
/** Unbucketed spend at/above this share of total spend is worth flagging. */
const UNBUCKETED_PCT = 0.05;
/** Projected spend above budget × this triggers an overrun flag. */
const PROJECT_OVERRUN = 1.05;
/** …and above budget × this makes it critical rather than a warning. */
const PROJECT_OVERRUN_CRITICAL = 1.15;
/** Revenue down at least this fraction YoY is worth a flag. */
const REVENUE_DOWN = 0.1;
/** …and down this much makes it critical. */
const REVENUE_DOWN_CRITICAL = 0.2;
/** In-season gap (days since the last revenue entry) that looks stale. */
const REVENUE_STALE_DAYS = 14;

const SPENT_EXPENSE_STATUSES: ReadonlySet<ExpenseStatus> = new Set([
  "approved",
  "paid",
]);

// ── Formatting / rounding helpers ────────────────────────────────────────────

/** Round to cents to keep float drift out of money math. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// ── Math helpers (the pace / projection / trend primitives) ──────────────────

/** Fraction of a calendar year elapsed as of `now`, clamped to [0, 1]. */
export function calendarYearElapsedFraction(year: number, now: Date): number {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  return clampFraction(now.getTime(), start, end);
}

/**
 * Fraction of a federal fiscal year (Oct 1 of fy-1 → Oct 1 of fy) elapsed as of
 * `now`, clamped to [0, 1].
 */
export function federalFyElapsedFraction(fy: number, now: Date): number {
  const start = new Date(fy - 1, 9, 1).getTime(); // Oct = month index 9
  const end = new Date(fy, 9, 1).getTime();
  return clampFraction(now.getTime(), start, end);
}

function clampFraction(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

/**
 * How fast money is going out relative to time: consumedFraction / elapsed
 * Fraction. >1 means spending outruns the calendar. null when the period
 * hasn't started (can't divide by zero elapsed time).
 */
export function paceRatio(
  consumedFraction: number,
  elapsedFraction: number,
): number | null {
  if (elapsedFraction <= 0) return null;
  return consumedFraction / elapsedFraction;
}

/**
 * Linear extrapolation of full-period spend from spend-so-far and elapsed time.
 * null when no time has elapsed.
 */
export function projectLinear(
  spent: number,
  elapsedFraction: number,
): number | null {
  if (elapsedFraction <= 0) return null;
  return spent / elapsedFraction;
}

/** Percent change from `previous` to `current` as a fraction; null if no baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

// ── Lens A: operating budget (budget_items + expenses, calendar year) ─────────

interface DuplicateGroup {
  key: string;
  count: number;
  amount: number;
  vendor: string;
  date: string;
}

/**
 * Group approved/paid expenses by (vendor, amount, date); a group of 2+ with a
 * real vendor and non-zero amount is a likely double-entry.
 */
function findDuplicateExpenses(expenses: ExpenseInput[]): DuplicateGroup[] {
  const groups = new Map<string, ExpenseInput[]>();
  for (const e of expenses) {
    if (!SPENT_EXPENSE_STATUSES.has(e.status)) continue;
    const vendor = (e.vendor ?? "").trim();
    if (!vendor || e.amount === 0) continue;
    const key = `${vendor}|${e.amount}|${e.expense_date}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const dups: DuplicateGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    dups.push({
      key,
      count: list.length,
      amount: list[0].amount,
      vendor: (list[0].vendor ?? "").trim(),
      date: list[0].expense_date,
    });
  }
  return dups;
}

/**
 * Analyze the operating budget (calendar-year `budget_items` vs `expenses`).
 * "Spent" counts only approved + paid expenses (matching the rest of the app).
 */
export function analyzeOperatingBudget(
  budgetItems: BudgetItemInput[],
  expenses: ExpenseInput[],
  calendarYear: number,
  now: Date,
): OperatingAnalysis {
  const elapsedFraction = calendarYearElapsedFraction(calendarYear, now);

  // Budget item id → category, and budget summed per category.
  const itemCategory = new Map<string, BudgetCategory>();
  const budgetByCat = new Map<BudgetCategory, number>();
  let totalBudgeted = 0;
  for (const it of budgetItems) {
    itemCategory.set(it.id, it.category);
    budgetByCat.set(
      it.category,
      round2((budgetByCat.get(it.category) ?? 0) + it.budgeted_amount),
    );
    totalBudgeted = round2(totalBudgeted + it.budgeted_amount);
  }

  // Spend (approved+paid) per category + unbucketed + monthly; pending tally.
  const spentByCat = new Map<BudgetCategory, number>();
  const monthlySpend = new Array<number>(12).fill(0);
  let unbucketedSpent = 0;
  let totalSpent = 0;
  let pendingCount = 0;
  let pendingTotal = 0;

  for (const e of expenses) {
    if (e.status === "pending") {
      pendingCount += 1;
      pendingTotal = round2(pendingTotal + e.amount);
    }
    if (!SPENT_EXPENSE_STATUSES.has(e.status)) continue;
    totalSpent = round2(totalSpent + e.amount);
    const m = parseLocalDate(e.expense_date).getMonth();
    if (m >= 0 && m <= 11) monthlySpend[m] = round2(monthlySpend[m] + e.amount);
    const cat = e.budget_item_id ? itemCategory.get(e.budget_item_id) : undefined;
    if (cat) {
      spentByCat.set(cat, round2((spentByCat.get(cat) ?? 0) + e.amount));
    } else {
      unbucketedSpent = round2(unbucketedSpent + e.amount);
    }
  }

  // Per-category analysis (union of budgeted + spent categories).
  const categories = new Set<BudgetCategory>([
    ...budgetByCat.keys(),
    ...spentByCat.keys(),
  ]);
  const byCategory: CategoryBudgetAnalysis[] = [];
  for (const category of categories) {
    const budgeted = budgetByCat.get(category) ?? 0;
    const spent = spentByCat.get(category) ?? 0;
    byCategory.push(buildLine(category, budgeted, spent, elapsedFraction));
  }
  byCategory.sort((a, b) => b.budgeted - a.budgeted || b.spent - a.spent);

  // Top-line totals.
  const remaining = round2(totalBudgeted - totalSpent);
  const percentUsed =
    totalBudgeted > 0
      ? Math.round((totalSpent / totalBudgeted) * 100)
      : totalSpent > 0
        ? 100
        : 0;
  const overallPace =
    totalBudgeted > 0
      ? paceRatio(totalSpent / totalBudgeted, elapsedFraction)
      : null;
  const projectedSpend = projectLinear(totalSpent, elapsedFraction);
  const projectedOverUnder =
    projectedSpend != null ? round2(projectedSpend - totalBudgeted) : null;

  const flags = operatingFlags({
    byCategory,
    expenses,
    calendarYear,
    elapsedFraction,
    totalBudgeted,
    totalSpent,
    unbucketedSpent,
    projectedSpend,
  });

  return {
    calendarYear,
    elapsedFraction,
    totalBudgeted,
    totalSpent,
    remaining,
    percentUsed,
    paceRatio: overallPace,
    projectedSpend,
    projectedOverUnder,
    unbucketedSpent,
    pendingCount,
    pendingTotal,
    byCategory,
    monthlySpend,
    flags,
  };
}

function buildLine(
  category: BudgetCategory,
  budgeted: number,
  spent: number,
  elapsedFraction: number,
): CategoryBudgetAnalysis {
  const remaining = round2(budgeted - spent);
  const percentUsed =
    budgeted > 0
      ? Math.round((spent / budgeted) * 100)
      : spent > 0
        ? 100
        : 0;
  const pace =
    budgeted > 0 ? paceRatio(spent / budgeted, elapsedFraction) : null;
  const projectedSpend = projectLinear(spent, elapsedFraction);
  const projectedOverUnder =
    projectedSpend != null ? round2(projectedSpend - budgeted) : null;
  let status: LineStatus = "ok";
  if (budgeted > 0 && spent > budgeted) status = "over";
  else if (
    budgeted > 0 &&
    pace != null &&
    elapsedFraction >= MIN_ELAPSED_FOR_PACE &&
    pace >= PACE_WATCH
  )
    status = "watch";
  return {
    category,
    budgeted,
    spent,
    remaining,
    percentUsed,
    paceRatio: pace,
    projectedSpend,
    projectedOverUnder,
    status,
  };
}

function operatingFlags(ctx: {
  byCategory: CategoryBudgetAnalysis[];
  expenses: ExpenseInput[];
  calendarYear: number;
  elapsedFraction: number;
  totalBudgeted: number;
  totalSpent: number;
  unbucketedSpent: number;
  projectedSpend: number | null;
}): Flag[] {
  const flags: Flag[] = [];
  const { elapsedFraction, calendarYear } = ctx;

  for (const c of ctx.byCategory) {
    const name = categoryLabel(c.category);
    if (c.budgeted > 0 && c.spent > c.budgeted) {
      const over = round2(c.spent - c.budgeted);
      flags.push({
        id: `operating:over-budget:${c.category}`,
        severity: "critical",
        lens: "operating",
        title: `${name} over budget`,
        detail: `${name} has spent ${money(c.spent)} of its ${money(c.budgeted)} budget — ${money(over)} over.`,
        action: `Move funds into ${name} or pause ${name} spending.`,
        metric: over,
      });
    } else if (
      c.budgeted > 0 &&
      c.paceRatio != null &&
      elapsedFraction >= MIN_ELAPSED_FOR_PACE &&
      c.paceRatio >= PACE_WATCH
    ) {
      const proj =
        c.projectedSpend != null
          ? ` On this trend it reaches ${money(c.projectedSpend)} against a ${money(c.budgeted)} budget.`
          : "";
      flags.push({
        id: `operating:over-pace:${c.category}`,
        severity: "warning",
        lens: "operating",
        title: `${name} pacing high`,
        detail: `${name} is ${c.percentUsed}% spent at ${pct(elapsedFraction)} through the year (${c.paceRatio.toFixed(1)}× pace).${proj}`,
        action: `Slow ${name} spend or rebalance the budget before it runs out.`,
        metric: c.paceRatio,
      });
    }
    if (c.budgeted <= 0 && c.spent > 0) {
      flags.push({
        id: `operating:no-budget:${c.category}`,
        severity: "warning",
        lens: "operating",
        title: `${name} has spend but no budget`,
        detail: `${money(c.spent)} spent on ${name} with no ${calendarYear} budget set, so it shows no pace or remaining.`,
        action: `Set a ${name} budget for ${calendarYear} or recategorize the expenses.`,
        metric: c.spent,
      });
    }
  }

  if (
    ctx.unbucketedSpent > 0 &&
    ctx.totalSpent > 0 &&
    ctx.unbucketedSpent / ctx.totalSpent >= UNBUCKETED_PCT
  ) {
    flags.push({
      id: "operating:unbucketed",
      severity: "warning",
      lens: "operating",
      title: "Uncategorized spending",
      detail: `${money(ctx.unbucketedSpent)} of spend (${pct(ctx.unbucketedSpent / ctx.totalSpent)}) isn't assigned to any budget category, so category totals understate reality.`,
      action: "Assign these expenses to a budget category.",
      metric: ctx.unbucketedSpent,
    });
  }

  for (const dup of findDuplicateExpenses(ctx.expenses)) {
    flags.push({
      id: `operating:duplicate:${dup.key}`,
      severity: "warning",
      lens: "operating",
      title: "Possible duplicate expense",
      detail: `${dup.count}× ${money(dup.amount)} to ${dup.vendor} on ${dup.date} — check for a double entry.`,
      action: "Confirm these aren't the same charge entered twice.",
      metric: dup.amount,
    });
  }

  const negatives = ctx.expenses.filter((e) => e.amount < 0);
  if (negatives.length > 0) {
    const sum = round2(negatives.reduce((s, e) => s + e.amount, 0));
    flags.push({
      id: "operating:negative-amount",
      severity: "warning",
      lens: "operating",
      title: "Negative expense amount",
      detail: `${negatives.length} expense${negatives.length > 1 ? "s have" : " has"} a negative amount (${money(sum)} total) — likely a refund logged as an expense or a data-entry slip.`,
      action: "Verify these are intentional credits, not mistakes.",
    });
  }

  if (
    ctx.totalBudgeted > 0 &&
    ctx.projectedSpend != null &&
    ctx.projectedSpend > ctx.totalBudgeted * PROJECT_OVERRUN
  ) {
    const over = round2(ctx.projectedSpend - ctx.totalBudgeted);
    const severity: Severity =
      ctx.projectedSpend > ctx.totalBudgeted * PROJECT_OVERRUN_CRITICAL
        ? "critical"
        : "warning";
    flags.push({
      id: "operating:projected-overrun",
      severity,
      lens: "operating",
      title: "On track to exceed the operating budget",
      detail: `At the current pace, ${calendarYear} spend projects to ${money(ctx.projectedSpend)} against a ${money(ctx.totalBudgeted)} budget — ${money(over)} over.`,
      action: "Find the categories driving the overrun and trim before year-end.",
      metric: over,
    });
  }

  return flags;
}

// ── Lens C: revenue (revenue_entries, calendar year) ─────────────────────────

const dollars = money; // alias for readability in revenue text

/**
 * Analyze revenue (calendar-year `revenue_entries`). `entries` should include
 * the current AND prior calendar year so year-over-year can be computed. All
 * figures are "as of `now`" — entries dated after today are excluded.
 */
export function analyzeRevenue(
  entries: RevenueEntryInput[],
  calendarYear: number,
  now: Date,
): RevenueAnalysis {
  const elapsedFraction = calendarYearElapsedFraction(calendarYear, now);
  const todayStr = formatLocalDate(now);
  const curYear = String(calendarYear);
  const priorYear = String(calendarYear - 1);
  // Same month/day one year ago, for an apples-to-apples prior-year period.
  // On Feb 29, the prior (non-leap) year has no Feb 29 — `new Date` would roll
  // it to Mar 1, pulling an extra day into the baseline. Detect that and back
  // up to Feb 28.
  const priorDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (priorDate.getMonth() !== now.getMonth()) {
    priorDate.setDate(priorDate.getDate() - 1);
  }
  const priorCutoff = formatLocalDate(priorDate);
  const curMonthPrefix = `${calendarYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const ytdEntries = entries.filter(
    (e) => e.entry_date.slice(0, 4) === curYear && e.entry_date <= todayStr,
  );
  const priorEntries = entries.filter(
    (e) => e.entry_date.slice(0, 4) === priorYear && e.entry_date <= priorCutoff,
  );

  let ytdTotal = 0;
  let mtdTotal = 0;
  let ytdRounds = 0;
  const monthly = new Array<number>(12).fill(0);
  const catMap = new Map<string, number>();
  for (const e of ytdEntries) {
    ytdTotal = round2(ytdTotal + e.amount);
    ytdRounds += e.rounds_count ?? 0;
    const mi = Number(e.entry_date.slice(5, 7)) - 1;
    if (mi >= 0 && mi <= 11) monthly[mi] = round2(monthly[mi] + e.amount);
    if (e.entry_date.slice(0, 7) === curMonthPrefix)
      mtdTotal = round2(mtdTotal + e.amount);
    catMap.set(e.category, round2((catMap.get(e.category) ?? 0) + e.amount));
  }

  const priorYtdTotal =
    priorEntries.length > 0
      ? round2(priorEntries.reduce((s, e) => s + e.amount, 0))
      : null;
  const yoyChange =
    priorYtdTotal != null ? pctChange(ytdTotal, priorYtdTotal) : null;

  const byCategory: RevenueCategoryBreakdown[] = [...catMap.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      // Only meaningful when there's positive revenue to distribute; an
      // all-refund (negative) total would otherwise yield misleading shares.
      share: ytdTotal > 0 ? amount / ytdTotal : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const revenuePerRound = ytdRounds > 0 ? round2(ytdTotal / ytdRounds) : null;
  const hasTarget = false; // no revenue-target system yet

  const flags = revenueFlags({
    ytdTotal,
    priorYtdTotal,
    yoyChange,
    ytdEntries,
    allEntries: entries,
    hasTarget,
    now,
    todayStr,
  });

  return {
    calendarYear,
    elapsedFraction,
    ytdTotal,
    mtdTotal,
    priorYtdTotal,
    yoyChange,
    byCategory,
    monthly,
    ytdRounds,
    revenuePerRound,
    hasTarget,
    flags,
  };
}

function revenueFlags(ctx: {
  ytdTotal: number;
  priorYtdTotal: number | null;
  yoyChange: number | null;
  ytdEntries: RevenueEntryInput[];
  allEntries: RevenueEntryInput[];
  hasTarget: boolean;
  now: Date;
  todayStr: string;
}): Flag[] {
  const flags: Flag[] = [];

  if (ctx.yoyChange != null && ctx.yoyChange <= -REVENUE_DOWN) {
    const severity: Severity =
      ctx.yoyChange <= -REVENUE_DOWN_CRITICAL ? "critical" : "warning";
    flags.push({
      id: "revenue:yoy-down",
      severity,
      lens: "revenue",
      title: "Revenue down vs. last year",
      detail: `Revenue is ${pct(Math.abs(ctx.yoyChange))} lower than this point last year (${dollars(ctx.ytdTotal)} vs ${dollars(ctx.priorYtdTotal ?? 0)}).`,
      action: "Compare rounds, pricing, and F&B against last year to find the gap.",
      metric: ctx.yoyChange,
    });
  }

  const negatives = ctx.allEntries.filter((e) => e.amount < 0);
  if (negatives.length > 0) {
    flags.push({
      id: "revenue:negative-entry",
      severity: "info",
      lens: "revenue",
      title: "Negative revenue entry",
      detail: `${negatives.length} revenue entr${negatives.length > 1 ? "ies have" : "y has"} a negative amount — likely a refund or a correction logged in the wrong place.`,
      action: "Confirm these are intentional, not data-entry errors.",
    });
  }

  // Staleness: in season but no fresh revenue logged.
  if (ctx.ytdEntries.length > 0 && inSeason(ctx.todayStr)) {
    const latest = ctx.ytdEntries.reduce(
      (max, e) => (e.entry_date > max ? e.entry_date : max),
      "",
    );
    const daysSince = Math.floor(
      (ctx.now.getTime() - parseLocalDate(latest).getTime()) / 86_400_000,
    );
    if (daysSince > REVENUE_STALE_DAYS) {
      flags.push({
        id: "revenue:stale",
        severity: "info",
        lens: "revenue",
        title: "No recent revenue logged",
        detail: `The last revenue entry was ${daysSince} days ago (${latest}) — mid-season, daily revenue should be coming in.`,
        action: "Log recent greens fees, cart, and F&B revenue so trends stay accurate.",
      });
    }
  }

  if (!ctx.hasTarget && ctx.ytdTotal > 0) {
    flags.push({
      id: "revenue:no-target",
      severity: "info",
      lens: "revenue",
      title: "No revenue target set",
      detail: `Revenue is being tracked (${dollars(ctx.ytdTotal)} YTD) but there's no target to measure pace against.`,
      action: "Set monthly revenue targets so the watchdog can track to goal.",
    });
  }

  return flags;
}

// ── Lens B: procurement (cost-center rollup, federal fiscal year) ────────────

/**
 * Analyze procurement spend. Takes the already-computed CostCenterRollup[]
 * (from buildCostCenterRollup — the trusted committed-spend math) and layers
 * federal-FY pace, projection, and flags on top. Rows with an empty/unknown
 * cost center are summed into `unassignedSpent` rather than shown as a line.
 */
export function analyzeProcurement(
  rollup: CostCenterRollup[],
  fiscalYear: number,
  now: Date,
): ProcurementAnalysis {
  const elapsedFraction = federalFyElapsedFraction(fiscalYear, now);

  let totalBudget = 0;
  let totalSpent = 0;
  let totalPending = 0;
  let unassignedSpent = 0;
  const byCostCenter: CostCenterAnalysis[] = [];

  for (const r of rollup) {
    totalBudget = round2(totalBudget + r.budget);
    totalSpent = round2(totalSpent + r.spent);
    totalPending = round2(totalPending + r.pending);

    const code = (r.cost_ctr ?? "").trim();
    if (code === "" || code === "__unassigned__") {
      unassignedSpent = round2(unassignedSpent + r.spent);
      continue;
    }

    const pace =
      r.budget > 0 ? paceRatio(r.spent / r.budget, elapsedFraction) : null;
    const projectedSpend = projectLinear(r.spent, elapsedFraction);
    const projectedOverUnder =
      projectedSpend != null ? round2(projectedSpend - r.budget) : null;
    let status: LineStatus = "ok";
    if (r.budget > 0 && r.spent > r.budget) status = "over";
    else if (
      r.budget > 0 &&
      pace != null &&
      elapsedFraction >= MIN_ELAPSED_FOR_PACE &&
      pace >= PACE_WATCH
    )
      status = "watch";

    byCostCenter.push({
      costCtr: code,
      label: r.label,
      budget: r.budget,
      spent: r.spent,
      pending: r.pending,
      remaining: r.remaining,
      percentUsed: r.percentUsed,
      paceRatio: pace,
      projectedSpend,
      projectedOverUnder,
      status,
    });
  }

  const remaining = round2(totalBudget - totalSpent);
  const percentUsed =
    totalBudget > 0
      ? Math.round((totalSpent / totalBudget) * 100)
      : totalSpent > 0
        ? 100
        : 0;
  const overallPace =
    totalBudget > 0 ? paceRatio(totalSpent / totalBudget, elapsedFraction) : null;
  const projectedSpend = projectLinear(totalSpent, elapsedFraction);
  const projectedOverUnder =
    projectedSpend != null ? round2(projectedSpend - totalBudget) : null;

  byCostCenter.sort((a, b) => b.budget - a.budget || b.spent - a.spent);

  const flags = procurementFlags({
    byCostCenter,
    unassignedSpent,
    fiscalYear,
    elapsedFraction,
    totalSpent,
  });

  return {
    fiscalYear,
    elapsedFraction,
    totalBudget,
    totalSpent,
    totalPending,
    remaining,
    percentUsed,
    paceRatio: overallPace,
    projectedSpend,
    projectedOverUnder,
    byCostCenter,
    unassignedSpent,
    flags,
  };
}

function procurementFlags(ctx: {
  byCostCenter: CostCenterAnalysis[];
  unassignedSpent: number;
  fiscalYear: number;
  elapsedFraction: number;
  totalSpent: number;
}): Flag[] {
  const flags: Flag[] = [];
  const { elapsedFraction } = ctx;
  const fyLabel = fiscalYearShort(ctx.fiscalYear);
  let anyBudget = false;

  for (const c of ctx.byCostCenter) {
    if (c.budget > 0) anyBudget = true;
    const name = c.label || c.costCtr;
    if (c.budget > 0 && c.spent > c.budget) {
      const over = round2(c.spent - c.budget);
      flags.push({
        id: `procurement:over-budget:${c.costCtr}`,
        severity: "critical",
        lens: "procurement",
        title: `${name} over budget`,
        detail: `${name} has committed ${money(c.spent)} of its ${money(c.budget)} ${fyLabel} budget — ${money(over)} over.`,
        action: `Hold new POs on ${name} or move budget into it.`,
        metric: over,
      });
    } else if (
      c.budget > 0 &&
      c.paceRatio != null &&
      elapsedFraction >= MIN_ELAPSED_FOR_PACE &&
      c.paceRatio >= PACE_WATCH
    ) {
      flags.push({
        id: `procurement:over-pace:${c.costCtr}`,
        severity: "warning",
        lens: "procurement",
        title: `${name} pacing high`,
        detail: `${name} is ${c.percentUsed}% committed at ${pct(elapsedFraction)} through ${fyLabel} (${c.paceRatio.toFixed(1)}× pace).`,
        action: `Slow ${name} purchasing or rebalance its budget.`,
        metric: c.paceRatio,
      });
    }
    if (c.budget > 0 && c.remaining > 0 && c.pending > c.remaining) {
      flags.push({
        id: `procurement:pipeline-exceeds:${c.costCtr}`,
        severity: "warning",
        lens: "procurement",
        title: `${name} pipeline exceeds remaining`,
        detail: `${money(c.pending)} of pending POs on ${name} is more than its ${money(c.remaining)} remaining budget.`,
        action: `Approving every pending ${name} PO would blow the budget — prioritize.`,
        metric: c.pending,
      });
    }
  }

  if (ctx.unassignedSpent > 0) {
    flags.push({
      id: "procurement:unassigned",
      severity: "warning",
      lens: "procurement",
      title: "PR spend with no cost center",
      detail: `${money(ctx.unassignedSpent)} of committed PR spend isn't assigned to a cost center, so it's missing from every cost-center total.`,
      action: "Assign a cost center to those purchase-request line items.",
      metric: ctx.unassignedSpent,
    });
  }

  if (!anyBudget && ctx.totalSpent > 0) {
    flags.push({
      id: "procurement:no-budgets",
      severity: "info",
      lens: "procurement",
      title: "No cost-center budgets set",
      detail: `${money(ctx.totalSpent)} committed in ${fyLabel} but no cost-center budgets are set, so pace can't be tracked.`,
      action: `Set ${fyLabel} cost-center budgets in PR Audit → Budget.`,
    });
  }

  return flags;
}

// ── Orchestrator: assemble the three lenses into one watchdog result ─────────

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Sort flags critical → warning → info; within a severity, bigger metric first. */
function rankFlags(flags: Flag[]): Flag[] {
  return [...flags].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return Math.abs(b.metric ?? 0) - Math.abs(a.metric ?? 0);
  });
}

/**
 * Run all three lenses and assemble the headline. This is the single entry the
 * UI (and the Phase-2 AI analyst) call. Pure: everything derives from `input`
 * and `input.now`.
 */
export function buildFinancialWatch(input: FinancialWatchInput): FinancialWatch {
  const operating = analyzeOperatingBudget(
    input.budgetItems,
    input.expenses,
    input.calendarYear,
    input.now,
  );
  const revenue = analyzeRevenue(
    input.revenueEntries,
    input.calendarYear,
    input.now,
  );
  const procurement = analyzeProcurement(
    input.procurement,
    input.fiscalYear,
    input.now,
  );

  const flags = rankFlags([
    ...operating.flags,
    ...procurement.flags,
    ...revenue.flags,
  ]);

  const criticalCount = flags.filter((f) => f.severity === "critical").length;
  const warningCount = flags.filter((f) => f.severity === "warning").length;
  const overallStatus: OverallStatus =
    criticalCount > 0 ? "alert" : warningCount > 0 ? "watch" : "ok";

  // Net position compares CURRENT-year revenue to current-year spend, so it's
  // null unless there's current-year revenue (prior-year-only data doesn't count).
  const hasCurrentYearRevenue = input.revenueEntries.some(
    (e) => e.entry_date.slice(0, 4) === String(input.calendarYear),
  );
  const netPositionYtd = hasCurrentYearRevenue
    ? round2(revenue.ytdTotal - operating.totalSpent)
    : null;

  const headline: FinancialHeadline = {
    netPositionYtd,
    criticalCount,
    warningCount,
    topFlags: flags.slice(0, 3),
    overallStatus,
  };

  return {
    generatedAt: input.now.toISOString(),
    operating,
    revenue,
    procurement,
    flags,
    headline,
  };
}
