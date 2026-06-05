import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  fillSoleSourcePdf,
  type SoleSourceData,
} from "@/lib/reports/sole-source-report";

const TEMPLATE = path.resolve(
  process.cwd(),
  "public/templates/sole-source-template.pdf",
);

const sample: SoleSourceData = {
  date: "06/05/2026",
  requestingInstallation: "NS Great Lakes",
  requiringActivity: "MWR Golf",
  requestingActivity: "MWR Great Lakes",
  estimatedCost: "$4,250.00",
  requiredDeliveryDate: "07/15/2026",
  // Smart apostrophe + trademark + em-dash exercise the sanitiser.
  description:
    "Annual reconditioning of the club’s Toro™ Greensmaster 3150-Q — grind all reels, replace bedknives, and verify cut tolerances.",
  characteristics:
    "The unit requires Toro-proprietary DPA cutting-unit gauges and factory service procedures, restricting reconditioning to an authorized Toro distributor with factory-trained reel technicians.",
  // Long enough to force the auto-fit below the 11pt ceiling.
  marketResearch:
    "A market survey was conducted and no other vendor was found capable of meeting the requirement. Reinders, Inc. is the authorized Toro distributor for the Great Lakes region and is uniquely qualified to recondition this unit: it has exclusive access to Toro genuine parts, the proprietary DPA cutting-unit gauges, and current factory service bulletins, and it maintains the documented service history for our existing fleet of Toro mowing equipment. General repair shops cannot guarantee Toro reel tolerances or supply warranty-compliant genuine parts, and no equivalent regional source exists. Accordingly, Reinders, Inc. is the sole source able to furnish the required reconditioning to the exclusion of other sources.",
  hasProprietary: "No",
  proprietaryData: "",
  compatibilityNotes: "",
  directReplacement: "N/A",
  contractorName: "Reinders, Inc.",
  contractorAddress: "13400 Watertown Plank Rd",
  contractorCityStateZip: "Elm Grove, WI 53122",
  contractorPoc: "Jane Sturgis",
  contractorPhone: "262-786-3300",
  contractorEmail: "jsturgis@reinders.com",
  requestorName: "Brian Carpenter",
};

function daFontSize(da: string | undefined): number | null {
  const m = da?.match(/\/\w+\s+(\d+(?:\.\d+)?)\s+Tf/);
  return m ? Number(m[1]) : null;
}

describe("fillSoleSourcePdf", () => {
  it("fills the template and produces an indistinguishable, leak-free PDF", async () => {
    const templateBytes = fs.readFileSync(TEMPLATE);
    const out = await fillSoleSourcePdf(templateBytes, sample);

    expect(out.byteLength).toBeGreaterThan(1000);

    // Optional artifact for visual inspection.
    if (process.env.SS_DUMP) {
      const dst = path.resolve(process.cwd(), ".tmp_contract/integration-filled.pdf");
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, out);
    }

    const pdf = await PDFDocument.load(out);
    const form = pdf.getForm();
    const text = (name: string) => form.getTextField(name).getText() ?? "";

    // Contractor lands in the Dealer/Rep column (Text9-Text14).
    expect(text("Text9")).toBe("Reinders, Inc.");
    expect(text("Text14")).toBe("jsturgis@reinders.com");

    // Manufacturer column stays blank (matches the example).
    expect(text("Manufacturer Name")).toBe("");

    // Header + service fields round-trip.
    expect(text("Date")).toBe("06/05/2026");
    expect(text("Requested Date")).toBe("06/05/2026");
    expect(text("2a Required Delivery Date")).toBe("07/15/2026");
    expect(text("equipment_2")).toBe("N/A");

    // Yes/No dropdown.
    expect(form.getDropdown("Yes/No").getSelected()).toEqual(["No"]);

    // Section 6 (compatibility) box stays blank.
    expect(text("equipment")).toBe("");

    // Sanitiser: smart punctuation normalised to WinAnsi-safe ASCII.
    const desc = text("3 Description of the item or service required");
    expect(desc).toContain("club's"); // U+2019 -> '
    expect(desc).toContain("Toro(TM)"); // U+2122 -> (TM)
    expect(desc).toContain("3150-Q - grind"); // U+2014 -> -
    expect(desc).not.toMatch(/[‘’“”–—™]/);

    // No leftover Burris/John Deere example data anywhere.
    for (const f of form.getFields()) {
      if (f.constructor.name === "PDFTextField") {
        const v = form.getTextField(f.getName()).getText() ?? "";
        expect(v).not.toMatch(/burris|raucci|greenbay|waukegan/i);
      }
    }
  });

  it("auto-fits the three size-0 multiline fields to a sane, non-giant size", async () => {
    const templateBytes = fs.readFileSync(TEMPLATE);
    const out = await fillSoleSourcePdf(templateBytes, sample);
    const pdf = await PDFDocument.load(out);
    const form = pdf.getForm();

    for (const name of [
      "3 Description of the item or service required",
      "etc",
      "the results of any supporting market research as appropriate",
    ]) {
      const da = form.getTextField(name).acroField.getDefaultAppearance();
      const size = daFontSize(da ?? undefined);
      expect(size).not.toBeNull();
      expect(size!).toBeGreaterThan(0); // never the broken size-0 / giant auto
      expect(size!).toBeLessThanOrEqual(11);
    }
  });
});
