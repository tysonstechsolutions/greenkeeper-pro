/**
 * Pull a PDF's text back out as printed lines, keeping column gaps.
 *
 * pdf.js returns positioned text pieces. Pieces on the same baseline become
 * one line, left to right; a horizontal gap wider than about two characters
 * becomes a run of spaces, so table columns stay separated by 2+ spaces
 * (like `pdftotext -layout`). Parsers split columns on that.
 */
type PdfjsModule = typeof import("pdfjs-dist");

const WORKER_URL = "/vendor/pdf.worker.min.mjs";
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= (
    typeof window === "undefined"
      ? (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfjsModule>)
      : import("pdfjs-dist")
  ).then((pdfjs) => {
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

export interface TextPiece {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Group positioned pieces into lines (top to bottom), gaps kept as spaces. */
export function piecesToLines(pieces: TextPiece[]): string[] {
  const rows: { y: number; items: TextPiece[] }[] = [];
  for (const p of pieces) {
    if (!p.str) continue;
    const tol = Math.max(2, p.height * 0.4);
    const row = rows.find((r) => Math.abs(r.y - p.y) <= tol);
    if (row) row.items.push(p);
    else rows.push({ y: p.y, items: [p] });
  }
  // PDF y grows upward: higher y first.
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const items = r.items.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const it of items) {
      const charW = it.str.length ? it.width / it.str.length : it.height * 0.5;
      const gap = it.x - end;
      if (line) {
        if (gap > Math.max(charW, 1) * 1.8) line += "   ";
        else if (gap > Math.max(charW, 1) * 0.15 && !line.endsWith(" ") && !it.str.startsWith(" ")) line += " ";
      }
      line += it.str;
      end = it.x + it.width;
    }
    return line.replace(/\s+$/, "");
  });
}

/** Every page's positioned text pieces, pages in order (for reports read by column position). */
export async function pdfTextPages(data: Uint8Array | ArrayBuffer): Promise<TextPiece[][]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    ...(typeof window !== "undefined" ? { standardFontDataUrl: "/vendor/standard_fonts/" } : {}),
  }).promise;
  const pages: TextPiece[][] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const [, , , , x, y] = item.transform as number[];
        pieces.push({ str: item.str, x, y, width: item.width, height: item.height || 8 });
      }
      pages.push(pieces);
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/** Every page's lines, pages in order. */
export async function pdfTextLines(data: Uint8Array | ArrayBuffer): Promise<string[]> {
  return (await pdfTextPages(data)).flatMap(piecesToLines);
}

/** A fillable PDF's form field values by field name (first page with each). */
export async function pdfFormFields(data: Uint8Array | ArrayBuffer): Promise<Record<string, string>> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise;
  const out: Record<string, string> = {};
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      for (const ann of await page.getAnnotations()) {
        const a = ann as { fieldName?: string; fieldValue?: unknown };
        if (!a.fieldName || a.fieldName in out) continue;
        if (typeof a.fieldValue === "string") out[a.fieldName] = a.fieldValue;
      }
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
