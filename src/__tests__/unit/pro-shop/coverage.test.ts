import { describe, expect, it } from "vitest";
import {
  coverageGaps,
  generateCoverageMonth,
  planDaySlots,
  type PlannedCoverageShift,
} from "@/lib/pro-shop/coverage";
import { minutesOfDay, paidMinutes } from "@/lib/pro-shop/hours";
import type {
  CoverageRule,
  ProShopShift,
  ProShopStaff,
  ShiftGroup,
} from "@/lib/pro-shop/types";

/** The rules as seeded from the hours the real shifts actually run. */
function proShopRules(): CoverageRule[] {
  const rules: CoverageRule[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const weekend = weekday === 0 || weekday === 6;
    rules.push({
      id: `in-${weekday}`, area: "pro_shop", weekday, group: "inside",
      open_time: weekend ? "05:30" : "06:00", close_time: "20:00",
      base_staff: 2, extra_staff: 0, extra_start: null,
    });
    const busy = weekday === 0 || weekday >= 4; // Thu, Fri, Sat, Sun
    rules.push({
      id: `out-${weekday}`, area: "pro_shop", weekday, group: "outside",
      open_time: "08:00", close_time: "20:00",
      base_staff: 2, extra_staff: busy ? 1 : 0, extra_start: busy ? "15:00" : null,
    });
  }
  return rules;
}

function person(partial: Partial<ProShopStaff> & { id: string }): ProShopStaff {
  return {
    full_name: partial.id,
    position: "rec_aid",
    default_group: "outside",
    availability_text: null,
    availability: {},
    flex: false,
    phone: null,
    is_active: true,
    area: "pro_shop",
    sort_order: 0,
    notes: null,
    ...partial,
  };
}

/** 3 golf ops + 7 rec aids, matching the real roster's shape. */
function roster(): ProShopStaff[] {
  const inside = ["dj", "marty", "mike"].map((id, i) =>
    person({ id, position: "golf_ops_assistant", default_group: "inside", sort_order: i }));
  const outside = ["joe", "tony", "aniya", "bart", "colin", "devin", "sam"].map((id, i) =>
    person({ id, sort_order: 10 + i }));
  return [...inside, ...outside];
}

function on(shifts: PlannedCoverageShift[], date: string, group: ShiftGroup) {
  return shifts
    .filter((s) => s.shift_date === date && s.group === group)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

describe("planDaySlots", () => {
  it("splits the inside weekday window into two back-to-back shifts", () => {
    const [rule] = proShopRules().filter((r) => r.group === "inside" && r.weekday === 3);
    expect(planDaySlots(rule).map((s) => `${s.start}-${s.end}`)).toEqual([
      "06:00-13:00",
      "13:00-20:00",
    ]);
  });

  it("rounds a ragged weekend split to the half hour without opening a gap", () => {
    // 05:30–20:00 is 14h30; half is 12:45, which rounds to 13:00.
    const [rule] = proShopRules().filter((r) => r.group === "inside" && r.weekday === 6);
    const slots = planDaySlots(rule);
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual([
      "05:30-13:00",
      "13:00-20:00",
    ]);
    expect(slots[0].end).toBe(slots[1].start);
  });

  it("gives a quiet outside day two shifts and no extra", () => {
    const [rule] = proShopRules().filter((r) => r.group === "outside" && r.weekday === 1);
    expect(planDaySlots(rule).map((s) => `${s.start}-${s.end}`)).toEqual([
      "08:00-14:00",
      "14:00-20:00",
    ]);
  });

  it("adds the third rec aid from 15:00 on a busy day", () => {
    const [rule] = proShopRules().filter((r) => r.group === "outside" && r.weekday === 4);
    const slots = planDaySlots(rule);
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual([
      "08:00-14:00",
      "14:00-20:00",
      "15:00-20:00",
    ]);
    expect(slots[2].kind).toBe("extra");
  });

  it("never leaves a gap between consecutive base shifts, whatever the window", () => {
    for (const [open, close, base] of [
      ["05:30", "20:00", 2], ["06:00", "20:00", 3], ["07:15", "19:45", 4], ["08:00", "20:00", 5],
    ] as const) {
      const slots = planDaySlots({
        id: "x", area: "pro_shop", weekday: 1, group: "inside",
        open_time: open, close_time: close, base_staff: base, extra_staff: 0, extra_start: null,
      }).filter((s) => s.kind === "base");
      expect(slots[0].start).toBe(open);
      expect(slots[slots.length - 1].end).toBe(close);
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i].start).toBe(slots[i - 1].end);
      }
    }
  });

  it("returns nothing for a window that closes before it opens", () => {
    expect(planDaySlots({
      id: "x", area: "pro_shop", weekday: 1, group: "inside",
      open_time: "20:00", close_time: "08:00", base_staff: 2, extra_staff: 0, extra_start: null,
    })).toEqual([]);
  });
});

