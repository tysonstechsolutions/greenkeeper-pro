import { describe, it, expect, beforeAll } from "vitest";
import {
  generateAstInspectionReport,
  astInspectionFilename,
} from "@/lib/reports/ast-inspection-report";
import { getDefaultPassItems } from "@/lib/ast-inspection-items";
import type { AstInspection } from "@/types/database";

const mockInspection: AstInspection = {
  id: "test-id",
  inspection_date: "2026-05-26",
  prior_inspection_date: "2026-04-26",
  retain_until_date: "2029-05-26",
  inspector_id: null,
  inspector_name: "Tyson Bruce",
  inspector_title: "Superintendent",
  inspector_signature: "Tyson Bruce",
  tank_ids: "3311-01A",
  facility_name: null,
  facility_id: "8400",
  items: getDefaultPassItems(),
  additional_comments: null,
  status: "completed",
  created_by: null,
  created_at: "2026-05-26T12:00:00Z",
  updated_at: "2026-05-26T12:00:00Z",
};

async function blobToText(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  // PDF streams use Latin-1 for the most part; decode that way so byte
  // patterns from doc.text() / doc.triangle() round-trip cleanly.
  return new TextDecoder("latin1").decode(new Uint8Array(buf));
}

/**
 * Decompresses all FlateDecode streams in the PDF and concatenates them.
 * jsPDF compresses content streams, so the raw PDF bytes don't contain the
 * drawing operators verbatim — we have to inflate them first.
 */
async function pdfContentStreams(blob: Blob): Promise<string> {
  const { inflateRawSync, inflateSync } = await import("node:zlib");
  const buf = Buffer.from(await blob.arrayBuffer());
  const text = buf.toString("latin1");
  const re = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const bytes = Buffer.from(m[1], "latin1");
    try {
      out += inflateSync(bytes).toString("latin1") + "\n";
    } catch {
      try {
        out += inflateRawSync(bytes).toString("latin1") + "\n";
      } catch {
        out += bytes.toString("latin1") + "\n";
      }
    }
  }
  return out;
}

describe("generateAstInspectionReport — bullet rendering", () => {
  let pdfText = "";
  let pdfStreams = "";

  beforeAll(async () => {
    const blob = await generateAstInspectionReport(mockInspection);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
    pdfText = await blobToText(blob);
    pdfStreams = await pdfContentStreams(blob);
  }, 30_000);

  it("starts with a valid PDF header", () => {
    expect(pdfText.slice(0, 5)).toBe("%PDF-");
  });

  it("contains the bullet text strings (so we know bullets actually drew)", () => {
    // Sample distinctive substrings from a few different bullets. jsPDF
    // breaks long Tj operands into chunks, so we look for short phrases.
    expect(pdfStreams).toContain("checklist is intended as a model");
    expect(pdfStreams).toContain("Retain the completed checklists");
    expect(pdfStreams).toContain("After severe weather");
  });

  it("draws exactly 8 right-pointing filled triangles (one per bullet)", () => {
    // jsPDF's doc.triangle() emits a moveTo + 3 lineTo + h (closepath) + f
    // (fill) sequence. Count those sequences to prove every bullet got a
    // properly-drawn triangle instead of the broken "%Æ" Unicode glyph.
    const triPattern =
      /[\d.]+ [\d.]+ m\s+[\d.]+ [\d.]+ l\s+[\d.]+ [\d.]+ l\s+[\d.]+ [\d.]+ l\s+h\s+f\b/g;
    const tris = pdfStreams.match(triPattern) || [];
    expect(tris.length).toBe(8);
  });

  it("does NOT contain the raw ◆ Unicode character", () => {
    // The old code passed "◆" (U+25C6) to doc.text(); the UTF-8 bytes
    // (0xE2 0x97 0x86) decoded as Latin-1 are "â—†". Either appearing in
    // the PDF stream means the broken bullet is back.
    expect(pdfText).not.toContain("◆");
    expect(pdfText).not.toContain("â—†");
  });

  it("does NOT contain the broken '%Æ' bullet artifact", () => {
    // The visible corruption the user reported: "%Æ" appearing where
    // every bullet should be.
    expect(pdfText).not.toMatch(/%Æ/);
  });

  it("contains form section header strings", () => {
    expect(pdfStreams).toContain("STI SP001 Monthly Inspection Checklist");
    expect(pdfStreams).toContain("General Inspection Information");
    expect(pdfStreams).toContain("Tank and Piping");
    expect(pdfStreams).toContain("Equipment on tank");
  });

  it("contains the bullet body text starting with '*' for the asterisk-prefixed bullet", () => {
    // Bullet #5 starts "* designates an item..." — confirms the ASCII
    // asterisk made it through and wasn't swallowed by encoding glitches.
    expect(pdfStreams).toContain("designates an item");
  });

  it("renders the inspection date in DDMONTHYYYY style", () => {
    // Matches the official form ("03APRIL2026"-style); the old code
    // used MM/DD/YYYY which the user pointed out was wrong.
    expect(pdfStreams).toContain("26MAY2026");
    expect(pdfStreams).toContain("26APRIL2026");
  });
});

describe("astInspectionFilename", () => {
  it("includes the inspection date and tank IDs", () => {
    const name = astInspectionFilename(mockInspection);
    expect(name).toBe("AST-Inspection-20260526-3311-01A.pdf");
  });

  it("appends -DRAFT suffix for draft inspections", () => {
    const draft = { ...mockInspection, status: "draft" as const };
    const name = astInspectionFilename(draft);
    expect(name.endsWith("-DRAFT.pdf")).toBe(true);
  });
});
