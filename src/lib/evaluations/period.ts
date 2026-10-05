/**
 * Rating periods. Evaluations follow the federal fiscal year: FY2026 runs
 * October 1, 2025 through September 30, 2026.
 */
import type { EvaluationPeriod } from "./types";

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The fiscal-year rating period that ends on September 30 of `fy`. */
export function fiscalYearPeriod(fy: number): EvaluationPeriod {
  return {
    start: `${fy - 1}-10-01`,
    end: `${fy}-09-30`,
    label: `FY${fy}`,
  };
}

/** The fiscal year a date falls in (October starts the next FY). */
export function fiscalYearOf(isoDate: string): number {
  const [year, month] = isoDate.split("-").map(Number);
  return month >= 10 ? year + 1 : year;
}

/**
 * The period evaluations are normally written for on a given day: the most
 * recently COMPLETED fiscal year. On 2026-10-02 that's FY2026.
 */
export function defaultPeriod(todayIso: string): EvaluationPeriod {
  return fiscalYearPeriod(fiscalYearOf(todayIso) - 1);
}

/** The period from a `?fy=2026` query param, or the default when it's missing or bad. */
export function periodFromFyParam(fy: string | null, todayIso: string): EvaluationPeriod {
  const n = Number(fy);
  return fy && Number.isInteger(n) && n >= 2000 && n <= 2100 ? fiscalYearPeriod(n) : defaultPeriod(todayIso);
}

/** Periods offered in the picker: the default, the one before, and the current FY. */
export function periodChoices(todayIso: string): EvaluationPeriod[] {
  const current = fiscalYearOf(todayIso);
  return [current - 1, current - 2, current].map(fiscalYearPeriod);
}

/** "FY2026 (Oct 1, 2025 – Sep 30, 2026)". */
export function periodDisplay(period: Pick<EvaluationPeriod, "start" | "end" | "label">): string {
  return `${period.label} (${longDate(period.start)} – ${longDate(period.end)})`;
}

/** True when an ISO date (or timestamp) falls inside the period, inclusive. */
export function inPeriod(iso: string | null | undefined, period: Pick<EvaluationPeriod, "start" | "end">): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= period.start && day <= period.end;
}

// ── New hires: 90-day evaluations ────────────────────────────────────────────

/**
 * Someone employed fewer than this many days before the period ends (Sep 30)
 * gets no yearly evaluation for that year. They get a 90-day evaluation at
 * their 90-day mark instead.
 */
export const NEW_HIRE_DAYS = 90;

/** Show a 90-day evaluation this many days before the mark… */
export const NINETY_DAY_LEAD_DAYS = 30;
/** …and keep showing it (as overdue) this long after, unless it's final. */
export const NINETY_DAY_GRACE_DAYS = 90;

function isoDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(isoDay(toIso) - isoDay(fromIso));
}

/** `iso` plus `days` days, as yyyy-mm-dd. */
export function addDays(iso: string, days: number): string {
  return new Date((isoDay(iso) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** True for a real yyyy-mm-dd date. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

/**
 * Does this person need the yearly evaluation for the period? Not when they
 * were hired fewer than 90 days before it ends (or after it ended). Without
 * a hire date we can't tell, so they stay on the list.
 */
export function needsAnnualEvaluation(
  hireDate: string | null | undefined,
  period: Pick<EvaluationPeriod, "end">,
): boolean {
  if (!isIsoDate(hireDate)) return true;
  return daysBetween(hireDate, period.end) >= NEW_HIRE_DAYS;
}

/** The 90-day rating period: hire date through the 90-day mark. */
export function ninetyDayPeriod(hireDate: string): EvaluationPeriod {
  return { start: hireDate, end: addDays(hireDate, NEW_HIRE_DAYS), label: "90-Day" };
}

export type NinetyDayTiming = "upcoming" | "due" | "overdue";

/**
 * Where someone's 90-day evaluation stands today, or null when it's outside
 * the window the roster shows (too early, or long past the mark).
 * "due" = the mark is within the next week or today.
 */
export function ninetyDayTiming(hireDate: string | null | undefined, todayIso: string): NinetyDayTiming | null {
  if (!isIsoDate(hireDate)) return null;
  const toMark = daysBetween(todayIso, addDays(hireDate, NEW_HIRE_DAYS));
  if (toMark > NINETY_DAY_LEAD_DAYS || toMark < -NINETY_DAY_GRACE_DAYS) return null;
  if (toMark < 0) return "overdue";
  return toMark <= 7 ? "due" : "upcoming";
}
