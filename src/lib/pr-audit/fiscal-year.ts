/**
 * Federal fiscal-year helpers for the PR Audit budget rollup.
 *
 * NAVMIDLANT NAF runs on the federal fiscal year: Oct 1 – Sep 30. FY26 is
 * Oct 1 2025 – Sep 30 2026. This matches the FY stamped on the PR Internal
 * Order (see src/lib/pr-internal-order.ts `fiscalYearTwoDigit`); the helpers
 * here return the full 4-digit year and the month ordering the dashboard uses.
 */

/** Month order within a federal fiscal year: Oct (0) … Sep (11). */
export const FISCAL_MONTH_LABELS: readonly string[] = [
  "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
  "Apr", "May", "Jun", "Jul", "Aug", "Sep",
];

/**
 * Full 4-digit federal fiscal year for a date. Oct/Nov/Dec roll into the
 * NEXT calendar year's FY. Mirrors `fiscalYearTwoDigit` but returns a number.
 *   federalFiscalYear(2025-10-01) → 2026
 *   federalFiscalYear(2026-09-30) → 2026
 *   federalFiscalYear(2026-01-15) → 2026
 */
export function federalFiscalYear(date: Date): number {
  const month = date.getMonth(); // 0-based; Oct = 9
  return month >= 9 ? date.getFullYear() + 1 : date.getFullYear();
}

/** Federal fiscal year for an ISO date string ("YYYY-MM-DD"). */
export function federalFiscalYearFromIso(iso: string): number {
  return federalFiscalYear(parseLocalDate(iso));
}

/**
 * Index 0..11 of a date within its fiscal year, where 0 = October and
 * 11 = September. Used to bucket spend into the FISCAL_MONTH_LABELS columns.
 */
export function fiscalMonthIndex(date: Date): number {
  return (date.getMonth() - 9 + 12) % 12;
}

/** The current federal fiscal year, from the supplied (or system) date. */
export function currentFederalFiscalYear(now: Date = new Date()): number {
  return federalFiscalYear(now);
}

/** Human label for a FY number: 2026 → "FY26 (Oct 2025 – Sep 2026)". */
export function fiscalYearLabel(fy: number): string {
  const yy = String(fy).slice(-2);
  return `FY${yy} (Oct ${fy - 1} – Sep ${fy})`;
}

/** Short FY label: 2026 → "FY26". */
export function fiscalYearShort(fy: number): string {
  return `FY${String(fy).slice(-2)}`;
}

/**
 * Parse an ISO date as a LOCAL date (not UTC). A bare "YYYY-MM-DD" parsed by
 * `new Date()` is treated as UTC midnight, which shifts to the previous day in
 * western time zones and can flip the fiscal month. Anchoring at local noon
 * avoids that off-by-one. Mirrors the formatDate helper used elsewhere.
 */
export function parseLocalDate(iso: string): Date {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored);
}
