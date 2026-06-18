/**
 * Combine one or more vendor quotes into a single PDF.
 *
 * Quotes get uploaded in whatever format the vendor sent — a phone photo
 * (JPG/HEIC), a screenshot (PNG), or a real PDF. Procurement wants a clean
 * PDF, so this helper normalises everything:
 *
 *   • PDF quote   → its pages are copied straight in (unchanged).
 *   • JPG / PNG   → embedded as a single PDF page.
 *   • HEIC / HEIF → decoded with heic2any, then embedded (iPhone photos).
 *   • WebP / GIF / anything else → rasterised through a <canvas> to PNG,
 *     then embedded.
 *
 * Multiple quotes are concatenated into ONE document, in the order given.
 *
 * Image pages are placed on a US-Letter sheet (auto portrait/landscape to
 * match the photo) and scaled to fit with a thin margin, so the result
 * prints cleanly on a standard printer.
 *
 * Anything that can't be converted is returned in `failures` rather than
 * throwing, so the caller can fall back to attaching the original file —
 * a quote should never silently vanish from a purchase-request submission.
 */

import { PDFDocument, type PDFImage } from "pdf-lib";

/** US-Letter, in PDF points (72 per inch). */
const LETTER_W = 612;
const LETTER_H = 792;
/** 0.25" margin around image pages. */
const MARGIN = 18;

export interface QuoteSource {
  /** Raw file bytes as downloaded from storage. */
  bytes: Uint8Array;
  /** Original filename (used to detect the type by extension). */
  filename: string;
  /** MIME type, if known — used as a fallback when the extension is absent. */
  mime?: string;
}

export interface MergedQuotesResult {
  /** The combined PDF. May contain 0 pages if every quote failed to convert. */
  pdfBytes: Uint8Array;
  /** Number of pages in the combined PDF. */
  pageCount: number;
  /** Quotes that couldn't be added — caller should attach the original. */
  failures: { source: QuoteSource; reason: string }[];
}

type QuoteKind = "pdf" | "jpg" | "png" | "heic" | "image-other";

/** Decide how to handle a quote from its filename extension, then its MIME. */
function classify(q: QuoteSource): QuoteKind {
  const ext = (q.filename.split(".").pop() || "").toLowerCase();
  const mime = (q.mime || "").toLowerCase();
  if (ext === "pdf" || mime.includes("pdf")) return "pdf";
  if (ext === "jpg" || ext === "jpeg" || mime.includes("jpeg") || mime.includes("jpg"))
    return "jpg";
  if (ext === "png" || mime.includes("png")) return "png";
  if (ext === "heic" || ext === "heif" || mime.includes("heic") || mime.includes("heif"))
    return "heic";
  // webp, gif, bmp, tiff, or an unknown image — route through the canvas.
  return "image-other";
}

/**
 * Merge the given quotes into a single PDF. Never throws for a single bad
 * quote; collects those in `failures` instead.
 */
export async function mergeQuotesToPdf(
  quotes: QuoteSource[],
): Promise<MergedQuotesResult> {
  const merged = await PDFDocument.create();
  const failures: MergedQuotesResult["failures"] = [];

  for (const q of quotes) {
    const kind = classify(q);
    try {
      if (kind === "pdf") {
        await appendPdf(merged, q.bytes);
      } else {
        await appendImage(merged, q, kind);
      }
    } catch (err) {
      failures.push({
        source: q,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Read the count BEFORE save(): pdf-lib injects a blank page when it
  // serialises a zero-page document, which would otherwise mask "nothing
  // converted" as a misleading 1-page result.
  const pageCount = merged.getPageCount();
  const pdfBytes = await merged.save();
  return { pdfBytes, pageCount, failures };
}

/** Copy every page of an existing PDF quote into the merged document. */
async function appendPdf(merged: PDFDocument, bytes: Uint8Array): Promise<void> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await merged.copyPages(src, src.getPageIndices());
  for (const page of pages) merged.addPage(page);
}

/** Embed a single image quote as one page in the merged document. */
async function appendImage(
  merged: PDFDocument,
  q: QuoteSource,
  kind: QuoteKind,
): Promise<void> {
  let image: PDFImage;
  if (kind === "jpg") {
    image = await embedJpgWithFallback(merged, q.bytes);
  } else if (kind === "png") {
    image = await embedPngWithFallback(merged, q.bytes);
  } else if (kind === "heic") {
    image = await merged.embedPng(await heicToPngBytes(q.bytes));
  } else {
    image = await merged.embedPng(await rasterizeToPngBytes(q.bytes, q.mime));
  }
  drawImagePage(merged, image);
}

/**
 * Embed a JPEG. pdf-lib only accepts baseline JPEGs, so progressive/CMYK
 * files fall back to a canvas re-encode.
 */
async function embedJpgWithFallback(
  doc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage> {
  try {
    return await doc.embedJpg(bytes);
  } catch {
    return doc.embedPng(await rasterizeToPngBytes(bytes, "image/jpeg"));
  }
}

/** Embed a PNG, falling back to a canvas re-encode for exotic PNGs. */
async function embedPngWithFallback(
  doc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage> {
  try {
    return await doc.embedPng(bytes);
  } catch {
    return doc.embedPng(await rasterizeToPngBytes(bytes, "image/png"));
  }
}

/** Add a Letter-sized page (oriented to the image) with the image fit inside. */
function drawImagePage(doc: PDFDocument, image: PDFImage): void {
  const iw = image.width;
  const ih = image.height;
  const landscape = iw > ih;
  const pageW = landscape ? LETTER_H : LETTER_W;
  const pageH = landscape ? LETTER_W : LETTER_H;
  const maxW = pageW - MARGIN * 2;
  const maxH = pageH - MARGIN * 2;
  const scale = Math.min(maxW / iw, maxH / ih);
  const w = iw * scale;
  const h = ih * scale;
  const page = doc.addPage([pageW, pageH]);
  page.drawImage(image, {
    x: (pageW - w) / 2,
    y: (pageH - h) / 2,
    width: w,
    height: h,
  });
}

/** Convert an iPhone HEIC/HEIF photo to PNG bytes (browser only). */
async function heicToPngBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const mod = await import("heic2any");
  const heic2any = (mod.default ?? mod) as (opts: {
    blob: Blob;
    toType?: string;
    quality?: number;
  }) => Promise<Blob | Blob[]>;
  const out = await heic2any({
    blob: new Blob([bytes as BlobPart], { type: "image/heic" }),
    toType: "image/png",
  });
  const pngBlob = Array.isArray(out) ? out[0] : out;
  return new Uint8Array(await pngBlob.arrayBuffer());
}

/**
 * Decode any browser-supported image and re-encode it as PNG using a
 * <canvas>. Used for WebP/GIF and as the fallback for stubborn JPG/PNG.
 * Throws (caught upstream) if run outside a browser.
 */
async function rasterizeToPngBytes(
  bytes: Uint8Array,
  mime?: string,
): Promise<Uint8Array> {
  if (
    typeof document === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    throw new Error("image conversion requires a browser environment");
  }
  const blob = new Blob([bytes as BlobPart], mime ? { type: mime } : undefined);
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!pngBlob) throw new Error("canvas could not encode PNG");
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
