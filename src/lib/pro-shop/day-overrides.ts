/**
 * Per-day exceptions to the coverage rules.
 *
 * The rules say what a WEEKDAY requires, which is right almost every week and
 * wrong on the one Saturday half the course is shut. An override lets a single
 * date say something different — "two rec aids today, not three" — without
 * touching the rule that governs every other Saturday.
 *
 * A date with no entry, or a group with no entry inside a date, falls back to
 * the weekday rule. That fallback is the whole point: days nobody has touched
 * behave exactly as they did before this file existed.
 *
 * `effectiveRulesForDay` is the ONE place that resolves rule + override into
 * "what does this day need". Open shifts, warnings, generation and the
 * printout all read through it, so a change to a day's count moves all four
 * together instead of leaving the grid disagreeing with the printout.
 *
 * Pure and deterministic — no network, no AI, no clock.
 */
import { parseYmd } from "./dates";
import type {
  CoverageRule,
  DayGroupOverride,
  DayOverride,
  DayOverrides,
  ShiftGroup,
  TimeRange,
} from "./types";

// The shapes live in types.ts, next to DismissedWarnings and the schedule row
// that carries them. Re-exported so callers can take the type and the helpers
// from one import.
export type { DayGroupOverride, DayOverride, DayOverrides, TimeRange };

/**
 * A weekday rule with this date's exceptions folded in.
 *
 * `unstaffed` is the one field that has no column behind it — it comes from
 * the day override, and everything that asks "is this day covered" reads it
 * off the rule so the grid, the warnings, the generator and the printout
 * cannot disagree about a stretch the GM has excused.
 */
export type EffectiveRule = CoverageRule & { unstaffed?: TimeRange[] };

/** Most excused stretches one group may carry on one day. A sanity bound. */
const MAX_UNSTAFFED_PER_GROUP = 12;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanRange(value: unknown): TimeRange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { start, end } = value as { start?: unknown; end?: unknown };
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
  // A backwards or empty stretch would excuse nothing and read as a bug.
  return start < end ? { start, end } : null;
}

export function sameRange(a: TimeRange, b: TimeRange): boolean {
  return a.start === b.start && a.end === b.end;
}

/** The stretches one group needs nobody on, for one date. */
export function unstaffedFor(
  date: string,
  group: ShiftGroup,
  overrides: DayOverrides,
): TimeRange[] {
  return overrides[date]?.unstaffed?.[group] ?? [];
}

/**
 * Ceiling on a per-day headcount. Not a business rule — a guard so a typo or a
 * bad row can't ask the generator for four hundred rec aids.
 */
export const MAX_DAY_STAFF = 12;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 0) return 0;
  return Math.min(n, MAX_DAY_STAFF);
}

/**
 * Read overrides off a schedule row. JSONB is schemaless, so anything that
 * isn't a date mapping to sane counts is dropped rather than trusted — a
 * malformed entry must not be able to blank out a day's coverage.
 */
export function sanitizeDayOverrides(raw: unknown): DayOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DayOverrides = {};
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DATE_RE.test(date)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as { locked?: unknown; groups?: unknown; unstaffed?: unknown };
    const next: DayOverride = {};
    if (entry.locked === true) next.locked = true;
    if (entry.groups && typeof entry.groups === "object" && !Array.isArray(entry.groups)) {
      const groups: Partial<Record<ShiftGroup, DayGroupOverride>> = {};
      for (const [group, counts] of Object.entries(entry.groups as Record<string, unknown>)) {
        if (!counts || typeof counts !== "object" || Array.isArray(counts)) continue;
        const base = cleanCount((counts as { base?: unknown }).base);
        const extra = cleanCount((counts as { extra?: unknown }).extra);
        // Both counts or neither: a half-written entry would silently inherit
        // the rule for the missing half, which reads as a bug on the screen.
        if (base === null || extra === null) continue;
        groups[group as ShiftGroup] = { base, extra };
      }
      if (Object.keys(groups).length > 0) next.groups = groups;
    }
    if (entry.unstaffed && typeof entry.unstaffed === "object" && !Array.isArray(entry.unstaffed)) {
      const unstaffed: Partial<Record<ShiftGroup, TimeRange[]>> = {};
      for (const [group, ranges] of Object.entries(entry.unstaffed as Record<string, unknown>)) {
        if (!Array.isArray(ranges)) continue;
        const clean: TimeRange[] = [];
        for (const raw of ranges) {
          const range = cleanRange(raw);
          // Dropping duplicates keeps "undo this one" unambiguous.
          if (range && !clean.some((kept) => sameRange(kept, range))) clean.push(range);
          if (clean.length >= MAX_UNSTAFFED_PER_GROUP) break;
        }
        if (clean.length > 0) {
          unstaffed[group as ShiftGroup] = clean.sort((a, b) => a.start.localeCompare(b.start));
        }
      }
      if (Object.keys(unstaffed).length > 0) next.unstaffed = unstaffed;
    }
    // Drop entries that ended up saying nothing, so `{}` never counts as
    // "this day is customised" in the UI.
    if (next.locked || next.groups || next.unstaffed) out[date] = next;
  }
  return out;
}

