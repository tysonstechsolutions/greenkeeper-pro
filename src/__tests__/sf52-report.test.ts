// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { generateSf52Report, sf52Filename, type Sf52Data } from "@/lib/reports/sf52-report";

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
