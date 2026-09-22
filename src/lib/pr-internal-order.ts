/**
 * Internal Order ID format: `FY{YY}-GC-{NNNN}`.
 *
 * Examples: `FY26-GC-0001`, `FY26-GC-0030`, `FY27-GC-0007`.
 *
 * • FY{YY} — the fiscal year the PR was numbered in, stored on the row as
 *   `pr_fiscal_year`. Procurement can open a year before Oct 1 (FY27 opened
 *   in Sept 2026), so the date alone isn't enough. Rows without it fall back
 *   to the federal fiscal year (Oct 1 – Sep 30) of `date_prepared` — never
 *   the time the form is opened, so an old PR never re-stamps.
 * • GC — Golf Course.
 * • NNNN — zero-padded 4-digit number that restarts every fiscal year. The
 *   DB trigger hands these out on insert from `pr_fiscal_counters` (see
 *   migration 20260922120000_pr_numbering_per_fiscal_year.sql).
 */

const FACILITY_CODE = "GC";

/** Compute fiscal year from a date. Oct/Nov/Dec roll into the next FY. */
export function fiscalYearTwoDigit(d: Date): string {
  const month = d.getMonth(); // 0-based; Oct = 9
  const fy = month >= 9 ? d.getFullYear() + 1 : d.getFullYear();
  return String(fy).slice(-2);
}

/**
 * Format a sequence number into the full Internal Order string.
 *
 *   formatInternalOrder(30, "2026-05-01")       → "FY26-GC-0030"
 *   formatInternalOrder(2, "2026-09-22", 2027)  → "FY27-GC-0002"
 *
 * If `seq` is null/undefined (PR not yet saved), returns null.
 */
export function formatInternalOrder(
  seq: number | null | undefined,
  datePrepared: string | Date,
  fiscalYear?: number | null,
): string | null {
  if (seq == null) return null;
  const padded = String(seq).padStart(4, "0");
  if (fiscalYear != null) {
    return `FY${String(fiscalYear).slice(-2)}-${FACILITY_CODE}-${padded}`;
  }
  // A bare "YYYY-MM-DD" parses as UTC midnight, which is still Sep 30 here
  // on Oct 1 — read it as a local calendar date instead.
  const ymd =
    typeof datePrepared === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePrepared)
      : null;
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : typeof datePrepared === "string"
      ? new Date(datePrepared)
      : datePrepared;
  if (Number.isNaN(d.getTime())) return null;
  const fy = fiscalYearTwoDigit(d);
  return `FY${fy}-${FACILITY_CODE}-${padded}`;
}
