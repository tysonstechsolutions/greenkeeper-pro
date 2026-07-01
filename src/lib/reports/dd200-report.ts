/**
 * DD Form 200 filler. Fills the initiator's portion (blocks 1-11) on page 1 of
 * the two-page form, onto the blank template rasters. Signature blocks and the
 * reviewing/appointing/approving sections (and all of page 2) are left blank —
 * signed up the chain, off-app.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import {
  PAGE_W,
  PAGE_H,
  BLACK,
  drawAt,
  drawWrapped,
  drawMultiline,
  fetchTemplateBytes,
  sanitize,
} from "./form-overlay";
import {
  DD200_LINES,
  DD200_BOXES,
  DD200_CIRCUMSTANCE_CHECKS,
  DD200_CATEGORY_CHECKS,
  type Dd200Check,
} from "@/lib/dd-forms/dd200-fields";

export interface Dd200Data {
  dateInitiated?: string;
  inquiryNumber?: string;
  dateLossDiscovered?: string;
  nsn?: string;
  itemDescription?: string;
  quantity?: string;
  unitCost?: string;
  totalCost?: string;
  circumstance?: "lost" | "damaged" | "destroyed";
  category?: "organization" | "installation" | "ocie";
  circumstances?: string;
  actions?: string;
  orgAddress?: string;
  typedName?: string;
  dsn?: string;
  dateSigned?: string;
}

/** Bold "X" matching the form's ✖ mark (Helvetica can't encode ✖ itself). */
function drawX(page: PDFPage, bold: PDFFont, mark: Dd200Check): void {
  page.drawText("X", { x: mark.x, y: mark.baseline, size: 8.5, font: bold, color: BLACK });
}

export async function generateDd200Report(
  data: Dd200Data,
  filename = "DD200.pdf",
): Promise<{ blob: Blob; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [bg1, bg2] = await Promise.all([
    fetchTemplateBytes("/templates/dd200-page-1.png"),
    fetchTemplateBytes("/templates/dd200-page-2.png"),
  ]);
  const png1 = await doc.embedPng(bg1);
  const png2 = await doc.embedPng(bg2);

  const p1 = doc.addPage([PAGE_W, PAGE_H]);
  p1.drawImage(png1, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  const p2 = doc.addPage([PAGE_W, PAGE_H]);
  p2.drawImage(png2, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  // Single-line fields.
  const lineData = data as Record<string, string | undefined>;
  for (const [key, f] of Object.entries(DD200_LINES)) {
    const raw = lineData[key];
    if (!raw || !raw.trim()) continue;
    const clean = sanitize(raw.trim());
    // Long item descriptions wrap to a 2nd line within the cell (no bleed).
    if (key === "itemDescription") {
      drawWrapped(p1, font, { x: f.x, baseline: f.baseline, maxW: f.maxW, align: f.align, maxLines: 2 }, clean);
    } else {
      drawAt(p1, font, { x: f.x, baseline: f.baseline, maxW: f.maxW, align: f.align }, clean);
    }
  }

  // Multi-line boxes.
  for (const [key, box] of Object.entries(DD200_BOXES)) {
    const raw = lineData[key];
    if (!raw || !raw.trim()) continue;
    drawMultiline(p1, font, box, sanitize(raw.trim()));
  }

  // Block-9 marks.
  if (data.circumstance) drawX(p1, bold, DD200_CIRCUMSTANCE_CHECKS[data.circumstance]);
  if (data.category) drawX(p1, bold, DD200_CATEGORY_CHECKS[data.category]);

  const bytes = await doc.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return { blob, filename };
}

/** Save-name convention: SITE_<site>_FY26_GLK_DD FORM 200_<asset>. */
export function dd200Filename(site: string, asset: string): string {
  const clean = (s: string) => (s || "").replace(/[^A-Za-z0-9 ]+/g, "").trim().replace(/\s+/g, " ");
  const parts = [`SITE_${clean(site)}`, "FY26", "GLK", "DD FORM 200", clean(asset)].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}
