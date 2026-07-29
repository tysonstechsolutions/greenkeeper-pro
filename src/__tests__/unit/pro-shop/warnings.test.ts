import { describe, it, expect } from "vitest";
import { dayWarnings, activeWarnings } from "@/lib/pro-shop/schedule-engine";
import type { CoverageRule, ShiftGroup } from "@/lib/pro-shop/types";

function shift(group: ShiftGroup, start: string, end: string) {
  return { group, start_time: start, end_time: end };
}

describe("dayWarnings (structured)", () => {
  it("flags an empty day with both missing-group codes", () => {
    const codes = dayWarnings([]).map((w) => w.code);
    expect(codes).toContain("no_outside");
    expect(codes).toContain("no_inside");
  });

  it("returns no warnings for a fully-covered day", () => {
    const shifts = [
      shift("inside", "07:00", "19:00"),
      shift("outside", "08:00", "19:00"),
    ];
    expect(dayWarnings(shifts)).toEqual([]);
  });

  it("flags a missing inside opener and closer", () => {
    const shifts = [
      shift("inside", "09:00", "17:00"),
      shift("outside", "08:00", "19:00"),
    ];
    const codes = dayWarnings(shifts).map((w) => w.code);
    expect(codes).toContain("no_inside_opener");
    expect(codes).toContain("no_inside_closer");
    expect(codes).not.toContain("no_inside");
  });

  it("gives every warning a human-readable message", () => {
    for (const w of dayWarnings([])) {
      expect(w.message.length).toBeGreaterThan(0);
    }
  });
});

describe("activeWarnings", () => {
  const warnings = dayWarnings([shift("outside", "08:00", "19:00")]); // missing inside

  it("filters out dismissed codes", () => {
    const active = activeWarnings(warnings, ["no_inside"]);
    expect(active.some((w) => w.code === "no_inside")).toBe(false);
  });

  it("keeps non-dismissed codes", () => {
    const active = activeWarnings(warnings, ["no_outside"]);
    expect(active.map((w) => w.code)).toEqual(warnings.map((w) => w.code));
  });

  it("returns all when nothing is dismissed", () => {
    expect(activeWarnings(warnings, [])).toEqual(warnings);
    expect(activeWarnings(warnings, undefined)).toEqual(warnings);
  });
});

describe("dayWarnings against recorded coverage rules", () => {
  // Monday: rec aids 08:00–20:00 with 2 people, golf ops 06:00–20:00 with 2.
  const monday: CoverageRule[] = [
    {
      id: "in", area: "pro_shop", weekday: 1, group: "inside",
      open_time: "06:00", close_time: "20:00", base_staff: 2, extra_staff: 0, extra_start: null,
    },
    {
      id: "out", area: "pro_shop", weekday: 1, group: "outside",
      open_time: "08:00", close_time: "20:00", base_staff: 2, extra_staff: 0, extra_start: null,
    },
  ];

  const covered = [
    shift("inside", "06:00", "13:00"), shift("inside", "13:00", "20:00"),
    shift("outside", "08:00", "14:00"), shift("outside", "14:00", "20:00"),
  ];

  it("says nothing when the rules are met exactly", () => {
    expect(dayWarnings(covered, "pro_shop", monday)).toEqual([]);
  });

  it("names the hole a hand-moved shift leaves, with its times", () => {
    // The GM drags the opener to 10:00 — 08:00-10:00 now has nobody on it.
    const shifts = [
      shift("inside", "06:00", "13:00"), shift("inside", "13:00", "20:00"),
      shift("outside", "10:00", "16:30"), shift("outside", "14:00", "20:00"),
    ];
    const warnings = dayWarnings(shifts, "pro_shop", monday);
    expect(warnings.map((w) => w.code)).toContain("coverage_gap_outside");
    expect(warnings.find((w) => w.code === "coverage_gap_outside")?.message)
      .toBe("Nobody on rec aids 0800-1000");
  });

  it("flags a day that is short a person even with no gap", () => {
    const shifts = [
      shift("inside", "06:00", "13:00"), shift("inside", "13:00", "20:00"),
      shift("outside", "08:00", "20:00"),
    ];
    const warnings = dayWarnings(shifts, "pro_shop", monday);
    expect(warnings.map((w) => w.code)).toContain("short_staffed_outside");
    expect(warnings.find((w) => w.code === "short_staffed_outside")?.message)
      .toBe("Only 1 of 2 rec aids scheduled");
  });

  it("drops the old opener/closer guesswork once rules exist", () => {
    // Inside opens at 06:00 and closes at 20:00 per the rule, so the legacy
    // 07:00/19:00 heuristics must not also fire.
    const codes = dayWarnings(covered, "pro_shop", monday).map((w) => w.code);
    expect(codes).not.toContain("no_inside_opener");
    expect(codes).not.toContain("no_inside_closer");
  });

  it("still uses the old heuristics when no rule is recorded", () => {
    const codes = dayWarnings(
      [shift("inside", "09:00", "15:00"), shift("outside", "09:00", "15:00")],
      "pro_shop",
      [],
    ).map((w) => w.code);
    expect(codes).toContain("no_inside_opener");
    expect(codes).toContain("no_inside_closer");
  });

  it("leaves the maintenance crew on its own simpler rule", () => {
    expect(dayWarnings([], "maintenance", monday).map((w) => w.code)).toEqual(["no_crew"]);
  });
});
