// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  fiscalYearPeriod,
  isIsoDate,
  needsAnnualEvaluation,
  ninetyDayPeriod,
  ninetyDayTiming,
} from "@/lib/evaluations/period";
import { evaluationEditHref, evaluationListHref } from "@/lib/evaluations/links";
import { kindFilter, splitRoster, type RosterProfile } from "@/lib/evaluations/use-evaluations";
import type { StaffEvaluation } from "@/lib/evaluations/types";

const FY2026 = fiscalYearPeriod(2026); // 2025-10-01 .. 2026-09-30

describe("date helpers", () => {
  it("counts days and adds days across months and leap years", () => {
    expect(daysBetween("2026-07-02", "2026-09-30")).toBe(90);
    expect(daysBetween("2026-09-30", "2026-07-02")).toBe(-90);
    expect(addDays("2026-06-01", 90)).toBe("2026-08-30");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("needsAnnualEvaluation", () => {
  it("skips the yearly evaluation for anyone hired fewer than 90 days before Sep 30", () => {
    expect(needsAnnualEvaluation("2026-07-02", FY2026)).toBe(true); // exactly 90 days
    expect(needsAnnualEvaluation("2026-07-03", FY2026)).toBe(false); // 89 days
    expect(needsAnnualEvaluation("2026-09-15", FY2026)).toBe(false);
    expect(needsAnnualEvaluation("2026-06-01", FY2026)).toBe(true); // Colin O'Neill: 121 days
    expect(needsAnnualEvaluation("2004-06-08", FY2026)).toBe(true);
  });
  it("keeps people with no hire date on the list", () => {
    expect(needsAnnualEvaluation(null, FY2026)).toBe(true);
    expect(needsAnnualEvaluation("", FY2026)).toBe(true);
  });
});

describe("90-day period and timing", () => {
  it("runs from the hire date to the 90-day mark", () => {
    expect(ninetyDayPeriod("2026-06-01")).toEqual({ start: "2026-06-01", end: "2026-08-30", label: "90-Day" });
  });
  it("is upcoming, due, overdue, or out of the window", () => {
    const hire = "2026-08-01"; // mark 2026-10-30
    expect(ninetyDayTiming(hire, "2026-09-29")).toBeNull(); // 31 days out
    expect(ninetyDayTiming(hire, "2026-09-30")).toBe("upcoming"); // 30 days out
    expect(ninetyDayTiming(hire, "2026-10-23")).toBe("due"); // a week out
    expect(ninetyDayTiming(hire, "2026-10-30")).toBe("due"); // the mark
    expect(ninetyDayTiming(hire, "2026-10-31")).toBe("overdue");
    expect(ninetyDayTiming(hire, "2027-01-28")).toBe("overdue"); // 90 days late
    expect(ninetyDayTiming(hire, "2027-01-29")).toBeNull(); // long past
    expect(ninetyDayTiming(null, "2026-10-01")).toBeNull();
  });
});

describe("links and filters", () => {
  it("addresses yearly evaluations by FY and 90-day ones by hire date", () => {
    expect(evaluationEditHref("e1", { fy: 2026 })).toBe("/staff/evaluations/edit?employee=e1&fy=2026");
    expect(evaluationEditHref("e1", { ninetyDayStart: "2026-06-01" })).toBe(
      "/staff/evaluations/edit?employee=e1&kind=90day&start=2026-06-01",
    );
    expect(evaluationListHref({ fy: 2026 })).toBe("/staff/evaluations?fy=2026");
    expect(evaluationListHref({ ninetyDayStart: "2026-06-01" })).toBe("/staff/evaluations");
    expect(kindFilter("annual")).toBe("rating_reason=neq.ninety_day");
    expect(kindFilter("ninety_day")).toBe("rating_reason=eq.ninety_day");
  });
});

describe("splitRoster", () => {
  const person = (id: string, full_name: string, extra: Partial<RosterProfile> = {}): RosterProfile => ({
    id,
    full_name,
    role: "crew",
    is_active: true,
    supervisor_id: null,
    ...extra,
  });
  const row = (employee_id: string, extra: Partial<StaffEvaluation>): StaffEvaluation =>
    ({
      id: `ev-${employee_id}-${extra.rating_reason ?? "annual"}`,
      employee_id,
      period_start: FY2026.start,
      period_end: FY2026.end,
      period_label: "FY2026",
      status: "draft",
      rating_reason: "annual",
      supervisory: false,
      ratings: {},
      overall_rating: null,
      awards: {},
      answers: {},
      narrative: {},
      facts: {},
      form_version: "x",
      finalized_at: null,
      created_by: null,
      updated_by: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
      ...extra,
    }) as StaffEvaluation;

  const profiles = [
    person("gm", "Tyson Bruce"),
    person("old", "Oscar Gonzalez"),
    person("colin", "Colin O'Neill"),
    person("late", "Late Hire"),
    person("started", "Started Anyway"),
    person("nodate", "No Date"),
    person("gone", "Gone Away", { is_active: false }),
  ];
  const hireDates = new Map<string, string | null>([
    ["old", "2004-06-08"],
    ["colin", "2026-06-01"],
    ["late", "2026-08-20"],
    ["started", "2026-09-01"],
    ["gone", "2026-08-01"],
  ]);

  const split = splitRoster({
    profiles,
    annual: [row("started", {})],
    ninetyDay: [],
    hireDates,
    period: FY2026,
    viewer: { id: "gm", isManager: true },
    todayIso: "2026-10-05",
  });

  it("leaves recent hires off the yearly list but keeps one already started", () => {
    expect(split.entries.map((e) => e.profile.id).sort()).toEqual(["colin", "nodate", "old", "started"]);
    expect(split.notDue.map((e) => [e.profile.id, e.hireDate])).toEqual([["late", "2026-08-20"]]);
  });

  it("lists 90-day evaluations in the window, most urgent first", () => {
    // Late Hire (mark Nov 18) and Started Anyway (mark Nov 30) are more than
    // 30 days out, so only Colin (mark Aug 30) shows today.
    expect(split.ninetyDay.map((e) => [e.profile.id, e.timing, e.dueDate])).toEqual([["colin", "overdue", "2026-08-30"]]);
    const nextMonth = splitRoster({
      profiles,
      annual: [],
      ninetyDay: [],
      hireDates,
      period: FY2026,
      viewer: { id: "gm", isManager: true },
      todayIso: "2026-11-01",
    });
    expect(nextMonth.ninetyDay.map((e) => [e.profile.id, e.timing])).toEqual([
      ["colin", "overdue"],
      ["late", "upcoming"],
      ["started", "upcoming"],
    ]);
  });

  it("keeps an unfinished 90-day evaluation on the list after the window, and drops a final one", () => {
    const later = splitRoster({
      profiles,
      annual: [],
      ninetyDay: [
        row("old", { rating_reason: "ninety_day", period_start: "2025-01-02", period_end: "2025-04-02" }),
        row("colin", { rating_reason: "ninety_day", period_start: "2026-06-01", period_end: "2026-08-30", status: "final" }),
      ],
      hireDates,
      period: FY2026,
      viewer: { id: "gm", isManager: true },
      todayIso: "2027-06-01",
    });
    expect(later.ninetyDay.map((e) => [e.profile.id, e.progress, e.hireDate])).toEqual([["old", "in_progress", "2025-01-02"]]);
  });

  it("shows a supervisor only their direct reports", () => {
    const sup = splitRoster({
      profiles: [person("a", "A", { supervisor_id: "boss" }), person("b", "B"), person("boss", "Boss")],
      annual: [],
      ninetyDay: [],
      hireDates: new Map([["a", "2026-08-01"], ["b", "2026-08-01"]]),
      period: FY2026,
      viewer: { id: "boss", isManager: false },
      todayIso: "2026-10-05",
    });
    expect(sup.entries).toEqual([]);
    expect(sup.notDue.map((e) => e.profile.id)).toEqual(["a"]);
    expect(sup.ninetyDay.map((e) => e.profile.id)).toEqual(["a"]);
  });
});
