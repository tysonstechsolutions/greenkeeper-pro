import { describe, expect, it } from "vitest";
import {
  coverageGaps,
  generateCoverageMonth,
  openSlotsForDay,
  shiftFromAvailability,
  type PlannedCoverageShift,
} from "@/lib/pro-shop/coverage";
import { elapsedMinutes, minutesOfDay, paidMinutes, timeFromMinutes } from "@/lib/pro-shop/hours";
import {
  AREA_GROUPS,
  DEFAULT_SCHEDULE_SETTINGS,
  type CoverageRule,
  type ProShopShift,
  type ProShopStaff,
  type ShiftGroup,
} from "@/lib/pro-shop/types";

/** The real cap: 8h30 on site, 8h paid once the unpaid lunch comes out. */
const MAX = DEFAULT_SCHEDULE_SETTINGS.max_shift_minutes;

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

describe("shiftFromAvailability — the hours one person would work", () => {
  const at = (free: [string, string], cursor: string, handover: number | null, window: [string, string] = ["06:00", "20:00"]) =>
    shiftFromAvailability({
      free: { start: minutesOfDay(free[0]), end: minutesOfDay(free[1]) },
      open: minutesOfDay(window[0]),
      close: minutesOfDay(window[1]),
      cursor: minutesOfDay(cursor),
      handover,
      maxShiftMinutes: MAX,
    });
  const fmt = (w: ReturnType<typeof shiftFromAvailability>) =>
    w && `${timeFromMinutes(w.start)}-${timeFromMinutes(w.end)}`;

  it("gives somebody exactly the hours they said they could work", () => {
    // Marty's Monday really is 12:30–20:00. That is his Monday, untouched.
    expect(fmt(at(["12:30", "20:00"], "12:30", 30))).toBe("12:30-20:00");
    expect(fmt(at(["06:00", "12:30"], "06:00", 30))).toBe("06:00-12:30");
  });

  it("trims anyone who listed more than the cap", () => {
    // Mike's Sunday is 05:30–14:30 — nine hours. He works 8h30 of it.
    expect(fmt(at(["05:30", "14:30"], "05:30", 30, ["05:30", "20:00"]))).toBe("05:30-14:00");
  });

  it("brings golf ops on half an hour early, to hand over", () => {
    expect(fmt(at(["06:00", "20:00"], "14:30", 30))).toBe("14:00-20:00");
  });

  it("never starts golf ops earlier than that, however free they are", () => {
    // A whole-day-available assistant still comes on at the handover, not at
    // open — two people behind the counter is two people doing one job.
    const shift = at(["00:00", "24:00"], "14:30", 30)!;
    expect(timeFromMinutes(shift.start)).toBe("14:00");
  });

  it("never starts golf ops before their own hours, either", () => {
    // The handover is a floor, not an instruction to come in early.
    expect(fmt(at(["15:00", "20:00"], "14:30", 30))).toBe("15:00-20:00");
  });

  it("lets an unrestricted job take the hours it needs to reach close", () => {
    // Rec aids may overlap, so a fully-free one starts late enough to carry
    // the day to close rather than doubling up on the morning.
    expect(fmt(at(["08:00", "20:00"], "16:30", null, ["08:00", "20:00"]))).toBe("11:30-20:00");
  });

  it("still starts an unrestricted job at open when that is where cover is needed", () => {
    expect(fmt(at(["08:00", "20:00"], "08:00", null, ["08:00", "20:00"]))).toBe("08:00-16:30");
  });

  it("returns nothing once their hours are behind the cursor", () => {
    expect(at(["08:00", "14:00"], "16:00", null, ["08:00", "20:00"])).toBeNull();
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
    expect(on(shifts, "2026-08-06", "outside").map((s) => s.start_time))
      .toContain("15:00");
  });

  it("puts 2 golf ops on every day, opening and closing", () => {
    const { shifts } = generateCoverageMonth(base);
    const inside = on(shifts, "2026-08-05", "inside");
    expect(inside).toHaveLength(2);
    expect(inside[0].start_time).toBe("06:00");
    expect(inside[1].end_time).toBe("20:00");
  });

  it("gives everybody a full day rather than half of one", () => {
    // Nobody drives to the course for four hours: a shift runs as long as
    // their hours and the cap allow, and no shift anywhere exceeds the cap.
    const { shifts } = generateCoverageMonth(base);
    for (const shift of shifts) {
      expect(elapsedMinutes(shift.start_time, shift.end_time)).toBeLessThanOrEqual(MAX);
    }
    const monday = on(shifts, "2026-08-03", "inside");
    expect(monday.map((s) => `${s.start_time}-${s.end_time}`))
      .toEqual(["06:00-14:30", "14:00-20:00"]);
    // 8h30 on site is 8h paid.
    expect(paidMinutes(monday[0].start_time, monday[0].end_time)).toBe(480);
  });

  it("never puts two golf ops on together beyond the handover", () => {
    // Golf ops is one counter with one person behind it. The only overlap
    // allowed anywhere in the month is the half hour they hand over in.
    const { shifts } = generateCoverageMonth(base);
    const byDate = new Map<string, PlannedCoverageShift[]>();
    for (const shift of shifts.filter((s) => s.group === "inside")) {
      byDate.set(shift.shift_date, [...(byDate.get(shift.shift_date) ?? []), shift]);
    }
    for (const [, day] of byDate) {
      const spans = day
        .map((s) => ({ start: minutesOfDay(s.start_time), end: minutesOfDay(s.end_time) }))
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < spans.length; i++) {
        const overlap = Math.min(spans[i - 1].end, spans[i].end) - spans[i].start;
        expect(overlap).toBeLessThanOrEqual(30);
      }
    }
  });

  it("lets rec aids work alongside each other, which is the point of them", () => {
    const { shifts } = generateCoverageMonth(base);
    const monday = on(shifts, "2026-08-03", "outside");
    expect(monday.map((s) => `${s.start_time}-${s.end_time}`))
      .toEqual(["08:00-16:30", "11:30-20:00"]);
    // Five hours of two rec aids on at once — allowed here, unlike inside.
    expect(minutesOfDay(monday[0].end_time) - minutesOfDay(monday[1].start_time)).toBe(300);
  });

  it("never books anybody more than the cap in one day", () => {
    const { shifts } = generateCoverageMonth(base);
    const perDay = new Map<string, number>();
    for (const shift of shifts) {
      const key = `${shift.staff_id}|${shift.shift_date}`;
      perDay.set(key, (perDay.get(key) ?? 0) + elapsedMinutes(shift.start_time, shift.end_time));
    }
    for (const minutes of perDay.values()) expect(minutes).toBeLessThanOrEqual(MAX);
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
    // Within one shift's worth of each other across the whole month. A shift
    // is now a full day, so the bar is one full day (480 paid minutes) rather
    // than the six hours a half-window split used to be.
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(480);
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

describe("respecting the HOURS people gave, not just the day", () => {
  /** Sunday windows taken from the real roster. */
  function sundayRoster(): ProShopStaff[] {
    const win = (start: string, end: string) => ({
      weekly: {
        sun: { works: true, start, end },
        mon: { works: false }, tue: { works: false }, wed: { works: false },
        thu: { works: false }, fri: { works: false }, sat: { works: false },
      },
    });
    return [
      person({ id: "marty", position: "golf_ops_assistant", default_group: "inside", availability: win("14:00", "20:00") }),
      person({ id: "mike", position: "golf_ops_assistant", default_group: "inside", availability: win("05:30", "14:30") }),
      person({ id: "aniya", availability: win("13:00", "20:00") }),
      person({ id: "joe", availability: win("08:00", "14:00") }),
      person({ id: "devin", availability: win("12:00", "20:00") }),
    ];
  }

  const sunday = () => generateCoverageMonth({
    staff: sundayRoster(), year: 2026, month0: 10, timeOff: [],
    rules: proShopRules(), area: "pro_shop",
  });

  it("never starts anyone before the hours they gave", () => {
    // The bug: Aniya is free Sunday 13:00-20:00 and was handed 08:00-14:00.
    const { shifts } = sunday();
    for (const s of shifts) {
      const windows: Record<string, [string, string]> = {
        marty: ["14:00", "20:00"], mike: ["05:30", "14:30"],
        aniya: ["13:00", "20:00"], joe: ["08:00", "14:00"], devin: ["12:00", "20:00"],
      };
      const [from, to] = windows[s.staff_id];
      expect(s.start_time >= from).toBe(true);
      expect(s.end_time <= to).toBe(true);
    }
  });

  it("gives Aniya the afternoon, never the morning shift", () => {
    const { shifts } = sunday();
    for (const s of shifts.filter((x) => x.staff_id === "aniya")) {
      expect(s.start_time >= "13:00").toBe(true);
    }
  });

  it("still opens and closes the day around those windows", () => {
    // Mike opens inside (he is the only one free at 05:30) and Marty closes.
    const { shifts } = sunday();
    const sun = "2026-11-01"; // a Sunday
    const inside = on(shifts, sun, "inside");
    expect(inside[0].staff_id).toBe("mike");
    expect(inside[0].start_time).toBe("05:30");
    expect(inside[inside.length - 1].end_time).toBe("20:00");
  });

  it("leaves no gap even when the split has to move off the halfway point", () => {
    // Mike is free to 14:30 and Marty only from 14:00, so a rigid 13:00
    // handover is impossible; the shifts must still meet.
    const { shifts } = sunday();
    for (const group of ["inside", "outside"] as const) {
      const day = on(shifts, "2026-11-01", group)
        .map((s) => ({ group, start_time: s.start_time, end_time: s.end_time }));
      const rule = proShopRules().find((r) => r.group === group && r.weekday === 0)!;
      expect(coverageGaps(day, rule)).toEqual([]);
    }
  });

  it("reports the stretch nobody can cover instead of forcing someone into it", () => {
    // Only a late person: the morning is genuinely uncoverable.
    const staff = [
      person({ id: "late", position: "golf_ops_assistant", default_group: "inside",
        availability: { weekly: {
          sun: { works: true, start: "15:00", end: "20:00" },
          mon: { works: false }, tue: { works: false }, wed: { works: false },
          thu: { works: false }, fri: { works: false }, sat: { works: false },
        } } }),
    ];
    const { shifts, unfilled } = generateCoverageMonth({
      staff, year: 2026, month0: 10, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    expect(shifts.every((s) => s.start_time >= "15:00")).toBe(true);
    const morning = unfilled.find((u) => u.date === "2026-11-01" && u.group === "inside");
    expect(morning?.start).toBe("05:30");
    expect(morning?.end).toBe("15:00");
  });

  it("caps one person's day rather than handing them open-to-close", () => {
    const staff = [
      person({ id: "anytime", position: "golf_ops_assistant", default_group: "inside",
        availability: { weekly: {
          sun: { works: true }, mon: { works: true }, tue: { works: true },
          wed: { works: true }, thu: { works: true }, fri: { works: true }, sat: { works: true },
        } } }),
    ];
    const { shifts, unfilled } = generateCoverageMonth({
      staff, year: 2026, month0: 10, timeOff: [], rules: proShopRules(), area: "pro_shop",
    });
    const inside = on(shifts, "2026-11-01", "inside");
    // A day with no recorded times is fully open, but the 8h30 cap still
    // applies — one person cannot be given a 14.5-hour Sunday.
    expect(inside).toHaveLength(1);
    expect(inside[0].start_time).toBe("05:30");
    expect(inside[0].end_time).toBe("14:00");
    // …and the rest of the window is reported, not quietly dropped.
    expect(unfilled.some((u) => u.date === "2026-11-01" && u.start === "14:00" && u.end === "20:00"))
      .toBe(true);
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

describe("openSlotsForDay — what prints as a blank line", () => {
  const monday = proShopRules().filter((r) => r.weekday === 1);
  const thursday = proShopRules().filter((r) => r.weekday === 4);
  const s = (group: ShiftGroup, start: string, end: string) =>
    ({ group, start_time: start, end_time: end });

  it("finds nothing when the day is fully staffed", () => {
    expect(openSlotsForDay([
      s("inside", "06:00", "13:00"), s("inside", "13:00", "20:00"),
      s("outside", "08:00", "14:00"), s("outside", "14:00", "20:00"),
    ], monday)).toEqual([]);
  });

  it("returns the uncovered stretch so it can be written on", () => {
    const open = openSlotsForDay([
      s("inside", "06:00", "13:00"), s("inside", "13:00", "20:00"),
      s("outside", "08:00", "14:00"),
    ], monday);
    expect(open).toEqual([
      { group: "outside", start: "14:00", end: "20:00", kind: "gap" },
    ]);
  });

  it("names the missing third rec aid on a busy day", () => {
    // Thursday wants 3 outside; the window is covered but only 2 are on.
    const open = openSlotsForDay([
      s("inside", "06:00", "13:00"), s("inside", "13:00", "20:00"),
      s("outside", "08:00", "14:00"), s("outside", "14:00", "20:00"),
    ], thursday);
    expect(open).toEqual([
      { group: "outside", start: "15:00", end: "20:00", kind: "extra" },
    ]);
  });

  it("reports the whole window when nobody at all is scheduled", () => {
    const open = openSlotsForDay([], monday);
    expect(open).toContainEqual({ group: "inside", start: "06:00", end: "20:00", kind: "gap" });
    expect(open).toContainEqual({ group: "outside", start: "08:00", end: "20:00", kind: "gap" });
  });

  it("does not double-count a gap as a headcount shortfall too", () => {
    // One outside person and one hole: that is ONE open shift, not two.
    const open = openSlotsForDay([
      s("inside", "06:00", "13:00"), s("inside", "13:00", "20:00"),
      s("outside", "08:00", "14:00"),
    ], monday).filter((o) => o.group === "outside");
    expect(open).toHaveLength(1);
  });
});

describe("per-day overrides", () => {
  // 2026-08-15 is a Saturday.
  const SATURDAY = "2026-08-15";

  it("builds a day to the overridden headcount, not the weekday rule's", () => {
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
      overrides: { [SATURDAY]: { groups: { outside: { base: 2, extra: 0 } } } },
    });
    // Two rec aids splitting the Saturday window instead of two plus an extra…
    expect(on(shifts, SATURDAY, "outside")).toHaveLength(2);
    // …while the following Saturday still gets the rule's three.
    expect(on(shifts, "2026-08-22", "outside")).toHaveLength(3);
    // …and the other group that day is untouched.
    expect(on(shifts, SATURDAY, "inside")).toHaveLength(2);
  });

  it("treats a hand-set number as a ceiling, and shows what that leaves open", () => {
    // One person cannot cover 08:00–20:00 under the 8h30 cap. On an ordinary
    // day the generator would add a second; on a day the GM set to one it
    // honours the one and lets the shortfall show as an open shift.
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
      overrides: { [SATURDAY]: { groups: { outside: { base: 1, extra: 0 } } } },
    });
    const outside = on(shifts, SATURDAY, "outside");
    expect(outside).toHaveLength(1);
    expect(outside[0].end_time).toBe("16:30");
    // The uncovered evening is visible rather than silently filled.
    const open = openSlotsForDay(
      outside.map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time })),
      [{
        group: "outside", open_time: "08:00", close_time: "20:00",
        base_staff: 1, extra_staff: 0, extra_start: null,
      }],
    );
    expect(open).toContainEqual({ group: "outside", start: "16:30", end: "20:00", kind: "gap" });
  });

  it("still adds a fourth person on an ordinary day when hours leave a hole", () => {
    // The ceiling applies ONLY to days the GM set a number for. A normal day
    // keeps covering the window whatever that takes.
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
    });
    const outside = on(shifts, SATURDAY, "outside");
    expect(outside.length).toBeGreaterThanOrEqual(2);
    expect(outside[0].start_time).toBe("08:00");
    expect(outside[outside.length - 1].end_time).toBe("20:00");
  });

  it("places nobody, and reports no hole, on a group set to zero", () => {
    const { shifts, unfilled } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
      overrides: { [SATURDAY]: { groups: { outside: { base: 0, extra: 0 } } } },
    });
    expect(on(shifts, SATURDAY, "outside")).toHaveLength(0);
    // A day deliberately left unstaffed is not an unfilled slot. Reporting it
    // would train the GM to ignore the warning that matters.
    expect(unfilled.filter((u) => u.date === SATURDAY && u.group === "outside")).toEqual([]);
  });

  it("shows no open shifts for a group set to zero", () => {
    const zeroed: CoverageRule[] = [{
      id: "out-6", area: "pro_shop", weekday: 6, group: "outside",
      open_time: "08:00", close_time: "20:00",
      base_staff: 0, extra_staff: 0, extra_start: null,
    }];
    expect(openSlotsForDay([], zeroed)).toEqual([]);
  });

  it("leaves a held day entirely alone", () => {
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
      overrides: { [SATURDAY]: { locked: true } },
    });
    expect(shifts.filter((s) => s.shift_date === SATURDAY)).toEqual([]);
    // Every other day is still built.
    expect(shifts.filter((s) => s.shift_date === "2026-08-22").length).toBeGreaterThan(0);
  });
});

