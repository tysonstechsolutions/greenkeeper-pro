/**
 * AST Monthly Inspection Report — faithful reproduction of the official
 * STI SP001 Monthly Inspection Checklist PDF (FY2026 issue).
 *
 * The user's regulator (environmental compliance) accepts only the
 * official form layout — no branding, no summary stat strips, no
 * highlighting. Format matches the source PDF exactly:
 *   • Page 1: title, general inspection information bullets, info form
 *     box, ITEM/STATUS/COMMENTS table starting with Tank and Piping rows
 *   • Page 2: continued items table covering Equipment / Containment /
 *     CE-AST / Other Conditions
 *   • Page 3: Additional Comments lines
 *
 * Status indicators are the same filled-square / empty-square checkboxes
 * used on the source ("■ Yes  ☐ No*  ☐ N/A").
 *
 * Pure jsPDF (no autotable). The form is fixed-width tabular layout
 * which is easier to render manually than to coerce autotable into.
 */

import { jsPDF } from "jspdf";
import {
  AST_INSPECTION_ITEMS,
  AST_SECTIONS,
  isNonConforming,
} from "@/lib/ast-inspection-items";
import type { AstInspection } from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BLACK: [number, number, number] = [0, 0, 0];
const GRAY_LINE: [number, number, number] = [120, 120, 120];
const GRAY_SHADE: [number, number, number] = [220, 220, 220];

function formatDateUS(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export class AstInspectionReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "AstInspectionReportError";
  }
}

/**
 * Layout constants for the form. Letter-portrait, all in mm.
 */
const PAGE_WIDTH = 215.9;
const PAGE_HEIGHT = 279.4;
const MARGIN_X = 14;
const CONTENT_W = PAGE_WIDTH - MARGIN_X * 2;

// Item table column widths (must sum to CONTENT_W)
const COL_NUM_W = 8;
const COL_STATUS_W = 38;
const COL_COMMENT_W = 60;
const COL_ITEM_W = CONTENT_W - COL_NUM_W - COL_STATUS_W - COL_COMMENT_W;

const FONT = "helvetica";

