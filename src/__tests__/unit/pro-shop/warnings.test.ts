import { describe, it, expect } from "vitest";
import { dayWarnings, activeWarnings } from "@/lib/pro-shop/schedule-engine";
import type { ShiftGroup } from "@/lib/pro-shop/types";

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
