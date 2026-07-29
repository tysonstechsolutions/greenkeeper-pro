/**
 * Coverage-driven schedule generation. Pure, deterministic, no AI, no network.
 *
 * The old generator stamped each person's standing weekly pattern across the
 * month and accepted whatever that added up to — days with one rec aid, days
 * with five, and holes in the middle of the afternoon. This one starts from
 * what the day REQUIRES and fills it:
 *
 *   base_staff people split open..close back-to-back, so the window is covered
 *   end to end with no gap by construction — shift N ends at the exact minute
 *   shift N+1 begins. extra_staff more come in at extra_start and work to
 *   close, which is the Thu–Sun afternoon rec aid.
 *
 * What it will not do is invent staff. If nobody is available for a slot the
 * slot comes back UNFILLED so the GM sees a real hole to solve, rather than the
 * schedule quietly booking someone who told him they can't work Tuesdays.
 */
import { minutesOfDay, paidMinutes, timeFromMinutes } from "./hours";
import { datesInMonth, isOff, parseYmd, weekdayKeyForDate } from "./dates";
import {
  AREA_GROUPS,
  DEFAULT_SCHEDULE_SETTINGS,
  positionGroup,
  type CoverageRule,
  type ProShopShift,
  type ProShopStaff,
  type ProShopTimeOff,
  type ScheduleArea,
  type ScheduleSettings,
  type ShiftGroup,
} from "./types";

/** One shift the day needs somebody in. */
export interface CoverageSlot {
  group: ShiftGroup;
  start: string;
  end: string;
  /** "base" splits the open..close window; "extra" is added cover on top. */
  kind: "base" | "extra";
}

export interface PlannedCoverageShift {
  staff_id: string;
  shift_date: string;
  group: ShiftGroup;
  start_time: string;
  end_time: string;
  source: "template";
}

/** A slot no available person could take. Surfaced, never silently dropped. */
export interface UnfilledSlot extends CoverageSlot {
  date: string;
  reason: string;
}

export interface CoveragePlan {
  shifts: PlannedCoverageShift[];
  unfilled: UnfilledSlot[];
}

/** Round to the nearest half hour — schedules are written in :00 and :30. */
function roundToHalfHour(minutes: number): number {
  return Math.round(minutes / 30) * 30;
}

/**
 * The shifts one weekday needs.
 *
 * Split points are rounded to the half hour so the printed schedule reads
 * 05:30–13:00 rather than 05:30–12:45, but the ends are pinned to the real
 * open and close and each segment starts exactly where the previous ended —
 * rounding can shift a boundary, never open a gap.
 */
export function planDaySlots(rule: CoverageRule): CoverageSlot[] {
  const open = minutesOfDay(rule.open_time);
  const close = minutesOfDay(rule.close_time);
  const slots: CoverageSlot[] = [];
  if (close <= open) return slots;

  const base = Math.max(0, rule.base_staff);
  if (base > 0) {
    const boundaries: number[] = [open];
    for (let i = 1; i < base; i++) {
      const raw = open + ((close - open) * i) / base;
      // Keep boundaries strictly inside the window and strictly increasing, so
      // a coarse rounding can never produce a zero-length or negative segment.
      const rounded = Math.min(close, Math.max(open, roundToHalfHour(raw)));
      boundaries.push(Math.max(rounded, boundaries[i - 1]));
    }
    boundaries.push(close);
    for (let i = 0; i < base; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      if (end <= start) continue; // collapsed by rounding — fewer, longer shifts
      slots.push({
        group: rule.group,
        start: timeFromMinutes(start),
        end: timeFromMinutes(end),
        kind: "base",
      });
    }
  }

  const extra = Math.max(0, rule.extra_staff);
  if (extra > 0 && rule.extra_start) {
    const start = minutesOfDay(rule.extra_start);
    if (start < close) {
      for (let i = 0; i < extra; i++) {
        slots.push({
          group: rule.group,
          start: timeFromMinutes(start),
          end: timeFromMinutes(close),
          kind: "extra",
        });
      }
    }
  }

  return slots;
}

