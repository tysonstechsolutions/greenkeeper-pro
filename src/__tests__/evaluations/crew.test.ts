import { describe, expect, it } from "vitest";
import {
  applyCrewRating,
  applyCrewSupervisory,
  crewSteps,
  defaultSupervisory,
  unratedCount,
  type CrewMember,
} from "@/lib/evaluations/crew";
import { PERFORMANCE_ELEMENTS } from "@/lib/evaluations/form";

const member = (m: Partial<CrewMember> = {}): CrewMember => ({ ratings: {}, supervisory: false, overall: null, ...m });

describe("crew rating helpers", () => {
  it("defaults supervisors by role or by having direct reports", () => {
    const roster = [{ supervisor_id: "lead1" }, { supervisor_id: null }];
    expect(defaultSupervisory({ id: "x", role: "foreman" }, roster)).toBe(true);
    expect(defaultSupervisory({ id: "lead1", role: "crew" }, roster)).toBe(true);
    expect(defaultSupervisory({ id: "x", role: "crew" }, roster)).toBe(false);
  });

  it("applies the form's Unsatisfactory rule on a tap", () => {
    const m = applyCrewRating(member({ overall: 4 }), "quality", 1);
    expect(m.ratings.quality).toBe(1);
    expect(m.overall).toBe(1);
    expect(applyCrewRating(member({ overall: 4 }), "quality", 3).overall).toBe(4);
  });

  it("drops f-h ratings when someone is no longer rated as a supervisor", () => {
    const m = applyCrewSupervisory(member({ supervisory: true, ratings: { quality: 4, leadership: 5 } }), false);
    expect(m).toEqual({ supervisory: false, ratings: { quality: 4 }, overall: null });
  });

  it("only shows f-h steps when someone supervises", () => {
    expect(crewSteps(false)).toHaveLength(6);
    expect(crewSteps(true)).toHaveLength(9);
    expect(crewSteps(true)[0]).toEqual({ kind: "supervisors" });
  });

  it("counts who still needs a rating on an element", () => {
    const leadership = PERFORMANCE_ELEMENTS.find((e) => e.key === "leadership")!;
    const quality = PERFORMANCE_ELEMENTS.find((e) => e.key === "quality")!;
    const people = [
      { member: member({ ratings: { quality: 3 } }) },
      { member: member({ supervisory: true }) },
    ];
    expect(unratedCount(quality, people)).toBe(1);
    expect(unratedCount(leadership, people)).toBe(1);
  });
});
