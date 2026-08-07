/**
 * Coverage-driven schedule generation. Pure, deterministic, no AI, no network.
 *
 * The day states what it REQUIRES — a window to cover and how many people —
 * and this fills it. What changed on 2026-08-07 is HOW the window is split.
 *
 * It used to be split back-to-back: two people on a 06:00–20:00 day got
 * 06:00–13:00 and 13:00–20:00, seven hours each. Nobody drives to the course
 * for a short day, so the split is now by LONGEST SHIFT instead:
 *
 *   every base shift is the same length — the cap, 8h30 on site — and the
 *   starts are spread evenly from open to close-minus-that. Two people on
 *   06:00–20:00 get 06:00–14:30 and 11:30–20:00: both full days, both the same
 *   length, overlapping over the busy middle instead of handing over.
 *
 * The window is still covered end to end, and still by construction: shifts
 * that overlap cannot leave a hole between them. What can leave a hole is a
 * window longer than the people times the cap, and that is reported.
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

/**
 * Shortest stretch worth handing anybody. Below this it is not a shift, it is
 * a drive — which is the whole reason the split changed.
 */
const MIN_SHIFT_MINUTES = 120;

/** Round to the nearest half hour — schedules are written in :00 and :30. */
function roundToHalfHour(minutes: number): number {
  return Math.round(minutes / 30) * 30;
}

type Window = { start: number; end: number };

/**
 * Spread `people` shifts of the longest allowed length across one contiguous
 * stretch, evenly.
 *
 * The first starts at `from`, the last ENDS at `to`, and the ones between are
 * spaced evenly and rounded to the half hour. When the stretch is shorter than
 * the cap everyone simply works all of it.
 *
 * Two people, 06:00–20:00, 8h30 cap → 06:00–14:30 and 11:30–20:00.
 */
export function spreadShifts(
  from: number,
  to: number,
  people: number,
  maxShiftMinutes: number,
): Window[] {
  const span = to - from;
  if (span <= 0 || people <= 0) return [];
  const length = Math.min(maxShiftMinutes, span);
  if (people === 1) return [{ start: from, end: from + length }];

  // How far the last start sits after the first. Zero when one shift already
  // covers the stretch — then everybody works the same full hours.
  const drift = span - length;
  const windows: Window[] = [];
  let previous = from;
  for (let i = 0; i < people; i++) {
    let start: number;
    if (i === 0) start = from;
    else if (i === people - 1) start = to - length; // pinned, so the day closes exactly
    else start = roundToHalfHour(from + (drift * i) / (people - 1));
    // Never step backwards, never start so late the shift runs past close.
    start = Math.min(Math.max(start, previous, from), to - length);
    windows.push({ start, end: start + length });
    previous = start;
  }
  return windows;
}

/** Where a set of spans leaves [from,to) uncovered, as minute ranges. */
function uncoveredWithin(from: number, to: number, spans: Window[]): Window[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const holes: Window[] = [];
  let cursor = from;
  for (const span of sorted) {
    if (span.end <= cursor) continue;
    if (span.start > cursor) holes.push({ start: cursor, end: Math.min(span.start, to) });
    cursor = Math.max(cursor, span.end);
    if (cursor >= to) break;
  }
  if (cursor < to) holes.push({ start: cursor, end: to });
  return holes.filter((hole) => hole.end > hole.start);
}

/**
 * The shifts one weekday needs, before anyone is put in them.
 *
 * Base shifts spread across the whole open..close window; extra cover is
 * layered on top from `extra_start` to close.
 */
