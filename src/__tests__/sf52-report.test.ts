// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { generateSf52Report, sf52Filename, type Sf52Data } from "@/lib/reports/sf52-report";
import {
  buildSf52Data,
  getSf52Action,
  EMPTY_SF52_INPUTS,
  type Sf52FormInputs,
} from "@/lib/sf52/actions";
import type { PersonnelDetails } from "@/types/database";

// The generator fetches the form backgrounds from /templates/ (client-side in
// the app); for the test, serve them from disk.
function mockFetch() {
  globalThis.fetch = (async (url: unknown) => {
    const m = String(url).match(/sf52-page-\d+\.png/);
    if (m) return new Response(readFileSync(`public/templates/${m[0]}`));
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

const sample: Sf52Data = {
  actionsRequested: "Resignation",
  fullName: "Smith, John A.",
  fromPositionTitleNo: "Recreation Aide / PD# 12345",
  fromPayPlan: "NF",
  fromTotalSalary: "17.25",
  reasonForResign:
    "Date of notice: 06/20/2026. Notice provided in writing. Employee relocating out of state.",
  forwardingAddress: "123 Main St, Anytown, IL 60000",
  conflictingReasons: "no",
};

describe("generateSf52Report", () => {
  it("fills the official form into a valid 2-page PDF", async () => {
    mockFetch();
    const { blob, filename } = await generateSf52Report(sample, "test.pdf");
    const buf = Buffer.from(await blob.arrayBuffer());
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(filename).toBe("test.pdf");
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it("builds the desk-guide filename convention", () => {
    expect(
      sf52Filename("Recruitment", "Smith", "Recreation Aide", new Date("2026-12-15T12:00:00")),
    ).toBe("SF52_Recruitment_Smith_RecreationAide_Dec2026.pdf");
  });
});

const samplePd: PersonnelDetails = {
  name_last: "Smith",
  name_first: "John",
  name_middle: "A.",
  position_title: "Recreation Aide",
  position_number: "12345",
  pay_plan: "NF",
  occ_series: "0189",
  pay_band: "02",
  step: "",
  hourly_rate: "17.25",
  work_schedule: "FLEX",
  avg_hours: "20",
  flsa: "N",
  cost_center: "12345",
};

function inputs(over: Partial<Sf52FormInputs>): Sf52FormInputs {
  return {
    ...EMPTY_SF52_INPUTS,
    proposedEffectiveDate: "2026-07-01",
    preparerName: "Tyson Bruce, Course Superintendent",
    preparerPhone: "847-555-0123",
    ...over,
  };
}

describe("buildSf52Data", () => {
  it("resignation fills the FROM side, the name, and Part E", () => {
    const a = getSf52Action("resignation");
    const d = buildSf52Data(
      a,
      samplePd,
      inputs({ box1: a.box1, reasonForResign: "Relocating out of state.", forwardingAddress: "123 Main St", conflictingReasons: "no" }),
    );
    expect(d.fullName).toBe("Smith, John A.");
    expect(d.fromPositionTitleNo).toContain("Recreation Aide");
    expect(d.toPositionTitleNo).toBeUndefined();
    expect(d.reasonForResign).toBe("Relocating out of state.");
    expect(d.conflictingReasons).toBe("no");
    expect(d.appropriationCode).toBe("12345");
    expect(d.dutyStationCode).toBe("00128");
  });

  it("recruitment leaves Name blank, fills the TO side + Part D + vice in box 1", () => {
    const a = getSf52Action("recruitment");
    const d = buildSf52Data(
      a,
      samplePd,
      inputs({ box1: a.box1, vice: "Jane Doe", numRecruitments: "1", toPositionTitle: "Recreation Aide", toPositionNumber: "12345" }),
    );
    expect(d.fullName).toBeUndefined();
    expect(d.toPositionTitleNo).toContain("Recreation Aide");
    expect(d.fromPositionTitleNo).toBeUndefined();
    expect(d.actionsRequested).toContain("vice Jane Doe");
    expect(d.numRecruitments).toBe("1");
  });

  it("pay increase fills both FROM and TO pay + Part F remarks", () => {
    const a = getSf52Action("pay_increase");
    const d = buildSf52Data(
      a,
      samplePd,
      inputs({ box1: a.box1, toPositionTitle: "Recreation Aide", toHourlyRate: "18.50", partFRemarks: "Annual increase." }),
    );
    expect(d.fromTotalSalary).toBe("17.25");
    expect(d.toTotalSalary).toBe("18.50");
    expect(d.partFRemarks).toBe("Annual increase.");
  });
});
