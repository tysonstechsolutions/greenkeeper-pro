/**
 * NAVCOMPT 2212 filler. Draws the activity/date/sheet header and the item rows
 * onto the blank template raster, matching the official form exactly (same
 * approach as the SF-52 filler). Signature/approval blocks are left blank —
 * those are signed off-app.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  PAGE_W,
  PAGE_H,
  drawAt,
  fetchTemplateBytes,
  sanitize,
} from "./form-overlay";
import {
  DD2212_HEADER,
  DD2212_TABLE,
  dd2212RowBaseline,
  type Dd2212ColumnKey,
} from "@/lib/dd-forms/dd2212-fields";

export interface Dd2212Item {
  description?: string;
  units?: string;
  unitCost?: string;
  totalValue?: string;
  reason?: string;
}

export interface Dd2212Data {
  activity?: string;
  date?: string;
  sheetNo?: string;
  sheetOf?: string;
  items?: Dd2212Item[];
}

export async function generateDd2212Report(
  data: Dd2212Data,
  filename = "DD2212.pdf",
): Promise<{ blob: Blob; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const bg = await fetchTemplateBytes("/templates/dd2212-page-1.png");
  const png = await doc.embedPng(bg);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(png, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  // Header fields on their exact baselines.
  for (const [key, field] of Object.entries(DD2212_HEADER)) {
    const raw = (data as Record<string, string | undefined>)[key];
    if (!raw || !raw.trim()) continue;
    drawAt(
      page,
      font,
      { x: field.x, baseline: field.baseline, maxW: field.maxW, align: field.align },
      sanitize(raw.trim()),
    );
  }

  // Item rows.
  const items = (data.items ?? []).slice(0, DD2212_TABLE.maxRows);
  items.forEach((item, i) => {
    const baseline = dd2212RowBaseline(i + 1);
    (Object.keys(DD2212_TABLE.cols) as Dd2212ColumnKey[]).forEach((col) => {
      const raw = item[col as keyof Dd2212Item];
      if (!raw || !raw.trim()) return;
      const c = DD2212_TABLE.cols[col];
      drawAt(page, font, { x: c.x, baseline, maxW: c.maxW, align: c.align }, sanitize(raw.trim()));
    });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return { blob, filename };
}

/** Save-name convention: SITE_<site>_FY26_GLK_FORM 2212_<asset>. */
export function dd2212Filename(site: string, asset: string): string {
  const clean = (s: string) => (s || "").replace(/[^A-Za-z0-9 ]+/g, "").trim().replace(/\s+/g, " ");
  const parts = [`SITE_${clean(site)}`, "FY26", "GLK", "FORM 2212", clean(asset)].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}
