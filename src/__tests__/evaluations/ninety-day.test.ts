// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addDays,
  dueStatus,
  dueText,
  employedLongEnough,
  yearEndDueDate,
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
import { departuresByEmployee, sf52ActionOf } from "@/lib/staff/sf52-files";

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
  it("shows on the 90-day mark as due, and is overdue the day after", () => {
    const hire = "2026-08-01"; // mark 2026-10-30
    expect(ninetyDayTiming(hire, "2026-10-29")).toBeNull(); // not yet
    expect(ninetyDayTiming(hire, "2026-10-30")).toBe("due_soon"); // the mark: due today
    expect(ninetyDayTiming(hire, "2026-10-31")).toBe("overdue");
    expect(ninetyDayTiming(hire, "2027-01-28")).toBe("overdue"); // 90 days late
    expect(ninetyDayTiming(hire, "2027-01-29")).toBeNull(); // long past
    expect(ninetyDayTiming(null, "2026-10-01")).toBeNull();
  });
});

describe("due dates", () => {
  it("year-end evaluations are due Oct 31", () => {
    expect(yearEndDueDate(FY2026)).toBe("2026-10-31");
  });
  it("is due soon within 30 days and overdue after the date", () => {
    expect(dueStatus("2026-10-31", "2026-09-30")).toBe("upcoming"); // 31 days out
    expect(dueStatus("2026-10-31", "2026-10-01")).toBe("due_soon"); // 30 days out
    expect(dueStatus("2026-10-31", "2026-10-31")).toBe("due_soon"); // due today
    expect(dueStatus("2026-10-31", "2026-11-01")).toBe("overdue");
    expect(dueText("2026-10-31", "2026-10-31")).toBe("Due today");
    expect(dueText("2026-10-31", "2026-10-30")).toBe("Due in 1 day");
    expect(dueText("2026-10-31", "2026-11-03")).toBe("3 days overdue");
  });
  it("needs 90 days employed to show on the evaluation lists", () => {
    expect(employedLongEnough("2026-07-07", "2026-10-05")).toBe(true); // 90 days
    expect(employedLongEnough("2026-07-08", "2026-10-05")).toBe(false); // 89 days
    expect(employedLongEnough(null, "2026-10-05")).toBe(true); // unknown: keep
  });
});

