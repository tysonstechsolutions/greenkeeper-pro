/**
 * MWR Facilities Maintenance Work Order PDF generator.
 *
 * Pixel-faithful recreation of the official form (rev 10/2024).
 * Only Section 2 (Requestor) is populated — Section 1 and Section 3
 * are left blank for Facilities Admin and the Maintenance Team.
 */
import { jsPDF, AcroFormComboBox } from "jspdf";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

// ── Page constants ────────────────────────────────────────────────────────────

const PW = 216; // letter width mm
const ML = 12; // left margin
const MR = 12; // right margin

const FX = ML; // form left = 12
const FY = 25; // form top (title sits above)
const FW = PW - ML - MR; // form width = 192
const FH = 247; // form total height
const FX2 = FX + FW; // form right = 204
const FBY = FY + FH; // form bottom = 272

const SLW = 8; // section-label column width
const CX = FX + SLW; // content left = 20
const CW = FW - SLW; // content width = 184
const CX2 = CX + CW; // content right = 204

// ── Section heights & positions ──────────────────────────────────────────────

const S1H = 15;
const S2H = 115;
const S3H = FH - S1H - S2H; // 117

const S1Y = FY; // 25
const S2Y = S1Y + S1H; // 40
const S3Y = S2Y + S2H; // 155

// ── Section 1: Admin fills (compact value + label strip) ─────────────────────

const S1_VAL_H = 9;
const S1_LBL_Y = S1Y + S1_VAL_H; // 34
const S1_LBL_H = S1H - S1_VAL_H; // 6

// S1 columns: DATE ASSIGNED | NATURE OF REQUEST | WORK ORDER #
const S1_C1 = 46;
const S1_C2 = 92;
const S1_C3 = CW - S1_C1 - S1_C2; // 46

// ── Section 2: Requestor fills ───────────────────────────────────────────────

// Label strip height (used for all label rows in S2)
const LBL_H = 5;
// Value strip height
const VAL_H = 9;
// Combined row height
const ROW_H = LBL_H + VAL_H; // 14

// Row 1: DATE | FACILITY/BLDG # | PROGRAM AREA/ROOM | COST CENTER
const S2R1_Y = S2Y; // 40
const S2R1_LBL_Y = S2R1_Y;
const S2R1_VAL_Y = S2R1_Y + LBL_H; // 45

const S2_C1 = 24; // DATE
const S2_C2 = 48; // FACILITY/BLDG #
const S2_C3 = 63; // PROGRAM AREA/ROOM
const S2_C4 = CW - S2_C1 - S2_C2 - S2_C3; // 49 COST CENTER

// Description of Work Needed
const S2D_LBL_Y = S2R1_Y + ROW_H; // 54
const S2D_AREA_Y = S2D_LBL_Y + LBL_H; // 59
const S2D_AREA_H = 60;

// Work Type row: WORK TYPE | PRIMARY POC EMAIL | PRIMARY POC PHONE
const S2W_LBL_Y = S2D_AREA_Y + S2D_AREA_H; // 119
const S2W_VAL_Y = S2W_LBL_Y + LBL_H; // 124

const S2_W1 = 55; // WORK TYPE
const S2_W2 = 64; // PRIMARY POC EMAIL
const S2_W3 = CW - S2_W1 - S2_W2; // 65 PRIMARY POC PHONE

// Enclosures row: NUM ENCLOSURES | SEC POC NAME | SEC POC PHONE
const S2E_LBL_Y = S2W_VAL_Y + VAL_H; // 133
const S2E_VAL_Y = S2E_LBL_Y + LBL_H; // 138
const S2E_BOT = S2E_VAL_Y + VAL_H; // 147

// Blank rows at base of Section 2  (S3Y=155, so 8mm of blank = 2 × 4mm)
const S2_BLK_H = (S3Y - S2E_BOT) / 2; // 4

// ── Section 3: Maintenance Team fills ────────────────────────────────────────

