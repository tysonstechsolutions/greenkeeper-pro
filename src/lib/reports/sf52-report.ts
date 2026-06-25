/**
 * SF-52 (Request for Personnel Action) PDF generator.
 *
 * Overlays typed values onto a high-DPI image of the official OPM form at the
 * exact field coordinates (see sf52-fields.ts), producing a result that is the
 * real form — indistinguishable in print. All filling is client-side with
 * pdf-lib; the form backgrounds are fetched from public/templates/.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  SF52_BOXES,
  SF52_CHECKBOXES,
  SF52_PAGE_W,
  SF52_PAGE_H,
  type Sf52Box,
  type Sf52BoxKey,
} from "@/lib/sf52/sf52-fields";

/** All filled values are keyed by field; plus the one Part D checkbox. */
export type Sf52Data = Partial<Record<Sf52BoxKey, string>> & {
  conflictingReasons?: "yes" | "no" | null;
};

const BLACK = rgb(0, 0, 0);

/** Helvetica (WinAnsi) can't encode smart quotes / dashes — fold to ASCII. */
function sanitize(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ");
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Greedy word-wrap honoring explicit newlines. */
function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const trial = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(trial, size) > maxW) {
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

function drawSingle(page: PDFPage, font: PDFFont, box: Sf52Box, text: string): void {
  const padX = 2.5;
  const maxW = box.w - padX * 2;
  let size = Math.min(9.5, box.h - 4);
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  const y = box.y + Math.max(2, (box.h - size) / 2);
  page.drawText(text, { x: box.x + padX, y, size, font, color: BLACK, maxWidth: maxW });
}

function drawMultiline(page: PDFPage, font: PDFFont, box: Sf52Box, text: string): void {
  const padX = 2.5;
  const padY = 2;
  const maxW = box.w - padX * 2;
  const maxH = box.h - padY * 2;
  // Shrink font until every wrapped line fits the box height — never clip.
  const startSize = box.h > 100 ? 9 : 8;
  let size = startSize;
  let lines = wrapText(text, font, size, maxW);
  for (; size >= 6; size -= 0.5) {
    lines = wrapText(text, font, size, maxW);
    if (lines.length * (size + 2) <= maxH) break;
  }
  const lineGap = size + 2;
  let ty = box.y + box.h - padY - size; // first baseline near the top
  for (const line of lines) {
    if (ty < box.y + 1) break;
    if (line) page.drawText(line, { x: box.x + padX, y: ty, size, font, color: BLACK });
    ty -= lineGap;
  }
}

function drawCheck(page: PDFPage, font: PDFFont, box: { x: number; y: number; w: number; h: number }): void {
  const size = Math.min(12, box.h - 2);
  const w = font.widthOfTextAtSize("X", size);
  page.drawText("X", {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - size) / 2 + 1,
    size,
    font,
    color: BLACK,
  });
}

export async function generateSf52Report(
  data: Sf52Data,
  filename = "SF52.pdf",
): Promise<{ blob: Blob; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const [bg1, bg2] = await Promise.all([
    fetchBytes("/templates/sf52-page-1.png"),
    fetchBytes("/templates/sf52-page-2.png"),
  ]);
  const png1 = await doc.embedPng(bg1);
  const png2 = await doc.embedPng(bg2);

  const p1 = doc.addPage([SF52_PAGE_W, SF52_PAGE_H]);
  p1.drawImage(png1, { x: 0, y: 0, width: SF52_PAGE_W, height: SF52_PAGE_H });
  const p2 = doc.addPage([SF52_PAGE_W, SF52_PAGE_H]);
  p2.drawImage(png2, { x: 0, y: 0, width: SF52_PAGE_W, height: SF52_PAGE_H });
  const pages: Record<1 | 2, PDFPage> = { 1: p1, 2: p2 };

  for (const key of Object.keys(SF52_BOXES) as Sf52BoxKey[]) {
    const raw = data[key];
    if (!raw || !raw.trim()) continue;
    const box: Sf52Box = SF52_BOXES[key];
    const text = sanitize(raw.trim());
    if (box.multiline) drawMultiline(pages[box.page], font, box, text);
    else drawSingle(pages[box.page], font, box, text);
  }

  if (data.conflictingReasons === "yes") drawCheck(p2, font, SF52_CHECKBOXES.conflictingReasonsYes);
  if (data.conflictingReasons === "no") drawCheck(p2, font, SF52_CHECKBOXES.conflictingReasonsNo);

  const bytes = await doc.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return { blob, filename };
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Official filename convention from the SF-52 Desk Guide:
 *   SF52_<ActionRequested>_<EmployeeLastName>_<PositionTitle>_<MonthYear>.pdf
 * e.g. SF52_Recruitment_Smith_RecreationAide_Dec2026.pdf
 */
export function sf52Filename(
  action: string,
  lastName: string,
  positionTitle: string,
  now: Date = new Date(),
): string {
  const clean = (s: string) => (s || "").replace(/[^a-zA-Z0-9]+/g, "");
  const my = `${SHORT_MONTHS[now.getMonth()]}${now.getFullYear()}`;
  const parts = ["SF52", clean(action), clean(lastName), clean(positionTitle), my].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}