describe("links and filters", () => {
  it("addresses yearly evaluations by FY and 90-day ones by hire date", () => {
    expect(evaluationEditHref("e1", { fy: 2026 })).toBe("/staff/evaluations/edit?employee=e1&fy=2026");
    expect(evaluationEditHref("e1", { ninetyDayStart: "2026-06-01" })).toBe(
      "/staff/evaluations/edit?employee=e1&kind=90day&start=2026-06-01",
    );
    expect(evaluationListHref({ fy: 2026 })).toBe("/staff/evaluations?fy=2026");
    expect(evaluationListHref({ ninetyDayStart: "2026-06-01" })).toBe("/staff/evaluations?tab=90day");
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

  it("hides anyone employed under 90 days, even when a yearly evaluation was already started", () => {
    // Late Hire (46 days) is nowhere. Started Anyway (34 days) had a year-end
    // evaluation begun, but new hires get only the 90-day one.
    expect(split.entries.map((e) => e.profile.id).sort()).toEqual(["colin", "nodate", "old"]);
    expect(split.notDue.map((e) => e.profile.id)).toEqual(["started"]);
    expect(split.ninetyDay.map((e) => e.profile.id)).toEqual(["colin"]);
  });

  it("keeps a finished yearly evaluation for a new hire as finished", () => {
    const done = splitRoster({ profiles, annual: [row("started", { status: "final" })], ninetyDay: [], hireDates, period: FY2026, viewer: { id: "gm", isManager: true }, todayIso: "2026-10-05" });
    expect(done.entries.find((e) => e.profile.id === "started")?.progress).toBe("final");
    expect(done.notDue).toEqual([]);
  });

  it("flags who on the yearly list has no hire date, unless hire dates couldn't be read", () => {
    expect(split.missingHireDate.map((p) => p.id)).toEqual(["nodate"]);
    const blind = splitRoster({ profiles, annual: [], ninetyDay: [], hireDates: new Map(), hireDatesKnown: false, period: FY2026, viewer: { id: "gm", isManager: true }, todayIso: "2026-10-05" });
    expect(blind.missingHireDate).toEqual([]);
  });

  it("takes anyone with a resignation or transfer SF-52 off both lists", () => {
    const files = [
      { employee_id: "old", category: "sf52_resignation", created_at: "2026-10-03T15:00:00Z" },
      { employee_id: "colin", category: "sf52_transfer", created_at: "2026-10-04T15:00:00Z" },
      { employee_id: "nodate", category: "sf52", created_at: "2026-10-04T15:00:00Z" }, // a pay change: stays
    ];
    const departures = departuresByEmployee(files);
    expect([...departures.keys()].sort()).toEqual(["colin", "old"]);
    const leaving = splitRoster({ profiles, annual: [], ninetyDay: [], hireDates, departures, period: FY2026, viewer: { id: "gm", isManager: true }, todayIso: "2026-10-05" });
    expect(leaving.entries.map((e) => e.profile.id)).toEqual(["nodate"]);
    expect(leaving.ninetyDay).toEqual([]); // Colin's overdue 90-day evaluation is gone too
    expect(leaving.departing.map((d) => [d.profile.id, d.action])).toEqual([
      ["colin", "transfer"],
      ["old", "resignation"],
    ]);
    // An evaluation already finished stays as finished.
    const finished = splitRoster({ profiles, annual: [row("old", { status: "final" })], ninetyDay: [], hireDates, departures, period: FY2026, viewer: { id: "gm", isManager: true }, todayIso: "2026-10-05" });
    expect(finished.entries.find((e) => e.profile.id === "old")?.progress).toBe("final");
  });

  it("reads the SF-52 action from the document category", () => {
    expect(sf52ActionOf("sf52_resignation")).toBe("resignation");
    expect(sf52ActionOf("sf52_transfer")).toBe("transfer");
    expect(sf52ActionOf("sf52")).toBe("other");
    expect(sf52ActionOf("review")).toBeNull();
    // The newest resignation/transfer wins.
    const d = departuresByEmployee([
      { employee_id: "a", category: "sf52_transfer", created_at: "2026-01-01T00:00:00Z" },
      { employee_id: "a", category: "sf52_resignation", created_at: "2026-10-01T00:00:00Z" },
    ]);
    expect(d.get("a")).toEqual({ action: "resignation", uploadedAt: "2026-10-01T00:00:00Z" });
  });

  it("dates the year-end list and flags what's overdue", () => {
    expect(split.entries.every((e) => e.dueDate === "2026-10-31")).toBe(true);
    expect(new Set(split.entries.map((e) => e.due))).toEqual(new Set(["due_soon"]));
    const afterDue = splitRoster({ profiles, annual: [row("old", { status: "final" })], ninetyDay: [], hireDates, period: FY2026, viewer: { id: "gm", isManager: true }, todayIso: "2026-11-02" });
    expect(afterDue.entries.find((e) => e.profile.id === "colin")?.due).toBe("overdue");
    expect(afterDue.entries.find((e) => e.profile.id === "old")?.due).toBeNull(); // finished
    expect(afterDue.entries.at(-1)?.profile.id).toBe("old"); // finished last
    const nextYear = splitRoster({ profiles, annual: [], ninetyDay: [], hireDates, period: fiscalYearPeriod(2027), viewer: { id: "gm", isManager: true }, todayIso: "2026-11-02" });
    expect(nextYear.entries.find((e) => e.profile.id === "old")?.due).toBe("upcoming");
  });

  it("lists 90-day evaluations from the mark, most urgent first", () => {
    // Colin's mark (Aug 30) has passed: overdue.
    expect(split.ninetyDay.map((e) => [e.profile.id, e.due, e.dueDate])).toEqual([["colin", "overdue", "2026-08-30"]]);
    // On Nov 18 Late Hire reaches the mark (due today) and the year-end note shows them.
    const lateMark = splitRoster({
      profiles,
      annual: [],
      ninetyDay: [],
      hireDates,
      period: FY2026,
      viewer: { id: "gm", isManager: true },
      todayIso: "2026-11-18",
    });
    expect(lateMark.ninetyDay.map((e) => [e.profile.id, e.due])).toEqual([
      ["colin", "overdue"],
      ["late", "due_soon"],
    ]);
    expect(lateMark.notDue.map((e) => e.profile.id)).toEqual(["late"]);
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
      todayIso: "2026-10-30", // their 90-day mark
    });
    expect(sup.entries).toEqual([]);
    expect(sup.notDue.map((e) => e.profile.id)).toEqual(["a"]);
    expect(sup.ninetyDay.map((e) => e.profile.id)).toEqual(["a"]);
  });
});
