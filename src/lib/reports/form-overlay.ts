/**
 * Shared helpers for overlaying typed values onto a high-DPI image of an
 * official form (the DD-200 / NAVCOMPT-2212 fillers work like the SF-52 one:
 * the originals are XFA PDFs pdf-lib can't fill, so we draw onto a raster of
 * the blank at the real field coordinates). All coordinates are PDF points,
 * bottom-left origin, on a standard 612 x 792 letter page.
 */
import { rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const BLACK = rgb(0, 0, 0);
export const PAGE_W = 612;
export const PAGE_H = 792;

export interface OverlayBox {
  x: number;
  y: number;
  w: number;
  h: number;
  multiline?: boolean;
}

/** Helvetica (WinAnsi) can't encode smart quotes / dashes — fold to ASCII. */
export function sanitize(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ");
}

/** Greedy word-wrap honoring explicit newlines. */
export function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const trial = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Single line, vertically centered, auto-shrunk to fit the box width. */
export function drawSingle(page: PDFPage, font: PDFFont, box: OverlayBox, text: string): void {
  const padX = 2.5;
  const maxW = box.w - padX * 2;
  let size = Math.min(9.5, box.h - 3);
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  const y = box.y + Math.max(2, (box.h - size) / 2);
  page.drawText(text, { x: box.x + padX, y, size, font, color: BLACK, maxWidth: maxW });
}

/** Multi-line, wrapped + shrunk so every line fits the box height (never clip). */
export function drawMultiline(page: PDFPage, font: PDFFont, box: OverlayBox, text: string): void {
  const padX = 2.5;
  const padY = 2;
  const maxW = box.w - padX * 2;
  const maxH = box.h - padY * 2;
  let size = box.h > 100 ? 9 : 8;
  let lines = wrapText(text, font, size, maxW);
  for (; size >= 6; size -= 0.5) {
    lines = wrapText(text, font, size, maxW);
    if (lines.length * (size + 2) <= maxH) break;
  }
  const lineGap = size + 2;
  let ty = box.y + box.h - padY - size;
  for (const line of lines) {
    if (ty < box.y + 1) break;
    if (line) page.drawText(line, { x: box.x + padX, y: ty, size, font, color: BLACK });
    ty -= lineGap;
  }
}

export type Align = "left" | "center" | "right";

/**
 * Draw one line at an exact baseline (for table cells that must sit on the grid
 * lines). Auto-shrinks to fit maxW and aligns within [x, x+maxW].
 */
export function drawAt(
  page: PDFPage,
  font: PDFFont,
  opts: { x: number; baseline: number; maxW: number; align?: Align; size?: number },
  text: string,
): void {
  let size = opts.size ?? 8.5;
  while (size > 5 && font.widthOfTextAtSize(text, size) > opts.maxW) size -= 0.5;
  const tw = font.widthOfTextAtSize(text, size);
  let x = opts.x;
  if (opts.align === "center") x = opts.x + (opts.maxW - tw) / 2;
  else if (opts.align === "right") x = opts.x + (opts.maxW - tw);
  page.drawText(text, { x, y: opts.baseline, size, font, color: BLACK });
}

/** Centered "X" for a checkbox. */
export function drawCheck(page: PDFPage, font: PDFFont, box: OverlayBox): void {
  const size = Math.min(11, box.h - 2);
  const w = font.widthOfTextAtSize("X", size);
  page.drawText("X", {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - size) / 2 + 1,
    size,
    font,
    color: BLACK,
  });
}

export async function fetchTemplateBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}
