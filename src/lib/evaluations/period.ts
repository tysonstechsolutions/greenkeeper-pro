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