describe("every shift belongs to a job its own schedule has", () => {
  // The maintenance crew's shifts were once filed under the pro shop's
  // "outside" group. They showed on the month grid only because the grid
  // happened to render that group, and vanished the moment it stopped.
  // A shift outside its area's jobs is invisible on that area's board.
  it("never files a shift under another schedule's job", () => {
    const crew = ["jorge", "payton", "bart"].map((id, i) =>
      person({
        id, area: "maintenance", position: "maintenance_crew",
        default_group: "grounds", sort_order: i,
      }));
    const groundsRules: CoverageRule[] = Array.from({ length: 7 }, (_, weekday) => ({
      id: `grd-${weekday}`, area: "maintenance" as const, weekday, group: "grounds" as const,
      open_time: "05:00", close_time: "13:30",
      base_staff: 2, extra_staff: 0, extra_start: null,
    }));
    const { shifts: placed } = generateCoverageMonth({
      staff: crew, year: 2026, month0: 8, timeOff: [],
      rules: groundsRules, area: "maintenance",
    });
    expect(placed.length).toBeGreaterThan(0);
    for (const shift of placed) expect(AREA_GROUPS.maintenance).toContain(shift.group);
  });

  it("keeps each area's generated shifts inside that area's jobs", () => {
    const everyone = [
      ...roster(),
      person({ id: "jorge", area: "maintenance", position: "maintenance_crew", default_group: "grounds" }),
      person({ id: "nathan", area: "buckleys", position: "restaurant_staff", default_group: "restaurant" }),
    ];
    for (const area of ["pro_shop", "maintenance", "buckleys"] as const) {
      const rules: CoverageRule[] = [{
        id: `r-${area}`, area, weekday: 1, group: AREA_GROUPS[area][0],
        open_time: "09:00", close_time: "17:00",
        base_staff: 1, extra_staff: 0, extra_start: null,
      }];
      const { shifts: placed } = generateCoverageMonth({
        staff: everyone, year: 2026, month0: 8, timeOff: [], rules, area,
      });
      for (const shift of placed) expect(AREA_GROUPS[area]).toContain(shift.group);
    }
  });
});

