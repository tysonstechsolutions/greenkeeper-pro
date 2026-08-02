import { describe, expect, it } from "vitest";
import {
  clearDayOverride,
  effectiveRulesForDay,
  hasDayOverride,
  isDayLocked,
  lockedDatesAmong,
  MAX_DAY_STAFF,
  ruleCountsForDay,
  sanitizeDayOverrides,
  withDayCounts,
  withDayLocked,
  type DayOverrides,
} from "@/lib/pro-shop/day-overrides";
import type { CoverageRule } from "@/lib/pro-shop/types";

/** 2026-08-15 is a Saturday (weekday 6); 2026-08-17 is a Monday (weekday 1). */
const SATURDAY = "2026-08-15";
const MONDAY = "2026-08-17";

function rules(): CoverageRule[] {
  const out: CoverageRule[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    out.push({
      id: `in-${weekday}`, area: "pro_shop", weekday, group: "inside",
      open_time: "06:00", close_time: "20:00",
      base_staff: 2, extra_staff: 0, extra_start: null,
    });
    out.push({
      id: `out-${weekday}`, area: "pro_shop", weekday, group: "outside",
      open_time: "08:00", close_time: "20:00",
      base_staff: 2, extra_staff: 1, extra_start: "15:00",
    });
  }
  return out;
}

describe("effectiveRulesForDay", () => {
  it("returns the weekday's rules untouched when nothing is overridden", () => {
    const today = effectiveRulesForDay(SATURDAY, rules(), {});
    expect(today.map((r) => r.id).sort()).toEqual(["in-6", "out-6"]);
    expect(today.find((r) => r.group === "outside")?.base_staff).toBe(2);
  });

  it("substitutes only the overridden group, on only the overridden date", () => {
    const overrides: DayOverrides = {
      [SATURDAY]: { groups: { outside: { base: 1, extra: 0 } } },
    };
    const saturday = effectiveRulesForDay(SATURDAY, rules(), overrides);
    expect(saturday.find((r) => r.group === "outside")?.base_staff).toBe(1);
    expect(saturday.find((r) => r.group === "outside")?.extra_staff).toBe(0);
    // The other group that day is untouched…
    expect(saturday.find((r) => r.group === "inside")?.base_staff).toBe(2);
    // …and so is every other Saturday, which is the whole point of a per-day
    // override rather than editing the weekday rule.
    const nextSaturday = effectiveRulesForDay("2026-08-22", rules(), overrides);
    expect(nextSaturday.find((r) => r.group === "outside")?.base_staff).toBe(2);
  });

  it("does not mutate the rules it was given", () => {
    const source = rules();
    effectiveRulesForDay(SATURDAY, source, {
      [SATURDAY]: { groups: { outside: { base: 0, extra: 0 } } },
    });
    expect(source.find((r) => r.id === "out-6")?.base_staff).toBe(2);
  });

  it("ignores an override for a group that has no rule that weekday", () => {
    const mondayInsideOnly = rules().filter((r) => !(r.weekday === 1 && r.group === "outside"));
    const today = effectiveRulesForDay(MONDAY, mondayInsideOnly, {
      [MONDAY]: { groups: { outside: { base: 4, extra: 0 } } },
    });
    expect(today.map((r) => r.group)).toEqual(["inside"]);
  });
});

describe("ruleCountsForDay", () => {
  it("reports what the day would need with no override, for the undo link", () => {
    expect(ruleCountsForDay(SATURDAY, rules())).toEqual({
      inside: { base: 2, extra: 0 },
      outside: { base: 2, extra: 1 },
    });
  });
});

describe("sanitizeDayOverrides", () => {
  it("keeps a well-formed entry", () => {
    const raw = { [SATURDAY]: { locked: true, groups: { outside: { base: 1, extra: 0 } } } };
    expect(sanitizeDayOverrides(raw)).toEqual(raw);
  });

  it("drops anything that isn't a date key", () => {
    expect(sanitizeDayOverrides({ tuesday: { locked: true } })).toEqual({});
    expect(sanitizeDayOverrides({ "2026-8-1": { locked: true } })).toEqual({});
  });

  it("drops a half-written group rather than inheriting the rule for the gap", () => {
    // base without extra would silently take extra from the weekday rule,
    // which reads as a bug on the screen.
    expect(sanitizeDayOverrides({ [SATURDAY]: { groups: { outside: { base: 1 } } } })).toEqual({});
  });

  it("clamps counts into a sane range instead of trusting them", () => {
    const out = sanitizeDayOverrides({
      [SATURDAY]: { groups: { outside: { base: -4, extra: 9999 } } },
    });
    expect(out[SATURDAY].groups?.outside).toEqual({ base: 0, extra: MAX_DAY_STAFF });
  });

  it("survives junk without throwing", () => {
    expect(sanitizeDayOverrides(null)).toEqual({});
    expect(sanitizeDayOverrides("nope")).toEqual({});
    expect(sanitizeDayOverrides([1, 2, 3])).toEqual({});
    expect(sanitizeDayOverrides({ [SATURDAY]: "locked" })).toEqual({});
    expect(sanitizeDayOverrides({ [SATURDAY]: { locked: "yes" } })).toEqual({});
  });

  it("drops an entry that ends up saying nothing", () => {
    expect(sanitizeDayOverrides({ [SATURDAY]: { locked: false, groups: {} } })).toEqual({});
  });
});

describe("editing overrides", () => {
  it("sets, then clears, one group's counts", () => {
    const set = withDayCounts({}, SATURDAY, "outside", { base: 1, extra: 0 });
    expect(set[SATURDAY].groups?.outside).toEqual({ base: 1, extra: 0 });
    // Clearing the only group clears the whole entry, so the date stops
    // counting as customised rather than lingering as an empty `{}`.
    expect(withDayCounts(set, SATURDAY, "outside", null)).toEqual({});
  });

  it("keeps a lock when the counts are cleared", () => {
    let overrides = withDayLocked({}, SATURDAY, true);
    overrides = withDayCounts(overrides, SATURDAY, "outside", { base: 1, extra: 0 });
    overrides = withDayCounts(overrides, SATURDAY, "outside", null);
    expect(isDayLocked(SATURDAY, overrides)).toBe(true);
    expect(overrides[SATURDAY].groups).toBeUndefined();
  });

  it("unlocking a day with no counts removes it entirely", () => {
    const locked = withDayLocked({}, SATURDAY, true);
    expect(withDayLocked(locked, SATURDAY, false)).toEqual({});
  });

  it("does not mutate the map it was given", () => {
    const before: DayOverrides = { [SATURDAY]: { locked: true } };
    withDayCounts(before, SATURDAY, "outside", { base: 1, extra: 0 });
    withDayLocked(before, MONDAY, true);
    expect(before).toEqual({ [SATURDAY]: { locked: true } });
  });

  it("clearDayOverride wipes both the lock and the counts", () => {
    const overrides = withDayCounts(
      withDayLocked({}, SATURDAY, true), SATURDAY, "outside", { base: 1, extra: 0 },
    );
    expect(hasDayOverride(SATURDAY, overrides)).toBe(true);
    expect(clearDayOverride(overrides, SATURDAY)).toEqual({});
  });
});

describe("lockedDatesAmong", () => {
  it("picks out only the held days in a window", () => {
    const overrides = withDayLocked(withDayLocked({}, SATURDAY, true), MONDAY, true);
    expect(lockedDatesAmong([SATURDAY, "2026-08-16", MONDAY], overrides)).toEqual([SATURDAY, MONDAY]);
  });
});