export async function generateAstInspectionReport(
  inspection: AstInspection,
): Promise<Blob> {
  let step = "init";
  try {
    step = "pdf-init";
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
    });

    let y = MARGIN_X;
    let pageNum = 1;
    const totalPagesPlaceholder = "{{TOTAL_PAGES}}";

    // ── Header band: page count footer set up after we know totals ────────
    function drawFooter(p: number) {
      doc.setFont(FONT, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BLACK);
      doc.text("Monthly Checklist", MARGIN_X, PAGE_HEIGHT - 8);
      doc.text(
        `Page ${p} of ${totalPagesPlaceholder}`,
        PAGE_WIDTH - MARGIN_X,
        PAGE_HEIGHT - 8,
        { align: "right" },
      );
    }

    function newPage() {
      drawFooter(pageNum);
      doc.addPage();
      pageNum++;
      y = MARGIN_X;
    }

    // ── Title ─────────────────────────────────────────────────────────────
    step = "pdf-title";
    doc.setFont(FONT, "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BLACK);
    doc.text("STI SP001 Monthly Inspection Checklist", PAGE_WIDTH / 2, y, {
      align: "center",
    });
    y += 7;

    // ── General Inspection Information bullets ────────────────────────────
    step = "pdf-info-bullets";
    doc.setFont(FONT, "bold");
    doc.setFontSize(9);
    doc.text("General Inspection Information:", MARGIN_X, y);
    y += 4;

    const bullets = [
      "This checklist is intended as a model. Locally developed checklists are acceptable as long as they are equivalent and meet all applicable inspection checklist items. Inspections of multiple tanks may be captured on one form as long as the tanks are substantially the same.",
      "For equipment not included in this Standard, follow the manufacturer recommended inspection/testing schedules and procedures.",
      "The periodic AST Inspection is intended for monitoring the external AST condition and its containment structure. This visual inspection does not require a Certified Inspector. It shall be performed by an owner's inspector per paragraph 4.1.2 of the standard.",
      "Upon discovery of water in the primary tank, secondary containment area, interstice, or spill container, remove promptly or take other corrective action. Inspect the liquid for regulated products or other contaminants and dispose of properly.",
      "* designates an item in a non-conformance status. This indicates that action is required to address a problem. Note that some non-conforming items important to tank or containment integrity require evaluation by an engineer experienced in AST design, a Certified Inspector, or a tank manufacturer who will determine the corrective action. Note the non-conformance and corresponding corrective action in the comment section.",
      "If the inspection finds the integrity of the spill control system and/or the CRDM, such as items 13 and 14, is compromised the tank category and inspection time table should be re-evaluated by someone knowledgeable about the SP001 standard.",
      "Retain the completed checklists for at least 36 months.",
      "After severe weather (snow, ice, wind storms) or maintenance (such as coating) that could affect the operation of critical components (normal and emergency vents, valves), an inspection of these components is required as soon as the equipment is safely accessible after the event.",
    ];

    doc.setFont(FONT, "normal");
    doc.setFontSize(7.2);
    for (const b of bullets) {
      // Indented bullet — diamond marker followed by wrapped text.
      const wrapped = doc.splitTextToSize(b, CONTENT_W - 6);
      doc.text("◆", MARGIN_X + 1, y);
      doc.text(wrapped, MARGIN_X + 5, y);
      y += wrapped.length * 3.2 + 0.6;
    }

    y += 1;

    // ── General info form box ─────────────────────────────────────────────
    step = "pdf-info-box";
    const boxTop = y;
    const boxH = 28;

    // Outer box
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN_X, boxTop, CONTENT_W, boxH);

    // Three-column row 1: Inspection Date | Prior Inspection Date | Retain until date
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    const colW = CONTENT_W / 3;
    drawLabeledLine(
      doc,
      MARGIN_X + 2,
      boxTop + 5,
      "Inspection Date:",
      formatDateUS(inspection.inspection_date),
      colW - 4,
    );
    drawLabeledLine(
      doc,
      MARGIN_X + colW + 2,
      boxTop + 5,
      "Prior Inspection Date:",
      formatDateUS(inspection.prior_inspection_date),
      colW - 4,
    );
    drawLabeledLine(
      doc,
      MARGIN_X + colW * 2 + 2,
      boxTop + 5,
      "Retain until date:",
      formatDateUS(inspection.retain_until_date),
      colW - 4,
    );

    // Row 2: Inspector Name (print) (2/3 width) | Title (1/3 width)
    drawLabeledLine(
      doc,
      MARGIN_X + 2,
      boxTop + 11,
      "Inspector Name (print):",
      inspection.inspector_name,
      colW * 2 - 4,
    );
    drawLabeledLine(
      doc,
      MARGIN_X + colW * 2 + 2,
      boxTop + 11,
      "Title:",
      inspection.inspector_title || "",
      colW - 4,
    );

    // Row 3: Inspector's Signature (full width)
    drawLabeledLine(
      doc,
      MARGIN_X + 2,
      boxTop + 17,
      "Inspector's Signature",
      inspection.inspector_signature || "",
      CONTENT_W - 4,
      true,
    );

    // Row 4: Tank(s) inspected ID (full width)
    drawLabeledLine(
      doc,
      MARGIN_X + 2,
      boxTop + 22,
      "Tank(s) inspected ID",
      inspection.tank_ids,
      CONTENT_W - 4,
    );

    // Row 5: Regulatory facility name and ID number (full width)
    const facility =
      [inspection.facility_name, inspection.facility_id]
        .filter(Boolean)
        .join(" — ") || "";
    drawLabeledLine(
      doc,
      MARGIN_X + 2,
      boxTop + 27,
      "Regulatory facility name and ID number (if applicable)",
      facility,
      CONTENT_W - 4,
    );

    y = boxTop + boxH + 4;

    // ── Items table ───────────────────────────────────────────────────────
    step = "pdf-items";

    // Column header row
    function drawHeaderRow() {
      const headH = 6;
      doc.setFillColor(...GRAY_SHADE);
      doc.rect(MARGIN_X, y, CONTENT_W, headH, "F");
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN_X, y, CONTENT_W, headH, "S");

      // Column dividers
      const x1 = MARGIN_X + COL_NUM_W;
      const x2 = x1 + COL_ITEM_W;
      const x3 = x2 + COL_STATUS_W;
      doc.line(x1, y, x1, y + headH);
      doc.line(x2, y, x2, y + headH);
      doc.line(x3, y, x3, y + headH);

      doc.setFont(FONT, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLACK);
      doc.text("ITEM", MARGIN_X + COL_NUM_W / 2, y + 4, { align: "center" });
      doc.text("", MARGIN_X + COL_NUM_W + COL_ITEM_W / 2, y + 4, {
        align: "center",
      });
      doc.text("STATUS", x2 + COL_STATUS_W / 2, y + 4, { align: "center" });
      doc.text("COMMENTS / DATE CORRECTED", x3 + COL_COMMENT_W / 2, y + 4, {
        align: "center",
      });
      y += headH;
    }

    function drawSectionHeaderRow(label: string) {
      const h = 5;
      ensureRoom(h);
      doc.setFillColor(...GRAY_SHADE);
      doc.rect(MARGIN_X, y, CONTENT_W, h, "F");
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN_X, y, CONTENT_W, h, "S");
      doc.setFont(FONT, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLACK);
      doc.text(label, PAGE_WIDTH / 2, y + 3.5, { align: "center" });
      y += h;
    }

    function ensureRoom(needed: number) {
      // Reserve 12mm at the bottom for the footer.
      if (y + needed > PAGE_HEIGHT - 12) {
        newPage();
        // Repeat column header on new page.
        drawHeaderRow();
      }
    }

    function drawCheckbox(x: number, yy: number, checked: boolean) {
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.3);
      const sz = 2.4;
      doc.rect(x, yy - sz + 0.5, sz, sz, "S");
      if (checked) {
        // Filled box (■)
        doc.setFillColor(...BLACK);
        doc.rect(x + 0.4, yy - sz + 0.9, sz - 0.8, sz - 0.8, "F");
      }
    }

    function drawItemRow(item: (typeof AST_INSPECTION_ITEMS)[number]) {
      const entry = inspection.items?.[String(item.number)];
      const status = entry?.status ?? null;

      // Compute the row height needed by wrapping the prompt + note.
      const promptText = item.prompt;
      const noteText = item.note || "";
      doc.setFont(FONT, "normal");
      doc.setFontSize(7.5);
      const promptWrap = doc.splitTextToSize(promptText, COL_ITEM_W - 4);
      const noteWrap = noteText
        ? doc.splitTextToSize("Note: " + noteText, COL_ITEM_W - 6)
        : [];
      const commentWrap = entry?.comment
        ? doc.splitTextToSize(entry.comment, COL_COMMENT_W - 4)
        : [];

      // Row height = max of (prompt+note lines) and (comment lines), with
      // a minimum that fits the status checkboxes.
      const lineH = 3.4;
      const promptH = promptWrap.length * lineH + (noteWrap.length ? noteWrap.length * lineH + 1 : 0);
      const commentH = commentWrap.length * lineH;
      const rowH = Math.max(8, promptH + 2, commentH + 2);

      ensureRoom(rowH);

      // Borders
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");

      const x1 = MARGIN_X + COL_NUM_W;
      const x2 = x1 + COL_ITEM_W;
      const x3 = x2 + COL_STATUS_W;
      doc.line(x1, y, x1, y + rowH);
      doc.line(x2, y, x2, y + rowH);
      doc.line(x3, y, x3, y + rowH);

      // Item number — bold, centered top
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.text(String(item.number), MARGIN_X + COL_NUM_W / 2, y + 4.5, {
        align: "center",
      });

      // Item description text
      doc.setFont(FONT, "normal");
      doc.setFontSize(7.5);
      doc.text(promptWrap, x1 + 2, y + 3.6);
      if (noteWrap.length > 0) {
        doc.setFont(FONT, "bold");
        doc.text(
          noteWrap,
          x1 + 4,
          y + 3.6 + promptWrap.length * lineH + 0.5,
        );
      }

      // Status checkboxes (Yes / No* / N/A)
      const statusYTop = y + rowH / 2 - 1.5;
      let cx = x2 + 3;
      const yesBad = !!item.yesIsNonConforming;
      // YES
      drawCheckbox(cx, statusYTop, status === "yes");
      doc.setFont(FONT, "normal");
      doc.setFontSize(8);
      doc.text(yesBad ? "Yes*" : "Yes", cx + 3.5, statusYTop);
      cx += 12;
      // NO
      drawCheckbox(cx, statusYTop, status === "no");
      doc.text(yesBad ? "No" : "No*", cx + 3.5, statusYTop);
      cx += 12;
      if (item.allowsNa) {
        drawCheckbox(cx, statusYTop, status === "na");
        doc.text("N/A", cx + 3.5, statusYTop);
      }

      // Comment cell
      if (commentWrap.length > 0) {
        doc.setFont(FONT, "normal");
        doc.setFontSize(7.5);
        doc.text(commentWrap, x3 + 2, y + 3.6);
      }

      y += rowH;
    }

    // Render the table
    drawHeaderRow();

    for (const section of AST_SECTIONS) {
      drawSectionHeaderRow(section);
      const sectionItems = AST_INSPECTION_ITEMS.filter(
        (i) => i.section === section,
      );
      for (const item of sectionItems) {
        drawItemRow(item);
      }
    }

    // ── Additional Comments page ──────────────────────────────────────────
    step = "pdf-comments";
    newPage();
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text("Additional Comments:", MARGIN_X, y + 4);
    y += 7;

    // Pre-fill any stored comments at the top, then leave blank lines for handwriting.
    if (inspection.additional_comments) {
      doc.setFont(FONT, "normal");
      doc.setFontSize(9);
      const wrapped = doc.splitTextToSize(
        inspection.additional_comments,
        CONTENT_W,
      );
      doc.text(wrapped, MARGIN_X, y + 4);
      y += wrapped.length * 4 + 2;
    }

    // Lines for additional handwritten notes — fill remaining page room.
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.25);
    const lineSpacing = 6;
    while (y + lineSpacing < PAGE_HEIGHT - 16) {
      y += lineSpacing;
      doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y);
    }

    // ── Render footers with real total page count ─────────────────────────
    drawFooter(pageNum);
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      // Re-draw footer with correct totals (overwrite the placeholder).
      doc.setFillColor(255, 255, 255);
      doc.rect(MARGIN_X, PAGE_HEIGHT - 12, CONTENT_W, 6, "F");
      doc.setFont(FONT, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BLACK);
      doc.text("Monthly Checklist", MARGIN_X, PAGE_HEIGHT - 8);
      doc.text(
        `Page ${p} of ${totalPages}`,
        PAGE_WIDTH - MARGIN_X,
        PAGE_HEIGHT - 8,
        { align: "right" },
      );
    }

    // Suppress draft watermark / non-conforming summary that we used to
    // print — the form must match the official layout exactly.

    step = "pdf-output";
    return doc.output("blob");
  } catch (err: any) {
    if (err instanceof AstInspectionReportError) throw err;
    throw new AstInspectionReportError(
      step,
      err?.message || "Failed to generate PDF",
    );
  }
}

/**
 * Draw a "Label: value" row with an underline beneath the value, mirroring
 * the visual style of the official form.
 */
function drawLabeledLine(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  totalW: number,
  smallLabel = false,
) {
  doc.setFont(FONT, "normal");
  doc.setFontSize(smallLabel ? 8 : 8);
  doc.setTextColor(...BLACK);
  doc.text(label, x, y);

  // Compute label width so the underline starts after the label text.
  const labelW = doc.getTextWidth(label) + 2;
  const startX = x + labelW;
  const endX = x + totalW;

  // Underline
  doc.setDrawColor(...GRAY_LINE);
  doc.setLineWidth(0.25);
  doc.line(startX, y + 0.5, endX, y + 0.5);

  // Value (printed above the underline)
  if (value) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.text(value, startX + 1, y - 0.2);
  }
}

export function astInspectionFilename(inspection: AstInspection): string {
  const d = inspection.inspection_date.replace(/-/g, "");
  const tanks = inspection.tank_ids
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const draftSuffix = inspection.status === "draft" ? "-DRAFT" : "";
  return `AST-Inspection-${d}-${tanks}${draftSuffix}.pdf`;
}