describe("generateCoverageMonth", () => {
  const base = {
    staff: roster(), year: 2026, month0: 7, timeOff: [],
    rules: proShopRules(), area: "pro_shop" as const,
  };

  it("staffs 2 rec aids on a quiet day and 3 on a busy one", () => {
    const { shifts } = generateCoverageMonth(base);
    // 2026-08-03 is a Monday, 2026-08-06 a Thursday.
    expect(on(shifts, "2026-08-03", "outside")).toHaveLength(2);
    expect(on(shifts, "2026-08-06", "outside")).toHaveLength(3);
    expect(on(shifts, "2026-08-06", "outside")[2].start_time).toBe("15:00");
  });

  it("puts 2 golf ops on every day, opening and closing", () => {
    const { shifts } = generateCoverageMonth(base);
    const inside = on(shifts, "2026-08-05", "inside");
    expect(inside).toHaveLength(2);
    expect(inside[0].start_time).toBe("06:00");
    expect(inside[1].end_time).toBe("20:00");
  });

  it("leaves no uncovered minute in either window, all month", () => {
    const { shifts, unfilled } = generateCoverageMonth(base);
    expect(unfilled).toEqual([]);
    for (const rule of proShopRules()) {
      const dates = shifts
        .map((s) => s.shift_date)
        .filter((d, i, a) => a.indexOf(d) === i)
        .filter((d) => new Date(`${d}T12:00:00`).getDay() === rule.weekday);
      for (const date of dates) {
        const day = shifts
          .filter((s) => s.shift_date === date)
          .map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time }));
        expect(coverageGaps(day, rule)).toEqual([]);
      }
    }
  });

  it("never books one person twice on the same day", () => {
    const { shifts } = generateCoverageMonth(base);
    const seen = new Set<string>();
    for (const s of shifts) {
      const key = `${s.staff_id}|${s.shift_date}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("spreads PAID HOURS across the rec aids, not just shift counts", () => {
    // Hours are what the fairness sort optimises and what Tyson pays, so the
    // month is balanced on minutes. Shift counts can differ legitimately — a
    // 15:00 extra is 5h against a 6h base shift.
    const { shifts } = generateCoverageMonth(base);
    const minutes = new Map<string, number>();
    for (const s of shifts.filter((x) => x.group === "outside")) {
      minutes.set(s.staff_id, (minutes.get(s.staff_id) ?? 0) + paidMinutes(s.start_time, s.end_time));
    }
    expect(minutes.size).toBe(7);
    const values = [...minutes.values()];
    // Within one shift's worth of each other across the whole month.
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(360);
  });
});

describe("who may cover golf ops", () => {
  it("does not pull a rec aid inside unless the GM cleared them", () => {
    // Only one golf ops assistant, so the second inside slot needs a borrow.
    const staff = [
      person({ id: "dj", position: "golf_ops_assistant", default_group: "inside" }),
      person({ id: "joe", flex: false }),
      person({ id: "tony", flex: false }),
      person({ id: "bart", flex: false }),
    ];
    const { shifts, unfilled } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    expect(on(shifts, "2026-08-03", "inside")).toHaveLength(1);
    expect(unfilled.some((u) => u.group === "inside")).toBe(true);
  });

  it("pulls in a rec aid the GM did clear, and only that one", () => {
    const staff = [
      person({ id: "dj", position: "golf_ops_assistant", default_group: "inside" }),
      person({ id: "joe", flex: true }),
      person({ id: "tony", flex: false }),
      person({ id: "bart", flex: false }),
    ];
    const { shifts } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    const inside = on(shifts, "2026-08-03", "inside");
    expect(inside).toHaveLength(2);
    expect(inside.map((s) => s.staff_id).sort()).toEqual(["dj", "joe"]);
  });

  it("still fills golf ops from golf ops first, before borrowing anyone", () => {
    const staff = [
      person({ id: "dj", position: "golf_ops_assistant", default_group: "inside", sort_order: 9 }),
      person({ id: "mike", position: "golf_ops_assistant", default_group: "inside", sort_order: 9 }),
      person({ id: "joe", flex: true, sort_order: 0 }),
    ];
    const { shifts } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    expect(on(shifts, "2026-08-03", "inside").map((s) => s.staff_id).sort())
      .toEqual(["dj", "mike"]);
  });
});

describe("respecting what people told the GM", () => {
  it("does not schedule someone on a weekday their pattern rules out", () => {
    const staff = roster().map((p) =>
      p.id === "joe"
        ? { ...p, availability: { weekly: {
            sun: { works: true }, mon: { works: false }, tue: { works: true },
            wed: { works: true }, thu: { works: true }, fri: { works: true }, sat: { works: true },
          } } }
        : p);
    const { shifts } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    const mondays = shifts.filter(
      (s) => s.staff_id === "joe" && new Date(`${s.shift_date}T12:00:00`).getDay() === 1);
    expect(mondays).toEqual([]);
    expect(shifts.some((s) => s.staff_id === "joe")).toBe(true);
  });

  it("skips time off and anything past a leaver's last day", () => {
    const staff = roster().map((p) =>
      p.id === "colin" ? { ...p, employed_through: "2026-08-10" } : p);
    const { shifts } = generateCoverageMonth({
      staff, year: 2026, month0: 7,
      timeOff: [{ id: "t", staff_id: "bart", start_date: "2026-08-05", end_date: "2026-08-09", reason: "Vacation" }],
      rules: proShopRules(), area: "pro_shop",
    });
    expect(shifts.some((s) => s.staff_id === "bart" && s.shift_date >= "2026-08-05" && s.shift_date <= "2026-08-09")).toBe(false);
    expect(shifts.some((s) => s.staff_id === "colin" && s.shift_date > "2026-08-10")).toBe(false);
    expect(shifts.some((s) => s.staff_id === "colin")).toBe(true);
  });

  it("reports an unfillable slot instead of booking someone who is not free", () => {
    const staff = [person({ id: "solo", position: "golf_ops_assistant", default_group: "inside" })];
    const { shifts, unfilled } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    expect(shifts.every((s) => s.staff_id === "solo")).toBe(true);
    expect(unfilled.length).toBeGreaterThan(0);
    expect(unfilled[0].reason).toMatch(/available/i);
  });
});

describe("locked shifts", () => {
  const locked: ProShopShift[] = [{
    id: "L1", schedule_id: "s", staff_id: "bart", shift_date: "2026-08-03",
    group: "outside", start_time: "08:00", end_time: "14:00",
    source: "manual", note: null, locked: true,
  }];

  it("counts a pinned shift toward the day instead of scheduling on top of it", () => {
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [],
      rules: proShopRules(), area: "pro_shop", lockedShifts: locked,
    });
    // Monday needs 2 outside; one is pinned, so exactly one more is generated.
    expect(on(shifts, "2026-08-03", "outside")).toHaveLength(1);
    expect(shifts.some((s) => s.staff_id === "bart" && s.shift_date === "2026-08-03")).toBe(false);
  });
});

describe("coverageGaps", () => {
  const rule = { open_time: "08:00", close_time: "20:00", group: "outside" as const };

  it("finds nothing when back-to-back shifts span the window", () => {
    expect(coverageGaps([
      { group: "outside", start_time: "08:00", end_time: "14:00" },
      { group: "outside", start_time: "14:00", end_time: "20:00" },
    ], rule)).toEqual([]);
  });

  it("finds the hole an afternoon with nobody in it leaves", () => {
    expect(coverageGaps([
      { group: "outside", start_time: "08:00", end_time: "12:00" },
      { group: "outside", start_time: "15:00", end_time: "20:00" },
    ], rule)).toEqual([{ start: "12:00", end: "15:00" }]);
  });

  it("reports the whole window when nobody is on at all", () => {
    expect(coverageGaps([], rule)).toEqual([{ start: "08:00", end: "20:00" }]);
  });

  it("ignores the other group's shifts", () => {
    expect(coverageGaps([
      { group: "inside", start_time: "08:00", end_time: "20:00" },
    ], rule)).toEqual([{ start: "08:00", end: "20:00" }]);
  });

  it("treats overlapping cover as covered", () => {
    expect(coverageGaps([
      { group: "outside", start_time: "08:00", end_time: "16:00" },
      { group: "outside", start_time: "15:00", end_time: "20:00" },
    ], rule)).toEqual([]);
  });

  it("does not count cover that runs past close as filling an earlier hole", () => {
    const gaps = coverageGaps([
      { group: "outside", start_time: "17:00", end_time: "22:00" },
    ], rule);
    expect(gaps).toEqual([{ start: "08:00", end: "17:00" }]);
    expect(minutesOfDay(gaps[0].end)).toBeLessThan(minutesOfDay("20:00"));
  });
});
