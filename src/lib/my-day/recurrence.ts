/**
 * My Day — recurrence math (pure, no I/O).
 *
 * A recurring task advances its DEADLINE by one interval each period. Monthly /
 * quarterly / yearly are "end-of-month aware": if the deadline is the last day
 * of its month, the next deadline snaps to the last day of the target month, so
 * "due by the end of the month" stays end-of-month even as month lengths differ
 * (Jul 31 -> Aug 31 -> Sep 30). Day-of-month otherwise carries over, clamped to
 * the target month's length (date-fns addMonths already clamps).
 *
 * Dates are YYYY-MM-DD strings, parsed at local noon to dodge DST edges.
 */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  lastDayOfMonth,
  isLastDayOfMonth,
} from "date-fns";
import { formatLocalDate } from "@/lib/utils/date";

export type RecurrenceFrequency =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export const RECURRENCE_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "none", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export function recurrenceLabel(freq: RecurrenceFrequency): string {
  return RECURRENCE_OPTIONS.find((o) => o.value === freq)?.label ?? "One-time";
}

export function isRecurring(freq: RecurrenceFrequency | null | undefined): boolean {
  return !!freq && freq !== "none";
}

function parse(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

/**
 * Advance a deadline by exactly one interval of `freq`. Returns YYYY-MM-DD.
 * 'none' returns the input unchanged.
 */
export function advanceDeadline(dateStr: string, freq: RecurrenceFrequency): string {
  const d = parse(dateStr);
  let next: Date;
  switch (freq) {
    case "daily":
      next = addDays(d, 1);
      break;
    case "weekly":
      next = addWeeks(d, 1);
      break;
    case "monthly":
      next = addMonths(d, 1);
      break;
    case "quarterly":
      next = addMonths(d, 3);
      break;
    case "yearly":
      next = addYears(d, 1);
      break;
    case "none":
    default:
      return dateStr;
  }
  // Preserve "end of month" intent for month-based cadences.
  if ((freq === "monthly" || freq === "quarterly" || freq === "yearly") && isLastDayOfMonth(d)) {
    next = lastDayOfMonth(next);
  }
  return formatLocalDate(next);
}

/**
 * The next deadline strictly after `lastDeadline`, skipping any fully-missed
 * periods so the result is the first occurrence on or after `today` (never a
 * backfill of every gap). Always at least one interval past `lastDeadline`.
 */
export function nextDeadline(
  lastDeadline: string,
  freq: RecurrenceFrequency,
  today: string,
): string {
  if (!isRecurring(freq)) return lastDeadline;
  let d = advanceDeadline(lastDeadline, freq);
  // Safety bound: even daily over ~11 years can't exceed this many hops.
  let guard = 0;
  while (d < today && guard < 4000) {
    d = advanceDeadline(d, freq);
    guard += 1;
  }
  return d;
}

/** A new occurrence is due once today has passed the last deadline. */
export function needsRollover(lastDeadline: string, today: string): boolean {
  return today > lastDeadline;
}