export function planDaySlots(
  rule: CoverageRule,
  maxShiftMinutes: number = DEFAULT_SCHEDULE_SETTINGS.max_shift_minutes,
): CoverageSlot[] {
  const open = minutesOfDay(rule.open_time);
  const close = minutesOfDay(rule.close_time);
  const slots: CoverageSlot[] = [];
  if (close <= open) return slots;

  for (const window of spreadShifts(open, close, Math.max(0, rule.base_staff), maxShiftMinutes)) {
    slots.push({
      group: rule.group,
      start: timeFromMinutes(window.start),
      end: timeFromMinutes(window.end),
      kind: "base",
    });
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
function availableWindow(person: ProShopStaff, date: string): Window | null {
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
 * Can this person work this group? Their own group always; another group only
 * when the GM has ticked them as able to cover it. That tick is the `flex`
 * flag — it exists so a rec aid covering golf ops is a decision the GM made,
 * not something the generator assumed.
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
    "lunch_threshold_minutes" | "lunch_minutes" | "max_shift_minutes"
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
 * Assignment order per planned shift, most important first:
 *   1. someone whose own position owns the group, before borrowing anyone
 *   2. whoever can cover most of that shift — the person free 06:00–14:30 takes
 *      the opening shift, not the one who only starts at 13:00
 *   3. fewest paid minutes booked so far that week — spreads the hours
 *   4. sort_order, then id, so the same inputs always produce the same month
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
  const maxShift = Math.max(
    60,
    settings.max_shift_minutes ?? DEFAULT_SCHEDULE_SETTINGS.max_shift_minutes,
  );

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
       * On an ordinary day base_staff is a MINIMUM: the day is covered
       * open..close whatever that takes, adding a third person if two people's
       * hours leave a hole, because a covered shop beats a tidy headcount.
       *
       * On a day the GM has explicitly set a number for, it is a MAXIMUM. He
       * said two people today; handing him three is ignoring him. Any stretch
       * left uncovered shows up as an open shift and a coverage warning, so the
       * trade he made stays visible rather than being quietly undone.
       */
      const cappedByHand = !!overrides[date]?.groups?.[group];

      const locked = lockedByDateGroup.get(`${date}|${group}`) ?? [];
      const open = minutesOfDay(rule.open_time);
      const close = minutesOfDay(rule.close_time);
      if (close <= open) continue;

      /** Everyone who could take work in this group on this date. */
      const availableFor = (window: Window) => {
        const booked = bookedOnDate.get(date) ?? new Set<string>();
        return roster
          .map((person) => {
            if (booked.has(person.id)) return null;
            if (person.employed_through && date > person.employed_through) return null;
            if (isOff(person.id, date, timeOff)) return null;
            if (!eligibleForGroup(person, group)) return null;
            const free = availableWindow(person, date);
            if (!free) return null;
            // What they could actually work of this shift, inside their hours.
            const start = Math.max(window.start, free.start);
            const end = Math.min(window.end, free.end);
            const covers = end - start;
            if (covers < Math.min(MIN_SHIFT_MINUTES, window.end - window.start)) return null;
            return { person, start, end, covers };
          })
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
          .sort((a, b) => {
            const nativeDiff = Number(isNative(b.person, group)) - Number(isNative(a.person, group));
            if (nativeDiff !== 0) return nativeDiff;
            // Whoever can cover most of this shift takes it. That is what keeps
            // the day whole: the person free from open gets the opening shift,
            // rather than an afternoon person being cut back to fit it.
            if (a.covers !== b.covers) return b.covers - a.covers;
            const aWeek = weekMinutes.get(`${a.person.id}|${week}`) ?? 0;
            const bWeek = weekMinutes.get(`${b.person.id}|${week}`) ?? 0;
            if (aWeek !== bWeek) return aWeek - bWeek;
            const aTotal = totalMinutes.get(a.person.id) ?? 0;
            const bTotal = totalMinutes.get(b.person.id) ?? 0;
            if (aTotal !== bTotal) return aTotal - bTotal;
            if (a.person.sort_order !== b.person.sort_order) {
              return a.person.sort_order - b.person.sort_order;
            }
            return a.person.id.localeCompare(b.person.id);
          });
      };

      const placedSpans: Window[] = locked.map((shift) => ({
        start: minutesOfDay(shift.start_time),
        end: minutesOfDay(shift.end_time),
      }));
      let placedCount = locked.length;

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
        placedSpans.push({ start: from, end: to });
        placedCount += 1;
      };

      /** Fill one planned shift; returns false when nobody could take it. */
      const fill = (window: Window): boolean => {
        const candidates = availableFor(window);
        if (candidates.length === 0) return false;
        const best = candidates[0];
        place(best.person, best.start, best.end);
        return true;
      };

      // ── Base cover ────────────────────────────────────────────────────────
      // Plan the shifts the day wants, then put people in them. With nothing
      // pinned that is one even spread across open..close; with a pinned shift
      // in the way it is a spread across whatever that leaves uncovered.
      if (rule.base_staff > 0) {
        const stretches = locked.length > 0
          ? uncoveredWithin(open, close, placedSpans)
          : [{ start: open, end: close }];
        const wanted = Math.max(0, rule.base_staff - locked.length);

        // How many each stretch needs to be covered end to end. On an ordinary
        // day that is the floor; on a hand-set day the headcount is the ceiling
        // and a short stretch simply stays open.
        const needs = stretches.map((s) => Math.ceil((s.end - s.start) / maxShift));
        const totalNeeded = needs.reduce((sum, n) => sum + n, 0);
        let budget = cappedByHand ? Math.min(wanted, totalNeeded) : Math.max(wanted, totalNeeded);

        for (let i = 0; i < stretches.length && budget > 0; i++) {
          // Everything this stretch needs, plus a share of any headcount asked
          // for beyond the minimum — the longest stretch takes the surplus.
          const surplus = budget - needs.slice(i).reduce((sum, n) => sum + n, 0);
          const here = Math.min(budget, needs[i] + Math.max(0, i === 0 ? surplus : 0));
          for (const window of spreadShifts(stretches[i].start, stretches[i].end, here, maxShift)) {
            if (fill(window)) budget -= 1;
          }
        }
      }

      // ── Whatever the plan could not close ─────────────────────────────────
      // Derived from the shifts actually placed, not from the plan, so a person
      // cut back to their own hours shows up as the hole it leaves. On an
      // ordinary day one more pass tries to fill it; on a hand-set day the
      // ceiling holds and the hole is simply reported.
      for (let pass = 0; pass < 4; pass++) {
        const holes = uncoveredWithin(open, close, placedSpans);
        if (holes.length === 0) break;
        if (cappedByHand && placedCount >= rule.base_staff) break;
        let progressed = false;
        for (const hole of holes) {
          if (cappedByHand && placedCount >= rule.base_staff) break;
          const capped = { start: hole.start, end: Math.min(hole.end, hole.start + maxShift) };
          if (fill(capped)) progressed = true;
        }
        if (!progressed) break;
      }

      for (const hole of uncoveredWithin(open, close, placedSpans)) {
        unfilled.push({
          group, kind: "base", date,
          start: timeFromMinutes(hole.start), end: timeFromMinutes(hole.end),
          reason: "Nobody available for this stretch",
        });
      }

      // Covered but short-handed is still a problem worth naming — the rule
      // asks for a number of people, not only a covered window.
      if (!cappedByHand && placedCount < rule.base_staff) {
        unfilled.push({
          group, kind: "base", date,
          start: rule.open_time.slice(0, 5), end: rule.close_time.slice(0, 5),
          reason: `Only ${placedCount} of ${rule.base_staff} people available all day`,
        });
      }

      // ── Extra cover layered on top, from extra_start to close. ────────────
      if (rule.extra_staff > 0 && rule.extra_start) {
        const extraStart = minutesOfDay(rule.extra_start);
        for (let i = 0; i < rule.extra_staff && extraStart < close; i++) {
          const window = {
            start: extraStart,
            end: Math.min(close, extraStart + maxShift),
          };
          if (!fill(window)) {
            unfilled.push({
              group, kind: "extra", date,
              start: timeFromMinutes(window.start), end: timeFromMinutes(close),
              reason: "Nobody available for this extra shift",
            });
          }
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
    .map((s) => ({ start: minutesOfDay(s.start_time), end: minutesOfDay(s.end_time) }));

  return uncoveredWithin(open, close, spans).map((hole) => ({
    start: timeFromMinutes(hole.start),
    end: timeFromMinutes(hole.end),
  }));
}
