/**
 * Pro Shop scheduling engine — pure, deterministic helpers. No AI, no network.
 *
 * The schedule is "mostly consistent through the season": each person carries a
 * standing weekly pattern. Generating a month = stamping every active person's
 * pattern across the dates, skipping their time-off. This file is the single
 * source of truth for that expansion plus display/coverage helpers, so the same
 * logic backs both the UI preview and the saved shifts.
 */
import {
  WEEKDAY_KEYS,
  type DayPattern,
  type DayWarning,
  type ProShopStaff,
  type ProShopTimeOff,
  type ScheduleArea,
  type ShiftGroup,
  type WarningCode,
  type WeekdayKey,
} from "./types";

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

/** "14:00" or "14:00:00" → "1400" (the PDF's compact 24h form). */
export function compactTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${(h ?? "").padStart(2, "0")}${(m ?? "00").padStart(2, "0")}`;
}

/** "14:00:00" → "14:00" for form inputs / comparisons. */
export function hhmm(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
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

export interface PlannedShift {
  staff_id: string;
  shift_date: string;
  group: ShiftGroup;
  start_time: string; // "HH:MM"
  end_time: string;
  source: "template";
}

/**
 * Stamp every active person's weekly pattern across the month, skipping any
 * date covered by their time-off or falling after their last working day.
 * Returns the planned shifts (not yet saved).
 */
export function expandMonth(
  staff: ProShopStaff[],
  year: number,
  month0: number,
  timeOff: ProShopTimeOff[],
): PlannedShift[] {
  const out: PlannedShift[] = [];
  const dates = datesInMonth(year, month0);
  for (const person of staff) {
    if (!person.is_active) continue;
    const weekly = person.availability?.weekly;
    if (!weekly) continue;
    for (const date of dates) {
      // Nobody is scheduled past their last working day. Dates are ISO
      // yyyy-mm-dd, so a string compare is the correct calendar compare.
      if (person.employed_through && date > person.employed_through) continue;
      const key = weekdayKeyForDate(parseYmd(date));
      const pat: DayPattern | undefined = weekly[key];
      if (!pat?.works || !pat.start || !pat.end) continue;
      if (isOff(person.id, date, timeOff)) continue;
      out.push({
        staff_id: person.id,
        shift_date: date,
        group: pat.group ?? person.default_group,
        start_time: pat.start,
        end_time: pat.end,
        source: "template",
      });
    }
  }
  return out;
}

/**
 * Coverage warnings for a single day, as structured {code, message}. Light on
 * purpose — flags what actually leaves the shop short: an empty group, or no
 * early opener / late closer. Each code is stable so a warning can be dismissed.
 */
export function dayWarnings(
  shiftsForDay: { group: ShiftGroup; start_time: string; end_time: string }[],
  area: ScheduleArea = "pro_shop",
): DayWarning[] {
  const warnings: DayWarning[] = [];
  const add = (code: WarningCode, message: string) => warnings.push({ code, message });

  // The maintenance crew's day has no counter to staff and no closing shift —
  // the pro-shop opener/closer rules would fire on every single day and train
  // the GM to ignore warnings. Only flag a day with nobody on it.
  if (area === "maintenance") {
    if (shiftsForDay.length === 0) add("no_crew", "No maintenance crew scheduled");
    return warnings;
  }

  const inside = shiftsForDay.filter((s) => s.group === "inside");
  const outside = shiftsForDay.filter((s) => s.group === "outside");

  if (outside.length === 0) add("no_outside", "No outside staff (rec aids) scheduled");
  if (inside.length === 0) add("no_inside", "No inside staff (golf ops) scheduled");
  // "Opener" = someone starting at or before 07:00 inside.
  const hasOpener = inside.some((s) => hhmm(s.start_time) <= "07:00");
  if (inside.length > 0 && !hasOpener) add("no_inside_opener", "No early inside opener (no one starts by 07:00)");
  // "Closer" = someone working until 19:00+ in each active group.
  const insideCloses = inside.some((s) => hhmm(s.end_time) >= "19:00");
  const outsideCloses = outside.some((s) => hhmm(s.end_time) >= "19:00");
  if (inside.length > 0 && !insideCloses) add("no_inside_closer", "No inside closer (no one works to 19:00)");
  if (outside.length > 0 && !outsideCloses) add("no_outside_closer", "No outside closer (no one works to 19:00)");
  return warnings;
}

/** Drop any warnings whose code the user has dismissed for that day. */
export function activeWarnings(
  warnings: DayWarning[],
  dismissedCodes: WarningCode[] | undefined,
): DayWarning[] {
  if (!dismissedCodes || dismissedCodes.length === 0) return warnings;
  const dismissed = new Set(dismissedCodes);
  return warnings.filter((w) => !dismissed.has(w.code));
}

/** Short human label, e.g. "Mon Jun 1". */
export function shortDate(date: string): string {
  const d = parseYmd(date);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Summarize a weekly pattern as a one-line string for the staff list. */
export function summarizeWeekly(staff: ProShopStaff): string {
  const weekly = staff.availability?.weekly;
  if (!weekly) return "No availability set";
  const order: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const labels: Record<WeekdayKey, string> = {
    sun: "Sun",
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
  };
  const parts = order
    .filter((k) => weekly[k]?.works)
    .map((k) => `${labels[k]} ${compactTime(weekly[k]?.start)}-${compactTime(weekly[k]?.end)}`);
  return parts.length ? parts.join(" · ") : "No days set";
}
