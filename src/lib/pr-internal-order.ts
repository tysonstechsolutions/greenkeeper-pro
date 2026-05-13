/**
 * Internal Order ID format: `FY{YY}-GC-{NNNN}`.
 *
 * Examples: `FY26-GC-0001`, `FY26-GC-0030`, `FY27-GC-0007`.
 *
 * • FY{YY} — federal fiscal year (Oct 1 – Sep 30). Tied to the PR's
 *   `date_prepared`, NOT the time the user opens the form, so editing an
 *   old PR doesn't accidentally re-stamp it with the wrong fiscal year.
 * • GC — Golf Course.
 * • NNNN — zero-padded 4-digit sequence, monotonically increasing across
 *   the lifetime of the table. The DB sequence (see migration
 *   20260504_pr_sequence_number.sql) hands these out on insert; we never
 *   reset across fiscal years because procurement files cross-reference
 *   by raw sequence, not by FY-prefixed slot.
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
 *   formatInternalOrder(30, new Date("2026-05-01")) → "FY26-FM-0030"
 *
 * If `seq` is null/undefined (PR not yet saved), returns null.
 */
export function formatInternalOrder(
  seq: number | null | undefined,
  datePrepared: string | Date,
): string | null {
  if (seq == null) return null;
  const d = typeof datePrepared === "string" ? new Date(datePrepared) : datePrepared;
  if (Number.isNaN(d.getTime())) return null;
  const fy = fiscalYearTwoDigit(d);
  const padded = String(seq).padStart(4, "0");
  return `FY${fy}-${FACILITY_CODE}-${padded}`;
}
