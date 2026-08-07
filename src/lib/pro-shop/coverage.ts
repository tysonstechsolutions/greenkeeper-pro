/**
 * Coverage-driven schedule generation. Pure, deterministic, no AI, no network.
 *
 * The day states what it REQUIRES — a window to cover — and this fills it with
 * THE HOURS PEOPLE ACTUALLY GAVE. There are no manufactured shift blocks: if
 * Marty told the GM he can do Mondays 12:30–20:00, that is his Monday. The
 * generator walks the window from open to close and hands each stretch to
 * whoever is genuinely free for it, cut to their own hours.
 *
 * Two rules shape the result:
 *
 *   1. Nobody works more than the cap (8h30 on site, 8h paid). Somebody whose
 *      availability is wider than that gets the cap, starting where cover is
 *      needed — not a token three-hour shift, and not an eleven-hour one.
 *
 *   2. Golf ops is a counter with one person behind it, so its shifts do not
 *      run alongside each other: the next assistant comes on half an hour
 *      before the last one leaves, to hand over, and that is the only overlap.
 *      Rec aids, grounds and the restaurant have no such limit — several
 *      people on at once is the normal state there, so they simply work the
 *      hours they said they could.
 *
 * What it will not do is invent staff. If nobody is available for a stretch it
 * comes back UNFILLED so the GM sees a real hole to solve, rather than the
 * schedule quietly booking someone who told him they can't work Tuesdays.
 */
