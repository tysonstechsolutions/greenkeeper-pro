/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { openShiftsForDay } from "@/lib/pro-shop/open-shifts";
import type { CoverageRule, WeekTemplate } from "@/lib/pro-shop/types";

const rule = (group: "inside" | "outside"): CoverageRule => ({
  id: group, area: "pro_shop", weekday: 1, group, open_time: "06:30:00", close_time: "19:30:00",
  base_staff: 1, extra_staff: 0, extra_start: null,
});

describe("openShiftsForDay", () => {
  const shifts = [{ staff_id: "dj", group: "inside" as const, start_time: "07:00:00", end_time: "19:00:00" }];

  it("uses the standard week's hours, so the real opening time isn't a hole", () => {
    // 2026-10-05 is a Monday.
    expect(openShiftsForDay("2026-10-05", shifts, [rule("inside")], {}).map((s) => `${s.start}-${s.end}`))
      .toEqual(["06:30-07:00", "19:00-19:30"]);
    const week: WeekTemplate = {
      id: "w", area: "pro_shop", effective_from: "2026-10-01", slots: [],
      hours: { 1: { inside: { open: "07:00", close: "19:00" } } },
    };
    expect(openShiftsForDay("2026-10-05", shifts, [rule("inside")], {}, [week])).toEqual([]);
  });

  it("skips a pro shop gap under 4 hours — the 07:00-08:00 and 14:00-16:00 nobody covers", () => {
    // Rec aids: Tony 08:00-14:00, Colin 16:00-19:00, against 07:00-19:00 hours.
    const day = [
      { staff_id: "tony", group: "outside" as const, start_time: "08:00", end_time: "14:00" },
      { staff_id: "colin", group: "outside" as const, start_time: "16:00", end_time: "19:00" },
    ];
    const hours: WeekTemplate = {
      id: "w", area: "pro_shop", effective_from: "2026-10-01", slots: [],
      hours: { 1: { outside: { open: "07:00", close: "19:00" } } },
    };
    const outside = { ...rule("outside"), base_staff: 1 };
    // Without an area, every hole is reported, as other schedules still do.
    expect(openShiftsForDay("2026-10-05", day, [outside], {}, [hours]).map((s) => `${s.start}-${s.end}`))
      .toEqual(["07:00-08:00", "14:00-16:00"]);
    // The pro shop doesn't call anyone in for an hour, or for two.
    expect(openShiftsForDay("2026-10-05", day, [outside], {}, [hours], "pro_shop")).toEqual([]);
  });

  it("still reports a pro shop gap of 4 hours or more", () => {
    const day = [{ staff_id: "tony", group: "outside" as const, start_time: "07:00", end_time: "14:00" }];
    const hours: WeekTemplate = {
      id: "w", area: "pro_shop", effective_from: "2026-10-01", slots: [],
      hours: { 1: { outside: { open: "07:00", close: "19:00" } } },
    };
    expect(openShiftsForDay("2026-10-05", day, [{ ...rule("outside"), base_staff: 1 }], {}, [hours], "pro_shop")
      .map((s) => `${s.start}-${s.end}`)).toEqual(["14:00-19:00"]);
  });

  it("with no rules, a standard-week slot nobody is on is the open shift", () => {
    const week: WeekTemplate = {
      id: "w", area: "maintenance", effective_from: "2026-10-01", hours: {},
      slots: [
        { id: "a", weekday: 1, group: "grounds", staff_id: "jorge", start: "05:00", end: "13:30" },
        { id: "b", weekday: 1, group: "grounds", staff_id: "payton", start: "05:00", end: "13:30" },
      ],
    };
    const onDay = [{ staff_id: "jorge", group: "grounds" as const, start_time: "05:00", end_time: "13:30", slot_id: "a" }];
    expect(openShiftsForDay("2026-10-05", onDay, [], {}, [week])).toEqual([
      { group: "grounds", start: "05:00", end: "13:30", kind: "gap", slot_id: "b" },
    ]);
    // excused for the day
    expect(openShiftsForDay("2026-10-05", onDay, [], { "2026-10-05": { removed_slots: ["b"] } }, [week])).toEqual([]);
  });
});
