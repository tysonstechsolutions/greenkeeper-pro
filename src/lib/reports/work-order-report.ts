/**
 * MWR Facilities Maintenance Work Order PDF generator.
 *
 * We do NOT redraw the form. We LOAD the official template
 * (`public/templates/work-order-template.pdf`, rev 10/2024) and fill its
 * SECTION 2 AcroForm fields with pdf-lib, leaving every field editable so
 * Facilities Admin (SECTION 1) and the Maintenance Team (SECTION 3) can
 * complete their parts later. The output is the same document as the
 * official form — only the SECTION 2 text boxes change.
 *
 * Faithfulness details:
 *   • The description box (Text7) is fixed at 12pt but tall; long text would
 *     clip, so we auto-fit it down to fit the box.
 *   • Narrow single-line boxes (cost center, etc.) shrink only when the value
 *     would overflow, otherwise they keep their native size.
 *   • AI text is normalised to WinAnsi-safe ASCII so pdf.save() can't throw.
 *
 * Field map was discovered by overlaying field names on a render. The form
 * has duplicate/overlapping auto-generated fields; we fill the specific-named
 * ones and leave the empty generic duplicates alone (verified no overlap).
 */
import { PDFDocument, PDFTextField, StandardFonts, type PDFFont } from "pdf-lib";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

const TEMPLATE_URL = "/templates/work-order-template.pdf";

/** SECTION 2 field names. Everything else is SECTION 1/3 — left blank. */
const FIELD = {
  date: "Date4_af_date",
  facility: "Dropdown2", // FACILITY/BLDG # dropdown
  programAreaRoom: "Text5",
  costCenter: "Text6",
  description: "Text7", // multiline
  workType: "Dropdown32",
  primaryPocEmail: "Text10", // native 10pt
  primaryPocPhone: "Text11",
  numberOfEnclosures: "Text14",
  secondaryPocName: "Text12",
  secondaryPocPhone: "Text13",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkOrderData {
  date: string; // MM/DD/YYYY
  /** FACILITY/BLDG # — exact dropdown option, e.g. "VMGC @ 8400". */
  facilityBldg: string;
  programAreaRoom: string;
  costCenter: string;
  descriptionOfWork: string;
  /** WORK TYPE — exact dropdown option, e.g. "Routine". */
  workType: string;
  primaryPocEmail: string;
  primaryPocPhone: string;
  numberOfEnclosures: string;
  secondaryPocName: string;
  secondaryPocPhone: string;
  /** Base64 data-URL strings for attached photos (appended as enclosure pages). */
  photos?: string[];
}

// ── Text sanitisation (WinAnsi-safe) ───────────────────────────────────────────

const SMART_CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...", "•": "-", "·": "-",
  "™": "(TM)", "®": "(R)", "©": "(C)",
  " ": " ",
};
const SMART_CHAR_RE = /[‘’‚‛“”„‟–—―−…•·™®© ]/g;
const NON_ENCODABLE_RE = /[^\t\n\r\x20-\x7E¡-ÿ]/g;

function sanitize(value: string): string {
  if (!value) return "";
  return value
    .replace(SMART_CHAR_RE, (ch) => SMART_CHAR_MAP[ch] ?? " ")
    .replace(NON_ENCODABLE_RE, "");
}

// ── Auto-fit helpers ────────────────────────────────────────────────────────────

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else if (!line) {
        let chunk = "";
        for (const ch of word) {
          if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Largest size ≤ maxSize whose wrapped text fits the box height. */
function fitMultiline(
  text: string,
  font: PDFFont,
  boxW: number,
  boxH: number,
  maxSize = 12,
  minSize = 6,
): number {
  const maxWidth = boxW - 8;
  const maxHeight = boxH - 8;
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    if (wrapLines(text, font, size, maxWidth).length * (size * 1.2) <= maxHeight) {
      return size;
    }
  }
  return minSize;
}

/** Shrink a single-line value from `nativeSize` only if it would overflow the box width. */
function fitSingleLine(
  text: string,
  font: PDFFont,
  boxW: number,
  nativeSize: number,
  minSize = 6.5,
): number {
  const maxWidth = boxW - 4;
  let size = nativeSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

// ── Core fill (pure — unit-testable in Node) ───────────────────────────────────

export async function fillWorkOrderPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  data: WorkOrderData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  const setText = (
    name: string,
    value: string,
    opts: { multiline?: boolean; nativeSize?: number } = {},
  ) => {
    let field: PDFTextField;
    try {
      field = form.getTextField(name);
    } catch {
      return;
    }
    const clean = sanitize(value);
    field.setText(clean);
    if (!clean) return;
    try {
      const { width, height } = field.acroField.getWidgets()[0].getRectangle();
      if (opts.multiline) {
        field.setFontSize(fitMultiline(clean, helv, width, height));
      } else {
        const native = opts.nativeSize ?? 12;
        const fit = fitSingleLine(clean, helv, width, native);
        if (fit < native) field.setFontSize(fit);
      }
    } catch {
      /* widget rect unavailable — leave native size */
    }
  };

  const setDropdown = (name: string, value: string) => {
    if (!value) return;
    try {
      const dd = form.getDropdown(name);
      if (dd.getOptions().includes(value)) dd.select(value);
    } catch {
      /* field/option missing — leave "(select one)" */
    }
  };

  setText(FIELD.date, data.date);
  setDropdown(FIELD.facility, data.facilityBldg);
  setText(FIELD.programAreaRoom, data.programAreaRoom);
  setText(FIELD.costCenter, data.costCenter);
  setText(FIELD.description, data.descriptionOfWork, { multiline: true });
  setDropdown(FIELD.workType, data.workType);
  setText(FIELD.primaryPocEmail, data.primaryPocEmail, { nativeSize: 10 });
  setText(FIELD.primaryPocPhone, data.primaryPocPhone);
  setText(FIELD.numberOfEnclosures, data.numberOfEnclosures);
  setText(FIELD.secondaryPocName, data.secondaryPocName);
  setText(FIELD.secondaryPocPhone, data.secondaryPocPhone);

  // Photo enclosure pages (appended after the form page).
  if (data.photos && data.photos.length > 0) {
    for (const dataUrl of data.photos) {
      await appendPhotoPage(pdf, dataUrl);
    }
  }

  return pdf.save();
}

async function appendPhotoPage(pdf: PDFDocument, dataUrl: string): Promise<void> {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return;
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return;
  }
  let img;
  try {
    img = /png/i.test(meta) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return;
  }
  const PW = 612;
  const PH = 792;
  const margin = 40;
  const page = pdf.addPage([PW, PH]);
  const scale = Math.min((PW - margin * 2) / img.width, (PH - margin * 2) / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (PW - w) / 2, y: (PH - h) / 2, width: w, height: h });
}

// ── Browser entry points ────────────────────────────────────────────────────────

export async function generateWorkOrderBlob(data: WorkOrderData): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Could not load the work order template.");
  const bytes = await fillWorkOrderPdf(await response.arrayBuffer(), data);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function downloadWorkOrderReport(
  data: WorkOrderData,
  filename?: string,
): Promise<void> {
  const blob = await generateWorkOrderBlob(data);
  const fname = filename ?? `MWR-Work-Order-${data.date.replace(/\//g, "-")}.pdf`;
  await saveBlobToDevice({
    blob,
    filename: fname,
    shareTitle: "MWR Facilities Maintenance Work Order",
  });
}