describe("the real pro-shop roster, scheduled on the hours they gave", () => {
  /** Availability as it actually stands in pro_shop_staff. */
  function shifts(days: Record<string, [string, string]>) {
    const weekly: Record<string, { works: boolean; start?: string; end?: string }> = {
      sun: { works: false }, mon: { works: false }, tue: { works: false },
      wed: { works: false }, thu: { works: false }, fri: { works: false }, sat: { works: false },
    };
    for (const [day, hours] of Object.entries(days)) {
      weekly[day] = { works: true, start: hours[0], end: hours[1] };
    }
    return { weekly } as ProShopStaff["availability"];
  }

  const roster: ProShopStaff[] = [
    person({ id: "DJ", position: "golf_ops_assistant", default_group: "inside", sort_order: 10,
      availability: shifts({ mon: ["06:00", "12:30"], tue: ["06:00", "13:00"], wed: ["06:00", "12:30"], thu: ["06:00", "12:30"] }) }),
    person({ id: "Marty", position: "golf_ops_assistant", default_group: "inside", sort_order: 11,
      availability: shifts({ sun: ["14:00", "20:00"], mon: ["12:30", "20:00"], sat: ["14:00", "20:00"] }) }),
    person({ id: "Mike", position: "golf_ops_assistant", default_group: "inside", sort_order: 12,
      availability: shifts({ sun: ["05:30", "14:30"], wed: ["12:30", "20:00"], thu: ["12:30", "20:00"], fri: ["11:30", "20:00"], sat: ["05:30", "14:30"] }) }),
    person({ id: "Joe", sort_order: 20,
      availability: shifts({ sun: ["08:00", "14:00"], mon: ["08:00", "14:00"], tue: ["14:00", "20:00"], sat: ["08:00", "14:00"] }) }),
    person({ id: "Tony", sort_order: 22,
      availability: shifts({ wed: ["08:00", "14:00"], thu: ["08:00", "14:00"], fri: ["08:00", "14:00"], sat: ["12:00", "18:00"] }) }),
    person({ id: "Aniya", flex: true, sort_order: 23,
      availability: shifts({ sun: ["13:00", "20:00"], tue: ["13:00", "20:00"], wed: ["13:00", "20:00"], thu: ["13:00", "20:00"], fri: ["13:00", "20:00"] }) }),
    person({ id: "Colin", sort_order: 25,
      availability: shifts({ tue: ["08:00", "14:00"], wed: ["08:00", "14:00"], thu: ["08:00", "14:00"], fri: ["08:00", "14:00"], sat: ["08:00", "14:00"] }) }),
  ];

  const september = () => generateCoverageMonth({
    staff: roster, year: 2026, month0: 8, timeOff: [],
    rules: proShopRules(), area: "pro_shop",
  });

  it("gives people the hours they actually gave, to the minute", () => {
    // 2026-09-02 is a Wednesday: DJ said 06:00–12:30, Mike said 12:30–20:00.
    // That is their Wednesday — no invented boundary anywhere near it.
    const { shifts: placed } = september();
    expect(on(placed, "2026-09-02", "inside").map((s) => `${s.start_time}-${s.end_time} ${s.staff_id}`))
      .toEqual(["06:00-12:30 DJ", "12:30-20:00 Mike"]);
  });

  it("trims the one person who listed more than the cap", () => {
    // Mike's Sunday is 05:30–14:30 — nine hours on site. He works 8h30 of it,
    // and Marty picks the counter up at 14:00 exactly as he said he would.
    const { shifts: placed } = september();
    expect(on(placed, "2026-09-06", "inside").map((s) => `${s.start_time}-${s.end_time} ${s.staff_id}`))
      .toEqual(["05:30-14:00 Mike", "14:00-20:00 Marty"]);
  });

  it("never has two golf ops on together for more than the handover", () => {
    const { shifts: placed } = september();
    const byDate = new Map<string, PlannedCoverageShift[]>();
    for (const shift of placed.filter((s) => s.group === "inside")) {
      byDate.set(shift.shift_date, [...(byDate.get(shift.shift_date) ?? []), shift]);
    }
    for (const [date, day] of byDate) {
      const spans = day
        .map((s) => ({ start: minutesOfDay(s.start_time), end: minutesOfDay(s.end_time) }))
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < spans.length; i++) {
        const overlap = Math.min(spans[i - 1].end, spans[i].end) - spans[i].start;
        expect({ date, overlap }).toEqual({ date, overlap: Math.min(overlap, 30) });
      }
    }
  });

  it("still lets two rec aids work the afternoon together", () => {
    const { shifts: placed } = september();
    const wednesday = on(placed, "2026-09-02", "outside");
    expect(wednesday.map((s) => `${s.start_time}-${s.end_time} ${s.staff_id}`))
      .toEqual(["08:00-14:00 Tony", "13:00-20:00 Aniya"]);
  });

  it("reports the stretches this roster genuinely cannot cover", () => {
    // Nobody on the golf ops roster works a Friday morning. That is a real
    // hole in the staffing, and it is named rather than papered over.
    const { unfilled } = september();
    expect(unfilled.some((slot) =>
      slot.date === "2026-09-04" && slot.group === "inside"
      && slot.start === "06:00" && slot.end === "11:30")).toBe(true);
  });
});

