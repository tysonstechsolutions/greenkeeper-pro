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
import { effectiveRulesForDay, isDayLocked, type DayOverrides } from "./day-overrides";
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

/**
 * The window a person is actually free on a date, in minutes since midnight,
 * or null when they are not available at all.
 *
 * The hours matter as much as the day: someone available Sunday 13:00–20:00
 * must not be handed the 08:00–14:00 shift. A weekday with no pattern, or a
 * pattern with no times, means nothing is ruled out yet (a new hire), so the
 * whole day is open.
 */
function availableWindow(
  person: ProShopStaff,
  date: string,
): { start: number; end: number } | null {
  const weekly = person.availability?.weekly;
  const whole = { start: 0, end: 24 * 60 };
  if (!weekly) return whole;
  const day = weekly[weekdayKeyForDate(parseYmd(date))];
  if (!day) return whole;
  if (day.works === false) return null;
  if (!day.start || !day.end) return whole;
  const start = minutesOfDay(day.start);
  const end = minutesOfDay(day.end);
  return end > start ? { start, end } : whole;
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
  settings?: Pick<
    ScheduleSettings,
    "lunch_threshold_minutes" | "lunch_minutes" | "max_shift_hours"
  >;
  /** Shifts the GM pinned. They hold their slot and their person's day. */
  lockedShifts?: ProShopShift[];
  area: ScheduleArea;
  /** Per-day exceptions to the rules: headcounts, and days locked as-is. */
  overrides?: DayOverrides;
  /**
   * Rebuild only these dates. Omitted, the whole month is rebuilt — which is
   * what Regenerate has always done. Locked days are dropped from whatever
   * this resolves to, so they are never rebuilt by either route.
   */
  dates?: string[];
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
    overrides = {},
    dates,
  } = input;

  const shifts: PlannedCoverageShift[] = [];
  const unfilled: UnfilledSlot[] = [];
  const maxShift = Math.max(60, (settings.max_shift_hours ?? 9) * 60);

  const roster = staff.filter(
    (person) => person.is_active && (person.area ?? "pro_shop") === area,
  );
  const areaRules = rules.filter((rule) => rule.area === area);

  // The days this run will actually build. A locked day is a decision already
  // made — it drops out here, once, so no later step has to remember it.
  const monthDates = datesInMonth(year, month0);
  const inScope = dates ? new Set(dates) : null;
  const buildDates = monthDates.filter(
    (date) => (!inScope || inScope.has(date)) && !isDayLocked(date, overrides),
  );

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

  for (const date of buildDates) {
    const week = weekStartOf(date);
    // What THIS date needs — the weekday rule, with any per-day override
    // applied. Resolved in one place so the generator, the open-shift lines and
    // the printout can never disagree about a day's headcount.
    const rulesToday = new Map<ShiftGroup, CoverageRule>();
    for (const rule of effectiveRulesForDay(date, areaRules, overrides)) {
      rulesToday.set(rule.group, rule);
    }

    for (const group of AREA_GROUPS[area]) {
      const rule = rulesToday.get(group);
      if (!rule) continue;
      // Set to nobody today: place nobody, and report no hole for a stretch
      // the GM deliberately left unstaffed.
      if (rule.base_staff + rule.extra_staff <= 0) continue;

      /**
       * On an ordinary day base_staff is a MINIMUM: the walk covers open..close
       * whatever that takes, adding a fourth person if three people's hours
       * leave a hole, because a covered shop beats a tidy headcount.
       *
       * On a day the GM has explicitly set a number for, it is a MAXIMUM. He
       * said two people today; handing him three is ignoring him. Any stretch
       * that leaves uncovered shows up as an open shift and a coverage warning,
       * so the trade he made stays visible rather than being quietly undone.
       */
      const cappedByHand = !!overrides[date]?.groups?.[group];

      const locked = lockedByDateGroup.get(`${date}|${group}`) ?? [];
      const open = minutesOfDay(rule.open_time);
      const close = minutesOfDay(rule.close_time);

      /** Everyone who could take work in this group on this date. */
      const freeFor = (from: number) => {
        const booked = bookedOnDate.get(date) ?? new Set<string>();
        return roster
          .filter((person) => {
            if (booked.has(person.id)) return false;
            if (person.employed_through && date > person.employed_through) return false;
            if (isOff(person.id, date, timeOff)) return false;
            if (!eligibleForGroup(person, group)) return false;
            const window = availableWindow(person, date);
            // They must actually be free at the moment cover is needed.
            return !!window && window.start <= from && window.end > from;
          })
          .sort((a, b) => {
            const nativeDiff = Number(isNative(b, group)) - Number(isNative(a, group));
            if (nativeDiff !== 0) return nativeDiff;
            // Reach furthest into the uncovered stretch first — that is what
            // closes the day with the fewest people and the fewest seams.
            const aEnd = Math.min(availableWindow(a, date)!.end, close);
            const bEnd = Math.min(availableWindow(b, date)!.end, close);
            if (aEnd !== bEnd) return bEnd - aEnd;
            const aWeek = weekMinutes.get(`${a.id}|${week}`) ?? 0;
            const bWeek = weekMinutes.get(`${b.id}|${week}`) ?? 0;
            if (aWeek !== bWeek) return aWeek - bWeek;
            const aTotal = totalMinutes.get(a.id) ?? 0;
            const bTotal = totalMinutes.get(b.id) ?? 0;
            if (aTotal !== bTotal) return aTotal - bTotal;
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.id.localeCompare(b.id);
          });
      };

      const place = (person: ProShopStaff, from: number, to: number) => {
        const start = timeFromMinutes(from);
        const end = timeFromMinutes(to);
        shifts.push({
          staff_id: person.id, shift_date: date, group,
          start_time: start, end_time: end, source: "template",
        });
        const booked = bookedOnDate.get(date) ?? new Set<string>();
        booked.add(person.id);
        bookedOnDate.set(date, booked);
        bump(person.id, week, paidMinutes(start, end, settings));
      };

      // ── Base cover: walk open → close, handing each stretch to whoever is
      // actually free for it. Shifts are cut to the person's own hours, so a
      // 13:00–20:00 person is never given the 08:00 shift; consecutive shifts
      // still meet exactly, which is what keeps the day gap-free.
      const coveredUntil = new Map<number, number>();
      for (const shift of locked) {
        coveredUntil.set(minutesOfDay(shift.start_time), minutesOfDay(shift.end_time));
      }
      let cursor = open;
      let placed = locked.length;
      // Bounded: every pass either advances the cursor or breaks. Skipped
      // entirely when the day asks for no base cover — an extra-only day is
      // afternoon help on top of nothing, not a window to walk end to end.
      for (
        let guard = 0;
        guard < 24 && rule.base_staff > 0 && cursor < close
          && (!cappedByHand || placed < rule.base_staff);
        guard++
      ) {
        // A pinned shift already covering this moment carries the cursor on.
        let jumped = false;
        for (const [lockStart, lockEnd] of coveredUntil) {
          if (lockStart <= cursor && lockEnd > cursor) { cursor = lockEnd; jumped = true; break; }
        }
        if (jumped) continue;

        const candidates = freeFor(cursor);
        if (candidates.length === 0) {
          // Nobody can start now. Jump to the next moment somebody can, and
          // report the stretch in between as the hole it is.
          const nextStart = roster
            .map((person) => {
              const booked = bookedOnDate.get(date) ?? new Set<string>();
              if (booked.has(person.id)) return null;
              if (person.employed_through && date > person.employed_through) return null;
              if (isOff(person.id, date, timeOff)) return null;
              if (!eligibleForGroup(person, group)) return null;
              const window = availableWindow(person, date);
              return window && window.start > cursor && window.start < close ? window.start : null;
            })
            .filter((value): value is number => value !== null)
            .sort((a, b) => a - b)[0];
          const gapEnd = nextStart ?? close;
          unfilled.push({
            group, kind: "base", date,
            start: timeFromMinutes(cursor), end: timeFromMinutes(gapEnd),
            reason: "Nobody available for this stretch",
          });
          cursor = gapEnd;
          continue;
        }

        const chosen = candidates[0];
        const window = availableWindow(chosen, date)!;
        // Nobody works open-to-close on their own: a single shift is capped,
        // so a 14-hour window becomes two shifts rather than one brutal day.
        let end = Math.min(window.end, close, cursor + maxShift);

        // Aim for an even hand-over — the rest of the window split between the
        // people still to be placed — so a deep roster gets 08:00-14:00 and
        // 14:00-20:00 rather than one 9-hour shift and one 3-hour one.
        const stillNeeded = Math.max(1, rule.base_staff - placed);
        const evenEnd = Math.min(
          close,
          cursor + Math.max(30, roundToHalfHour((close - cursor) / stillNeeded)),
        );
        // Only hand over early if somebody can actually take it from there;
        // otherwise this person keeps going rather than opening a hole.
        if (end > evenEnd && freeFor(evenEnd).some((p) => p.id !== chosen.id)) {
          end = evenEnd;
        }

        place(chosen, cursor, end);
        placed += 1;
        cursor = end;
      }

      // ── Headcount top-up: the rule asks for a number of people, not just a
      // covered window. If the walk closed the day with fewer than that, add
      // whoever else is free, each within their own hours.
      for (let i = placed; i < rule.base_staff; i++) {
        const candidates = freeFor(open).filter((person) => {
          const window = availableWindow(person, date)!;
          return Math.min(window.end, close) - Math.max(window.start, open) >= 120;
        });
        if (candidates.length === 0) {
          // Covered but short-handed is still a problem worth naming — the
          // rule asks for a number of people, not only a covered window.
          unfilled.push({
            group, kind: "base", date,
            start: rule.open_time.slice(0, 5), end: rule.close_time.slice(0, 5),
            reason: `Only ${placed} of ${rule.base_staff} people available all day`,
          });
          break;
        }
        const chosen = candidates[0];
        const window = availableWindow(chosen, date)!;
        place(chosen, Math.max(window.start, open), Math.min(window.end, close));
        placed += 1;
      }

      // ── Extra cover layered on top, from extra_start to close.
      if (rule.extra_staff > 0 && rule.extra_start) {
        const extraStart = minutesOfDay(rule.extra_start);
        for (let i = 0; i < rule.extra_staff && extraStart < close; i++) {
          const candidates = freeFor(extraStart);
          if (candidates.length === 0) {
            unfilled.push({
              group, kind: "extra", date,
              start: timeFromMinutes(extraStart), end: timeFromMinutes(close),
              reason: "Nobody available for this extra shift",
            });
            continue;
          }
          const chosen = candidates[0];
          const window = availableWindow(chosen, date)!;
          place(chosen, extraStart, Math.min(window.end, close));
        }
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

/** A shift the day still needs somebody in. */
export interface OpenSlot {
  group: ShiftGroup;
  start: string;
  end: string;
  /** "gap" leaves the window uncovered; "extra" is missing added cover. */
  kind: "gap" | "extra" | "short";
}

/**
 * The shifts a day is still missing, worked out from the rules against
 * whatever is actually scheduled.
 *
 * Derived rather than stored, so an unstaffed shift is visible on the screen
 * and on the printout at any time — not only in the moments after a rebuild.
 * These are what print as a time with a blank line beside it, for whoever
 * picks up the shift to write their name on.
 */
export function openSlotsForDay(
  shiftsForDay: { group: ShiftGroup; start_time: string; end_time: string }[],
  rulesForDay: Pick<
    CoverageRule,
    "group" | "open_time" | "close_time" | "base_staff" | "extra_staff" | "extra_start"
  >[],
): OpenSlot[] {
  const slots: OpenSlot[] = [];
  for (const rule of rulesForDay) {
    // A day set to need nobody in this group needs nobody: no blank lines, and
    // above all no "uncovered window", which would otherwise report the entire
    // open..close stretch as a hole on a day deliberately left unstaffed.
    if (rule.base_staff + rule.extra_staff <= 0) continue;
    const list = shiftsForDay.filter((s) => s.group === rule.group);
    const close = rule.close_time.slice(0, 5);

    // An uncovered stretch is the most urgent kind: the shop is unattended.
    for (const gap of coverageGaps(list, rule)) {
      slots.push({ group: rule.group, start: gap.start, end: gap.end, kind: "gap" });
    }

    // Then anyone missing on headcount beyond those gaps — a day can be
    // covered end to end and still be a person short.
    const wanted = rule.base_staff + rule.extra_staff;
    const shortfall = wanted - list.length - slots.filter((s) => s.group === rule.group).length;
    for (let i = 0; i < shortfall; i++) {
      slots.push(
        rule.extra_staff > 0 && rule.extra_start
          ? { group: rule.group, start: rule.extra_start.slice(0, 5), end: close, kind: "extra" }
          : { group: rule.group, start: rule.open_time.slice(0, 5), end: close, kind: "short" },
      );
    }
  }
  return slots;
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