import { minutesOfDay, paidMinutes, timeFromMinutes } from "./hours";
import { datesInMonth, isOff, parseYmd, weekdayKeyForDate } from "./dates";
import { effectiveRulesForDay, isDayLocked, type DayOverrides } from "./day-overrides";
import {
  AREA_GROUPS,
  DEFAULT_SCHEDULE_SETTINGS,
  GROUP_HANDOVER_MINUTES,
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
  /** "base" covers the open..close window; "extra" is added cover on top. */
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
 * Shortest stretch worth calling somebody in for. Preferred, not enforced: if
 * the only person who can cover a hole can only do an hour, an hour of cover
 * beats none — but they are picked last.
 */
const PREFERRED_MIN_MINUTES = 120;

type Window = { start: number; end: number };

/**
 * The shift one person would work if they took over at `cursor`.
 *
 * Their own hours decide the shape of it. The cap trims the end, the day's
 * open and close trim both, and a group with a handover limit pulls the start
 * no further back than that. Returns null when nothing usable is left.
 */
export function shiftFromAvailability(options: {
  /** The hours this person said they can work, in minutes since midnight. */
  free: Window;
  open: number;
  close: number;
  /** The moment cover is needed from. */
  cursor: number;
  /** Minutes this group may overlap; null means their hours decide. */
  handover: number | null;
  maxShiftMinutes: number;
}): Window | null {
  const { free, open, close, cursor, handover, maxShiftMinutes } = options;
  const earliest = Math.max(free.start, open);
  const latest = Math.min(free.end, close);

  const start = handover === null
    // No handover limit, so the only question is which part of their hours to
    // spend. As late as they can while still being on duty when cover is
    // needed — otherwise a fully-available person burns their whole day on
    // hours somebody else is already working, and the evening needs a third.
    ? Math.max(earliest, Math.min(cursor, latest - maxShiftMinutes))
    // A handover limit, so they come on a fixed half hour before the last
    // person leaves, or when their own hours start, whichever is later.
    : Math.max(earliest, cursor - handover);

  const end = Math.min(latest, start + maxShiftMinutes);
  // Nothing to offer if it would not be a shift, or would not carry the day
  // any further forward than it already is.
  return end > start && end > cursor ? { start, end } : null;
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
 * Whoever takes the next stretch is decided in this order:
 *   1. someone whose own position owns the group, before borrowing anyone
 *   2. whoever carries the day furthest forward from where cover runs out
 *   3. of those, whoever's own hours end soonest — spend the person with the
 *      tight availability now and keep the flexible one for the evening
 *   4. fewest paid minutes booked so far that week — spreads the hours
 *   5. sort_order, then id, so the same inputs always produce the same month
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
       * open..close whatever that takes, because a covered shop beats a tidy
       * headcount.
       *
       * On a day the GM has explicitly set a number for, it is a MAXIMUM. He
       * said two people today; handing him three is ignoring him. Any stretch
       * left uncovered shows up as an open shift and a coverage warning, so the
       * trade he made stays visible rather than being quietly undone.
       */
      const cappedByHand = !!overrides[date]?.groups?.[group];

      const handover = GROUP_HANDOVER_MINUTES[group] ?? null;
      const locked = lockedByDateGroup.get(`${date}|${group}`) ?? [];
      const open = minutesOfDay(rule.open_time);
      const close = minutesOfDay(rule.close_time);
      if (close <= open) continue;

      const placedSpans: Window[] = locked.map((shift) => ({
        start: minutesOfDay(shift.start_time),
        end: minutesOfDay(shift.end_time),
      }));
      let placedCount = locked.length;

      /**
       * Who is owed work, most owed first — by PAID minutes across the whole
       * month, with the week as the tiebreak.
       *
       * The month has to lead. Balancing the week first sounds fairer and is
       * not: a week rarely divides evenly (seven openers and seven closers
       * across three assistants cannot come out level), so the same person
       * takes the light end of every week and drifts a full day behind by the
       * end of the month. Leading on the month total costs nothing weekly and
       * cut the golf ops spread from 26 hours a month to 4.
       *
       * Used by every placement below — base cover, top-up and the afternoon
       * extra — so none of them can quietly develop its own idea of fair.
       */
      const owedFirst = (a: ProShopStaff, b: ProShopStaff) => {
        const aTotal = totalMinutes.get(a.id) ?? 0;
        const bTotal = totalMinutes.get(b.id) ?? 0;
        if (aTotal !== bTotal) return aTotal - bTotal;
        const aWeek = weekMinutes.get(`${a.id}|${week}`) ?? 0;
        const bWeek = weekMinutes.get(`${b.id}|${week}`) ?? 0;
        if (aWeek !== bWeek) return aWeek - bWeek;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.id.localeCompare(b.id);
      };

      const place = (person: ProShopStaff, span: Window) => {
        const start = timeFromMinutes(span.start);
        const end = timeFromMinutes(span.end);
        shifts.push({
          staff_id: person.id, shift_date: date, group,
          start_time: start, end_time: end, source: "template",
        });
        const booked = bookedOnDate.get(date) ?? new Set<string>();
        booked.add(person.id);
        bookedOnDate.set(date, booked);
        bump(person.id, week, paidMinutes(start, end, settings));
        placedSpans.push(span);
        placedCount += 1;
      };

      /** Everybody who could still take work in this group on this date. */
      const freeToday = () => {
        const booked = bookedOnDate.get(date) ?? new Set<string>();
        return roster
          .filter((person) => {
            if (booked.has(person.id)) return false;
            if (person.employed_through && date > person.employed_through) return false;
            if (isOff(person.id, date, timeOff)) return false;
            return eligibleForGroup(person, group);
          })
          .map((person) => ({ person, free: availableWindow(person, date) }))
          .filter((entry): entry is { person: ProShopStaff; free: Window } => entry.free !== null);
      };

      /**
       * Who should take over at `cursor`, and the hours they would work.
       *
       * Only people who can actually be on duty at that moment are considered —
       * a shift that starts later leaves the stretch in between uncovered, and
       * an uncovered stretch is reported rather than papered over.
       */
      const takeOverAt = (cursor: number) => {
        const options = freeToday()
          .map(({ person, free }) => ({
            person,
            free,
            span: shiftFromAvailability({
              free, open, close, cursor, handover, maxShiftMinutes: maxShift,
            }),
          }))
          .filter((option): option is typeof option & { span: Window } =>
            option.span !== null && option.span.start <= cursor && option.span.end > cursor);
        if (options.length === 0) return null;

        // A stretch long enough to be worth the drive wins over a token hour —
        // but a token hour of cover still beats an empty shop, so the short
        // ones stay in the running rather than being dropped.
        const worthwhile = Math.min(PREFERRED_MIN_MINUTES, close - cursor);
        return options.sort((a, b) => {
          const nativeDiff = Number(isNative(b.person, group)) - Number(isNative(a.person, group));
          if (nativeDiff !== 0) return nativeDiff;
          const aWorth = Number(a.span.end - a.span.start >= worthwhile);
          const bWorth = Number(b.span.end - b.span.start >= worthwhile);
          if (aWorth !== bWorth) return bWorth - aWorth;
          // Carry the day as far forward as possible…
          if (a.span.end !== b.span.end) return b.span.end - a.span.end;
          // …and where two people would carry it equally far, spend the one
          // whose own hours run out first. Keeping the flexible one back is
          // what stops the evening being left with nobody who can work it.
          if (a.free.end !== b.free.end) return a.free.end - b.free.end;
          return owedFirst(a.person, b.person);
        })[0];
      };

      /** Carry the cursor past anything already covering it (pinned or placed). */
      const pastCover = (at: number) => {
        let value = at;
        for (let guard = 0; guard < placedSpans.length + 1; guard++) {
          const covering = placedSpans.find((span) => span.start <= value && span.end > value);
          if (!covering) break;
          value = covering.end;
        }
        return value;
      };

      // ── Walk the window, handing each stretch to whoever is free for it ───
      let cursor = pastCover(open);
      for (let guard = 0; guard < 24 && cursor < close; guard++) {
        if (cappedByHand && placedCount >= rule.base_staff) break;

        const choice = takeOverAt(cursor);
        if (choice) {
          place(choice.person, choice.span);
          cursor = pastCover(choice.span.end);
          continue;
        }

        // Nobody can be on at this moment. Jump to the next time somebody can,
        // and report the stretch in between as the hole it is.
        const nextStart = freeToday()
          .map(({ free }) => Math.max(free.start, open))
          .filter((start) => start > cursor && start < close)
          .sort((a, b) => a - b)[0];
        const until = nextStart ?? close;
        unfilled.push({
          group, kind: "base", date,
          start: timeFromMinutes(cursor), end: timeFromMinutes(until),
          reason: "Nobody available for this stretch",
        });
        cursor = pastCover(until);
      }

      // Anything the walk could not close, as it finally stands.
      for (const hole of uncoveredWithin(open, close, placedSpans)) {
        if (unfilled.some((slot) =>
          slot.date === date && slot.group === group
          && slot.start === timeFromMinutes(hole.start))) continue;
        unfilled.push({
          group, kind: "base", date,
          start: timeFromMinutes(hole.start), end: timeFromMinutes(hole.end),
          reason: "Nobody available for this stretch",
        });
      }

      // ── Headcount top-up ─────────────────────────────────────────────────
      // The rule asks for a number of people, not only a covered window. Only
      // groups that may work alongside each other can take one: adding a
      // second golf ops assistant to a covered day is two people doing one
      // job, which is exactly what the handover limit exists to prevent.
      if (handover === null && !cappedByHand) {
        for (let i = placedCount; i < rule.base_staff; i++) {
          const extra = freeToday()
            .map(({ person, free }) => ({
              person,
              free,
              span: shiftFromAvailability({
                free, open, close, cursor: open, handover, maxShiftMinutes: maxShift,
              }),
            }))
            .filter((option): option is typeof option & { span: Window } =>
              option.span !== null && option.span.end - option.span.start >= PREFERRED_MIN_MINUTES)
            .sort((a, b) => {
              const nativeDiff = Number(isNative(b.person, group)) - Number(isNative(a.person, group));
              if (nativeDiff !== 0) return nativeDiff;
              return owedFirst(a.person, b.person);
            })[0];
          if (!extra) {
            // Covered but short-handed is still worth naming.
            unfilled.push({
              group, kind: "base", date,
              start: rule.open_time.slice(0, 5), end: rule.close_time.slice(0, 5),
              reason: `Only ${placedCount} of ${rule.base_staff} people available all day`,
            });
            break;
          }
          place(extra.person, extra.span);
        }
      }

      // ── Extra cover layered on top, from extra_start to close. ────────────
      if (rule.extra_staff > 0 && rule.extra_start) {
        const extraStart = minutesOfDay(rule.extra_start);
        for (let i = 0; i < rule.extra_staff && extraStart < close; i++) {
          const choice = freeToday()
            .map(({ person, free }) => ({
              person,
              free,
              span: shiftFromAvailability({
                free, open: extraStart, close, cursor: extraStart,
                handover, maxShiftMinutes: maxShift,
              }),
            }))
            .filter((option): option is typeof option & { span: Window } =>
              option.span !== null && option.span.start <= extraStart)
            .sort((a, b) => {
              const nativeDiff = Number(isNative(b.person, group)) - Number(isNative(a.person, group));
              if (nativeDiff !== 0) return nativeDiff;
              if (a.span.end !== b.span.end) return b.span.end - a.span.end;
              return owedFirst(a.person, b.person);
            })[0];
          if (!choice) {
            unfilled.push({
              group, kind: "extra", date,
              start: timeFromMinutes(extraStart), end: timeFromMinutes(close),
              reason: "Nobody available for this extra shift",
            });
            continue;
          }
          place(choice.person, choice.span);
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