describe("Buckley's Restaurant — the third schedule", () => {
  /** Seeded rules: 11:00–20:00, two people, every day. */
  function buckleysRules(): CoverageRule[] {
    return Array.from({ length: 7 }, (_, weekday) => ({
      id: `rst-${weekday}`, area: "buckleys" as const, weekday, group: "restaurant" as const,
      open_time: "11:00", close_time: "20:00",
      base_staff: 2, extra_staff: 0, extra_start: null,
    }));
  }

  const crew = ["nathan", "rosie", "patrice", "ruben"].map((id, i) =>
    person({
      id, area: "buckleys", position: "restaurant_staff",
      default_group: "restaurant", sort_order: i,
    }));

  const plan = () => generateCoverageMonth({
    staff: crew, year: 2026, month0: 8, timeOff: [],
    rules: buckleysRules(), area: "buckleys",
  });

  it("covers the nine-hour window with two near-full shifts", () => {
    const { shifts, unfilled } = plan();
    expect(unfilled).toEqual([]);
    expect(on(shifts, "2026-09-14", "restaurant").map((s) => `${s.start_time}-${s.end_time}`))
      .toEqual(["11:00-19:30", "11:30-20:00"]);
  });

  it("leaves no uncovered minute all month", () => {
    const { shifts } = plan();
    for (const date of [...new Set(shifts.map((s) => s.shift_date))]) {
      const day = shifts
        .filter((s) => s.shift_date === date)
        .map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time }));
      expect(coverageGaps(day, {
        group: "restaurant", open_time: "11:00", close_time: "20:00",
      })).toEqual([]);
    }
  });

  it("keeps the pro shop's people out of the restaurant, and vice versa", () => {
    const { shifts } = generateCoverageMonth({
      staff: [...crew, ...roster()], year: 2026, month0: 8, timeOff: [],
      rules: [...buckleysRules(), ...proShopRules()], area: "buckleys",
    });
    const ids = new Set(shifts.map((s) => s.staff_id));
    expect([...ids].sort()).toEqual(["nathan", "patrice", "rosie", "ruben"]);
    expect(shifts.every((s) => s.group === "restaurant")).toBe(true);
  });
});

