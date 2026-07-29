/**
 * Paid-hours maths for the schedule. Pure, deterministic, no network.
 *
 * Staff are not paid for lunch, so every hour shown anywhere in the app is a
 * PAID hour: a shift longer than the threshold has the unpaid lunch deducted.
 * Mike 06:00–14:30 is 8h30 on site and reads as 8 hours, which is what he is
 * paid for and what the GM is budgeting against.
 *
 * The running totals are week-to-date on purpose. Seeing "16" next to Mike on
 * Monday answers "how much has he had this week so far", which is the question
 * being asked while filling the rest of the week.
 */
import {
  DEFAULT_SCHEDULE_SETTINGS,
  type ProShopShift,
  type ScheduleSettings,
} from "./types";

type Settings = Pick<ScheduleSettings, "lunch_threshold_minutes" | "lunch_minutes">;

/** "14:30" or "14:30:00" → minutes since midnight. */
export function minutesOfDay(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":");
  return (parseInt(h ?? "0", 10) || 0) * 60 + (parseInt(m ?? "0", 10) || 0);
}

/** minutes since midnight → "14:30". */
export function timeFromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Time actually on site, before the lunch deduction. */
export function elapsedMinutes(start: string, end: string): number {
  return Math.max(0, minutesOfDay(end) - minutesOfDay(start));
}

/**
 * Paid minutes for one shift: time on site, less the unpaid lunch once the
 * shift runs past the threshold. A shift exactly AT the threshold keeps every
 * minute — the deduction starts above it, which is what "more than 6 hours"
 * means.
 */
export function paidMinutes(
  start: string,
  end: string,
  settings: Settings = DEFAULT_SCHEDULE_SETTINGS,
): number {
  const elapsed = elapsedMinutes(start, end);
  if (elapsed <= settings.lunch_threshold_minutes) return elapsed;
  return Math.max(0, elapsed - settings.lunch_minutes);
}

/** Paid hours for one shift, as a number (8, 7.5, 6.25). */
export function paidHours(
  start: string,
  end: string,
  settings: Settings = DEFAULT_SCHEDULE_SETTINGS,
): number {
  return paidMinutes(start, end, settings) / 60;
}

/**
 * Hours for display: trimmed to at most two decimals, no trailing zeros.
 * 480 → "8", 450 → "7.5", 435 → "7.25".
 */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return String(Math.round(hours * 100) / 100);
}

/** The Sunday that starts the week containing `date` (YYYY-MM-DD, local). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  const value = new Date(y, (m || 1) - 1, d || 1);
  value.setDate(value.getDate() - value.getDay());
  const yy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export interface StaffHoursTotals {
  /** Paid minutes per person for the whole loaded period. */
  totalByStaff: Map<string, number>;
  /**
   * Week-to-date paid minutes, keyed `${staffId}|${date}`: everything that
   * person works from the Sunday of that week through that date inclusive.
   */
  runningByStaffDate: Map<string, number>;
  /** Paid minutes for a single person on a single date, same key shape. */
  dayByStaffDate: Map<string, number>;
}

export function staffDayKey(staffId: string, date: string): string {
  return `${staffId}|${date}`;
}

/**
 * One pass over the month's shifts producing every hours figure the grid
 * needs. Computed together because the running total is just the day totals
 * accumulated in date order, and doing it per-cell would be quadratic.
 */
export function computeStaffHours(
  shifts: ProShopShift[],
  settings: Settings = DEFAULT_SCHEDULE_SETTINGS,
): StaffHoursTotals {
  const totalByStaff = new Map<string, number>();
  const dayByStaffDate = new Map<string, number>();
  const runningByStaffDate = new Map<string, number>();

  for (const shift of shifts) {
    const minutes = paidMinutes(shift.start_time, shift.end_time, settings);
    const key = staffDayKey(shift.staff_id, shift.shift_date);
    dayByStaffDate.set(key, (dayByStaffDate.get(key) ?? 0) + minutes);
    totalByStaff.set(shift.staff_id, (totalByStaff.get(shift.staff_id) ?? 0) + minutes);
  }

  // Accumulate each person's days in calendar order, resetting every Sunday.
  const byStaff = new Map<string, string[]>();
  for (const key of dayByStaffDate.keys()) {
    const [staffId, date] = key.split("|");
    byStaff.set(staffId, [...(byStaff.get(staffId) ?? []), date]);
  }
  for (const [staffId, dates] of byStaff) {
    let currentWeek = "";
    let running = 0;
    for (const date of [...dates].sort()) {
      const week = weekStart(date);
      if (week !== currentWeek) {
        currentWeek = week;
        running = 0;
      }
      running += dayByStaffDate.get(staffDayKey(staffId, date)) ?? 0;
      runningByStaffDate.set(staffDayKey(staffId, date), running);
    }
  }

  return { totalByStaff, runningByStaffDate, dayByStaffDate };
}
