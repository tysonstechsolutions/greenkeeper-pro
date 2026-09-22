/**
 * The standard week — one Sun–Sat schedule per area that every week repeats.
 *
 * The coverage generator rebuilt each month day by day and rotated who worked
 * which day to even out the month's hours. The GM wants the opposite: the same
 * people on the same days every week, changed in one place. So the schedule
 * is now written down once, as slots ("Mike, golf ops, Monday 12:30–19:00"),
 * and each month is stamped from it. One-off changes stay on the day.
 *
 * Versions are dated. A version applies from its `effective_from` until the
 * next one starts, which is how "from Oct 12 on, Colin does Thursdays" leaves
 * the weeks before Oct 12 exactly as they were worked.
 *
 * Pure and deterministic — no network, no clock.
 */
import { datesInMonth, isOff, parseYmd, weekdayKeyForDate, ymd } from "./dates";
import { minutesOfDay, paidMinutes } from "./hours";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  SHIFT_GROUPS,
  WEEKDAY_KEYS,
  positionGroup,
  type CoverageRule,
  type DayOverrides,
  type ProShopStaff,
  type ProShopTimeOff,
  type ScheduleSettings,
  type ShiftGroup,
  type WeekHours,
  type WeekSlot,
  type WeekTemplate,
} from "./types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "7:00", "07:00:00" → "07:00". Null when it isn't a time at all. */
export function normTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const t = `${m[1].padStart(2, "0")}:${m[2]}`;
  return TIME_RE.test(t) ? t : null;
}

/** A fresh slot id. Only needs to be unique within an area's versions. */
export function newSlotId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Reading rows safely ─────────────────────────────────────────────────────
// Both columns are JSONB. Anything malformed is dropped rather than trusted:
// a bad slot must not be able to put a stranger on the schedule.

export function sanitizeSlots(raw: unknown): WeekSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: WeekSlot[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const id = typeof v.id === "string" && v.id ? v.id : null;
    const weekday = typeof v.weekday === "number" ? v.weekday : Number(v.weekday);
    const group = SHIFT_GROUPS.includes(v.group as ShiftGroup) ? (v.group as ShiftGroup) : null;
    const start = normTime(v.start);
    const end = normTime(v.end);
    if (!id || seen.has(id) || !group || !start || !end) continue;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (minutesOfDay(end) <= minutesOfDay(start)) continue;
    seen.add(id);
    out.push({
      id,
      weekday,
      group,
      staff_id: typeof v.staff_id === "string" && v.staff_id ? v.staff_id : null,
      start,
      end,
    });
  }
  return out;
}

export function sanitizeHours(raw: unknown): WeekHours {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: WeekHours = {};
  for (const [day, groups] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day) || !groups || typeof groups !== "object") continue;
    for (const [group, value] of Object.entries(groups as Record<string, unknown>)) {
      if (!SHIFT_GROUPS.includes(group as ShiftGroup) || !value || typeof value !== "object") continue;
      const open = normTime((value as { open?: unknown }).open);
      const close = normTime((value as { close?: unknown }).close);
      if (!open || !close || minutesOfDay(close) <= minutesOfDay(open)) continue;
      out[day] = { ...(out[day] ?? {}), [group]: { open, close } };
    }
  }
  return out;
}

export function sanitizeTemplate(row: unknown): WeekTemplate | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.area !== "string") return null;
  if (typeof r.effective_from !== "string" || !DATE_RE.test(r.effective_from.slice(0, 10))) return null;
  return {
    id: r.id,
    area: r.area as WeekTemplate["area"],
    effective_from: r.effective_from.slice(0, 10),
    slots: sanitizeSlots(r.slots),
    hours: sanitizeHours(r.hours),
  };
}

// ── Which version applies ───────────────────────────────────────────────────

/** The version in force on `date`: the latest one starting on or before it. */
export function versionFor(date: string, versions: WeekTemplate[]): WeekTemplate | null {
  let best: WeekTemplate | null = null;
  for (const v of versions) {
    if (v.effective_from <= date && (!best || v.effective_from > best.effective_from)) best = v;
  }
  return best;
}

/** The first version starting after `date`, if a later change is scheduled. */
export function nextVersionAfter(date: string, versions: WeekTemplate[]): WeekTemplate | null {
  let best: WeekTemplate | null = null;
  for (const v of versions) {
    if (v.effective_from > date && (!best || v.effective_from < best.effective_from)) best = v;
  }
  return best;
}