describe("stretches the GM says need nobody", () => {
  // 2026-08-17 is a Monday. One rec aid finishes at 14:00, the next starts at
  // 16:00, and Tyson is happy with that — 14:00–16:00 needs nobody.
  const MONDAY = "2026-08-17";
  const AFTERNOON = { start: "14:00", end: "16:00" };
  const monday = proShopRules().filter((r) => r.weekday === 1);
  const excused = monday.map((rule) =>
    rule.group === "outside" ? { ...rule, unstaffed: [AFTERNOON] } : rule);
  const s = (group: ShiftGroup, start: string, end: string) =>
    ({ group, start_time: start, end_time: end });
  const day = [
    s("inside", "06:00", "14:30"), s("inside", "14:00", "20:00"),
    s("outside", "08:00", "14:00"), s("outside", "16:00", "20:00"),
  ];

  it("stops calling the excused stretch a gap", () => {
    expect(coverageGaps(day, { group: "outside", open_time: "08:00", close_time: "20:00" }))
      .toEqual([{ start: "14:00", end: "16:00" }]);
    expect(coverageGaps(day, {
      group: "outside", open_time: "08:00", close_time: "20:00", unstaffed: [AFTERNOON],
    })).toEqual([]);
  });

  it("stops printing a blank line for it", () => {
    expect(openSlotsForDay(day, monday))
      .toContainEqual({ group: "outside", start: "14:00", end: "16:00", kind: "gap" });
    expect(openSlotsForDay(day, excused)).toEqual([]);
  });

  it("leaves the other group's holes alone", () => {
    const short = [s("outside", "08:00", "14:00"), s("outside", "16:00", "20:00")];
    const open = openSlotsForDay(short, excused);
    expect(open.every((slot) => slot.group === "inside")).toBe(true);
    expect(open.length).toBeGreaterThan(0);
  });

  it("does not send anybody in to cover it, or report it unfilled", () => {
    // A rec aid free all day would otherwise be walked straight through it.
    const staff = [
      person({ id: "early", availability: { weekly: {
        sun: { works: true, start: "08:00", end: "14:00" },
        mon: { works: true, start: "08:00", end: "14:00" },
        tue: { works: true, start: "08:00", end: "14:00" },
        wed: { works: true, start: "08:00", end: "14:00" },
        thu: { works: true, start: "08:00", end: "14:00" },
        fri: { works: true, start: "08:00", end: "14:00" },
        sat: { works: true, start: "08:00", end: "14:00" },
      } } }),
      person({ id: "anytime", sort_order: 5 }),
    ];
    const { shifts, unfilled } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
      overrides: { [MONDAY]: { unstaffed: { outside: [AFTERNOON] } } },
    });
    const outside = on(shifts, MONDAY, "outside");
    // Nobody is on between 14:00 and 16:00…
    for (const shift of outside) {
      expect(shift.start_time >= "16:00" || shift.end_time <= "14:00").toBe(true);
    }
    // …the window is still covered either side of it…
    expect(outside.map((x) => `${x.start_time}-${x.end_time}`))
      .toEqual(["08:00-14:00", "16:00-20:00"]);
    // …and it is not reported as a hole, because it is not one.
    expect(unfilled.filter((slot) =>
      slot.date === MONDAY && slot.group === "outside")).toEqual([]);
  });

  it("still reports a genuine hole on the same day", () => {
    const staff = [person({ id: "morning", availability: { weekly: {
      sun: { works: true, start: "08:00", end: "14:00" },
      mon: { works: true, start: "08:00", end: "14:00" },
      tue: { works: false }, wed: { works: false }, thu: { works: false },
      fri: { works: false }, sat: { works: false },
    } } })];
    const { unfilled } = generateCoverageMonth({
      staff, year: 2026, month0: 7, timeOff: [], rules: proShopRules(), area: "pro_shop",
      overrides: { [MONDAY]: { unstaffed: { outside: [AFTERNOON] } } },
    });
    // 14:00–16:00 is excused; 16:00–20:00 is a real hole and is named.
    expect(unfilled.some((slot) =>
      slot.date === MONDAY && slot.group === "outside"
      && slot.start === "16:00" && slot.end === "20:00")).toBe(true);
    expect(unfilled.some((slot) =>
      slot.date === MONDAY && slot.group === "outside" && slot.start === "14:00")).toBe(false);
  });
});

describe("rebuilding a chosen window", () => {
  it("builds only the dates it was given", () => {
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
      dates: ["2026-08-17", "2026-08-18"],
    });
    expect([...new Set(shifts.map((s) => s.shift_date))].sort())
      .toEqual(["2026-08-17", "2026-08-18"]);
  });

  it("drops a held day out of the window it was handed", () => {
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
      dates: ["2026-08-17", "2026-08-18"],
      overrides: { "2026-08-18": { locked: true } },
    });
    expect([...new Set(shifts.map((s) => s.shift_date))]).toEqual(["2026-08-17"]);
  });

  it("builds the whole month when given no window, as it always has", () => {
    const { shifts } = generateCoverageMonth({
      staff: roster(), year: 2026, month0: 7, timeOff: [], rules: proShopRules(),
      area: "pro_shop",
    });
    expect(new Set(shifts.map((s) => s.shift_date)).size).toBe(31);
  });
});
