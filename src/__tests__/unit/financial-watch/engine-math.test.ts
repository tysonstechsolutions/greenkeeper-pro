import { describe, it, expect } from "vitest";
import {
  calendarYearElapsedFraction,
  federalFyElapsedFraction,
  paceRatio,
  projectLinear,
  pctChange,
} from "@/lib/financial-watch/engine";

describe("calendarYearElapsedFraction", () => {
  it("is 0 before the year starts", () => {
    expect(calendarYearElapsedFraction(2026, new Date("2025-12-31T12:00:00"))).toBe(0);
  });

  it("is 1 after the year ends", () => {
    expect(calendarYearElapsedFraction(2026, new Date("2027-06-01T12:00:00"))).toBe(1);
  });

  it("is ~0.5 at the start of July", () => {
    expect(
      calendarYearElapsedFraction(2026, new Date("2026-07-02T12:00:00")),
    ).toBeCloseTo(0.5, 1);
  });
});

describe("federalFyElapsedFraction", () => {
  it("is 0 before Oct 1 of the prior calendar year", () => {
    // FY2026 starts Oct 1 2025.
    expect(federalFyElapsedFraction(2026, new Date("2025-09-30T12:00:00"))).toBe(0);
  });

  it("is 1 after Sep 30 of the FY year", () => {
    expect(federalFyElapsedFraction(2026, new Date("2026-10-02T12:00:00"))).toBe(1);
  });

  it("is ~0.5 around April 1 (six fiscal months in)", () => {
    expect(
      federalFyElapsedFraction(2026, new Date("2026-04-01T12:00:00")),
    ).toBeCloseTo(0.5, 1);
  });
});

describe("paceRatio", () => {
  it("is null when no time has elapsed", () => {
    expect(paceRatio(0.5, 0)).toBeNull();
  });

  it("is >1 when spending outruns time", () => {
    expect(paceRatio(0.7, 0.5)).toBeCloseTo(1.4, 5);
  });

  it("is 0 when nothing is consumed", () => {
    expect(paceRatio(0, 0.5)).toBe(0);
  });
});

describe("projectLinear", () => {
  it("is null when no time has elapsed", () => {
    expect(projectLinear(500, 0)).toBeNull();
  });

  it("extrapolates spend to the full period", () => {
    expect(projectLinear(500, 0.5)).toBeCloseTo(1000, 5);
  });
});

describe("pctChange", () => {
  it("is null with no prior baseline", () => {
    expect(pctChange(80, 0)).toBeNull();
  });

  it("computes a decline", () => {
    expect(pctChange(80, 100)).toBeCloseTo(-0.2, 5);
  });

  it("computes growth", () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2, 5);
  });
});
