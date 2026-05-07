/**
 * Section 889 form rules.
 *
 * 889 reps must be re-signed every federal fiscal year. Federal FY runs
 * Oct 1 → Sept 30 — a form signed any time during a fiscal year is valid
 * through the **start of the next fiscal year (Oct 1)** and no further.
 *
 * So an 889 signed on Aug 5, 2026 (FY 2026) expires Oct 1, 2026.
 * An 889 signed on Oct 2, 2025 (start of FY 2026) also expires Oct 1, 2026.
 * An 889 signed on Oct 2, 2026 (FY 2027) expires Oct 1, 2027.
 */

/**
 * Compute the 889 expiration date for an 889 signed on the given date.
 * Returns YYYY-MM-DD (PostgreSQL DATE format, local).
 *
 * The rule: expiration is the next Oct 1 strictly after the signed date.
 * - Signed Jan 1 – Sept 30 of year N → expires Oct 1 of year N
 * - Signed Oct 1 – Dec 31 of year N → expires Oct 1 of year N+1
 *
 * Note that "Oct 1 of year N" for an Oct 1 sign date means the same day,
 * which would be a 0-day window — but a sign date of Oct 1 itself is
 * already in the new fiscal year, so its expiration is Oct 1 of the
 * following calendar year.
 */
export function calc889ExpirationDate(signedDate: Date | string = new Date()): string {
  const d = typeof signedDate === "string" ? new Date(signedDate + "T12:00:00") : signedDate;
  const month = d.getMonth(); // 0-indexed: Jan=0, Oct=9, Dec=11
  const year = d.getFullYear();
  // Oct 1 starts a new fiscal year. Anything on or after Oct 1 expires
  // the FOLLOWING Oct 1.
  const expirationYear = month >= 9 ? year + 1 : year;
  const mm = "10";
  const dd = "01";
  return `${expirationYear}-${mm}-${dd}`;
}

/**
 * Get the federal fiscal year a date falls in. FY 2026 = Oct 1 2025 →
 * Sept 30 2026 (named after the year it ends in).
 */
export function fiscalYearOf(date: Date | string = new Date()): number {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : date;
  const month = d.getMonth();
  const year = d.getFullYear();
  return month >= 9 ? year + 1 : year;
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
