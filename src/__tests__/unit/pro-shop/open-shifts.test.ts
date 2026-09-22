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
