/**
 * Date formatting helpers for the app.
 *
 * The big trap this fixes: `new Date("2026-05-04")` parses as
 * 2026-05-04T00:00:00Z (UTC midnight). When you then call
 * `.toLocaleDateString()` in a negative-UTC zone (Central, Pacific, …),
 * the result is the *previous* calendar day. Anchoring DATE-only
 * (yyyy-mm-dd) inputs at noon local sidesteps that — noon is far enough
 * from any DST edge to keep the calendar day correct everywhere in the
 * US.
 *
 * Use these instead of `new Date(iso).toLocaleDateString(...)` for any
 * value that comes from a Postgres DATE column (inspection_date,
 * due_date, purchase_date, etc.). For TIMESTAMP columns (created_at,
 * updated_at) you can use the raw constructor — they already include
 * a time component so the conversion is unambiguous.
 */

/**
 * Parse an ISO string into a Date, anchoring DATE-only values at local
 * noon so timezone conversion can't shift them to the previous day.
 *
 * Returns null for empty / invalid input so callers can fall back to a
 * placeholder ("—") without conditional ternaries.
 */
export function parseAppDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  const d = new Date(anchored);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a DATE / TIMESTAMP ISO string for display. Returns the fallback
 * (default "—") when the input is null/empty/invalid.
 *
 * Pass any Intl.DateTimeFormatOptions you want — same surface as
 * Date.prototype.toLocaleDateString().
 */
export function formatAppDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
  fallback: string = "—",
): string {
  const d = parseAppDate(iso);
  return d ? d.toLocaleDateString("en-US", options) : fallback;
}
