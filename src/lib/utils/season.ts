/**
 * Golf-season recurrence math.
 *
 * The course runs a seasonal window — **April 1 → November 1** every year.
 * Repeating jobs only generate occurrences inside that window: a weekly mow
 * dropped in June fills every [weekday] through Nov 1, skips the Nov–Mar
 * off-season, then resumes the next April 1, and so on indefinitely.
 *
 * Tier behavior (decided with the super):
 *   - daily / weekly → repeat on the dropped weekday, every week
 *   - monthly        → repeat on the dropped nth-weekday slot, every month
 *   - seasonal / projects → one-off (only the dropped day)
 *
 * Everything here is pure date math on `YYYY-MM-DD` strings (local-time, via
 * the date helpers) so it's deterministic and unit-testable.
 */
import { formatLocalDate, addDaysLocal } from "./date";
import type { TaskFrequency } from "@/types/database";

// Season window, inclusive of both ends. Kept as constants so it can later
// move into app_settings without touching call sites.
export const SEASON_START_MONTH = 4; // April
export const SEASON_START_DAY = 1;
export const SEASON_END_MONTH = 11; // November
export const SEASON_END_DAY = 1;

/** How far ahead a fresh drop materializes; the nightly job keeps it topped up. */
export const DEFAULT_HORIZON_DAYS = 365;

const pad = (n: number) => String(n).padStart(2, "0");

function yearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4));
}

/** Inclusive [Apr 1, Nov 1] bounds for a given year, as YYYY-MM-DD. */
export function seasonBounds(year: number): { start: string; end: string } {
  return {
    start: `${year}-${pad(SEASON_START_MONTH)}-${pad(SEASON_START_DAY)}`,
    end: `${year}-${pad(SEASON_END_MONTH)}-${pad(SEASON_END_DAY)}`,
  };
}

/** Is this date inside the course's operating season (Apr 1 – Nov 1)? */
export function inSeason(dateStr: string): boolean {
  const { start, end } = seasonBounds(yearOf(dateStr));
  // Lexicographic compare on YYYY-MM-DD is chronological.
  return dateStr >= start && dateStr <= end;
}

/**
 * The first in-season day on or after `dateStr`. If the date is already in
 * season, returns it unchanged; if it's in the off-season, returns the
 * upcoming April 1 (this year's if we're still before it, else next year's).
 */
export function clampToSeasonStart(dateStr: string): string {
  if (inSeason(dateStr)) return dateStr;
  const y = yearOf(dateStr);
  const thisStart = seasonBounds(y).start;
  // Before April 1 → this year's opener; after Nov 1 → next year's opener.
  return dateStr < thisStart ? thisStart : seasonBounds(y + 1).start;
}

/** Day of week for a YYYY-MM-DD string. 0 = Sunday … 6 = Saturday. */
export function weekdayOf(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

/** Which occurrence of its weekday the date is within its month (1–5). */
export function weekOfMonthOf(dateStr: string): number {
  const day = Number(dateStr.slice(8, 10));
  return Math.floor((day - 1) / 7) + 1;
}

/**
 * The date of the `n`-th `weekday` in a month (e.g. 2nd Tuesday), or null if
 * that month has no such occurrence (e.g. a 5th Friday that doesn't exist).
 */
export function nthWeekdayOfMonth(
  year: number,
  month1to12: number,
  weekday: number,
  n: number,
): string | null {
  const first = new Date(year, month1to12 - 1, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  const daysInMonth = new Date(year, month1to12, 0).getDate();
  if (day > daysInMonth) return null;
  return formatLocalDate(new Date(year, month1to12 - 1, day));
}

/**
 * Every 7th day from `anchor` through `horizon` (inclusive) that falls inside
 * the season. Off-season weeks are simply skipped, so the series automatically
 * pauses Nov–Mar and resumes the next April. All results share `anchor`'s
 * weekday.
 */
export function weeklyOccurrences(anchor: string, horizon: string): string[] {
  const out: string[] = [];
  let cur = anchor;
  // Guard against an inverted range.
  if (horizon < anchor) return out;
  while (cur <= horizon) {
    if (inSeason(cur)) out.push(cur);
    cur = addDaysLocal(cur, 7);
  }
  return out;
}

/**
 * The nth-weekday slot of each month from `anchor`'s month through `horizon`,
 * keeping only dates that are on/after `anchor`, on/before `horizon`, and in
 * season.
 */
export function monthlyOccurrences(
  anchor: string,
  weekday: number,
  weekOfMonth: number,
  horizon: string,
): string[] {
  const out: string[] = [];
  if (horizon < anchor) return out;
  let y = yearOf(anchor);
  let m = Number(anchor.slice(5, 7));
  const horizonY = yearOf(horizon);
  const horizonM = Number(horizon.slice(5, 7));
  while (y < horizonY || (y === horizonY && m <= horizonM)) {
    const d = nthWeekdayOfMonth(y, m, weekday, weekOfMonth);
    if (d && d >= anchor && d <= horizon && inSeason(d)) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Generate all occurrence dates for dropping a template of `tier` on `anchor`,
 * up to `horizon`. daily/weekly → weekly on the anchor's weekday; monthly →
 * the anchor's nth-weekday slot each month; seasonal/projects → just the
 * anchor (one-off, not season-clamped, so off-season project days are allowed).
 */
export function occurrencesFor(
  anchor: string,
  tier: TaskFrequency,
  horizon: string,
): string[] {
  switch (tier) {
    case "daily":
    case "weekly":
      // The in-season filter inside weeklyOccurrences skips any off-season
      // weeks — including a drop made during the off-season — so the anchor's
      // weekday is preserved and the series simply begins the next season.
      return weeklyOccurrences(anchor, horizon);
    case "monthly":
      return monthlyOccurrences(anchor, weekdayOf(anchor), weekOfMonthOf(anchor), horizon);
    case "seasonal":
    case "projects":
    default:
      return [anchor];
  }
}

/** Default materialization horizon for a fresh drop on `anchor`. */
export function defaultHorizon(anchor: string): string {
  return addDaysLocal(anchor, DEFAULT_HORIZON_DAYS);
}
