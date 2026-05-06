/**
 * Date helpers — YYYY-MM-DD formatting from local components.
 *
 * Why this exists:
 *   `new Date().toISOString().slice(0, 10)` is a popular shortcut for
 *   "today in YYYY-MM-DD." It's wrong. toISOString converts to UTC first;
 *   for users west of UTC (the entire US), late-evening local times shift
 *   into the next UTC day. A user in CDT at 8 PM gets tomorrow's date
 *   instead of today, breaking forms, filters, and date pickers.
 *
 *   These helpers format from the LOCAL Date components, so the output
 *   matches the user's wall-clock date.
 *
 *   Reserve `toISOString()` for storing/transmitting full timestamps in
 *   UTC — that's still the correct serialization for `created_at`,
 *   `updated_at`, etc. Only date-only strings need this fix.
 */

/**
 * Format a Date as `YYYY-MM-DD` using local timezone components.
 */
export function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Today's date in `YYYY-MM-DD` (local timezone).
 */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/**
 * Add (or subtract, with negative days) calendar days to a `YYYY-MM-DD`
 * string. Returns the result as `YYYY-MM-DD` (local).
 *
 * Uses local-component math so DST transitions don't introduce off-by-one
 * errors and `toISOString` shifts can't sneak back in.
 */
export function addDaysLocal(dateString: string, days: number): string {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

/**
 * Format a Date as `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`.
 *
 * Same rationale as formatLocalDate: the input expects local-time, not UTC.
 */
export function formatLocalDateTime(d: Date): string {
  const date = formatLocalDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date}T${hh}:${mm}`;
}

/**
 * Days-ago helper. `daysAgoLocal(7)` returns the date 7 calendar days
 * before today, in local YYYY-MM-DD.
 */
export function daysAgoLocal(days: number): string {
  return addDaysLocal(todayLocal(), -days);
}