/** True when the person's standing pattern leaves that weekday open. */
function availableOnWeekday(person: ProShopStaff, date: string): boolean {
  const weekly = person.availability?.weekly;
  // No pattern recorded at all (a new hire) means nothing is ruled out yet.
  if (!weekly) return true;
  const day = weekly[weekdayKeyForDate(parseYmd(date))];
  // A weekday the pattern never mentions is likewise not a refusal.
  if (!day) return true;
  return day.works !== false;
}

/**
 * Can this person work this group? Their own group always; the other group
 * only when the GM has ticked them as able to cover it. That tick is the
 * `flex` flag — it exists so a rec aid covering golf ops is a decision the GM
 * made, not something the generator assumed.
 */
function eligibleForGroup(person: ProShopStaff, group: ShiftGroup): boolean {
  if (positionGroup(person.position) === group) return true;
  return person.flex === true;
}

function isNative(person: ProShopStaff, group: ShiftGroup): boolean {
  return positionGroup(person.position) === group;
}

export interface GenerateCoverageInput {
  staff: ProShopStaff[];
  year: number;
  /** 0-based, matching Date. */
  month0: number;
  timeOff: ProShopTimeOff[];
  rules: CoverageRule[];
  settings?: Pick<ScheduleSettings, "lunch_threshold_minutes" | "lunch_minutes">;
  /** Shifts the GM pinned. They hold their slot and their person's day. */
  lockedShifts?: ProShopShift[];
  area: ScheduleArea;
}

/**
 * Fill every day of the month against the coverage rules.
 *
 * Assignment order per slot, most important first:
 *   1. someone whose own position owns the group, before borrowing anyone
 *   2. fewest paid minutes booked so far that week — spreads the hours
 *   3. sort_order, then id, so the same inputs always produce the same month
 */