// Maximo block — two stacked rows in a compact grid
const S3M_H = 14;
const S3M_ROW_H = S3M_H / 2; // 7
const S3M_Y = S3Y; // 155

// Maximo columns (left label | value box | right label | value box)
const S3M_L1 = 70; // MAXIMO SERVICE REQUEST # / WORK ORDER CODE
const S3M_V1 = 24; // value box
const S3M_L2 = 46; // DATE ENTERED / COMPLETED
const S3M_V2 = CW - S3M_L1 - S3M_V1 - S3M_L2; // 44

// Description of Work Provided
const S3D_LBL_Y = S3M_Y + S3M_H; // 169
const S3D_AREA_Y = S3D_LBL_Y + LBL_H; // 174

// Labor table (anchored to bottom of form)
const S3L_HEAD_H = 8;
const S3L_ROWS = 6;
const S3L_ROW_H = 6;
const S3L_TOTAL = S3L_HEAD_H + S3L_ROWS * S3L_ROW_H; // 44
const S3L_HEAD_Y = FBY - S3L_TOTAL; // 228
const S3L_DATA_Y = S3L_HEAD_Y + S3L_HEAD_H; // 236

// S3 description area fills the gap
const S3D_AREA_H = S3L_HEAD_Y - S3D_AREA_Y; // 54

// Labor columns
const S3_LC1 = 33; // START DATE
const S3_LC2 = 64; // NAMES
const S3_LC3 = 40; // TOTAL HOURS
const S3_LC4 = CW - S3_LC1 - S3_LC2 - S3_LC3; // 47 DATE COMPLETED

// ── Colors ────────────────────────────────────────────────────────────────────

const GRAY_BG: [number, number, number] = [70, 70, 70];

// ── Dropdown options (interactive AcroForm ComboBox fields) ──────────────────

const NATURE_OPTIONS = ["", "Routine", "Urgent", "Emergent"];

