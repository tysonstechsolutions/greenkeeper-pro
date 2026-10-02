import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

// A plain stub rather than vi.fn(): with vi.fn, vitest failed the "AI is down"
// test on the thrown error even though draftNarrative catches it.
let callApiImpl: (route: string, options: unknown) => Promise<unknown> = async () => ({});
const calls: { route: string; options: unknown }[] = [];
vi.mock("@/lib/api/client", () => ({
  callApi: (route: string, options: unknown) => {
    calls.push({ route, options });
    return callApiImpl(route, options);
  },
}));

import { buildDraftRequest, draftNarrative, mergeDraft } from "@/lib/evaluations/ai";
import { PERFORMANCE_ELEMENTS } from "@/lib/evaluations/form";
import {
  buildEvaluationsPdf,
  evaluationFilename,
  evaluationsPdfBlob,
  pdfSafe,
  type EvaluationPrintData,
} from "@/lib/evaluations/pdf";
import { elementNoteId } from "@/lib/evaluations/questions";
import type { EvaluationRatings } from "@/lib/evaluations/types";

const ratings = Object.fromEntries(PERFORMANCE_ELEMENTS.map((e) => [e.key, 4])) as EvaluationRatings;

const input = {
  employeeName: "Jane Smith",
  position: "Laborer",
  periodLabel: "FY2026",
  ratings,
  overall: 4 as const,
  answers: { highlights: "rebuilt bunkers", improve: "  ", [elementNoteId("safety")]: "always in PPE" },
  facts: null,
};

beforeEach(() => {
  calls.length = 0;
  callApiImpl = async () => ({});
});

describe("AI draft", () => {
  it("sends ratings with labels and only answered questions", () => {
    const body = buildDraftRequest(input);
    expect(body.overall).toEqual({ value: 4, label: "Exceeds Expectations" });
    expect(body.elements).toHaveLength(PERFORMANCE_ELEMENTS.length);
    expect(body.elements.find((e) => e.key === "safety")?.note).toBe("always in PPE");
    expect(body.answers).toEqual([{ prompt: "What did they do well this year?", answer: "rebuilt bunkers" }]);
  });

  it("fills anything the AI left out from the built-in writer", () => {
    const fallback = { summary: "S", strengths: "St", improvement: "I", goals: "G", elements: { quality: "Q", safety: "Sa" }, source: "template" as const };
    const merged = mergeDraft({ summary: " AI summary ", strengths: "", elements: { quality: "AI q" } }, fallback);
    expect(merged).toEqual({
      summary: "AI summary",
      strengths: "St",
      improvement: "I",
      goals: "G",
      elements: { quality: "AI q", safety: "Sa" },
      source: "ai",
    });
  });

  it("uses the AI draft when it works", async () => {
    callApiImpl = async () => ({ summary: "AI", strengths: "AI", improvement: "AI", goals: "AI", elements: {} });
    const { narrative, aiError } = await draftNarrative(input);
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe("staff-evaluation-draft");
    expect(calls[0].options).toMatchObject({ method: "POST" });
    expect(aiError).toBeNull();
    expect(narrative.source).toBe("ai");
    expect(narrative.summary).toBe("AI");
    expect(narrative.elements?.safety).toBe("Always in PPE.");
  });

  it("still returns a complete draft when the AI is down", async () => {
    callApiImpl = async () => {
      throw new Error("Function not found");
    };
    const { narrative, aiError } = await draftNarrative(input);
    expect(aiError).toBe("Function not found");
    expect(narrative.source).toBe("template");
    expect(narrative.strengths).toContain("Rebuilt bunkers.");
  });
});

function printData(name: string, status: "draft" | "final"): EvaluationPrintData {
  return {
    evaluation: {
      period_start: "2025-10-01",
      period_end: "2026-09-30",
      period_label: "FY2026",
      status,
      ratings,
      overall_rating: 4,
      narrative: {
        summary: "Jane’s year was strong — really strong… ✅",
        strengths: "Rebuilt bunkers. ".repeat(80),
        improvement: "Keep it up.",
        goals: "Pesticide license.",
        elements: Object.fromEntries(PERFORMANCE_ELEMENTS.map((e) => [e.key, `Comment for ${e.label}`])),
      },
    },
    employeeName: name,
    positionTitle: "Laborer",
    payPlanGrade: "NA-5703-05",
    hireDate: "2021-04-12",
    supervisorName: "Tyson Bruce",
  };
}

describe("evaluation PDF", () => {
  it("strips characters the PDF fonts can't encode", () => {
    expect(pdfSafe("Jane’s “great” year — done… ✅")).toBe(`Jane's "great" year - done... `);
    expect(pdfSafe(null)).toBe("");
  });

  it("names files predictably", () => {
    expect(evaluationFilename("FY2026", "Jane O'Neil Smith")).toBe("Evaluation_FY2026_Jane_O_Neil_Smith.pdf");
    expect(evaluationFilename("FY2026")).toBe("Evaluations_FY2026_All.pdf");
  });

  it("puts each employee on their own pages in one valid PDF", async () => {
    const doc = buildEvaluationsPdf([printData("Jane Smith", "final"), printData("Sam Lee", "draft")]);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const bytes = doc.output("arraybuffer");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(doc.getNumberOfPages());
    const blob = evaluationsPdfBlob([printData("Jane Smith", "final")]);
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("refuses to print nothing", () => {
    expect(() => buildEvaluationsPdf([])).toThrow("Nothing to print");
  });
});
