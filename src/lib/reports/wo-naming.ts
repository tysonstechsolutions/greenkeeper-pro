/**
 * Filename conventions for Work Orders.
 *
 * Format: "Work Order-Golf Course-{Mon}{YYYY}-{NNN}.pdf"
 * Example: "Work Order-Golf Course-May2026-001.pdf"
 *
 * The sequence number is auto-assigned by a BEFORE INSERT trigger on the
 * `work_orders` table (see `20260521_work_orders.sql`). When previewing
 * a draft (no sequence yet), the slot falls back to the date string.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format the work order sequence number as a zero-padded 3-digit string.
 * Returns `null` when no sequence has been assigned yet (draft).
 */
export function formatWoSequence(
  seqNum: number | null | undefined,
): string | null {
  if (seqNum == null || seqNum <= 0) return null;
  return String(seqNum).padStart(3, "0");
}

/**
 * Build the canonical work order filename.
 *
 * Examples:
 *   "Work Order-Golf Course-May2026-001.pdf"  (with sequence)
 *   "Work Order-Golf Course-May2026-20260521.pdf"  (draft fallback)
 */
export function workOrderPdfFilename(
  seqNum: number | null | undefined,
  dateSubmitted?: string | null,
  now: Date = new Date(),
): string {
  const mon = MONTH_NAMES[now.getMonth()];
  const yyyy = now.getFullYear();

  const seq = formatWoSequence(seqNum);
  const tag = seq ?? (dateSubmitted ?? now.toISOString().slice(0, 10)).replace(/-/g, "");

  return `Work Order-Golf Course-${mon}${yyyy}-${tag}.pdf`;
}

/**
 * Display name shown in the list UI.
 * Example: "Work Order-Golf Course-May2026-001"
 */
export function workOrderDisplayName(
  seqNum: number | null | undefined,
  dateSubmitted?: string | null,
  now?: Date,
): string {
  return workOrderPdfFilename(seqNum, dateSubmitted, now).replace(/\.pdf$/, "");
}