export function overrideFor(date: string, overrides: DayOverrides): DayOverride | undefined {
  return overrides[date];
}

/** Does this date carry any exception at all? Drives the "customised" badge. */
export function hasDayOverride(date: string, overrides: DayOverrides): boolean {
  const entry = overrides[date];
  return !!entry && (entry.locked === true || !!entry.groups || !!entry.unstaffed);
}

/** A locked day is held as-is: no rebuild touches it. */
export function isDayLocked(date: string, overrides: DayOverrides): boolean {
  return overrides[date]?.locked === true;
}

/**
 * What this specific date requires: the weekday's rules, with any per-day
 * counts substituted in. Filtering by weekday lives here so no caller has to
 * remember to do it before applying an override.
 */
export function effectiveRulesForDay(
  date: string,
  rules: CoverageRule[],
  overrides: DayOverrides = {},
): EffectiveRule[] {
  const weekday = parseYmd(date).getDay();
  const entry = overrides[date];
  const forWeekday = rules.filter((rule) => rule.weekday === weekday);
  if (!entry?.groups && !entry?.unstaffed) return forWeekday;
  return forWeekday.map((rule) => {
    const counts = entry.groups?.[rule.group];
    const excused = entry.unstaffed?.[rule.group];
    if (!counts && !excused?.length) return rule;
    return {
      ...rule,
      ...(counts ? { base_staff: counts.base, extra_staff: counts.extra } : {}),
      ...(excused?.length ? { unstaffed: excused } : {}),
    };
  });
}

/** What the day would need with no override — used to offer "back to normal". */
export function ruleCountsForDay(
  date: string,
  rules: CoverageRule[],
): Partial<Record<ShiftGroup, DayGroupOverride>> {
  const out: Partial<Record<ShiftGroup, DayGroupOverride>> = {};
  for (const rule of effectiveRulesForDay(date, rules, {})) {
    out[rule.group] = { base: rule.base_staff, extra: rule.extra_staff };
  }
  return out;
}

// ── Immutable edits ─────────────────────────────────────────────────────────
// Every helper returns a fresh map. The caller writes the whole object back to
// the schedule row, so nothing may be mutated in place under React.

/** Set (or clear, with null) one group's headcount for one date. */
export function withDayCounts(
  overrides: DayOverrides,
  date: string,
  group: ShiftGroup,
  counts: DayGroupOverride | null,
): DayOverrides {
  const next: DayOverrides = { ...overrides };
  const entry: DayOverride = { ...(next[date] ?? {}) };
  const groups = { ...(entry.groups ?? {}) };
  if (counts) {
    groups[group] = {
      base: Math.min(Math.max(0, Math.round(counts.base)), MAX_DAY_STAFF),
      extra: Math.min(Math.max(0, Math.round(counts.extra)), MAX_DAY_STAFF),
    };
  } else {
    delete groups[group];
  }
  if (Object.keys(groups).length > 0) entry.groups = groups;
  else delete entry.groups;
  if (entry.locked || entry.groups || entry.unstaffed) next[date] = entry;
  else delete next[date];
  return next;
}

/**
 * Excuse (or un-excuse) one stretch of one date for one group.
 *
 * @param needed false to say nobody is needed then; true to want cover back.
 */
export function withDayUnstaffed(
  overrides: DayOverrides,
  date: string,
  group: ShiftGroup,
  range: TimeRange,
  needed: boolean,
): DayOverrides {
  const next: DayOverrides = { ...overrides };
  const entry: DayOverride = { ...(next[date] ?? {}) };
  const unstaffed = { ...(entry.unstaffed ?? {}) };
  const current = unstaffed[group] ?? [];

  if (needed) {
    const kept = current.filter((r) => !sameRange(r, range));
    if (kept.length > 0) unstaffed[group] = kept;
    else delete unstaffed[group];
  } else if (!current.some((r) => sameRange(r, range))) {
    unstaffed[group] = [...current, range]
      .slice(0, MAX_UNSTAFFED_PER_GROUP)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  if (Object.keys(unstaffed).length > 0) entry.unstaffed = unstaffed;
  else delete entry.unstaffed;
  if (entry.locked || entry.groups || entry.unstaffed) next[date] = entry;
  else delete next[date];
  return next;
}

export function withDayLocked(
  overrides: DayOverrides,
  date: string,
  locked: boolean,
): DayOverrides {
  const next: DayOverrides = { ...overrides };
  const entry: DayOverride = { ...(next[date] ?? {}) };
  if (locked) entry.locked = true;
  else delete entry.locked;
  if (entry.locked || entry.groups || entry.unstaffed) next[date] = entry;
  else delete next[date];
  return next;
}

/** Drop every exception on a date — "back to a normal Saturday". */
export function clearDayOverride(overrides: DayOverrides, date: string): DayOverrides {
  if (!overrides[date]) return overrides;
  const next = { ...overrides };
  delete next[date];
  return next;
}

/** The locked dates inside a candidate rebuild window. */
export function lockedDatesAmong(dates: string[], overrides: DayOverrides): string[] {
  return dates.filter((date) => isDayLocked(date, overrides));
}
