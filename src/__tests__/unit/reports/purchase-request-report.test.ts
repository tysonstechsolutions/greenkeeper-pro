/**
 * @vitest-environment node
 *
 * End-to-end checks on the generated PR PDF. The template is the real
 * government AcroForm from public/templates, loaded off disk through a
 * stubbed `fetch` (the generator fetches it by URL in the browser).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFRawStream,
  StandardFonts,
  type PDFFont,
} from "pdf-lib";
import { generatePurchaseRequestReport } from "@/lib/reports/purchase-request-report";
import { PR_REQUEST_VIA_OPTIONS, PR_INVOICE_DEFAULTS } from "@/lib/pr-defaults";
import type { PurchaseRequest } from "@/types/database";

const TEMPLATE = path.join(
  process.cwd(),
  "public/templates/naf-pr-template.pdf",
);

let realFetch: typeof globalThis.fetch;

beforeAll(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => {
    const bytes = fs.readFileSync(TEMPLATE);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    } as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function pr(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: "test",
    date_prepared: "2026-08-26",
    required_delivery_date: "2026-09-02",
    request_via: "PURCHASE CARD",
    currency: "US Dollar $",
    vendor1_name: "Ace Hardware",
    pr_sequence_number: 1,
    items: [],
    ige_excess_pct: 0,
    attached_ssj: false,
    attached_bnj: false,
    attached_pws: false,
    attached_itpr: false,
    attached_section_889: true,
    attached_sow: false,
    status: "draft",
    ...overrides,
  } as PurchaseRequest;
}

async function render(row: PurchaseRequest): Promise<PDFDocument> {
  const blob = await generatePurchaseRequestReport(row);
  return PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
}

/**
 * The text a viewer actually sees in a form field: the widget's appearance
 * stream, decoded, plus the font size it was drawn at. Reading the field
 * VALUE would not catch text that renders clipped outside its box.
 */
function drawnText(
  doc: PDFDocument,
  fieldName: string,
): { lines: string[]; fontSize: number; boxWidth: number } {
  const field = doc.getForm().getField(fieldName);
  const widget = field.acroField.getWidgets()[0];
  const apDict = widget.dict.lookup(PDFName.of("AP"));
  const stream = doc.context.lookup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (apDict as any).get(PDFName.of("N")),
  ) as PDFRawStream;
  let buf = Buffer.from(stream.getContents());
  if (String(stream.dict.get(PDFName.of("Filter")) ?? "").includes("Flate")) {
    buf = zlib.inflateSync(buf);
  }
  const content = buf.toString("latin1");
  const fontSize = Number(/\/\w+ ([\d.]+) Tf/.exec(content)?.[1] ?? 0);
  const lines = [
    ...content.matchAll(/1 0 0 1 [-\d.]+ [-\d.]+ Tm\s*<([0-9A-Fa-f]+)>\s*Tj/g),
  ].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
  return { lines, fontSize, boxWidth: widget.getRectangle().width };
}

async function widestLine(
  doc: PDFDocument,
  fieldName: string,
): Promise<{ widest: number; available: number; text: string; fontSize: number }> {
  const { lines, fontSize, boxWidth } = drawnText(doc, fieldName);
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  return {
    widest: Math.max(...lines.map((l) => font.widthOfTextAtSize(l, fontSize))),
    // pdf-lib insets the drawable area by the border (1pt) plus 1pt padding.
    available: boxWidth - 4,
    text: lines.join(" "),
    fontSize,
  };
}

describe("Request Via", () => {
  it.each(PR_REQUEST_VIA_OPTIONS)("prints %s on the form", async (via) => {
    const doc = await render(pr({ request_via: via }));
    const field = doc.getForm().getField("Via");
    expect(field).toBeInstanceOf(PDFDropdown);
    expect((field as PDFDropdown).getSelected()).toEqual([via]);
    expect(drawnText(doc, "Via").lines.join("")).toBe(via);
  });

  it("adds CHECK to the template's dropdown without dropping the others", async () => {
    // The government template ships only two options; CHECK is ours.
    const doc = await render(pr({ request_via: "CHECK" }));
    const options = (doc.getForm().getField("Via") as PDFDropdown).getOptions();
    for (const opt of PR_REQUEST_VIA_OPTIONS) expect(options).toContain(opt);
  });

  it("leaves the template default alone for a value it doesn't know", async () => {
    const doc = await render(pr({ request_via: "CARRIER PIGEON" }));
    expect(
      (doc.getForm().getField("Via") as PDFDropdown).getSelected(),
    ).not.toContain("CARRIER PIGEON");
  });
});

describe("quote filename in IGE Based On and the Other box", () => {
  const label = "QUOTE-FY26-GC-0001-AceHardware-Golf Course-August2026";

  it("prints the whole label in both fields", async () => {
    const doc = await render(
      pr({ ige_based_on: label, attached_other: `${label} and SOW` }),
    );
    expect(drawnText(doc, "IGE").lines.join(" ")).toBe(label);
    expect(drawnText(doc, "Attachment").lines.join(" ")).toBe(
      `${label} and SOW`,
    );
  });

  it("ticks the Other checkbox when the box has text", async () => {
    const doc = await render(pr({ attached_other: label }));
    expect(doc.getForm().getCheckBox("Other").isChecked()).toBe(true);
  });

  it("keeps the template's font size for a label that already fits", async () => {
    const doc = await render(
      pr({ ige_based_on: label, attached_other: `${label} and SOW` }),
    );
    expect((await widestLine(doc, "IGE")).fontSize).toBe(8);
    expect((await widestLine(doc, "Attachment")).fontSize).toBe(8);
  });

  it.each([
    "Ace Hardware",
    "SiteOne Landscape Supply",
    "Central Turf & Irrigation Supply",
    "Reinder Brothers Turf Equipment Company",
  ])("keeps the label inside its box for vendor %s", async (vendor) => {
    const long = `QUOTE-FY26-GC-0012-${vendor.replace(/\s+/g, "")}-Golf Course-September2026`;
    const doc = await render(
      pr({
        vendor1_name: vendor,
        ige_based_on: long,
        attached_other: `${long} and SOW`,
      }),
    );

    const ige = await widestLine(doc, "IGE");
    expect(ige.text).toBe(long);
    expect(ige.widest).toBeLessThanOrEqual(ige.available + 1);

    const other = await widestLine(doc, "Attachment");
    expect(other.text).toBe(`${long} and SOW`);
    expect(other.widest).toBeLessThanOrEqual(other.available + 1);
  });
});

describe("invoice block", () => {
  it("prints the address the PR was saved with", async () => {
    const doc = await render(
      pr({
        invoice_address: PR_INVOICE_DEFAULTS.address,
        invoice_line2: PR_INVOICE_DEFAULTS.line2,
        invoice_city_state_zip: PR_INVOICE_DEFAULTS.city_state_zip,
      }),
    );
    expect(doc.getForm().getTextField("INVOICE_ADDRESS").getText()).toBe(
      "2601E Paul Jones",
    );
    expect(drawnText(doc, "INVOICE_ADDRESS").lines.join(" ")).toBe(
      "2601E Paul Jones",
    );
  });
});

describe("header dates", () => {
  it("prints the required delivery date a week out from the prepared date", async () => {
    const doc = await render(
      pr({ date_prepared: "2026-08-26", required_delivery_date: "2026-09-02" }),
    );
    expect(doc.getForm().getTextField("DATE SUBMITTED").getText()).toBe(
      "08/26/2026",
    );
    expect(doc.getForm().getTextField("RDD").getText()).toBe("09/02/2026");
  });
});
