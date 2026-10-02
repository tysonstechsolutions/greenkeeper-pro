/**
 * Section 889 form rules.
 *
 * A vendor's 889 representation is good for ONE YEAR from the date it was
 * signed: signed Aug 5, 2026 → expires Aug 5, 2027. (The app used to expire
 * every 889 on the next Oct 1 — the end of the federal fiscal year — which
 * made every vendor go "expired" on Oct 1. That was wrong.)
 *
 * The database does the same math (`sign date + interval '1 year'`), so a
 * Feb 29 sign date expires Feb 28 the next year in both places.
 */

function toLocalDate(value: Date | string): Date {
  if (typeof value !== "string") return value;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${value}`);
  return d;
}

function iso(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** YYYY-MM-DD for a date (local), e.g. a sign date picked "today". */
export function toIsoDate(value: Date | string = new Date()): string {
  const d = toLocalDate(value);
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The 889 expiration for a form signed on `signedDate`: the same day one
 * year later (Feb 29 → Feb 28). Returns YYYY-MM-DD.
 */
export function calc889ExpirationDate(signedDate: Date | string = new Date()): string {
  const d = toLocalDate(signedDate);
  const year = d.getFullYear() + 1;
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return iso(year, month, Math.min(d.getDate(), lastDay));
}

/**
 * Get the federal fiscal year a date falls in. FY 2026 = Oct 1 2025 →
 * Sept 30 2026 (named after the year it ends in).
 */
export function fiscalYearOf(date: Date | string = new Date()): number {
  const d = toLocalDate(date);
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}

/**
 * Format a YYYY-MM-DD date string (the way our DATE columns return) as a
 * short human-readable date. Anchored at noon to avoid the UTC-vs-local
 * day-shift issue when toLocaleDateString parses an ISO date.
 */
export function format889Date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export type Section889Status = "compliant" | "expiring_soon" | "expired" | "missing";

/**
 * Where a vendor's 889 stands: missing (no form on file), expired (past its
 * expiration date), expiring_soon (within 30 days), or compliant. A form on
 * file with no expiration date counts as compliant. `todayIso` is for tests.
 */
export function section889Status(
  vendor: { section_889_path: string | null; section_889_expiration_date: string | null },
  todayIso: string = toIsoDate(new Date()),
): Section889Status {
  if (!vendor.section_889_path) return "missing";
  if (!vendor.section_889_expiration_date) return "compliant";
  const day = 86_400_000;
  const days = Math.round(
    (Date.parse(`${vendor.section_889_expiration_date}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / day,
  );
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "compliant";
}
