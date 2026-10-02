import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { elementsFor } from "@/lib/evaluations/form";
import { elementNoteId } from "@/lib/evaluations/questions";
import type { EvaluationRatings } from "@/lib/evaluations/types";

const ratings = Object.fromEntries(elementsFor(true).map((e) => [e.key, 4])) as EvaluationRatings;

const input = {
  employeeName: "Jane Smith",
  position: "Laborer",
  periodLabel: "FY2026",
  ratings,
  supervisory: false,
  overall: 4 as const,
  answers: {
    highlights: "rebuilt bunkers",
    improve: "  ",
    training: "mower training",
    [elementNoteId("dependability")]: "never missed a frost delay call",
  },
  facts: null,
};

beforeEach(() => {
  calls.length = 0;
  callApiImpl = async () => ({});
});

describe("AI draft", () => {
  it("sends only the elements that apply, with the form's level wording", () => {
    const body = buildDraftRequest(input);
    expect(body.overall).toEqual({ value: 4, label: "Highly Satisfactory" });
    expect(body.elements.map((e) => e.key)).toEqual([
      "quality",
      "productivity",
      "dependability",
      "working_relationships",
      "customer_relations",
    ]);
    const dep = body.elements.find((e) => e.key === "dependability")!;
    expect(dep.label).toBe("c. Dependability");
    expect(dep.note).toBe("never missed a frost delay call");
    expect(dep.level_description).toMatch(/Exceeds expectations/);
    expect(body.answers.map((a) => a.id)).toEqual(["highlights", "training"]);
    expect(buildDraftRequest({ ...input, supervisory: true }).elements).toHaveLength(8);
  });

  it("fills gaps from the built-in writer but keeps a deliberately empty optional section", () => {
    const fallback = {
      summary: "S",
      strengths: "St",
      improvement: "I",
      goals: "G",
      idp: { learning: ["fb"], conferences: [], remarks: "R" },
      source: "template" as const,
    };
    const merged = mergeDraft(
      { summary: " AI summary ", strengths: "", improvement: "", idp: { learning: ["x", " ", "y", "z", "w"], remarks: 5 } },
      fallback,
    );
    expect(merged).toEqual({
      summary: "AI summary",
      strengths: "St",
      improvement: "",
      goals: "G",
      idp: { learning: ["x", "y", "z"], conferences: [], remarks: "R" },
      source: "ai",
    });
  });

  it("uses the AI draft when it works", async () => {
    callApiImpl = async () => ({
      summary: "AI",
      strengths: "AI",
      improvement: "",
      goals: "AI",
      idp: { learning: ["Mower training"], conferences: [], remarks: "AI" },
    });
    const { narrative, aiError } = await draftNarrative(input);
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe("staff-evaluation-draft");
    expect(calls[0].options).toMatchObject({ method: "POST" });
    expect(aiError).toBeNull();
    expect(narrative.source).toBe("ai");
    expect(narrative.idp?.learning).toEqual(["Mower training"]);
  });

  it("still returns a complete draft when the AI is down", async () => {
    callApiImpl = async () => {
      throw new Error("Function not found");
    };
    const { narrative, aiError } = await draftNarrative(input);
    expect(aiError).toBe("Function not found");
    expect(narrative.source).toBe("template");
    expect(narrative.strengths).toBe("Rebuilt bunkers. Never missed a frost delay call.");
    expect(narrative.idp?.learning).toEqual(["mower training"]);
  });
});
