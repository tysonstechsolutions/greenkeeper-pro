/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { mergeQuotesToPdf, type QuoteSource } from "@/lib/reports/quotes-to-pdf";

async function makePdf(numPages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < numPages; i++) doc.addPage([612, 792]);
  return doc.save();
}

async function makePng(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

async function makeJpg(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 10, g: 60, b: 160 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

function src(bytes: Uint8Array, filename: string, mime?: string): QuoteSource {
  return { bytes, filename, mime };
}

describe("mergeQuotesToPdf", () => {
  it("turns a single PNG quote into a one-page PDF", async () => {
    const png = await makePng(100, 60); // landscape
    const { pdfBytes, pageCount, failures } = await mergeQuotesToPdf([
      src(png, "quote.png", "image/png"),
    ]);

    expect(failures).toEqual([]);
    expect(pageCount).toBe(1);

    const out = await PDFDocument.load(pdfBytes);
    expect(out.getPageCount()).toBe(1);
    // A wide image should land on a landscape page.
    const page = out.getPage(0);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });

  it("merges multiple image quotes into one PDF, preserving orientation", async () => {
    const png = await makePng(100, 60); // landscape
    const jpg = await makeJpg(60, 100); // portrait
    const { pdfBytes, pageCount, failures } = await mergeQuotesToPdf([
      src(png, "a.png", "image/png"),
      src(jpg, "b.jpg", "image/jpeg"),
    ]);

    expect(failures).toEqual([]);
    expect(pageCount).toBe(2);

    const out = await PDFDocument.load(pdfBytes);
    expect(out.getPage(0).getWidth()).toBeGreaterThan(out.getPage(0).getHeight());
    expect(out.getPage(1).getHeight()).toBeGreaterThan(out.getPage(1).getWidth());
  });

  it("copies every page from an existing PDF quote", async () => {
    const pdf = await makePdf(3);
    const { pageCount, failures } = await mergeQuotesToPdf([
      src(pdf, "quote.pdf", "application/pdf"),
    ]);

    expect(failures).toEqual([]);
    expect(pageCount).toBe(3);
  });

  it("combines a PDF quote and an image quote into a single document", async () => {
    const pdf = await makePdf(2);
    const png = await makePng(80, 80);
    const { pageCount, failures } = await mergeQuotesToPdf([
      src(pdf, "q1.pdf", "application/pdf"),
      src(png, "q2.png", "image/png"),
    ]);

    expect(failures).toEqual([]);
    expect(pageCount).toBe(3);
  });

  it("classifies by extension when the MIME type is missing", async () => {
    const jpg = await makeJpg(120, 90);
    const { pageCount, failures } = await mergeQuotesToPdf([src(jpg, "scan.jpeg")]);

    expect(failures).toEqual([]);
    expect(pageCount).toBe(1);
  });

  it("reports a corrupt quote as a failure instead of throwing", async () => {
    const png = await makePng(50, 50);
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    const { pageCount, failures } = await mergeQuotesToPdf([
      src(png, "ok.png", "image/png"),
      src(garbage, "bad.png", "image/png"),
    ]);

    // The good quote still makes it into the PDF...
    expect(pageCount).toBe(1);
    // ...and the bad one is reported, not thrown.
    expect(failures).toHaveLength(1);
    expect(failures[0].source.filename).toBe("bad.png");
  });

  it("returns an empty document for no quotes", async () => {
    const { pageCount, failures } = await mergeQuotesToPdf([]);
    expect(pageCount).toBe(0);
    expect(failures).toEqual([]);
  });
});
