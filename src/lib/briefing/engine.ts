import {
  evaluatePmSafe,
  pmIsComputable,
} from "@/lib/equipment/pm-status";
import {
  getAttentionPriority,
  summarizeEquipmentReadiness,
} from "@/lib/equipment/readiness";
import {
  isTriageAttention,
  triageLabel,
  triageOrder,
} from "@/lib/equipment/triage";
import { evaluateObligations } from "@/lib/operations/engine";
import { evaluateCerts } from "@/lib/people/certs";
import { prSubmittedTotal, prVariance } from "@/lib/pr-reconciliation";
import type { PurchaseRequest } from "@/types/database";
import {
  BRIEFING_AVAILABILITY_LABELS,
  PR_COMMITTED_ORDERED_SPEND_LABEL,
  type AtAGlanceSection,
  type AvailabilityOnlySection,
  type BriefingAvailability,
  type BriefingData,
  type BriefingFact,
  type BriefingFinding,
  type BriefingHoleObservationSource,
  type BriefingPeriod,
  type BriefingSection,
  type BriefingSourceAttribution,
  type BriefingSources,
  type BuildBriefingOptions,
  type ComplianceItem,
  type CountByLabel,
  type CoursePriorityIssue,
  type MoneyCategoryAmount,
  type MoneyMonthAmount,
  type PeriodComparison,
  type PrReconciliationVariance,
  type ProcurementItem,
} from "./types";

export const AGED_WORK_ORDER_DAYS = 30;
export const BRIEFING_LIST_LIMIT = 10;

const SOURCE = {
  revenue: source("revenue_monthly_rollup", "Revenue monthly rollup"),
  prSpend: source(
    "pr_spend_monthly_rollup",
    `${PR_COMMITTED_ORDERED_SPEND_LABEL} monthly rollup`,
  ),
  budget: source("budget_items", "Budget items"),
  purchaseRequests: source("purchase_requests", "Purchase requests"),
  equipment: source("equipment", "Equipment records"),
  readiness: source("equipment_readiness", "Equipment readiness helper"),
  triage: source("equipment_triage", "Equipment triage helper"),
  pm: source("equipment_pm_status", "Safe PM status helper"),
  observations: source("hole_observations", "Hole observations"),
  obligations: source("obligations", "Compliance obligations"),
  completions: source(
    "obligation_completions",
    "Compliance obligation completions",
  ),
  obligationsEngine: source("obligations_engine", "Obligations engine"),
  profiles: source("profiles", "Active profiles"),
  certifications: source("certifications", "Certifications"),
  certificationsEngine: source(
    "certifications_engine",
    "Certification expiry helper",
  ),
  workOrders: source("work_orders", "Work orders"),
  restaurant: source("restaurant_purchases", "Restaurant purchases"),
  inventory: source("inventory_items", "Inventory items"),
  projects: source("capital_projects", "Capital projects"),
  staffRecords: source("staff_records", "Staff records"),
  engine: source("briefing_engine", "Deterministic briefing engine"),
} as const;

function source(
  id: BriefingSourceAttribution["id"],
  label: string,
): BriefingSourceAttribution {
  return { id, label };
}

function availabilityLabel(availability: BriefingAvailability): string {
  return BRIEFING_AVAILABILITY_LABELS[availability];
}

function fact<T>(
  value: T | null,
  availability: BriefingAvailability,
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
  note?: string,
): BriefingFact<T> {
  return {
    value,
    availability,
    availabilityLabel: availabilityLabel(availability),
    source: uniqueSources(sources),
    asOf,
    ...(note ? { note } : {}),
  };
}

function recorded<T>(
  value: T,
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
  note?: string,
): BriefingFact<T> {
  return fact(value, "recorded", sources, asOf, note);
}

function notRecorded<T>(
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
  note = "Not recorded for this period.",
): BriefingFact<T> {
  return fact<T>(null, "not_recorded", sources, asOf, note);
}

function insufficient<T>(
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
  note = "Insufficient history for this comparison.",
): BriefingFact<T> {
  return fact<T>(null, "insufficient_history", sources, asOf, note);
}

function section<T>(
  data: T,
  facts: readonly BriefingFact<unknown>[],
  asOf: string,
  note?: string,
): BriefingSection<T> {
  const availability = aggregateAvailability(facts);
  return {
    data,
    availability,
    availabilityLabel: availabilityLabel(availability),
    source: uniqueSources(facts.flatMap((item) => item.source)),
    asOf,
    ...(note ? { note } : {}),
  };
}

function aggregateAvailability(
  facts: readonly BriefingFact<unknown>[],
): BriefingAvailability {
  if (facts.some((item) => item.availability === "recorded")) return "recorded";
  if (facts.some((item) => item.availability === "insufficient_history")) {
    return "insufficient_history";
  }
  return "not_recorded";
}

function uniqueSources(
  sources: readonly BriefingSourceAttribution[],
): BriefingSourceAttribution[] {
  const byId = new Map(sources.map((item) => [item.id, item]));
  return [...byId.values()];
}

interface DateRange {
  start: string;
  end: string;
  label: string;
}

export function resolveBriefingPeriod(
  options: BuildBriefingOptions,
): BriefingPeriod {
  const asOf = parseYmd(options.asOf, "asOf");
  const anchor = parseYmd(options.period?.anchor ?? options.asOf, "period anchor");
  if (anchor.getTime() > asOf.getTime()) {
    throw new Error("Briefing period anchor cannot be after asOf.");
  }

  const kind = options.period?.kind ?? "quarterly";
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const startMonth = kind === "quarterly" ? Math.floor(month / 3) * 3 : month;
  const calendarStart = new Date(Date.UTC(year, startMonth, 1));
  const monthSpan = kind === "quarterly" ? 3 : 1;
  const calendarEnd = new Date(Date.UTC(year, startMonth + monthSpan, 0));
  const end = calendarEnd.getTime() > asOf.getTime() ? asOf : calendarEnd;
  const previousEnd = new Date(calendarStart.getTime() - 86_400_000);
  const previousStart = new Date(
    Date.UTC(
      previousEnd.getUTCFullYear(),
      kind === "quarterly"
        ? Math.floor(previousEnd.getUTCMonth() / 3) * 3
        : previousEnd.getUTCMonth(),
      1,
    ),
  );

  return {
    kind,
    key: periodKey(kind, calendarStart),
    label: periodLabel(kind, calendarStart),
    start: ymd(calendarStart),
    end: ymd(end),
    calendarEnd: ymd(calendarEnd),
    isPartial: end.getTime() < calendarEnd.getTime(),
    previous: {
      key: periodKey(kind, previousStart),
      label: periodLabel(kind, previousStart),
      start: ymd(previousStart),
      end: ymd(previousEnd),
    },
  };
}

