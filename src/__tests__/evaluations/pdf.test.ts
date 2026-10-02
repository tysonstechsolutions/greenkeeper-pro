import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { FORM_TEMPLATE_URL, PERFORMANCE_ELEMENTS } from "@/lib/evaluations/form";
import {
  evaluationFilename,
  fillEvaluationPdf,
  fillEvaluationsCombined,
  formDate,
  gridFieldName,
  nameLastFirstMi,
  pdfSafe,
  positionLine,
  type EvaluationPrintData,
} from "@/lib/evaluations/pdf";
import type { RatingValue } from "@/lib/evaluations/types";

const TEMPLATE = fs.readFileSync(path.resolve(process.cwd(), "public", FORM_TEMPLATE_URL.replace(/^\//, "")));

function sample(overrides: Partial<EvaluationPrintData["evaluation"]> = {}): EvaluationPrintData {
  return {
    evaluation: {
      period_start: "2025-10-01",
      period_end: "2026-09-30",
      period_label: "FY2026",
      status: "final",
      rating_reason: "annual",
      supervisory: false,
      ratings: { quality: 5, productivity: 4, dependability: 3, working_relationships: 4, customer_relations: 2 },
      overall_rating: 4,
      awards: {
        pay_increase: { granted: true, amount: "$0.50/hr" },
        performance_award: { granted: false, amount: "ignored" },
        time_off_award: { granted: true, amount: "8 hrs" },
      },
      narrative: {
        summary: "Jane’s year was strong — really strong… ✅",
        strengths: "Rebuilt the bunkers on 7 and 12.",
        improvement: "",
        goals: "Earn the pesticide license.",
        idp: {
          learning: ["Pesticide applicator prep", "Hydraulics basics"],
          conferences: ["GCSAA seminar, Mar 2027, $250"],
          remarks: "Wants to grow into an operator role.",
        },
      },
      ...overrides,
    },
    employeeName: "Jane Quinn Smith",
    nameParts: null,
    positionTitle: "Laborer",
    payPlanGrade: "NA-5703-05",
    hireDate: "2021-04-12",
    workSchedule: "RFT",
  };
}

async function fields(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  return {
    doc,
    text: (name: string) => form.getTextField(name).getText() ?? "",
    checked: (name: string) => form.getCheckBox(name).isChecked(),
  };
}

describe("helpers", () => {
  it("formats item 1 as Last, First MI", () => {
    expect(nameLastFirstMi("Jane Quinn Smith")).toBe("Smith, Jane Q.");
    expect(nameLastFirstMi("Jane Smith")).toBe("Smith, Jane");
    expect(nameLastFirstMi("Cher")).toBe("Cher");
    expect(nameLastFirstMi("whatever", { last: "Del Toro", first: "Ana", middle: "maria" })).toBe("Del Toro, Ana M.");
  });

  it("formats item 3, dates, filenames, and unsafe characters", () => {
    expect(positionLine("Laborer", "NA-5703-05")).toBe("Laborer, NA-5703-05");
    expect(positionLine("Laborer", null)).toBe("Laborer");
    expect(formDate("2025-10-01")).toBe("10/01/2025");
    expect(evaluationFilename("FY2026", "Jane O'Neil Smith")).toBe("Evaluation_FY2026_Jane_O_Neil_Smith.pdf");
    expect(evaluationFilename("FY2026")).toBe("Evaluations_FY2026_All.pdf");
    expect(pdfSafe("Jane’s “great” year — done… ✅")).toBe(`Jane's "great" year - done... `);
  });

  it("knows a real field for every element in every rating column", async () => {
    const form = (await PDFDocument.load(TEMPLATE)).getForm();
    for (const el of PERFORMANCE_ELEMENTS) {
      for (const v of [1, 2, 3, 4, 5] as RatingValue[]) {
        expect(() => form.getTextField(gridFieldName(el.key, v))).not.toThrow();
      }
    }
  });
});

describe("filling CNIC 5300", () => {
  it("fills items 1-9 and the IDP on the official form", async () => {
    const { bytes, remarksContinued } = await fillEvaluationPdf(TEMPLATE, sample());
    expect(remarksContinued).toBe(false);
    const { doc, text, checked } = await fields(bytes);
    expect(doc.getPageCount()).toBe(5);

    expect(text("1 Name Last First MI")).toBe("Smith, Jane Q.");
    expect(text("2 Last 4 SSN")).toBe("");
    expect(text("3 Position Title Pay Plan Series Grade eg Clerk NF000001")).toBe("Laborer, NA-5703-05");
    expect(text("4 Name and Location of NAF Activity eg CNIC N9 NSA Mid South")).toMatch(/Naval Station Great Lakes/);
    expect(text("From")).toBe("10/01/2025");
    expect(text("To")).toBe("09/30/2026");
    expect(checked("Annual")).toBe(true);
    expect(checked("90 Day") || checked("Interim") || checked("SeparationClose Out")).toBe(false);

    // Item 6: one X per rated element, in the right column; f-h blank.
    expect(text("Outstandinga Quality of Work")).toBe("X");
    expect(text("Highly Satisfactorya Quality of Work")).toBe("");
    expect(text("Highly Satisfactoryb Productivity")).toBe("X");
    expect(text("Satisfactoryc Dependability")).toBe("X");
    expect(text("Minimally Satisfactorye Customer  Patron Relations")).toBe("X");
    for (const v of [1, 2, 3, 4, 5] as RatingValue[]) expect(text(gridFieldName("leadership", v))).toBe("");

    // Item 7: Highly Satisfactory only.
    expect(checked("Check Box1")).toBe(true);
    for (const f of ["Outstanding", "Check Box2", "Check Box3", "Check Box4"]) expect(checked(f)).toBe(false);

    // Item 8: Yes/No and amounts ("$" is printed on the form).
    expect(checked("Check Box5")).toBe(true);
    expect(checked("Check Box8")).toBe(false);
    expect(text("Text5")).toBe("0.50/hr");
    expect(checked("Check Box6")).toBe(false);
    expect(checked("Check Box17")).toBe(true);
    expect(text("Text6")).toBe("");
    expect(checked("Check Box7")).toBe(true);
    expect(text("Text7")).toBe("8 hrs");

    // Item 9: paragraphs, no empty "Areas to develop", text made font-safe.
    const remarks = text("9 Supervisors Remarks Separate sheet may be attached");
    expect(remarks).toBe(
      `Jane's year was strong - really strong... \n\nAccomplishments: Rebuilt the bunkers on 7 and 12.\n\nGoals for next period: Earn the pesticide license.`,
    );

    // Signature dates are left for the signers.
    for (const f of ["Text9", "Text11", "Text13", "Date21_af_date"]) expect(text(f)).toBe("");

    // IDP page.
    expect(text("Text12")).toBe("Smith, Jane Q.");
    expect(text("Text14")).toBe("Laborer, NA-5703-05");
    expect(checked("Regular Full Time")).toBe(true);
    expect(checked("Regular Part Time")).toBe(false);
    expect(text("Text26")).toBe("04/12/2021");
    expect(text("Text31")).toBe("10/01/2026");
    expect(text("Text28")).toBe("09/30/2027");
    expect([text("Text15"), text("Text20"), text("Text8")]).toEqual(["Pesticide applicator prep", "Hydraulics basics", ""]);
    expect([text("Text22"), text("Text10"), text("Text23")]).toEqual(["GCSAA seminar, Mar 2027, $250", "", ""]);
    expect(text("8 Remarks")).toBe("Wants to grow into an operator role.");
    // The form's own pre-printed IDP goals are untouched.
    expect(text("Text2")).toBe("Naval Station Great Lakes MWR");
  });

  it("marks f-h for supervisors and the reason for rating", async () => {
    const { bytes } = await fillEvaluationPdf(
      TEMPLATE,
      sample({
        supervisory: true,
        rating_reason: "separation",
        ratings: { quality: 3, productivity: 3, dependability: 3, working_relationships: 3, customer_relations: 3, leadership: 5, management_coaching: 4, internal_controls: 1 },
        overall_rating: 1,
      }),
    );
    const { text, checked } = await fields(bytes);
    expect(checked("SeparationClose Out")).toBe(true);
    expect(checked("Annual")).toBe(false);
    expect(text("Outstandingf Leadership")).toBe("X");
    expect(text("Highly Satisfactoryg ManagementCoaching EffectivenessEEO Commitment")).toBe("X");
    expect(text("Unsatisfactoryh Management Internal Controls")).toBe("X");
    expect(checked("Check Box4")).toBe(true);
  });

  it("moves long remarks to a continuation sheet right after page 1", async () => {
    const long = "Trained the new crew on mowing patterns and bunker maintenance every week. ".repeat(60);
    const { bytes, remarksContinued } = await fillEvaluationPdf(
      TEMPLATE,
      sample({ status: "draft", narrative: { summary: long, strengths: "x", goals: "y" } }),
    );
    expect(remarksContinued).toBe(true);
    const { doc, text } = await fields(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(6);
    expect(text("9 Supervisors Remarks Separate sheet may be attached")).toMatch(/continuation sheet/);
    // The IDP fields still live on the (now shifted) last page.
    const idpPage = doc.getForm().getTextField("Text12").acroField.getWidgets()[0].P();
    expect(doc.getPages().findIndex((p) => p.ref === idpPage)).toBe(doc.getPageCount() - 1);
  });

  it("combines several forms into one valid PDF for printing", async () => {
    const bytes = await fillEvaluationsCombined(TEMPLATE, [sample(), sample({ supervisory: true })]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(10);
    await expect(fillEvaluationsCombined(TEMPLATE, [])).rejects.toThrow("Nothing to print");
  });
});
