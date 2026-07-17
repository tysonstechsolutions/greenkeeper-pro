import { describe, it, expect } from "vitest";
import {
  scoreProgram,
  scoreSection,
  rankStandards,
  currentStatusOf,
} from "@/lib/standards/scoring";
import type {
  ProgramStandard,
  StandardSection,
  StandardSubsection,
  StandardStatus,
  StandardWithStatus,
} from "@/lib/standards/types";

function section(s: string, name: string, weight: number): StandardSection {
  return { section: s, name, weight, sort_order: 0 };
}
function sub(
  subsection: string,
  s: string,
  earned: number,
  possible: number,
): StandardSubsection {
  return {
    subsection,
    section: s,
    earned,
    possible,
    count_y: 0,
    count_n: 0,
    count_na: 0,
    count_blank: 0,
    baseline_as_of: "2026-05-22",
  };
}
function std(
  code: string,
  s: string,
  status: StandardStatus,
  extra: Partial<ProgramStandard> = {},
): StandardWithStatus {
  return {
    standard: {
      id: `id-${code}`,
      code,
      section: s,
      subsection: `${s}.1`,
      title: `Standard ${code}`,
      standard_text: "text",
      expected_condition: null,
      current_state: null,
      possible_score: 10,
      recommended_actions: [],
      dependencies: [],
      owner_role: null,
      owner_profile_id: null,
      backup_profile_id: null,
      priority: "P2",
      effort: "Low",
      timeline: null,
      cost_estimate: 0,
      source_type: "navy_program_standard",
      source_document: null,
      requires_confirmation: false,
      evaluation_method: "manual",
      evaluation_frequency: null,
      evidence_requirements: [],
      verification_required: false,
      operational_status: "not_started",
      estimated_minutes: 60,
      impact_level: "medium",
      manager_target_date: null,
      not_applicable_reason: null,
      is_active: true,
      effective_date: null,
      version: 1,
      notes: null,
      created_by: null,
      updated_by: null,
      created_at: "2026-05-22T00:00:00Z",
      updated_at: "2026-05-22T00:00:00Z",
      ...extra,
      inactive_reason: extra.inactive_reason ?? null,
    },
    status,
    evaluatedAt: "2026-05-22",
    detail: null,
    openAction: null,
  };
}

describe("scoreSection", () => {
  it("computes percent from earned/possible", () => {
    const r = scoreSection(section("2", "Facilities", 20), [sub("2.1", "2", 38, 42)], []);
    expect(r.percent).toBe(90.5);
  });

  it("returns NULL percent (not 0) when nothing was scored", () => {
    const r = scoreSection(section("1", "Personnel", 10), [sub("1.1", "1", 0, 0)], []);
    expect(r.percent).toBeNull();
  });

  it("counts unknown separately from failing", () => {
    const standards = [
      std("1.1.1", "1", "critical"),
      std("1.1.2", "1", "below_standard"),
      std("1.1.3", "1", "not_evaluated"),
      std("1.1.4", "1", "meets_standard"),
    ];
    const r = scoreSection(section("1", "Personnel", 10), [], standards);
    expect(r.failing).toBe(2); // critical + below — NOT the unevaluated one
    expect(r.unknown).toBe(1);
    expect(r.critical).toBe(1);
  });
});

describe("scoreProgram", () => {
  const sections = [
    section("1", "Personnel", 10),
    section("2", "Facilities", 20),
  ];

  it("weights sections by their assessment weight", () => {
    // Personnel 50% @ weight 10, Facilities 100% @ weight 20
    // => (10*50 + 20*100) / 30 = 83.3
    const subs = [sub("1.1", "1", 5, 10), sub("2.1", "2", 10, 10)];
    const r = scoreProgram(sections, subs, []);
    expect(r.percent).toBe(83.3);
  });

  it("EXCLUDES unscored sections from the denominator instead of scoring them 0", () => {
    // Personnel unscored (possible 0), Facilities 100%.
    // Honest answer is 100% with 50% coverage — NOT 50%.
    const subs = [sub("1.1", "1", 0, 0), sub("2.1", "2", 10, 10)];
    const r = scoreProgram(sections, subs, []);
    expect(r.percent).toBe(100);
    expect(r.coverage).toBe(0.5);
  });

  it("returns NULL program percent when nothing anywhere is scored", () => {
    const r = scoreProgram(sections, [sub("1.1", "1", 0, 0)], []);
    expect(r.percent).toBeNull();
    expect(r.coverage).toBe(0);
  });

  it("counts only ACTIVE unowned standards as an ownership gap", () => {
    const standards = [
      std("1.1.1", "1", "critical"), // active + unowned → a real gap
      std("1.1.2", "1", "below_standard", { owner_profile_id: "p1" }), // owned
      std("1.1.3", "1", "below_standard", { is_active: false }), // retired: not a gap
    ];
    const r = scoreProgram(sections, [], standards);
    expect(r.unowned).toBe(1);
  });

  // Reproduces the real seeded numbers so the scorer can't silently drift from
  // the FY24 assessment: weights 10/20/30/15/25.
  it("matches the real FY24 weighting shape", () => {
    const real = [
      section("1", "Personnel", 10),
      section("2", "Facilities", 20),
      section("3", "Programs", 30),
      section("4", "Equipment", 15),
      section("5", "Administration", 25),
    ];
    const subs = [
      sub("1.1", "1", 0, 0), // never scored
      sub("2.1", "2", 38, 42),
      sub("3.1", "3", 15, 30),
      sub("4.1", "4", 5, 20),
      sub("5.1", "5", 10, 25),
    ];
    const r = scoreProgram(real, subs, []);
    // Personnel drops out (unscored) → coverage 4/5
    expect(r.coverage).toBe(0.8);
    expect(r.percent).not.toBeNull();
    expect(r.percent as number).toBeGreaterThan(0);
    expect(r.percent as number).toBeLessThan(100);
  });
});

describe("rankStandards", () => {
  it("puts critical first and unknown AFTER real problems", () => {
    const items = [
      std("a", "1", "meets_standard"),
      std("b", "1", "not_evaluated"),
      std("c", "1", "critical"),
      std("d", "1", "below_standard"),
    ];
    const ranked = rankStandards(items).map((s) => s.standard.code);
    expect(ranked).toEqual(["c", "d", "b", "a"]);
  });

  it("breaks status ties by assessment priority", () => {
    const items = [
      std("low", "1", "below_standard", { priority: "P4" }),
      std("high", "1", "below_standard", { priority: "P1" }),
    ];
    expect(rankStandards(items)[0].standard.code).toBe("high");
  });
});

describe("currentStatusOf", () => {
  it("is not_evaluated when there is no history", () => {
    expect(currentStatusOf([])).toBe("not_evaluated");
  });

  it("uses the NEWEST evaluation, not the worst", () => {
    expect(
      currentStatusOf([
        { status: "critical", evaluated_at: "2026-01-01T00:00:00Z" },
        { status: "meets_standard", evaluated_at: "2026-07-01T00:00:00Z" },
      ]),
    ).toBe("meets_standard");
  });
});
