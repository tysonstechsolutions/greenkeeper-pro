import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { fillWorkOrderPdf, type WorkOrderData } from "@/lib/reports/work-order-report";

const TEMPLATE = path.resolve(
  process.cwd(),
  "public/templates/work-order-template.pdf",
);

// 1×1 transparent PNG.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const sample: WorkOrderData = {
  date: "06/05/2026",
  facilityBldg: "VMGC @ 3311",
  programAreaRoom: "Pump house / #7 fairway",
  costCenter: "25581",
  descriptionOfWork:
    "The irrigation pump at the #7 fairway pump house has failed and isn’t building pressure — inspect, diagnose, and repair or replace components to restore full irrigation to the back nine.",
  workType: "Routine",
  primaryPocEmail: "admin@tysonstechsolutions.com",
  primaryPocPhone: "847-688-4593",
  numberOfEnclosures: "1",
  secondaryPocName: "Joseph Caprez",
  secondaryPocPhone: "847-688-4593",
  photos: [TINY_PNG],
};

describe("fillWorkOrderPdf", () => {
  it("fills SECTION 2, leaves SECTION 1/3 blank, and appends photo pages", async () => {
    const templateBytes = fs.readFileSync(TEMPLATE);
    const out = await fillWorkOrderPdf(templateBytes, sample);
    expect(out.byteLength).toBeGreaterThan(1000);

    if (process.env.WO_DUMP) {
      const dst = path.resolve(process.cwd(), ".tmp_wo/integration-filled.pdf");
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, out);
    }

    const pdf = await PDFDocument.load(out);
    const form = pdf.getForm();
    const text = (n: string) => form.getTextField(n).getText() ?? "";
    const selected = (n: string) => form.getDropdown(n).getSelected();

    // SECTION 2 filled.
    expect(text("Text5")).toBe("Pump house / #7 fairway");
    expect(text("Text6")).toBe("25581");
    expect(text("Text7")).toContain("irrigation pump");
    expect(selected("Dropdown2")).toEqual(["VMGC @ 3311"]);
    expect(selected("Dropdown32")).toEqual(["Routine"]);
    expect(text("Text10")).toBe("admin@tysonstechsolutions.com");
    expect(text("Text11")).toBe("847-688-4593");
    expect(text("Text12")).toBe("Joseph Caprez");
    expect(text("Text13")).toBe("847-688-4593");
    expect(text("Text14")).toBe("1");

    // Sanitiser: smart apostrophe normalised.
    expect(text("Text7")).toContain("isn't");
    expect(text("Text7")).not.toMatch(/[’]/);

    // SECTION 1 (admin) left untouched.
    expect(text("Date1_af_date")).toBe(""); // DATE ASSIGNED
    expect(text("Text3")).toBe(""); // WORK ORDER #
    expect(selected("Dropdown35")).toEqual(["(select one)"]); // NATURE OF REQUEST

    // Photo enclosure appended → 2 pages.
    expect(pdf.getPageCount()).toBe(2);
  });

  it("ignores a facility/work-type value that isn't a valid option", async () => {
    const templateBytes = fs.readFileSync(TEMPLATE);
    const out = await fillWorkOrderPdf(templateBytes, {
      ...sample,
      facilityBldg: "Not A Real Option",
      workType: "Also Bogus",
      photos: [],
    });
    const pdf = await PDFDocument.load(out);
    const form = pdf.getForm();
    // Falls back to the unselected default rather than throwing.
    expect(form.getDropdown("Dropdown2").getSelected()).toEqual(["(select one)"]);
    expect(form.getDropdown("Dropdown32").getSelected()).toEqual(["(select one)"]);
  });
});
