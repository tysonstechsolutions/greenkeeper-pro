import { describe, expect, it } from "vitest";
import {
  asSentence,
  composeNarrative,
  evaluationProgress,
  firstName,
  narrativeComplete,
  suggestOverall,
} from "@/lib/evaluations/compose";
import { NARRATIVE_SECTIONS, PERFORMANCE_ELEMENTS } from "@/lib/evaluations/form";
import {
  defaultPeriod,
  fiscalYearOf,
  fiscalYearPeriod,
  inPeriod,
  periodChoices,
  periodFromFyParam,
} from "@/lib/evaluations/period";
import {
  elementNoteId,
  interviewComplete,
  missingAnswers,
  missingRatings,
} from "@/lib/evaluations/questions";
import type { EvaluationRatings, RatingValue, StaffEvaluation } from "@/lib/evaluations/types";

/** Every element rated `value`. */
function allRated(value: RatingValue): EvaluationRatings {
  return Object.fromEntries(PERFORMANCE_ELEMENTS.map((e) => [e.key, value])) as EvaluationRatings;
}

function evaluation(overrides: Partial<StaffEvaluation> = {}): StaffEvaluation {
  return {
    id: "ev1",
    employee_id: "emp1",
    period_start: "2025-10-01",
    period_end: "2026-09-30",
    period_label: "FY2026",
    status: "draft",
    ratings: {},
    overall_rating: null,
    answers: {},
    narrative: {},
    facts: {},
    form_version: "generic-v1",
    finalized_at: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

describe("rating periods", () => {
  it("follows the federal fiscal year", () => {
    expect(fiscalYearOf("2026-09-30")).toBe(2026);
    expect(fiscalYearOf("2026-10-01")).toBe(2027);
    expect(fiscalYearOf("2026-01-15")).toBe(2026);
    expect(fiscalYearPeriod(2026)).toEqual({ start: "2025-10-01", end: "2026-09-30", label: "FY2026" });
  });

  it("defaults to the most recently completed fiscal year", () => {
    expect(defaultPeriod("2026-10-02").label).toBe("FY2026");
    expect(defaultPeriod("2026-09-30").label).toBe("FY2025");
    expect(periodChoices("2026-10-02").map((p) => p.label)).toEqual(["FY2026", "FY2025", "FY2027"]);
  });

  it("reads ?fy= safely", () => {
    expect(periodFromFyParam("2025", "2026-10-02").label).toBe("FY2025");
    expect(periodFromFyParam(null, "2026-10-02").label).toBe("FY2026");
    expect(periodFromFyParam("abc", "2026-10-02").label).toBe("FY2026");
    expect(periodFromFyParam("26.5", "2026-10-02").label).toBe("FY2026");
  });

  it("checks dates and timestamps inclusively", () => {
    const p = fiscalYearPeriod(2026);
    expect(inPeriod("2025-10-01", p)).toBe(true);
    expect(inPeriod("2026-09-30T23:00:00Z", p)).toBe(true);
    expect(inPeriod("2025-09-30", p)).toBe(false);
    expect(inPeriod(null, p)).toBe(false);
  });
});

describe("suggestOverall", () => {
  it("averages and rounds half up", () => {
    expect(suggestOverall(allRated(4))).toBe(4);
    const half = allRated(3);
    PERFORMANCE_ELEMENTS.slice(0, PERFORMANCE_ELEMENTS.length / 2).forEach((e) => (half[e.key] = 4));
    expect(suggestOverall(half)).toBe(4); // exactly 3.5
  });

  it("never lets one Unacceptable be averaged away", () => {
    const r = allRated(5);
    r[PERFORMANCE_ELEMENTS[0].key] = 1;
    expect(suggestOverall(r)).toBe(2);
  });

  it("returns null with nothing rated and ignores junk values", () => {
    expect(suggestOverall({})).toBeNull();
    expect(suggestOverall({ quality: 7 as RatingValue, safety: 3 })).toBe(3);
  });
});

describe("interview completeness", () => {
  it("needs every element rated and the required question answered", () => {
    expect(missingRatings({})).toHaveLength(PERFORMANCE_ELEMENTS.length);
    expect(missingRatings(allRated(3))).toEqual([]);
    expect(missingAnswers({})).toEqual(["highlights"]);
    expect(missingAnswers({ highlights: "   " })).toEqual(["highlights"]);
    expect(interviewComplete(allRated(3), { highlights: "Rebuilt the bunkers" })).toBe(true);
    expect(interviewComplete(allRated(3), {})).toBe(false);
  });
});

describe("built-in writer", () => {
  it("cleans text into sentences", () => {
    expect(asSentence("  rebuilt   bunkers on 7 ")).toBe("Rebuilt bunkers on 7.");
    expect(asSentence("Great job!")).toBe("Great job!");
    expect(asSentence("")).toBe("");
    expect(firstName("Jane Q Smith")).toBe("Jane");
    expect(firstName("  ")).toBe("The employee");
  });

  it("uses the GM's own words and fills every section", () => {
    const ratings = allRated(3);
    ratings.quality = 5;
    ratings.dependability = 2;
    const n = composeNarrative({
      employeeName: "Jane Smith",
      periodLabel: "FY2026",
      ratings,
      overall: 3,
      answers: {
        highlights: "rebuilt the bunkers on 7 and 12",
        improve: "call in before shifts, not after",
        goals: "get the pesticide license",
        training: "pesticide applicator course",
        [elementNoteId("quality")]: "greens were the best they've looked",
        [elementNoteId("dependability")]: "four late call-outs in July",
      },
    });
    expect(n.source).toBe("template");
    expect(narrativeComplete(n)).toBe(true);
    expect(n.summary).toContain("Jane's overall performance for FY2026 is rated Fully Successful.");
    expect(n.summary).toContain("quality of work");
    expect(n.summary).toContain("dependability & attendance");
    expect(n.strengths).toContain("Rebuilt the bunkers on 7 and 12.");
    expect(n.strengths).toContain("Greens were the best they've looked.");
    expect(n.improvement).toContain("Call in before shifts, not after.");
    expect(n.improvement).toContain("Four late call-outs in July.");
    expect(n.goals).toContain("Get the pesticide license.");
    expect(n.goals).toContain("Training and certifications: pesticide applicator course.");
    expect(n.elements?.quality).toBe("Greens were the best they've looked.");
    expect(n.elements?.safety).toBe("Meets the standard for safety & care of equipment.");
    expect(Object.keys(n.elements ?? {})).toHaveLength(PERFORMANCE_ELEMENTS.length);
  });

  it("writes neutral defaults when the GM left notes blank", () => {
    const n = composeNarrative({
      employeeName: "Sam",
      periodLabel: "FY2026",
      ratings: allRated(3),
      overall: 3,
      answers: {},
    });
    for (const s of NARRATIVE_SECTIONS) expect((n[s.key] ?? "").length).toBeGreaterThan(10);
    expect(n.improvement).toMatch(/No significant areas/);
  });
});

describe("evaluationProgress", () => {
  it("walks not started → in progress → ready → final", () => {
    expect(evaluationProgress(null)).toBe("not_started");
    expect(evaluationProgress(evaluation())).toBe("in_progress");
    const ready = evaluation({
      ratings: allRated(4),
      overall_rating: 4,
      answers: { highlights: "Solid year" },
      narrative: { summary: "a", strengths: "b", improvement: "c", goals: "d" },
    });
    expect(evaluationProgress(ready)).toBe("ready");
    expect(evaluationProgress({ ...ready, overall_rating: null })).toBe("in_progress");
    expect(evaluationProgress({ ...ready, status: "final" })).toBe("final");
  });
});