export function generateCoverageMonth(input: GenerateCoverageInput): CoveragePlan {
  const {
    staff, year, month0, timeOff, rules, area,
    settings = DEFAULT_SCHEDULE_SETTINGS,
    lockedShifts = [],
  } = input;

  const shifts: PlannedCoverageShift[] = [];
  const unfilled: UnfilledSlot[] = [];

  const roster = staff.filter(
    (person) => person.is_active && (person.area ?? "pro_shop") === area,
  );
  const ruleFor = new Map<string, CoverageRule>();
  for (const rule of rules) {
    if (rule.area !== area) continue;
    ruleFor.set(`${rule.weekday}|${rule.group}`, rule);
  }

  // Paid minutes booked so far, tracked two ways so the fairness sort is fair
  // in both directions: per week, so no one week lands on one person; and
  // across the whole month, because the weekly figure resets every Sunday and
  // without the month tiebreak the same low-sort_order names would win every
  // Sunday and drift steadily ahead over four weeks.
  const weekMinutes = new Map<string, number>();
  const totalMinutes = new Map<string, number>();
  const bookedOnDate = new Map<string, Set<string>>();
  const bump = (staffId: string, week: string, minutes: number) => {
    const key = `${staffId}|${week}`;
    weekMinutes.set(key, (weekMinutes.get(key) ?? 0) + minutes);
    totalMinutes.set(staffId, (totalMinutes.get(staffId) ?? 0) + minutes);
  };

  // Locked shifts are already real: they consume their person's day and count
  // toward that person's hours before anything else is placed. Counted up
  // front, once each, so the fairness sort knows about a pinned Saturday while
  // it is still filling that Monday.
  const lockedByDateGroup = new Map<string, ProShopShift[]>();
  for (const shift of lockedShifts) {
    const list = lockedByDateGroup.get(`${shift.shift_date}|${shift.group}`) ?? [];
    list.push(shift);
    lockedByDateGroup.set(`${shift.shift_date}|${shift.group}`, list);
    const booked = bookedOnDate.get(shift.shift_date) ?? new Set<string>();
    booked.add(shift.staff_id);
    bookedOnDate.set(shift.shift_date, booked);
    bump(
      shift.staff_id,
      weekStartOf(shift.shift_date),
      paidMinutes(shift.start_time, shift.end_time, settings),
    );
  }

  for (const date of datesInMonth(year, month0)) {
    const weekday = parseYmd(date).getDay();
    const week = weekStartOf(date);

    for (const group of AREA_GROUPS[area]) {
      const rule = ruleFor.get(`${weekday}|${group}`);
      if (!rule) continue;

      const locked = lockedByDateGroup.get(`${date}|${group}`) ?? [];

      // A locked shift stands in for one slot of its kind, so pinning a shift
      // reduces what still needs filling rather than adding on top of it.
      const slots = planDaySlots(rule);
      const remaining = slots.slice(Math.min(locked.length, slots.length));

      for (const slot of remaining) {
        const booked = bookedOnDate.get(date) ?? new Set<string>();
        const candidates = roster.filter((person) => {
          if (booked.has(person.id)) return false;
          if (person.employed_through && date > person.employed_through) return false;
          if (isOff(person.id, date, timeOff)) return false;
          if (!availableOnWeekday(person, date)) return false;
          return eligibleForGroup(person, slot.group);
        });

        if (candidates.length === 0) {
          unfilled.push({
            ...slot,
            date,
            reason: "Nobody is available and cleared for this shift",
          });
          continue;
        }

        candidates.sort((a, b) => {
          const nativeDiff = Number(isNative(b, slot.group)) - Number(isNative(a, slot.group));
          if (nativeDiff !== 0) return nativeDiff;
          const aWeek = weekMinutes.get(`${a.id}|${week}`) ?? 0;
          const bWeek = weekMinutes.get(`${b.id}|${week}`) ?? 0;
          if (aWeek !== bWeek) return aWeek - bWeek;
          const aTotal = totalMinutes.get(a.id) ?? 0;
          const bTotal = totalMinutes.get(b.id) ?? 0;
          if (aTotal !== bTotal) return aTotal - bTotal;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.id.localeCompare(b.id);
        });

        const chosen = candidates[0];
        shifts.push({
          staff_id: chosen.id,
          shift_date: date,
          group: slot.group,
          start_time: slot.start,
          end_time: slot.end,
          source: "template",
        });
        booked.add(chosen.id);
        bookedOnDate.set(date, booked);
        bump(chosen.id, week, paidMinutes(slot.start, slot.end, settings));
      }
    }
  }

  return { shifts, unfilled };
}

/** Local Sunday-start week key. Kept here to avoid a cycle with hours.ts. */
function weekStartOf(date: string): string {
  const value = parseYmd(date);
  value.setDate(value.getDate() - value.getDay());
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Where the day is actually uncovered, as [start,end) minute ranges per group.
 * Derived from the shifts themselves rather than from the rules, so it stays
 * honest after the GM drags something around by hand.
 */
export function coverageGaps(
  shiftsForDay: { group: ShiftGroup; start_time: string; end_time: string }[],
  rule: Pick<CoverageRule, "open_time" | "close_time" | "group">,
): Array<{ start: string; end: string }> {
  const open = minutesOfDay(rule.open_time);
  const close = minutesOfDay(rule.close_time);
  const spans = shiftsForDay
    .filter((s) => s.group === rule.group)
    .map((s) => ({ start: minutesOfDay(s.start_time), end: minutesOfDay(s.end_time) }))
    .sort((a, b) => a.start - b.start);

  const gaps: Array<{ start: string; end: string }> = [];
  let cursor = open;
  for (const span of spans) {
    if (span.end <= cursor) continue;
    if (span.start > cursor) {
      gaps.push({ start: timeFromMinutes(cursor), end: timeFromMinutes(Math.min(span.start, close)) });
    }
    cursor = Math.max(cursor, span.end);
    if (cursor >= close) break;
  }
  if (cursor < close) gaps.push({ start: timeFromMinutes(cursor), end: timeFromMinutes(close) });
  return gaps.filter((gap) => gap.start < gap.end);
}
