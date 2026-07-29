/**
 * Date helpers shared by the schedule engine and the coverage generator.
 *
 * These live apart from both so `schedule-engine` can use `coverageGaps` for
 * its warnings while `coverage` still uses these helpers, without the two
 * modules importing each other. `schedule-engine` re-exports every one of
 * them, so existing imports keep working unchanged.
 */
import { WEEKDAY_KEYS, type ProShopTimeOff, type WeekdayKey } from "./types";

/** Local YYYY-MM-DD for a Date (no UTC shift). */
export function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a "YYYY-MM-DD" into a local Date (midnight). */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function weekdayKeyForDate(date: Date): WeekdayKey {
  return WEEKDAY_KEYS[date.getDay()];
}

/** Every calendar date (YYYY-MM-DD) in a given month. month0 is 0-based. */
export function datesInMonth(year: number, month0: number): string[] {
  const out: string[] = [];
  const days = new Date(year, month0 + 1, 0).getDate();
  for (let d = 1; d <= days; d++) out.push(ymd(new Date(year, month0, d)));
  return out;
}

/** Is `date` (YYYY-MM-DD) inside any of the staff member's time-off ranges? */
export function isOff(
  staffId: string,
  date: string,
  timeOff: ProShopTimeOff[],
): boolean {
  return timeOff.some(
    (t) => t.staff_id === staffId && date >= t.start_date && date <= t.end_date,
  );
}
