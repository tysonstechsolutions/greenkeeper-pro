import { describe, expect, it } from "vitest";
import {
  asSentence,
  composeNarrative,
  evaluationProgress,
  firstName,
  hasUnsatisfactory,
  narrativeComplete,
  overallRuleProblem,
  remarksText,
  suggestOverall,
} from "@/lib/evaluations/compose";
import { PERFORMANCE_ELEMENTS, elementsFor } from "@/lib/evaluations/form";
import {
  defaultPeriod,
  fiscalYearOf,
  fiscalYearPeriod,
  inPeriod,
  periodChoices,
  periodFromFyParam,
} from "@/lib/evaluations/period";
import {
  applicableRatings,
  elementNoteId,
  interviewComplete,
  missingAnswers,
  missingAwardAmounts,
  missingRatings,
  splitLines,
} from "@/lib/evaluations/questions";
import type { EvaluationRatings, RatingValue, StaffEvaluation } from "@/lib/evaluations/types";

/** Every applicable element rated `value`. */
function allRated(value: RatingValue, supervisory = false): EvaluationRatings {
  return Object.fromEntries(elementsFor(supervisory).map((e) => [e.key, value])) as EvaluationRatings;
}

function evaluation(overrides: Partial<StaffEvaluation> = {}): StaffEvaluation {
  return {
    id: "ev1",
    employee_id: "emp1",
    period_start: "2025-10-01",
    period_end: "2026-09-30",
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
    form_version: "cnic-5300-rev-2025-09",
    finalized_at: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

describe("the form's elements", () => {
  it("rates a-e for everyone and adds f-h for supervisors", () => {
    expect(elementsFor(false).map((e) => e.letter)).toEqual(["a", "b", "c", "d", "e"]);
    expect(elementsFor(true).map((e) => e.letter)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(PERFORMANCE_ELEMENTS).toHaveLength(8);
  });
});

describe("rating periods", () => {
  it("follows the federal fiscal year", () => {
    expect(fiscalYearOf("2026-09-30")).toBe(2026);
    expect(fiscalYearOf("2026-10-01")).toBe(2027);
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

describe("overall rating (item 7)", () => {
  it("averages the applicable elements and rounds half up", () => {
    expect(suggestOverall(allRated(4), false)).toBe(4);
    const r = { ...allRated(3), quality: 5 as RatingValue, productivity: 5 as RatingValue } as EvaluationRatings;
    expect(suggestOverall(r, false)).toBe(4); // 3.8
    // f-h are ignored for a non-supervisor
    expect(suggestOverall({ ...allRated(3), leadership: 5 }, false)).toBe(3);
  });

  it("follows the form: any Unsatisfactory element makes the overall Unsatisfactory", () => {
    const r = { ...allRated(5), dependability: 1 as RatingValue };
    expect(suggestOverall(r, false)).toBe(1);
    expect(overallRuleProblem(r, 3, false)).toMatch(/must be Unsatisfactory/);
    expect(overallRuleProblem(r, 1, false)).toBeNull();
    expect(hasUnsatisfactory(r, null, false)).toBe(true);
    // An Unsatisfactory f-h rating only counts for supervisors.
    const sup = { ...allRated(4), leadership: 1 as RatingValue };
    expect(overallRuleProblem(sup, 4, false)).toBeNull();
    expect(overallRuleProblem(sup, 4, true)).not.toBeNull();
  });

  it("returns null with nothing rated", () => {
    expect(suggestOverall({}, false)).toBeNull();
  });
});

describe("interview completeness", () => {
  it("needs the applicable elements rated and the required question answered", () => {
    expect(missingRatings({}, false)).toHaveLength(5);
    expect(missingRatings({}, true)).toHaveLength(8);
    expect(missingRatings(allRated(3), false)).toEqual([]);
    expect(missingRatings(allRated(3), true)).toEqual(["leadership", "management_coaching", "internal_controls"]);
    expect(missingAnswers({})).toEqual(["highlights"]);
    expect(interviewComplete(allRated(3), { highlights: "Rebuilt bunkers" }, false)).toBe(true);
  });

  it("wants an amount for any award marked Yes", () => {
    expect(missingAwardAmounts({ pay_increase: { granted: true, amount: " " } })).toEqual(["pay_increase"]);
    expect(missingAwardAmounts({ pay_increase: { granted: false, amount: "" } })).toEqual([]);
    expect(missingAwardAmounts({ time_off_award: { granted: true, amount: "8 hrs" } })).toEqual([]);
  });

  it("drops f-h ratings for non-supervisors", () => {
    expect(applicableRatings({ ...allRated(3), leadership: 5 }, false)).toEqual(allRated(3));
  });

  it("splits one-per-line answers for the IDP", () => {
    expect(splitLines("- mower training\n2) CPR\n\n40-hour pesticide course", 3)).toEqual([
      "mower training",
      "CPR",
      "40-hour pesticide course",
    ]);
    expect(splitLines("a; b; c; d", 3)).toEqual(["a", "b", "c; d"]);
    expect(splitLines("", 3)).toEqual([]);
  });
});

describe("built-in writer", () => {
  it("cleans text into sentences", () => {
    expect(asSentence("  rebuilt   bunkers on 7 ")).toBe("Rebuilt bunkers on 7.");
    expect(asSentence("Great job!")).toBe("Great job!");
    expect(firstName("Jane Q Smith")).toBe("Jane");
  });

  it("uses the GM's own words for item 9 and the IDP", () => {
    const ratings = { ...allRated(3), quality: 5 as RatingValue, customer_relations: 2 as RatingValue };
    const n = composeNarrative({
      employeeName: "Jane Smith",
      periodLabel: "FY2026",
      ratings,
      supervisory: false,
      overall: 3,
      answers: {
        highlights: "rebuilt the bunkers on 7 and 12",
        improve: "slow down with golfers' questions",
        goals: "get the pesticide license",
        training: "pesticide applicator prep\nhydraulics basics",
        conferences: "GCSAA seminar, March, $250",
        [elementNoteId("quality")]: "greens were the best they've looked",
        [elementNoteId("customer_relations")]: "two complaints about tone",
      },
    });
    expect(n.source).toBe("template");
    expect(narrativeComplete(n)).toBe(true);
    expect(n.summary).toContain("Jane's overall performance for FY2026 is rated Satisfactory.");
    expect(n.summary).toContain("strongest in quality of work");
    expect(n.summary).toContain("Improvement is needed in customer / patron relations");
    expect(n.strengths).toBe("Rebuilt the bunkers on 7 and 12. Greens were the best they've looked.");
    expect(n.improvement).toBe("Slow down with golfers' questions. Two complaints about tone.");
    expect(n.goals).toBe("Get the pesticide license.");
    expect(n.idp).toEqual({
      learning: ["pesticide applicator prep", "hydraulics basics"],
      conferences: ["GCSAA seminar, March, $250"],
      remarks: "Get the pesticide license.",
    });
    expect(remarksText(n)).toBe(
      [n.summary, `Accomplishments: ${n.strengths}`, `Areas to develop: ${n.improvement}`, `Goals for next period: ${n.goals}`].join("\n\n"),
    );
  });

  it("writes neutral defaults when the GM left notes blank, with no empty paragraphs", () => {
    const n = composeNarrative({
      employeeName: "Sam",
      periodLabel: "FY2026",
      ratings: allRated(3),
      supervisory: false,
      overall: 3,
      answers: {},
    });
    expect(narrativeComplete(n)).toBe(true);
    expect(n.improvement).toBe("");
    expect(remarksText(n)).not.toContain("Areas to develop");
    expect(n.idp).toEqual({ learning: [], conferences: [], remarks: "" });
  });
});

describe("evaluationProgress", () => {
  const ready = evaluation({
    ratings: allRated(4),
    overall_rating: 4,
    answers: { highlights: "Solid year" },
    narrative: { summary: "a", strengths: "b", goals: "d" },
  });

  it("walks not started → in progress → ready → final", () => {
    expect(evaluationProgress(null)).toBe("not_started");
    expect(evaluationProgress(evaluation())).toBe("in_progress");
    expect(evaluationProgress(ready)).toBe("ready");
    expect(evaluationProgress({ ...ready, status: "final" })).toBe("final");
  });

  it("isn't ready while something on the form is still wrong", () => {
    expect(evaluationProgress({ ...ready, overall_rating: null })).toBe("in_progress");
    expect(evaluationProgress({ ...ready, supervisory: true })).toBe("in_progress"); // f-h unrated
    expect(evaluationProgress({ ...ready, ratings: { ...allRated(4), quality: 1 } })).toBe("in_progress");
    expect(evaluationProgress({ ...ready, awards: { performance_award: { granted: true, amount: "" } } })).toBe("in_progress");
  });
});