const WORK_TYPE_OPTIONS = [
  "",
  "General Maintenance",
  "Electrical",
  "Plumbing",
  "HVAC/Mechanical",
  "Carpentry/Structural",
  "Painting/Finishes",
  "Grounds/Landscaping",
  "Vehicle/Equipment",
  "Pest Control",
  "Special Event Support",
  "Other",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkOrderData {
  date: string;
  facilityBldg: string;
  programAreaRoom: string;
  costCenter: string;
  descriptionOfWork: string;
  workType: string;
  primaryPocEmail: string;
  primaryPocPhone: string;
  numberOfEnclosures: string;
  secondaryPocName: string;
  secondaryPocPhone: string;
  /** Base64 data-URL strings for attached photos (appended as enclosure pages). */
  photos?: string[];
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function hLine(doc: jsPDF, x1: number, y: number, x2: number, lw = 0.3) {
  doc.setLineWidth(lw);
  doc.setDrawColor(0);
  doc.line(x1, y, x2, y);
}

function vLine(doc: jsPDF, x: number, y1: number, y2: number, lw = 0.3) {
  doc.setLineWidth(lw);
  doc.setDrawColor(0);
  doc.line(x, y1, x, y2);
}

/** Draw a filled gray rectangle for a section-label column. */
function sectionFill(doc: jsPDF, y: number, h: number) {
  doc.setFillColor(...GRAY_BG);
  doc.rect(FX, y, SLW, h, "F");
}

/** Rotated white section label centered in the gray column. */
function sectionLabel(doc: jsPDF, label: string, y: number, h: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(label, FX + SLW / 2, y + h / 2, {
    angle: 90,
    align: "center",
  });
  doc.setTextColor(0);
}

/**
 * Label text — bold, 7pt, placed 1.5mm inside the cell.
 * Returns the width of the rendered string (useful for inline notes).
 */
function label(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  fs = 7,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fs);
  doc.setTextColor(0);
  doc.text(text, x + 1.5, y + 3.5);
  return doc.getTextWidth(text);
}

/** Italic note appended after a label on the same baseline. */
function labelNote(doc: jsPDF, text: string, x: number, y: number, fs = 6) {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(fs);
  doc.setTextColor(0);
  doc.text(text, x, y + 3.5);
}

/**
 * Add an interactive AcroForm ComboBox (dropdown) field to the PDF.
 * The field is clickable in Adobe Acrobat / other PDF viewers so the
 * user can change the selected value after the PDF is generated.
 */
function addComboBox(
  doc: jsPDF,
  fieldName: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: string[],
  currentValue: string,
  editable = false,
) {
  const combo = new AcroFormComboBox();
  combo.fieldName = fieldName;
  combo.x = x;
  combo.y = y;
  combo.width = w;
  combo.height = h;
  combo.setOptions(options);
  combo.value = currentValue;
  combo.defaultValue = currentValue;
  combo.fontName = "helvetica";
  combo.fontSize = 8;
  combo.edit = editable;
  combo.textAlign = "left";
  doc.addField(combo);
}

/**
 * Render wrapped value text inside a cell. Clips at bottomY.
 */
function value(
  doc: jsPDF,
  text: string,
  x: number,
  startY: number,
  maxW: number,
  bottomY: number,
  fs = 8,
) {
  if (!text.trim()) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fs);
  doc.setTextColor(0);
  const lines = doc.splitTextToSize(text, maxW - 3) as string[];
  const lineH = fs * 0.35 + 1.2;
  let ty = startY;
  for (const line of lines) {
    if (ty > bottomY - 1) break;
    doc.text(line, x + 1.5, ty);
    ty += lineH;
  }
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function downloadWorkOrderReport(
  data: WorkOrderData,
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
  });

  // ── Title ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("MWR FACILITIES MAINTENANCE WORK ORDER", PW / 2, 16, {
    align: "center",
  });

  // ── Outer border ───────────────────────────────────────────────────────
  doc.setLineWidth(0.6);
  doc.setDrawColor(0);
  doc.rect(FX, FY, FW, FH);

  // ── Section dividers (thick) ───────────────────────────────────────────
  hLine(doc, FX, S2Y, FX2, 0.6);
  hLine(doc, FX, S3Y, FX2, 0.6);

  // ── Section-label fills + labels ───────────────────────────────────────
  sectionFill(doc, S1Y, S1H);
  sectionFill(doc, S2Y, S2H);
  sectionFill(doc, S3Y, S3H);

  vLine(doc, CX, FY, FBY, 0.6); // label column right edge

  sectionLabel(doc, "SECTION 1", S1Y, S1H);
  sectionLabel(doc, "SECTION 2", S2Y, S2H);
  sectionLabel(doc, "SECTION 3", S3Y, S3H);

  // ════════════════════════════════════════════════════════════════════════
  //  SECTION 1  —  Admin fills (left blank)
  // ════════════════════════════════════════════════════════════════════════

  const s1x1 = CX;
  const s1x2 = s1x1 + S1_C1;
  const s1x3 = s1x2 + S1_C2;

  // Column dividers (full S1 height)
  vLine(doc, s1x2, S1Y, S1Y + S1H);
  vLine(doc, s1x3, S1Y, S1Y + S1H);

  // Horizontal divider between value area and label strip
  hLine(doc, CX, S1_LBL_Y, CX2);

  // Labels at bottom of Section 1 — centered in each column
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text("DATE ASSIGNED", s1x1 + S1_C1 / 2, S1_LBL_Y + 4, {
    align: "center",
  });
  doc.text("NATURE OF REQUEST", s1x2 + S1_C2 / 2, S1_LBL_Y + 4, {
    align: "center",
  });
  doc.text("WORK ORDER #", s1x3 + S1_C3 / 2, S1_LBL_Y + 4, {
    align: "center",
  });

  // Interactive dropdown for NATURE OF REQUEST
  addComboBox(doc, "natureOfRequest", s1x2, S1Y, S1_C2, S1_VAL_H, NATURE_OPTIONS, "");

  // ════════════════════════════════════════════════════════════════════════
  //  SECTION 2  —  Requestor fills
  // ════════════════════════════════════════════════════════════════════════

  // ── Row 1: DATE | FACILITY/BLDG # | PROGRAM AREA/ROOM | COST CENTER ──

  const r1x1 = CX;
  const r1x2 = r1x1 + S2_C1;
  const r1x3 = r1x2 + S2_C2;
  const r1x4 = r1x3 + S2_C3;

  // Horizontal line between label strip and value strip
  hLine(doc, CX, S2R1_VAL_Y, CX2);
  // Bottom of Row 1
  hLine(doc, CX, S2R1_Y + ROW_H, CX2);

  // Column dividers (full Row 1 height)
  vLine(doc, r1x2, S2R1_Y, S2R1_Y + ROW_H);
  vLine(doc, r1x3, S2R1_Y, S2R1_Y + ROW_H);
  vLine(doc, r1x4, S2R1_Y, S2R1_Y + ROW_H);

  // Row 1 labels
  label(doc, "DATE", r1x1, S2R1_LBL_Y);
  label(doc, "FACILITY/ BLDG #", r1x2, S2R1_LBL_Y);
  label(doc, "PROGRAM AREA/ROOM", r1x3, S2R1_LBL_Y);
  label(doc, "COST CENTER", r1x4, S2R1_LBL_Y);

  // Row 1 values
  value(doc, data.date, r1x1, S2R1_VAL_Y + 3.5, S2_C1, S2R1_Y + ROW_H);
  // FACILITY/BLDG # — interactive dropdown (editable so user can type custom values)
  addComboBox(doc, "facilityBldg", r1x2, S2R1_VAL_Y, S2_C2, VAL_H,
    ["", data.facilityBldg].filter((v, i, a) => a.indexOf(v) === i),
    data.facilityBldg, true);
  value(doc, data.programAreaRoom, r1x3, S2R1_VAL_Y + 3.5, S2_C3, S2R1_Y + ROW_H);
  value(doc, data.costCenter, r1x4, S2R1_VAL_Y + 3.5, S2_C4, S2R1_Y + ROW_H);

  // ── Description of Work Needed ─────────────────────────────────────────

  // Label row
  const dLblW = label(doc, "DESCRIPTION OF WORK NEEDED:", CX, S2D_LBL_Y);
  labelNote(
    doc,
    "(Include Specific Locations, Vehicle Plate #, Deficiency #'s, etc. Photos welcome.)",
    CX + 1.5 + dLblW + 1,
    S2D_LBL_Y,
  );

  // Bottom of description area
  hLine(doc, CX, S2D_AREA_Y + S2D_AREA_H, CX2);

  // Description value text
  value(
    doc,
    data.descriptionOfWork,
    CX,
    S2D_AREA_Y + 4,
    CW,
    S2D_AREA_Y + S2D_AREA_H,
    8,
  );

  // ── Work Type | Primary POC Email | Primary POC Phone ──────────────────

  const wx1 = CX;
  const wx2 = wx1 + S2_W1;
  const wx3 = wx2 + S2_W2;

  // Label / value divider
  hLine(doc, CX, S2W_VAL_Y, CX2);
  // Bottom of row
  hLine(doc, CX, S2W_VAL_Y + VAL_H, CX2);
  // Column dividers
  vLine(doc, wx2, S2W_LBL_Y, S2W_VAL_Y + VAL_H);
  vLine(doc, wx3, S2W_LBL_Y, S2W_VAL_Y + VAL_H);

  // Labels
  const wtW = label(doc, "WORK TYPE:", wx1, S2W_LBL_Y);
  labelNote(doc, "(list deficiency # above)", wx1 + 1.5 + wtW + 1, S2W_LBL_Y, 5.5);
  label(doc, "PRIMARY POC EMAIL", wx2, S2W_LBL_Y);
  label(doc, "PRIMARY POC PHONE", wx3, S2W_LBL_Y);

  // Values
  // WORK TYPE — interactive dropdown
  addComboBox(doc, "workType", wx1, S2W_VAL_Y, S2_W1, VAL_H,
    WORK_TYPE_OPTIONS, data.workType);
  value(doc, data.primaryPocEmail, wx2, S2W_VAL_Y + 3.5, S2_W2, S2W_VAL_Y + VAL_H, 7.5);
  value(doc, data.primaryPocPhone, wx3, S2W_VAL_Y + 3.5, S2_W3, S2W_VAL_Y + VAL_H);

  // ── Enclosures | Secondary POC ─────────────────────────────────────────

  // Label / value divider
  hLine(doc, CX, S2E_VAL_Y, CX2);
  // Bottom of row
  hLine(doc, CX, S2E_BOT, CX2);
  // Column dividers (same x as WT row)
  vLine(doc, wx2, S2E_LBL_Y, S2E_BOT);
  vLine(doc, wx3, S2E_LBL_Y, S2E_BOT);

  // Labels
  label(doc, "NUMBER OF ENCLOSURES:", wx1, S2E_LBL_Y);
  label(doc, "SECONDARY POC NAME", wx2, S2E_LBL_Y);
  label(doc, "SECONDARY POC PHONE", wx3, S2E_LBL_Y);

  // Values
  value(doc, data.numberOfEnclosures, wx1, S2E_VAL_Y + 3.5, S2_W1, S2E_BOT);
  value(doc, data.secondaryPocName, wx2, S2E_VAL_Y + 3.5, S2_W2, S2E_BOT);
  value(doc, data.secondaryPocPhone, wx3, S2E_VAL_Y + 3.5, S2_W3, S2E_BOT);

  // ── Blank rows at base of Section 2 ────────────────────────────────────

  hLine(doc, CX, S2E_BOT + S2_BLK_H, CX2);
  // Second blank row bottom is the thick S3 divider — already drawn

  // ════════════════════════════════════════════════════════════════════════
  //  SECTION 3  —  Maintenance Team fills (left blank)
  // ════════════════════════════════════════════════════════════════════════

  // ── Maximo block (2 rows × 4 columns) ──────────────────────────────────

  const mx1 = CX; // label 1 start
  const mx2 = mx1 + S3M_L1; // value box 1 start
  const mx3 = mx2 + S3M_V1; // label 2 start
  const mx4 = mx3 + S3M_L2; // value box 2 start

  const m1y = S3M_Y; // row 1 top
  const m2y = m1y + S3M_ROW_H; // row 2 top
  const mBot = m1y + S3M_H; // block bottom

  // Row divider
  hLine(doc, CX, m2y, CX2);
  // Block bottom
  hLine(doc, CX, mBot, CX2);

  // Column dividers for value boxes
  vLine(doc, mx2, m1y, mBot);
  vLine(doc, mx3, m1y, mBot);
  vLine(doc, mx4, m1y, mBot);

  // Row 1 labels
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text("MAXIMO SERVICE REQUEST #", mx1 + 1.5, m1y + 4.5);
  doc.text("DATE ENTERED", mx3 + 1.5, m1y + 4.5);

  // Row 2 labels
  doc.text("MAXIMO WORK ORDER CODE", mx1 + 1.5, m2y + 4.5);
  doc.text("DATE COMPLETED", mx3 + 1.5, m2y + 4.5);

  // ── Description of Work Provided ───────────────────────────────────────

  const dpW = label(doc, "DESCRIPTION OF WORK PROVIDED:", CX, S3D_LBL_Y);
  labelNote(
    doc,
    "(notes to include specific repairs, parts, & other relevant information)",
    CX + 1.5 + dpW + 1,
    S3D_LBL_Y,
  );

  // Bottom of description area
  hLine(doc, CX, S3D_AREA_Y + S3D_AREA_H, CX2);

  // ── Labor table ────────────────────────────────────────────────────────

  const lx1 = CX;
  const lx2 = lx1 + S3_LC1;
  const lx3 = lx2 + S3_LC2;
  const lx4 = lx3 + S3_LC3;

  // Header bottom
  hLine(doc, CX, S3L_DATA_Y, CX2);

  // Column dividers (header through all rows)
  vLine(doc, lx2, S3L_HEAD_Y, FBY);
  vLine(doc, lx3, S3L_HEAD_Y, FBY);
  vLine(doc, lx4, S3L_HEAD_Y, FBY);

  // Header labels (centered)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text("START DATE", lx1 + S3_LC1 / 2, S3L_HEAD_Y + 5, {
    align: "center",
  });
  doc.text("NAMES", lx2 + S3_LC2 / 2, S3L_HEAD_Y + 5, { align: "center" });
  doc.text("TOTAL  HOURS", lx3 + S3_LC3 / 2, S3L_HEAD_Y + 5, {
    align: "center",
  });
  doc.text("DATE COMPLETED", lx4 + S3_LC4 / 2, S3L_HEAD_Y + 5, {
    align: "center",
  });

  // Data row dividers
  for (let i = 0; i < S3L_ROWS; i++) {
    const ry = S3L_DATA_Y + i * S3L_ROW_H;
    if (i > 0) hLine(doc, CX, ry, CX2);
  }

  // ── Re-draw outer border on top of fills ───────────────────────────────
  doc.setLineWidth(0.6);
  doc.setDrawColor(0);
  doc.rect(FX, FY, FW, FH);

  // ── Footer ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text("rev 10/2024", FX2, FBY + 5, { align: "right" });

  // ── Photo enclosure pages ─────────────────────────────────────────────
  if (data.photos && data.photos.length > 0) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const maxImgW = pageW - margin * 2;
    const headerH = 22; // space for header text
    const maxImgH = pageH - margin * 2 - headerH;

    for (let i = 0; i < data.photos.length; i++) {
      doc.addPage();
      const dataUrl = data.photos[i];

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(
        `ENCLOSURE ${i + 1} — Photo`,
        pageW / 2,
        margin + 6,
        { align: "center" },
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `MWR Work Order — ${data.date}`,
        pageW / 2,
        margin + 12,
        { align: "center" },
      );
      doc.setTextColor(0);

      // Determine image format from data URL
      const imgFormat = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";

      try {
        // Load image to get natural dimensions for aspect-ratio scaling
        const dims = await getImageDimensions(dataUrl);
        const scale = Math.min(maxImgW / dims.w, maxImgH / dims.h, 1);
        const imgW = dims.w * scale;
        const imgH = dims.h * scale;
        const imgX = (pageW - imgW) / 2;
        const imgY = margin + headerH;

        doc.addImage(dataUrl, imgFormat, imgX, imgY, imgW, imgH);
      } catch {
        // If image fails to load, add a placeholder note
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(
          "(Photo could not be embedded)",
          pageW / 2,
          pageH / 2,
          { align: "center" },
        );
        doc.setTextColor(0);
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────
  const blob = doc.output("blob");
  const dateStr = data.date.replace(/\//g, "-");
  await saveBlobToDevice({
    blob,
    filename: `MWR-Work-Order-${dateStr}.pdf`,
    shareTitle: "MWR Facilities Maintenance Work Order",
  });
}

// ── Image helpers ──────────────────────────────────────────────────────────

/** Load a data-URL image and return its natural width/height in mm (at 96 dpi). */
function getImageDimensions(
  dataUrl: string,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Convert px → mm  (1 in = 25.4 mm, 96 px/in)
      resolve({ w: (img.width / 96) * 25.4, h: (img.height / 96) * 25.4 });
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}