/** One weekday's slots, earliest first. */
export function slotsForWeekday(slots: WeekSlot[], weekday: number): WeekSlot[] {
  return slots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** The operating hours for one weekday and job in a version, if it sets them. */
export function hoursIn(
  version: WeekTemplate | null,
  weekday: number,
  group: ShiftGroup,
): { open: string; close: string } | null {
  return version?.hours[String(weekday)]?.[group] ?? null;
}

/** Coverage rules with a version's operating hours written over open/close. */
export function rulesWithHours<R extends Pick<CoverageRule, "weekday" | "group" | "open_time" | "close_time">>(
  rules: R[],
  version: WeekTemplate | null,
): R[] {
  if (!version) return rules;
  return rules.map((rule) => {
    const h = hoursIn(version, rule.weekday, rule.group);
    return h ? { ...rule, open_time: h.open, close_time: h.close } : rule;
  });
}

/** Operating hours as the coverage rules have them — the seed for a first version. */
export function hoursFromRules(rules: CoverageRule[]): WeekHours {
  const out: WeekHours = {};
  for (const rule of rules) {
    const open = normTime(rule.open_time);
    const close = normTime(rule.close_time);
    if (!open || !close) continue;
    const day = String(rule.weekday);
    out[day] = { ...(out[day] ?? {}), [rule.group]: { open, close } };
  }
  return out;
}

// ── Stamping a month ────────────────────────────────────────────────────────

export interface StampedShift {
  staff_id: string;
  shift_date: string;
  group: ShiftGroup;
  start_time: string;
  end_time: string;
  source: "template";
  slot_id: string;
}

export interface StampInput {
  dates: string[];
  versions: WeekTemplate[];
  staff: ProShopStaff[];
  timeOff: ProShopTimeOff[];
  /** Hand-placed shifts on these dates. They win over the standard week. */
  lockedShifts: { staff_id: string; shift_date: string; slot_id?: string | null }[];
  overrides: DayOverrides;
}

/**
 * The standard week written onto real dates.
 *
 * A slot is left off a date when: nobody holds it; it was removed from that
 * date by hand; a pinned shift on that date already IS that slot (a one-off
 * replacement) or already books that person; the person is off, stood down,
 * or past their last working day. Everything else goes on as written.
 */
export function stampFromWeek(input: StampInput): StampedShift[] {
  const { dates, versions, staff, timeOff, lockedShifts, overrides } = input;
  const byId = new Map(staff.map((s) => [s.id, s]));
  const out: StampedShift[] = [];
  for (const date of dates) {
    const version = versionFor(date, versions);
    if (!version) continue;
    const weekday = parseYmd(date).getDay();
    const removed = new Set(overrides[date]?.removed_slots ?? []);
    const locked = lockedShifts.filter((l) => l.shift_date === date);
    const booked = new Set<string>();
    for (const slot of slotsForWeekday(version.slots, weekday)) {
      if (!slot.staff_id || removed.has(slot.id)) continue;
      if (locked.some((l) => l.slot_id === slot.id || l.staff_id === slot.staff_id)) continue;
      const person = byId.get(slot.staff_id);
      if (!person || !person.is_active) continue;
      if (person.employed_through && date > person.employed_through) continue;
      if (isOff(person.id, date, timeOff)) continue;
      // A standard week that books one person twice on a day is a typo; the
      // first (earliest) slot wins rather than the person appearing twice.
      if (booked.has(person.id)) continue;
      booked.add(person.id);
      out.push({
        staff_id: person.id,
        shift_date: date,
        group: slot.group,
        start_time: slot.start,
        end_time: slot.end,
        source: "template",
        slot_id: slot.id,
      });
    }
  }
  return out;
}

/**
 * Standard-week slots with nobody on them on this date — the person is off,
 * or nobody holds the slot yet. For areas with no coverage rules (the
 * maintenance crew) this is the only way a missing shift shows at all.
 */
export function missingSlots(
  date: string,
  versions: WeekTemplate[],
  shiftsForDay: { staff_id: string; group: ShiftGroup; slot_id?: string | null }[],
  overrides: DayOverrides,
): WeekSlot[] {
  const version = versionFor(date, versions);
  if (!version) return [];
  const removed = new Set(overrides[date]?.removed_slots ?? []);
  return slotsForWeekday(version.slots, parseYmd(date).getDay()).filter((slot) => {
    if (removed.has(slot.id)) return false;
    if (shiftsForDay.some((s) => s.slot_id === slot.id)) return false;
    // A shift stamped before slots existed has no slot_id; the same person on
    // the same job that day is that slot.
    if (slot.staff_id && shiftsForDay.some((s) => s.staff_id === slot.staff_id && s.group === slot.group)) {
      return false;
    }
    return true;
  });
}

// ── Building a first standard week ──────────────────────────────────────────

/**
 * The week people have actually been working, read off real shifts.
 *
 * For each weekday, every distinct (job, start, end) window is counted across
 * the dates given. A window that happened on at least `minShare` of that
 * weekday's dates is kept, and goes to whoever worked it most often. Each
 * person gets at most one slot a day — their most frequent one.
 */
export function deriveWeekFromShifts(
  shifts: { staff_id: string; shift_date: string; group: ShiftGroup; start_time: string; end_time: string }[],
  dates: string[],
  minShare = 0.4,
): WeekSlot[] {
  const inRange = new Set(dates);
  const perWeekday = new Map<number, number>();
  for (const date of dates) {
    const wd = parseYmd(date).getDay();
    perWeekday.set(wd, (perWeekday.get(wd) ?? 0) + 1);
  }

  type Window = { weekday: number; group: ShiftGroup; start: string; end: string; people: Map<string, Set<string>> };
  const windows = new Map<string, Window>();
  for (const shift of shifts) {
    if (!inRange.has(shift.shift_date)) continue;
    const start = normTime(shift.start_time);
    const end = normTime(shift.end_time);
    if (!start || !end) continue;
    const weekday = parseYmd(shift.shift_date).getDay();
    const key = `${weekday}|${shift.group}|${start}|${end}`;
    const w = windows.get(key) ?? { weekday, group: shift.group, start, end, people: new Map() };
    const days = w.people.get(shift.staff_id) ?? new Set<string>();
    days.add(shift.shift_date);
    w.people.set(shift.staff_id, days);
    windows.set(key, w);
  }

  const dayCount = (w: Window) => new Set([...w.people.values()].flatMap((d) => [...d])).size;
  const ranked = [...windows.values()]
    .filter((w) => dayCount(w) / (perWeekday.get(w.weekday) ?? 1) >= minShare)
    .sort((a, b) => dayCount(b) - dayCount(a) || a.start.localeCompare(b.start));

  const slots: WeekSlot[] = [];
  const used = new Set<string>();
  for (const w of ranked) {
    const people = [...w.people.entries()].sort(
      (a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]),
    );
    const pick = people.find(([staffId]) => !used.has(`${w.weekday}|${staffId}`));
    if (!pick) continue; // the same person at slightly different times — keep the common one
    used.add(`${w.weekday}|${pick[0]}`);
    slots.push({ id: newSlotId(), weekday: w.weekday, group: w.group, staff_id: pick[0], start: w.start, end: w.end });
  }
  return slots.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

/** A standard week from everyone's standing weekly pattern (the maintenance crew's way). */
export function slotsFromPatterns(staff: ProShopStaff[]): WeekSlot[] {
  const out: WeekSlot[] = [];
  for (const person of staff) {
    if (!person.is_active) continue;
    const weekly = person.availability?.weekly;
    if (!weekly) continue;
    for (let weekday = 0; weekday < 7; weekday++) {
      const pat = weekly[WEEKDAY_KEYS[weekday]];
      const start = normTime(pat?.start);
      const end = normTime(pat?.end);
      if (!pat?.works || !start || !end || minutesOfDay(end) <= minutesOfDay(start)) continue;
      out.push({
        id: newSlotId(),
        weekday,
        group: pat.group ?? person.default_group,
        staff_id: person.id,
        start,
        end,
      });
    }
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

/** A week of planned shifts (any seven consecutive dates) folded into slots. */
export function slotsFromPlannedWeek(
  planned: { staff_id: string; shift_date: string; group: ShiftGroup; start_time: string; end_time: string }[],
): WeekSlot[] {
  return planned
    .map((p) => ({
      id: newSlotId(),
      weekday: parseYmd(p.shift_date).getDay(),
      group: p.group,
      staff_id: p.staff_id,
      start: normTime(p.start_time) ?? p.start_time,
      end: normTime(p.end_time) ?? p.end_time,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

/** The first Sunday-to-Saturday week wholly inside a month, as dates. */
export function firstFullWeek(year: number, month0: number): string[] {
  const dates = datesInMonth(year, month0);
  const sunday = dates.findIndex((d) => parseYmd(d).getDay() === 0);
  return dates.slice(sunday, sunday + 7);
}

// ── Editing ─────────────────────────────────────────────────────────────────

/**
 * When a day's opening or closing time moves, move the shifts that were
 * opening or closing with it. A shift that no longer makes sense (would end
 * before it starts) is left where it was for the GM to look at.
 */
export function moveHoursEdges(
  slots: WeekSlot[],
  weekday: number,
  group: ShiftGroup,
  before: { open: string; close: string },
  after: { open: string; close: string },
): WeekSlot[] {
  return slots.map((slot) => {
    if (slot.weekday !== weekday || slot.group !== group) return slot;
    const start = slot.start === before.open ? after.open : slot.start;
    const end = slot.end === before.close ? after.close : slot.end;
    if (minutesOfDay(end) <= minutesOfDay(start)) return slot;
    return start === slot.start && end === slot.end ? slot : { ...slot, start, end };
  });
}

/** Paid minutes per person across one standard week. */
export function weeklyPaidByStaff(
  slots: WeekSlot[],
  settings: Pick<ScheduleSettings, "lunch_threshold_minutes" | "lunch_minutes"> = DEFAULT_SCHEDULE_SETTINGS,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.staff_id) continue;
    out.set(slot.staff_id, (out.get(slot.staff_id) ?? 0) + paidMinutes(slot.start, slot.end, settings));
  }
  return out;
}

/** Weekdays on which the standard week books somebody twice. */
export function doubleBookings(slots: WeekSlot[]): Array<{ weekday: number; staff_id: string }> {
  const seen = new Set<string>();
  const out: Array<{ weekday: number; staff_id: string }> = [];
  for (const slot of slots) {
    if (!slot.staff_id) continue;
    const key = `${slot.weekday}|${slot.staff_id}`;
    if (seen.has(key)) {
      if (!out.some((d) => d.weekday === slot.weekday && d.staff_id === slot.staff_id)) {
        out.push({ weekday: slot.weekday, staff_id: slot.staff_id });
      }
    } else {
      seen.add(key);
    }
  }
  return out;
}

/** Sunday on or after `date` — the natural day for a weekly change to start. */
export function nextSunday(date: string): string {
  const d = parseYmd(date);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return ymd(d);
}

// ── Who can take a shift ────────────────────────────────────────────────────

export type CandidateFit = "available" | "partly" | "not-listed";

export interface Candidate {
  person: ProShopStaff;
  fit: CandidateFit;
  /** Their own job, as opposed to somebody cleared to cover it. */
  ownGroup: boolean;
  /** "Available 08:00–14:00", "Usually off Tuesdays" — for the menu line. */
  note: string;
}

/**
 * Everyone who could take a shift, best first: free for the whole of it by
 * their own availability, then partly, then not usually working that day.
 *
 * Left out entirely: the person being replaced, anyone stood down, past their
 * last day, off that day, already working that day, or not cleared for the
 * job. Those can't be picked by mistake from a menu.
 */
export function replacementCandidates(options: {
  date: string;
  group: ShiftGroup;
  start: string;
  end: string;
  staff: ProShopStaff[];
  shiftsOnDay: { staff_id: string }[];
  timeOff: ProShopTimeOff[];
  excludeStaffId?: string | null;
}): Candidate[] {
  const { date, group, start, end, staff, shiftsOnDay, timeOff, excludeStaffId } = options;
  const key = weekdayKeyForDate(parseYmd(date));
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  const rank: Record<CandidateFit, number> = { available: 0, partly: 1, "not-listed": 2 };
  const out: Candidate[] = [];
  for (const person of staff) {
    if (person.id === excludeStaffId || !person.is_active) continue;
    if (person.employed_through && date > person.employed_through) continue;
    if (isOff(person.id, date, timeOff)) continue;
    if (shiftsOnDay.some((sh) => sh.staff_id === person.id)) continue;
    const ownGroup = positionGroup(person.position) === group;
    if (!ownGroup && person.flex !== true) continue;
    const pat = person.availability?.weekly?.[key];
    const ps = minutesOfDay(pat?.start);
    const pe = minutesOfDay(pat?.end);
    let fit: CandidateFit = "not-listed";
    let note = `Usually off ${key[0].toUpperCase()}${key.slice(1)}s`;
    if (pat?.works && pat.start && pat.end) {
      note = `Available ${normTime(pat.start)}–${normTime(pat.end)}`;
      if (ps <= s && pe >= e) fit = "available";
      else if (ps < e && pe > s) fit = "partly";
    }
    out.push({ person, fit, ownGroup, note });
  }
  return out.sort(
    (a, b) =>
      rank[a.fit] - rank[b.fit]
      || Number(b.ownGroup) - Number(a.ownGroup)
      || a.person.full_name.localeCompare(b.person.full_name),
  );
}