function parseYmd(value: string, name: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ${name}: expected YYYY-MM-DD.`);
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (ymd(parsed) !== value) throw new Error(`Invalid ${name}: ${value}.`);
  return parsed;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodKey(
  kind: BriefingPeriod["kind"],
  start: Date,
): string {
  const year = start.getUTCFullYear();
  if (kind === "monthly") {
    return `${year}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${year}-Q${Math.floor(start.getUTCMonth() / 3) + 1}`;
}

function periodLabel(
  kind: BriefingPeriod["kind"],
  start: Date,
): string {
  const year = start.getUTCFullYear();
  if (kind === "quarterly") {
    return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${year}`;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
}

function periodRange(period: BriefingPeriod): DateRange {
  return { start: period.start, end: period.end, label: period.label };
}

function previousRange(period: BriefingPeriod): DateRange {
  return {
    start: period.previous.start,
    end: period.previous.end,
    label: period.previous.label,
  };
}

function samePeriodPriorYear(period: BriefingPeriod): DateRange {
  return {
    start: shiftYear(period.start, -1),
    end: shiftYear(period.end, -1),
    label: `${period.label} prior year`,
  };
}

function shiftYear(value: string, amount: number): string {
  const date = parseYmd(value, "period date");
  const year = date.getUTCFullYear() + amount;
  const month = date.getUTCMonth();
  const day = Math.min(
    date.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  return ymd(new Date(Date.UTC(year, month, day)));
}

function rowMonthKey(value: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

function rangeMonthBounds(range: DateRange): { from: string; to: string } {
  return { from: `${range.start.slice(0, 7)}-01`, to: `${range.end.slice(0, 7)}-01` };
}

function inDateRange(value: string, range: DateRange): boolean {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= range.start && date <= range.end;
}

function rollupRowsInRange<T extends { month: string }>(
  rows: readonly T[],
  range: DateRange,
): T[] {
  const { from, to } = rangeMonthBounds(range);
  return rows.filter((row) => {
    const month = rowMonthKey(row.month);
    return month !== null && month >= from && month <= to;
  });
}

function sumRollupFact<T extends { month: string; total: number }>(
  rows: readonly T[],
  range: DateRange,
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
): BriefingFact<number> {
  const periodRows = rollupRowsInRange(rows, range);
  if (periodRows.length === 0) return notRecorded(sources, asOf);
  if (periodRows.some((row) => !Number.isFinite(Number(row.total)))) {
    return insufficient(sources, asOf, "Recorded rollup values are incomplete or invalid.");
  }
  return recorded(
    round2(periodRows.reduce((sum, row) => sum + Number(row.total), 0)),
    sources,
    asOf,
  );
}

function groupedRollupFact<T extends { month: string; total: number }>(
  rows: readonly T[],
  range: DateRange,
  labelFor: (row: T) => string,
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
): BriefingFact<MoneyCategoryAmount[]> {
  const periodRows = rollupRowsInRange(rows, range);
  if (periodRows.length === 0) return notRecorded(sources, asOf);
  if (periodRows.some((row) => !Number.isFinite(Number(row.total)))) {
    return insufficient(sources, asOf, "Recorded rollup values are incomplete or invalid.");
  }
  const amounts = new Map<string, number>();
  for (const row of periodRows) {
    const label = labelFor(row);
    amounts.set(label, round2((amounts.get(label) ?? 0) + Number(row.total)));
  }
  return recorded(
    [...amounts.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
    sources,
    asOf,
  );
}

function trendFact(
  rows: BriefingSources["revenueRollups"],
  range: DateRange,
  asOf: string,
): BriefingFact<MoneyMonthAmount[]> {
  const periodRows = rollupRowsInRange(rows, range);
  if (periodRows.length === 0) return notRecorded([SOURCE.revenue], asOf);
  if (periodRows.some((row) => !Number.isFinite(Number(row.total)))) {
    return insufficient(
      [SOURCE.revenue],
      asOf,
      "Recorded revenue rollup values are incomplete or invalid.",
    );
  }
  const amounts = new Map<string, number>();
  for (const row of periodRows) {
    const month = rowMonthKey(row.month)!;
    amounts.set(month, round2((amounts.get(month) ?? 0) + Number(row.total)));
  }
  return recorded(
    [...amounts.entries()]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    [SOURCE.revenue],
    asOf,
    "Only months with recorded revenue are included; missing months are not filled with zero.",
  );
}

function comparisonFact(
  current: BriefingFact<number>,
  prior: BriefingFact<number>,
  currentPeriod: string,
  priorPeriod: string,
  asOf: string,
  sources: readonly BriefingSourceAttribution[],
): BriefingFact<PeriodComparison> {
  if (current.availability !== "recorded" || current.value === null) {
    return notRecorded(sources, asOf, "No current-period value is recorded.");
  }
  if (prior.availability !== "recorded" || prior.value === null) {
    return insufficient(sources, asOf, "No prior-period baseline is recorded.");
  }
  const absoluteChange = round2(current.value - prior.value);
  const percentChange =
    prior.value > 0 ? round2((absoluteChange / prior.value) * 100) : null;
  const direction =
    absoluteChange > 0
      ? "increased"
      : absoluteChange < 0
        ? "decreased"
        : "unchanged";
  return recorded(
    {
      current: current.value,
      prior: prior.value,
      absoluteChange,
      percentChange,
      direction,
      currentPeriod,
      priorPeriod,
      ...(percentChange === null
        ? { note: "Percentage change is unavailable because the prior baseline is zero." }
        : {}),
    },
    sources,
    asOf,
  );
}

function periodBudgetFact(
  items: BriefingSources["budgetItems"],
  range: DateRange,
  asOf: string,
): BriefingFact<number> {
  const year = Number(range.start.slice(0, 4));
  const startMonth = Number(range.start.slice(5, 7));
  const endMonth = Number(range.end.slice(5, 7));
  const monthly = items.filter(
    (item) =>
      item.fiscal_year === year &&
      item.month !== null &&
      item.month >= startMonth &&
      item.month <= endMonth,
  );
  if (monthly.length === 0) {
    const hasAnnual = items.some(
      (item) => item.fiscal_year === year && item.month === null,
    );
    return hasAnnual
      ? insufficient(
          [SOURCE.budget],
          asOf,
          "Annual budget lines are recorded but cannot be assigned to this period without inventing an allocation.",
        )
      : notRecorded([SOURCE.budget], asOf);
  }
  if (monthly.some((item) => !Number.isFinite(Number(item.budgeted_amount)))) {
    return insufficient([SOURCE.budget], asOf, "Recorded budget values are incomplete or invalid.");
  }
  return recorded(
    round2(monthly.reduce((sum, item) => sum + Number(item.budgeted_amount), 0)),
    [SOURCE.budget],
    asOf,
  );
}

function utilizationFact(
  spend: BriefingFact<number>,
  budget: BriefingFact<number>,
  asOf: string,
): BriefingFact<number> {
  if (spend.availability !== "recorded" || spend.value === null) {
    return notRecorded([SOURCE.prSpend, SOURCE.budget], asOf);
  }
  if (budget.availability !== "recorded" || budget.value === null) {
    return insufficient(
      [SOURCE.prSpend, SOURCE.budget],
      asOf,
      "A period budget is required before utilization can be calculated.",
    );
  }
  if (budget.value <= 0) {
    return insufficient(
      [SOURCE.prSpend, SOURCE.budget],
      asOf,
      "Percentage utilization is unavailable because the recorded budget baseline is zero or unsuitable.",
    );
  }
  return recorded(round2((spend.value / budget.value) * 100), [SOURCE.prSpend, SOURCE.budget], asOf);
}

function reconciliationFact(
  requests: BriefingSources["purchaseRequests"],
  asOf: string,
): BriefingFact<PrReconciliationVariance[]> {
  if (requests.length === 0) return notRecorded([SOURCE.purchaseRequests], asOf);
  const values: PrReconciliationVariance[] = [];
  for (const request of requests) {
    if (request.actual_amount === null) continue;
    const receiptAmount = Number(request.actual_amount);
    if (!Number.isFinite(receiptAmount)) {
      return insufficient(
        [SOURCE.purchaseRequests],
        asOf,
        "A recorded receipt amount is invalid.",
      );
    }
    const submitted = prSubmittedTotal(request as PurchaseRequest);
    const variance = prVariance(submitted, receiptAmount);
    values.push({
      purchaseRequestId: request.id,
      submittedAmount: variance.submitted,
      recordedReceiptAmount: variance.actual,
      dollarVariance: round2(variance.dollars),
      percentVariance:
        variance.percent === null ? null : round2(variance.percent),
      tone: variance.tone,
    });
  }
  if (values.length === 0) {
    return notRecorded(
      [SOURCE.purchaseRequests],
      asOf,
      "No purchase requests have a recorded receipt amount for reconciliation.",
    );
  }
  return recorded(values, [SOURCE.purchaseRequests], asOf);
}

function sourceBackedCount(
  sourceRows: readonly unknown[],
  value: number,
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
): BriefingFact<number> {
  return sourceRows.length > 0
    ? recorded(value, sources, asOf)
    : notRecorded(sources, asOf);
}

interface OpenObservationResult {
  rows: BriefingHoleObservationSource[] | null;
  availability: BriefingAvailability;
  note?: string;
}

function openObservationsAt(
  rows: BriefingSources["holeObservations"],
  boundary: string,
  currentSnapshot: boolean,
): OpenObservationResult {
  if (rows.length === 0) return { rows: null, availability: "not_recorded" };
  const existing = rows.filter((row) => row.created_at.slice(0, 10) <= boundary);
  if (existing.length === 0) return { rows: null, availability: "not_recorded" };
  if (
    !currentSnapshot &&
    existing.some((row) => row.status === "resolved" && !row.resolved_at)
  ) {
    return {
      rows: null,
      availability: "insufficient_history",
      note: "A resolved observation lacks the timestamp required to reconstruct the historical snapshot.",
    };
  }
  const open = existing.filter((row) => {
    if (currentSnapshot) return row.status !== "resolved";
    return !row.resolved_at || row.resolved_at.slice(0, 10) > boundary;
  });
  return { rows: open, availability: "recorded" };
}

function observationCountFact(
  result: OpenObservationResult,
  asOf: string,
): BriefingFact<number> {
  if (result.availability === "not_recorded") {
    return notRecorded([SOURCE.observations], asOf);
  }
  if (result.availability === "insufficient_history" || result.rows === null) {
    return insufficient([SOURCE.observations], asOf, result.note);
  }
  return recorded(result.rows.length, [SOURCE.observations], asOf);
}

function groupedCounts(
  rows: readonly BriefingHoleObservationSource[],
  labelFor: (row: BriefingHoleObservationSource) => string,
): CountByLabel[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFor(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function complianceAt(
  sources: BriefingSources,
  boundary: string,
): BriefingFact<ComplianceItem[]> {
  if (sources.obligations.length === 0) {
    return notRecorded(
      [SOURCE.obligations, SOURCE.completions, SOURCE.obligationsEngine],
      boundary,
    );
  }
  const obligations = sources.obligations.filter(
    (item) => item.created_at.slice(0, 10) <= boundary,
  );
  if (obligations.length === 0) {
    return notRecorded(
      [SOURCE.obligations, SOURCE.completions, SOURCE.obligationsEngine],
      boundary,
    );
  }
  const completions = sources.obligationCompletions.filter(
    (item) => item.completed_at.slice(0, 10) <= boundary,
  );
  const evaluated = evaluateObligations(
    obligations,
    completions,
    localDate(boundary),
  );
  return recorded(
    evaluated
      .filter((item) => item.status === "overdue" || item.status === "due_soon")
      .map((item) => ({
        id: item.obligation.id,
        title: item.obligation.title,
        dueDate: item.dueDate,
        daysUntil: item.daysUntil,
        status: item.status as "overdue" | "due_soon",
      })),
    [SOURCE.obligations, SOURCE.completions, SOURCE.obligationsEngine],
    boundary,
  );
}

function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function filteredComplianceFact(
  sourceFact: BriefingFact<ComplianceItem[]>,
  status: ComplianceItem["status"],
  asOf: string,
): BriefingFact<ComplianceItem[]> {
  if (sourceFact.availability !== "recorded" || sourceFact.value === null) {
    return fact<ComplianceItem[]>(
      null,
      sourceFact.availability,
      sourceFact.source,
      asOf,
      sourceFact.note,
    );
  }
  return recorded(
    sourceFact.value.filter((item) => item.status === status),
    sourceFact.source,
    asOf,
  );
}

function countFromListFact<T>(
  list: BriefingFact<T[]>,
  asOf: string,
): BriefingFact<number> {
  if (list.availability !== "recorded" || list.value === null) {
    return fact<number>(null, list.availability, list.source, asOf, list.note);
  }
  return recorded(list.value.length, list.source, asOf);
}

function finding(
  label: string,
  detail: string,
  sources: readonly BriefingSourceAttribution[],
  asOf: string,
): BriefingFinding {
  return { label, detail, source: uniqueSources(sources), asOf };
}

function derivedFindingsFact(
  findings: BriefingFinding[],
  dependencies: readonly BriefingFact<unknown>[],
  asOf: string,
): BriefingFact<BriefingFinding[]> {
  const availability = aggregateAvailability(dependencies);
  const sources = dependencies.flatMap((item) => item.source);
  if (availability === "recorded") return recorded(findings, sources, asOf);
  if (availability === "insufficient_history") {
    return insufficient(sources, asOf);
  }
  return notRecorded(sources, asOf);
}

function comparisonFinding(
  label: string,
  comparison: BriefingFact<PeriodComparison>,
  lowerIsBetter: boolean,
  asOf: string,
): { improved?: BriefingFinding; worsened?: BriefingFinding } {
  if (comparison.availability !== "recorded" || !comparison.value) return {};
  const value = comparison.value;
  if (value.direction === "unchanged") return {};
  const isImproved = lowerIsBetter
    ? value.direction === "decreased"
    : value.direction === "increased";
  const detail = `${label} ${value.direction} by ${formatNumber(Math.abs(value.absoluteChange))} from ${value.priorPeriod} to ${value.currentPeriod}.`;
  const item = finding(label, detail, comparison.source, asOf);
  return isImproved ? { improved: item } : { worsened: item };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round2(value));
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function cleanText(value: string, maxLength = 160): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildBriefing(
  sources: BriefingSources,
  options: BuildBriefingOptions,
): BriefingData {
  const period = resolveBriefingPeriod(options);
  const currentRange = periodRange(period);
  const priorRange = previousRange(period);
  const asOf = options.asOf;

  const revenueTotal = sumRollupFact(
    sources.revenueRollups,
    currentRange,
    [SOURCE.revenue],
    asOf,
  );
  const priorRevenueTotal = sumRollupFact(
    sources.revenueRollups,
    priorRange,
    [SOURCE.revenue],
    asOf,
  );
  const revenuePeriodComparison = comparisonFact(
    revenueTotal,
    priorRevenueTotal,
    period.label,
    period.previous.label,
    asOf,
    [SOURCE.revenue],
  );
  const priorYearRange = samePeriodPriorYear(period);
  const priorYearRevenue = sumRollupFact(
    sources.revenueRollups,
    priorYearRange,
    [SOURCE.revenue],
    asOf,
  );
  const revenueYearOverYear = comparisonFact(
    revenueTotal,
    priorYearRevenue,
    period.label,
    priorYearRange.label,
    asOf,
    [SOURCE.revenue],
  );
  const revenueByCategory = groupedRollupFact(
    sources.revenueRollups,
    currentRange,
    (row) => row.category || "Uncategorized",
    [SOURCE.revenue],
    asOf,
  );
  const revenueTrend = trendFact(sources.revenueRollups, currentRange, asOf);

  const prSpend = sumRollupFact(
    sources.prSpendRollups,
    currentRange,
    [SOURCE.prSpend],
    asOf,
  );
  const priorPrSpend = sumRollupFact(
    sources.prSpendRollups,
    priorRange,
    [SOURCE.prSpend],
    asOf,
  );
  const prSpendComparison = comparisonFact(
    prSpend,
    priorPrSpend,
    period.label,
    period.previous.label,
    asOf,
    [SOURCE.prSpend],
  );
  const prSpendByCostCenter = groupedRollupFact(
    sources.prSpendRollups,
    currentRange,
    (row) => row.cost_ctr?.trim() || "Unassigned",
    [SOURCE.prSpend],
    asOf,
  );
  const budgetLinesForYear = sources.budgetItems.filter(
    (item) => item.fiscal_year === Number(period.start.slice(0, 4)),
  );
  const budgetByLine =
    budgetLinesForYear.length === 0
      ? notRecorded<
          Array<{
            id: string;
            category: string;
            description: string | null;
            amount: number;
            month: number | null;
            fiscalYear: number;
          }>
        >([SOURCE.budget], asOf)
      : budgetLinesForYear.some((item) =>
            !Number.isFinite(Number(item.budgeted_amount))
          )
        ? insufficient<
            Array<{
              id: string;
              category: string;
              description: string | null;
              amount: number;
              month: number | null;
              fiscalYear: number;
            }>
          >([SOURCE.budget], asOf, "Recorded budget values are incomplete or invalid.")
        : recorded(
            budgetLinesForYear.map((item) => ({
              id: item.id,
              category: item.category,
              description: item.description,
              amount: Number(item.budgeted_amount),
              month: item.month,
              fiscalYear: item.fiscal_year,
            })),
            [SOURCE.budget],
            asOf,
          );
  const periodBudget = periodBudgetFact(sources.budgetItems, currentRange, asOf);
  const priorPeriodBudget = periodBudgetFact(sources.budgetItems, priorRange, asOf);
  const currentUtilization = utilizationFact(prSpend, periodBudget, asOf);
  const priorUtilization = utilizationFact(priorPrSpend, priorPeriodBudget, asOf);
  const prBudgetUtilizationComparison = comparisonFact(
    currentUtilization,
    priorUtilization,
    period.label,
    period.previous.label,
    asOf,
    [SOURCE.prSpend, SOURCE.budget],
  );
  const prSpendAgainstBudget =
    prSpend.availability !== "recorded" || prSpend.value === null
      ? notRecorded<{
          budget: number;
          prCommittedOrderedSpend: number;
          remaining: number;
          percentUsed: number | null;
          label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
        }>([SOURCE.prSpend, SOURCE.budget], asOf)
      : periodBudget.availability !== "recorded" || periodBudget.value === null
        ? insufficient<{
            budget: number;
            prCommittedOrderedSpend: number;
            remaining: number;
            percentUsed: number | null;
            label: typeof PR_COMMITTED_ORDERED_SPEND_LABEL;
          }>(
            [SOURCE.prSpend, SOURCE.budget],
            asOf,
            "An exact period budget is required for this comparison.",
          )
        : recorded(
            {
              budget: periodBudget.value,
              prCommittedOrderedSpend: prSpend.value,
              remaining: round2(periodBudget.value - prSpend.value),
              percentUsed:
                periodBudget.value > 0
                  ? round2((prSpend.value / periodBudget.value) * 100)
                  : null,
              label: PR_COMMITTED_ORDERED_SPEND_LABEL,
            },
            [SOURCE.prSpend, SOURCE.budget],
            asOf,
            periodBudget.value > 0
              ? "Compared only with budget lines recorded for the selected calendar period."
              : "Percentage utilization is unavailable because the recorded budget baseline is zero.",
          );
  const reconciliationVariances = reconciliationFact(
    sources.purchaseRequests,
    asOf,
  );

  const financialData = {
    revenueTotal,
    revenueByCategory,
    revenueTrend,
    revenuePeriodComparison,
    revenueYearOverYear,
    prCommittedOrderedSpendTotal: {
      ...prSpend,
      label: PR_COMMITTED_ORDERED_SPEND_LABEL,
      note:
        prSpend.note ??
        `${PR_COMMITTED_ORDERED_SPEND_LABEL} comes from purchase requests; it is not a general-ledger expense measure.`,
    },
    prSpendByCostCenter: {
      ...prSpendByCostCenter,
      label: PR_COMMITTED_ORDERED_SPEND_LABEL,
    },
    prSpendPeriodComparison: {
      ...prSpendComparison,
      label: PR_COMMITTED_ORDERED_SPEND_LABEL,
    },
    budgetByLine,
    periodBudgetTotal: periodBudget,
    prSpendAgainstBudget: {
      ...prSpendAgainstBudget,
      label: PR_COMMITTED_ORDERED_SPEND_LABEL,
    },
    prBudgetUtilizationComparison: {
      ...prBudgetUtilizationComparison,
      label: PR_COMMITTED_ORDERED_SPEND_LABEL,
    },
    reconciliationVariances,
  };
  const financial = section(
    financialData,
    Object.values(financialData),
    asOf,
  );

  const readiness =
    sources.equipment.length > 0
      ? summarizeEquipmentReadiness(sources.equipment)
      : null;
  const equipmentSources = [SOURCE.equipment, SOURCE.readiness];
  const equipmentTotal = readiness
    ? recorded<number>(readiness.totalOwned, equipmentSources, asOf)
    : notRecorded<number>(equipmentSources, asOf);
  const equipmentOperational = readiness
    ? recorded<number>(readiness.operational, equipmentSources, asOf)
    : notRecorded<number>(equipmentSources, asOf);
  const equipmentDown = readiness
    ? recorded<number>(readiness.down, equipmentSources, asOf)
    : notRecorded<number>(equipmentSources, asOf);
  const equipmentWaitingParts = readiness
    ? recorded<number>(readiness.waitingOnParts, equipmentSources, asOf)
    : notRecorded<number>(equipmentSources, asOf);
  const equipmentNeedsService = readiness
    ? recorded<number>(readiness.needsService, equipmentSources, asOf)
    : notRecorded<number>(equipmentSources, asOf);
  const attentionUnits =
    sources.equipment.length === 0
      ? notRecorded<
          Array<{
            id: string;
            name: string;
            status: string;
            triageStatus: (typeof sources.equipment)[number]["triage_status"];
            triageLabel: string;
          }>
        >([SOURCE.equipment, SOURCE.readiness, SOURCE.triage], asOf)
      : recorded(
          sources.equipment
            .filter(
              (unit) =>
                unit.status !== "retired" &&
                (getAttentionPriority(unit) < 3 ||
                  isTriageAttention(unit.triage_status)),
            )
            .sort(
              (a, b) =>
                getAttentionPriority(a) - getAttentionPriority(b) ||
                triageOrder(a.triage_status) - triageOrder(b.triage_status) ||
                a.name.localeCompare(b.name),
            )
            .slice(0, BRIEFING_LIST_LIMIT)
            .map((unit) => ({
              id: unit.id,
              name: unit.name,
              status: unit.status,
              triageStatus: unit.triage_status,
              triageLabel: triageLabel(unit.triage_status),
            })),
          [SOURCE.equipment, SOURCE.readiness, SOURCE.triage],
          asOf,
        );
  const nonRetiredEquipment = sources.equipment.filter(
    (unit) => unit.status !== "retired",
  );
  const computablePm = nonRetiredEquipment.filter((unit) =>
    pmIsComputable(evaluatePmSafe(unit).state),
  );
  const pmNote =
    sources.equipment.length === 0
      ? notRecorded<string>([SOURCE.equipment, SOURCE.pm], asOf)
      : computablePm.length === 0
        ? notRecorded<string>(
            [SOURCE.equipment, SOURCE.pm],
            asOf,
            "PM schedule/meter data is not recorded or is unable to be calculated from confirmed values.",
          )
        : recorded(
            `Safe PM status is computable for ${computablePm.length} of ${nonRetiredEquipment.length} active units.`,
            [SOURCE.equipment, SOURCE.pm],
            asOf,
          );
  const equipmentDownComparison =
    equipmentDown.availability === "recorded"
      ? insufficient<PeriodComparison>(
          [SOURCE.equipment, SOURCE.readiness],
          asOf,
          "Equipment records contain the current status only; no historical status snapshot exists for a prior-period comparison.",
        )
      : notRecorded<PeriodComparison>(equipmentSources, asOf);
  const equipmentData = {
    total: equipmentTotal,
    operational: equipmentOperational,
    down: equipmentDown,
    waitingParts: equipmentWaitingParts,
    needsService: equipmentNeedsService,
    attentionUnits,
    pmNote,
    downPeriodComparison: equipmentDownComparison,
  };
  const equipment = section(
    equipmentData,
    Object.values(equipmentData),
    asOf,
  );

  const currentSnapshot = period.end === asOf;
  const currentOpenResult = openObservationsAt(
    sources.holeObservations,
    period.end,
    currentSnapshot,
  );
  const priorOpenResult = openObservationsAt(
    sources.holeObservations,
    period.previous.end,
    false,
  );
  const courseOpen = observationCountFact(currentOpenResult, asOf);
  const priorCourseOpen = observationCountFact(priorOpenResult, asOf);
  const courseComparison = comparisonFact(
    courseOpen,
    priorCourseOpen,
    period.label,
    period.previous.label,
    asOf,
    [SOURCE.observations],
  );
  const resolvedWithMissingDate = sources.holeObservations.some(
    (row) => row.status === "resolved" && !row.resolved_at,
  );
  const resolvedThisPeriod =
    sources.holeObservations.length === 0
      ? notRecorded<number>([SOURCE.observations], asOf)
      : resolvedWithMissingDate
        ? insufficient<number>(
            [SOURCE.observations],
            asOf,
            "A resolved observation lacks the timestamp required for a period count.",
          )
        : recorded(
            sources.holeObservations.filter(
              (row) =>
                row.resolved_at !== null &&
                inDateRange(row.resolved_at, currentRange),
            ).length,
            [SOURCE.observations],
            asOf,
          );
  const currentOpenRows = currentOpenResult.rows;
  const courseByCategory =
    currentOpenResult.availability === "recorded" && currentOpenRows
      ? recorded(
          groupedCounts(currentOpenRows, (row) => row.issue_type),
          [SOURCE.observations],
          asOf,
        )
      : fact<CountByLabel[]>(
          null,
          currentOpenResult.availability,
          [SOURCE.observations],
          asOf,
          currentOpenResult.note,
        );
  const courseByHole =
    currentOpenResult.availability === "recorded" && currentOpenRows
      ? recorded(
          groupedCounts(currentOpenRows, (row) => `Hole ${row.hole_number}`),
          [SOURCE.observations],
          asOf,
        )
      : fact<CountByLabel[]>(
          null,
          currentOpenResult.availability,
          [SOURCE.observations],
          asOf,
          currentOpenResult.note,
        );
  const priorityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  const courseTopPriority =
    currentOpenResult.availability === "recorded" && currentOpenRows
      ? recorded<CoursePriorityIssue[]>(
          [...currentOpenRows]
            .sort(
              (a, b) =>
                (priorityRank[a.priority] ?? 99) -
                  (priorityRank[b.priority] ?? 99) ||
                a.hole_number - b.hole_number ||
                a.title.localeCompare(b.title),
            )
            .slice(0, BRIEFING_LIST_LIMIT)
            .map((row) => ({
              id: row.id,
              holeNumber: row.hole_number,
              title: cleanText(row.title),
              priority: row.priority,
              issueType: row.issue_type,
            })),
          [SOURCE.observations],
          asOf,
        )
      : fact<CoursePriorityIssue[]>(
          null,
          currentOpenResult.availability,
          [SOURCE.observations],
          asOf,
          currentOpenResult.note,
        );
  const courseData = {
    openIssues: courseOpen,
    resolvedThisPeriod,
    byCategory: courseByCategory,
    byHole: courseByHole,
    topPriority: courseTopPriority,
    openIssuePeriodComparison: courseComparison,
  };
  const course = section(courseData, Object.values(courseData), asOf);

  const periodRequests = sources.purchaseRequests.filter((request) =>
    inDateRange(request.date_prepared, currentRange),
  );
  const prCountByStatus =
    periodRequests.length === 0
      ? notRecorded<CountByLabel[]>([SOURCE.purchaseRequests], asOf)
      : recorded(
          countLabels(periodRequests.map((request) => request.status)),
          [SOURCE.purchaseRequests],
          asOf,
        );
  const toProcurementItem = (
    request: BriefingSources["purchaseRequests"][number],
  ): ProcurementItem => ({
    id: request.id,
    status: request.status,
    datePrepared: request.date_prepared,
    submittedAmount: Number.isFinite(prSubmittedTotal(request as PurchaseRequest))
      ? prSubmittedTotal(request as PurchaseRequest)
      : null,
  });
  const openPrs =
    sources.purchaseRequests.length === 0
      ? notRecorded<ProcurementItem[]>([SOURCE.purchaseRequests], asOf)
      : recorded(
          sources.purchaseRequests
            .filter((request) => request.status !== "received")
            .map(toProcurementItem),
          [SOURCE.purchaseRequests],
          asOf,
        );
  const awaitingApproval =
    sources.purchaseRequests.length === 0
      ? notRecorded<ProcurementItem[]>([SOURCE.purchaseRequests], asOf)
      : recorded(
          sources.purchaseRequests
            .filter(
              (request) =>
                request.status === "submitted" || request.status === "sent",
            )
            .map(toProcurementItem),
          [SOURCE.purchaseRequests],
          asOf,
        );
  const procurementData = {
    prCountByStatus,
    openPRs: openPrs,
    awaitingApproval,
    prCommittedOrderedSpend: {
      ...prSpend,
      label: PR_COMMITTED_ORDERED_SPEND_LABEL,
    },
    reconciliationVariances,
  };
  const procurement = section(
    procurementData,
    Object.values(procurementData),
    asOf,
  );

  const activeProfiles = sources.profiles.filter((profile) => profile.is_active);
  const activeHeadcount = sourceBackedCount(
    sources.profiles,
    activeProfiles.length,
    [SOURCE.profiles],
    asOf,
  );
  const staffingByRole =
    sources.profiles.length === 0
      ? notRecorded<CountByLabel[]>([SOURCE.profiles], asOf)
      : recorded(
          countLabels(activeProfiles.map((profile) => profile.role)),
          [SOURCE.profiles],
          asOf,
        );
  const vacancies = notRecorded<number>(
    [SOURCE.profiles],
    asOf,
    "Authorized staffing is not recorded; vacancies are not inferred from prose.",
  );
  const evaluatedCertifications = evaluateCerts(
    sources.certifications,
    localDate(asOf),
  );
  const certificationsExpiring =
    sources.certifications.length === 0
      ? notRecorded<
          Array<{
            id: string;
            holder: string;
            certification: string;
            status: "expired" | "expiring";
            daysUntil: number;
          }>
        >([SOURCE.certifications, SOURCE.certificationsEngine], asOf)
      : recorded(
          evaluatedCertifications
            .filter(
              (item) => item.status === "expired" || item.status === "expiring",
            )
            .map((item) => ({
              id: item.cert.id,
              holder: item.cert.holder,
              certification: item.cert.cert_name,
              status: item.status as "expired" | "expiring",
              daysUntil: item.daysUntil as number,
            })),
          [SOURCE.certifications, SOURCE.certificationsEngine],
          asOf,
        );
  const trainingRecords =
    sources.staffRecords.length === 0
      ? notRecorded<number>([SOURCE.staffRecords], asOf)
      : recorded(sources.staffRecords.length, [SOURCE.staffRecords], asOf);
  const staffingData = {
    activeHeadcount,
    byRole: staffingByRole,
    vacancies,
    certificationsExpiring,
    trainingRecords,
  };
  const staffing = section(staffingData, Object.values(staffingData), asOf);

  const currentCompliance = complianceAt(sources, period.end);
  const priorCompliance = complianceAt(sources, period.previous.end);
  const overdue = filteredComplianceFact(currentCompliance, "overdue", asOf);
  const dueSoon = filteredComplianceFact(currentCompliance, "due_soon", asOf);
  const priorOverdue = countFromListFact(
    filteredComplianceFact(priorCompliance, "overdue", asOf),
    asOf,
  );
  const overdueCount = countFromListFact(overdue, asOf);
  const overdueComparison = comparisonFact(
    overdueCount,
    priorOverdue,
    period.label,
    period.previous.label,
    asOf,
    [SOURCE.obligations, SOURCE.completions, SOURCE.obligationsEngine],
  );
  const complianceData = {
    overdue,
    dueSoon,
    overduePeriodComparison: overdueComparison,
  };
  const compliance = section(
    complianceData,
    Object.values(complianceData),
    asOf,
  );

  const canUseCurrentWorkOrderState = period.end === asOf;
  const openWorkOrderRows = sources.workOrders.filter(
    (workOrder) => workOrder.status !== "completed",
  );
  const workOrderOpen =
    sources.workOrders.length === 0
      ? notRecorded<number>([SOURCE.workOrders], asOf)
      : canUseCurrentWorkOrderState
        ? recorded(openWorkOrderRows.length, [SOURCE.workOrders], asOf)
        : insufficient<number>(
            [SOURCE.workOrders],
            asOf,
            "Work orders do not record historical status snapshots.",
          );
  const agedCutoff = ymd(
    new Date(
      parseYmd(asOf, "asOf").getTime() -
        AGED_WORK_ORDER_DAYS * 86_400_000,
    ),
  );
  const agedWorkOrders = openWorkOrderRows.filter(
    (workOrder) =>
      (workOrder.date_submitted ?? workOrder.created_at).slice(0, 10) <= agedCutoff,
  );
  const agedOpen =
    sources.workOrders.length === 0
      ? notRecorded<number>([SOURCE.workOrders], asOf)
      : canUseCurrentWorkOrderState
        ? recorded(
            agedWorkOrders.length,
            [SOURCE.workOrders],
            asOf,
            `Aged means open for at least ${AGED_WORK_ORDER_DAYS} days.`,
          )
        : insufficient<number>([SOURCE.workOrders], asOf);
  const agedOpenItems =
    sources.workOrders.length === 0
      ? notRecorded<
          Array<{ id: string; description: string; submittedDate: string }>
        >([SOURCE.workOrders], asOf)
      : canUseCurrentWorkOrderState
        ? recorded(
            agedWorkOrders.slice(0, BRIEFING_LIST_LIMIT).map((workOrder) => ({
              id: workOrder.id,
              description: cleanText(workOrder.description_of_work),
              submittedDate: (
                workOrder.date_submitted ?? workOrder.created_at
              ).slice(0, 10),
            })),
            [SOURCE.workOrders],
            asOf,
          )
        : insufficient<
            Array<{ id: string; description: string; submittedDate: string }>
          >([SOURCE.workOrders], asOf);
  const workOrderComparison =
    workOrderOpen.availability === "recorded"
      ? insufficient<PeriodComparison>(
          [SOURCE.workOrders],
          asOf,
          "Work orders have no completion timestamp or historical status snapshot for a prior-period comparison.",
        )
      : fact<PeriodComparison>(
          null,
          workOrderOpen.availability,
          [SOURCE.workOrders],
          asOf,
          workOrderOpen.note,
        );
  const workOrderData = {
    open: workOrderOpen,
    agedOpen,
    agedOpenItems,
    openPeriodComparison: workOrderComparison,
  };
  const workOrders = section(
    workOrderData,
    Object.values(workOrderData),
    asOf,
  );

  const restaurant = availabilityOnlySection(
    sources.restaurantPurchases,
    SOURCE.restaurant,
    asOf,
  );
  const proShop = availabilityOnlySection(
    sources.inventoryItems,
    SOURCE.inventory,
    asOf,
  );
  const projects = availabilityOnlySection(
    sources.capitalProjects,
    SOURCE.projects,
    asOf,
  );

  const cleanComparisons = [
    {
      label: "Revenue",
      comparison: revenuePeriodComparison,
      lowerIsBetter: false,
    },
    {
      label: "Open course issues",
      comparison: courseComparison,
      lowerIsBetter: true,
    },
    {
      label: "Overdue compliance obligations",
      comparison: overdueComparison,
      lowerIsBetter: true,
    },
    {
      label: `${PR_COMMITTED_ORDERED_SPEND_LABEL} budget utilization`,
      comparison: prBudgetUtilizationComparison,
      lowerIsBetter: true,
    },
  ];
  const improvedFindings: BriefingFinding[] = [];
  const worsenedFindings: BriefingFinding[] = [];
  for (const candidate of cleanComparisons) {
    const result = comparisonFinding(
      candidate.label,
      candidate.comparison,
      candidate.lowerIsBetter,
      asOf,
    );
    if (result.improved) improvedFindings.push(result.improved);
    if (result.worsened) worsenedFindings.push(result.worsened);
  }
  const comparisonDependencies = cleanComparisons.map(
    (candidate) => candidate.comparison,
  );
  const improved = derivedFindingsFact(
    improvedFindings,
    comparisonDependencies,
    asOf,
  );
  const worsened = derivedFindingsFact(
    worsenedFindings,
    comparisonDependencies,
    asOf,
  );

  const overdueFindings: BriefingFinding[] = [];
  if (overdue.value && overdue.value.length > 0) {
    overdueFindings.push(
      finding(
        "Overdue compliance obligations",
        `${overdue.value.length} obligation${overdue.value.length === 1 ? " is" : "s are"} overdue.`,
        overdue.source,
        asOf,
      ),
    );
  }
  const expiredCerts = certificationsExpiring.value?.filter(
    (item) => item.status === "expired",
  );
  if (expiredCerts && expiredCerts.length > 0) {
    overdueFindings.push(
      finding(
        "Expired certifications",
        `${expiredCerts.length} active certification${expiredCerts.length === 1 ? " is" : "s are"} expired.`,
        certificationsExpiring.source,
        asOf,
      ),
    );
  }
  if (agedOpen.value !== null && agedOpen.value > 0) {
    overdueFindings.push(
      finding(
        "Aged work orders",
        `${agedOpen.value} open work order${agedOpen.value === 1 ? " is" : "s are"} at least ${AGED_WORK_ORDER_DAYS} days old.`,
        agedOpen.source,
        asOf,
      ),
    );
  }
  const overdueAtGlance = derivedFindingsFact(
    overdueFindings,
    [overdue, certificationsExpiring, agedOpen],
    asOf,
  );

  const equipmentDownFindings =
    equipmentDown.value === null
      ? []
      : [
          finding(
            "Equipment down",
            `${equipmentDown.value} equipment unit${equipmentDown.value === 1 ? " is" : "s are"} down according to recorded operational status.`,
            equipmentDown.source,
            asOf,
          ),
        ];
  const equipmentDownAtGlance = derivedFindingsFact(
    equipmentDownFindings,
    [equipmentDown],
    asOf,
  );

  const prSpendFindings =
    prSpend.value === null
      ? []
      : [
          finding(
            PR_COMMITTED_ORDERED_SPEND_LABEL,
            `${PR_COMMITTED_ORDERED_SPEND_LABEL}: ${money(prSpend.value)} for ${period.label}.`,
            prSpend.source,
            asOf,
          ),
        ];
  const prSpendAtGlance = derivedFindingsFact(
    prSpendFindings,
    [prSpend],
    asOf,
  );

  const decisions: BriefingFinding[] = [];
  if (overdue.value && overdue.value.length > 0) {
    decisions.push(
      finding(
        "Resolve overdue compliance",
        `${overdue.value.length} overdue obligation${overdue.value.length === 1 ? " requires" : "s require"} leadership review.`,
        overdue.source,
        asOf,
      ),
    );
  }
  const urgentCourse = courseTopPriority.value?.filter(
    (item) => item.priority === "critical" || item.priority === "high",
  );
  if (urgentCourse && urgentCourse.length > 0) {
    decisions.push(
      finding(
        "Prioritize course issues",
        `${urgentCourse.length} recorded critical/high course issue${urgentCourse.length === 1 ? " requires" : "s require"} prioritization.`,
        courseTopPriority.source,
        asOf,
      ),
    );
  }
  const materialVariances = reconciliationVariances.value?.filter(
    (item) => item.tone === "over",
  );
  if (materialVariances && materialVariances.length > 0) {
    decisions.push(
      finding(
        "Review PR reconciliation variances",
        `${materialVariances.length} recorded purchase-request reconciliation variance${materialVariances.length === 1 ? " exceeds" : "s exceed"} the existing review threshold.`,
        reconciliationVariances.source,
        asOf,
      ),
    );
  }
  if (agedOpen.value !== null && agedOpen.value > 0) {
    decisions.push(
      finding(
        "Prioritize aged work orders",
        `${agedOpen.value} aged open work order${agedOpen.value === 1 ? " needs" : "s need"} prioritization.`,
        agedOpen.source,
        asOf,
      ),
    );
  }
  const decisionDependencies = [
    overdue,
    courseTopPriority,
    reconciliationVariances,
    agedOpen,
  ];
  const decisionsNeeded = derivedFindingsFact(
    decisions,
    decisionDependencies,
    asOf,
  );

  const support: BriefingFinding[] = [];
  const waitingVendor = sources.equipment.filter(
    (unit) => unit.triage_status === "waiting_on_vendor",
  ).length;
  const waitingPartsTriage = sources.equipment.filter(
    (unit) => unit.triage_status === "waiting_on_parts",
  ).length;
  if (waitingVendor > 0 || waitingPartsTriage > 0) {
    support.push(
      finding(
        "Equipment repair support",
        `${waitingPartsTriage} unit${waitingPartsTriage === 1 ? " is" : "s are"} recorded waiting on parts; ${waitingVendor} unit${waitingVendor === 1 ? " is" : "s are"} recorded waiting on a vendor.`,
        [SOURCE.equipment, SOURCE.triage],
        asOf,
      ),
    );
  }
  if (awaitingApproval.value && awaitingApproval.value.length > 0) {
    support.push(
      finding(
        "Purchase-request approvals",
        `${awaitingApproval.value.length} purchase request${awaitingApproval.value.length === 1 ? " is" : "s are"} awaiting approval-stage action.`,
        awaitingApproval.source,
        asOf,
      ),
    );
  }
  const supportNeeded = derivedFindingsFact(
    support,
    [attentionUnits, awaitingApproval],
    asOf,
  );

  const atAGlanceData: AtAGlanceSection = {
    improved,
    worsened,
    overdue: overdueAtGlance,
    equipmentDown: equipmentDownAtGlance,
    prCommittedOrderedSpend: prSpendAtGlance,
    decisionsNeeded,
    supportNeeded,
  };
  const atAGlance = section(
    atAGlanceData,
    Object.values(atAGlanceData),
    asOf,
  );

  const headlineParts: string[] = [];
  if (revenueTotal.value !== null) {
    headlineParts.push(`Revenue recorded: ${money(revenueTotal.value)}`);
  }
  if (prSpend.value !== null) {
    headlineParts.push(
      `${PR_COMMITTED_ORDERED_SPEND_LABEL}: ${money(prSpend.value)}`,
    );
  }
  if (equipmentDown.value !== null) {
    headlineParts.push(`Equipment down: ${equipmentDown.value}`);
  }
  if (courseOpen.value !== null) {
    headlineParts.push(`Open course issues: ${courseOpen.value}`);
  }
  if (overdue.value !== null) {
    headlineParts.push(`Overdue compliance obligations: ${overdue.value.length}`);
  }
  const headline =
    headlineParts.length > 0
      ? recorded(
          `${headlineParts.join(". ")}.`,
          [
            ...revenueTotal.source,
            ...prSpend.source,
            ...equipmentDown.source,
            ...courseOpen.source,
            ...overdue.source,
            SOURCE.engine,
          ],
          asOf,
          "Facts-only deterministic summary; no causal claims.",
        )
      : notRecorded<string>([SOURCE.engine], asOf);
  const executiveData = { headline };
  const executive = section(executiveData, [headline], asOf);

  const riskItems: BriefingFinding[] = [];
  if (
    equipmentTotal.value !== null &&
    equipmentTotal.value > 0 &&
    equipmentDown.value !== null &&
    equipmentDown.value > 0
  ) {
    riskItems.push(
      finding(
        "Fleet readiness",
        `${round2((equipmentDown.value / equipmentTotal.value) * 100)}% of recorded active equipment is down (${equipmentDown.value} of ${equipmentTotal.value}).`,
        equipmentDown.source,
        asOf,
      ),
    );
  }
  riskItems.push(...overdueFindings);
  const unreconciledReceived = sources.purchaseRequests.filter(
    (request) => request.status === "received" && request.actual_amount === null,
  ).length;
  if (unreconciledReceived > 0) {
    riskItems.push(
      finding(
        "PR reconciliation gaps",
        `${unreconciledReceived} received purchase request${unreconciledReceived === 1 ? " lacks" : "s lack"} a recorded receipt amount.`,
        [SOURCE.purchaseRequests],
        asOf,
      ),
    );
  }
  const risksFact = derivedFindingsFact(
    riskItems,
    [equipmentTotal, equipmentDown, overdue, certificationsExpiring, agedOpen, openPrs],
    asOf,
  );
  const risksData = { items: risksFact };
  const risks = section(risksData, [risksFact], asOf);

  const leadershipData = { decisionsNeeded, supportNeeded };
  const leadershipAsks = section(
    leadershipData,
    Object.values(leadershipData),
    asOf,
  );

  return {
    meta: {
      period,
      generatedAt: options.generatedAt,
      courseName: options.courseName ?? "Veterans Memorial Golf Course",
      factsOnly: true,
    },
    atAGlance,
    executive,
    financial,
    equipment,
    course,
    procurement,
    restaurant,
    proShop,
    staffing,
    compliance,
    workOrders,
    projects,
    risks,
    leadershipAsks,
  };
}

function countLabels(labels: readonly string[]): CountByLabel[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function availabilityOnlySection(
  rows: readonly unknown[],
  sourceAttribution: BriefingSourceAttribution,
  asOf: string,
): BriefingSection<AvailabilityOnlySection> {
  const recordCount =
    rows.length === 0
      ? notRecorded<number>(
          [sourceAttribution],
          asOf,
          "Not recorded this period; no source rows were provided.",
        )
      : recorded(rows.length, [sourceAttribution], asOf);
  return section({ recordCount }, [recordCount], asOf);
}
