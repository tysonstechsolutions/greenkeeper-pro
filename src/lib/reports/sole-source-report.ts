/**
 * Sole Source justification PDF generator.
 *
 * We do NOT redraw the form. We LOAD the official FRSC template
 * (`public/templates/sole-source-template.pdf`) and fill its named AcroForm
 * fields with pdf-lib, leaving every field editable so the requestor and
 * contracting officer can add signatures in Acrobat afterward. The output is
 * therefore the same document as the official form — only the text-box values
 * change.
 *
 * Two faithfulness details handled here:
 *   1. Sections 3, 4 and 5 ship with an auto-size font (`/Helv 0 Tf`). pdf-lib
 *      renders size-0 multiline fields at a huge size (one word per box), so we
 *      replicate Acrobat's auto-fit: pick the largest font size whose wrapped
 *      text fits the box. The other boxes keep their native fixed size.
 *   2. AI text often contains smart quotes / em-dashes / trademark symbols,
 *      which the form's WinAnsi Helvetica can't always encode (it would throw
 *      on save). We normalise those to ASCII before filling.
 *
 * The business goes in the Dealer/Rep column (Text9-Text14); the Manufacturer
 * column is left blank, matching the source example.
 */
import { PDFDocument, PDFTextField, StandardFonts, type PDFFont } from "pdf-lib";
import { formatLocalDate } from "@/lib/utils/date";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

const TEMPLATE_URL = "/templates/sole-source-template.pdf";

// Fields that ship with `/Helv 0 Tf` (auto-size) + the multiline flag.
// These are the only ones pdf-lib mis-renders, so they get auto-fit.
const AUTOFIT_FIELDS: ReadonlySet<string> = new Set([
  "3 Description of the item or service required",
  "etc",
  "the results of any supporting market research as appropriate",
  // Page-2 justification boxes also ship auto-size; without auto-fit the text
  // renders oversized and bleeds out of the box. Fit them too.
  "equipment", // Section 6 — compatibility
  "equipment_2", // Section 8 — direct replacement
  "If yes list the proprietary data", // Section 7
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SoleSourceData {
  // Header
  date: string; // MM/DD/YYYY — fills both "Date" and "Requested Date"
  requestingInstallation: string; // "From (Installation)"
  requiringActivity: string; // page-1 "Requiring Activity"
  requestingActivity: string; // page-2 "Requesting Activity"

  // Item / service
  estimatedCost: string;
  requiredDeliveryDate: string;
  description: string; // Section 3
  characteristics: string; // Section 4  (field "etc")
  marketResearch: string; // Section 5

  // Justification
  hasProprietary: "Yes" | "No"; // Yes/No dropdown (shared by Q6 & Q7)
  proprietaryData: string; // Section 7 box  ("If yes list the proprietary data")
  compatibilityNotes: string; // Section 6 box  ("equipment") — usually blank
  directReplacement: string; // Section 8 box  ("equipment_2") — default "N/A"

  // Contractor → Dealer/Rep column (Text9-Text14)
  contractorName: string;
  contractorAddress: string;
  contractorCityStateZip: string;
  contractorPoc: string;
  contractorPhone: string;
  contractorEmail: string;

  // Requestor
  requestorName: string;
}

// ── Text sanitisation (WinAnsi-safe) ───────────────────────────────────────────

const SMART_CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...", "•": "-", "·": "-",
  "™": "(TM)", "®": "(R)", "©": "(C)",
  " ": " ",
};

const SMART_CHAR_RE =
  /[‘’‚‛“”„‟–—―−…•·™®© ]/g;

// Drop anything that is not tab/newline/CR, printable ASCII, or Latin-1
// supplement (accents, degree sign, fractions) so the WinAnsi font can always
// encode the result and `pdf.save()` can never throw on an exotic character.
const NON_ENCODABLE_RE = /[^\t\n\r\x20-\x7E¡-ÿ]/g;

function sanitize(value: string): string {
  if (!value) return "";
  return value
    .replace(SMART_CHAR_RE, (ch) => SMART_CHAR_MAP[ch] ?? " ")
    .replace(NON_ENCODABLE_RE, "");
}

// ── Auto-fit helpers ────────────────────────────────────────────────────────────

/** Word-wrap `text` to `maxWidth` at `size`, honouring explicit newlines. */
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
        // Single word wider than the box — hard-break it character by character.
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

/**
 * Largest font size in [minSize, maxSize] whose wrapped text fits the box.
 * A conservative line-height (1.2) and inner padding mean the estimate is
 * never tighter than pdf-lib's own layout, so text won't clip.
 */
function fitFontSize(
  text: string,
  font: PDFFont,
  boxW: number,
  boxH: number,
  maxSize = 11,
  minSize = 6,
): number {
  const padX = 4;
  const padY = 4;
  const maxWidth = boxW - padX * 2;
  const maxHeight = boxH - padY * 2;
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    const lines = wrapLines(text, font, size, maxWidth);
    if (lines.length * (size * 1.2) <= maxHeight) return size;
  }
  return minSize;
}

// ── Core fill (pure — no DOM/fetch, so it is unit-testable in Node) ─────────────

/**
 * Fill the sole-source template bytes with `data` and return the saved PDF
 * bytes. Fields remain interactive (not flattened).
 */
export async function fillSoleSourcePdf(
  templateBytes: ArrayBuffer | Uint8Array,
  data: SoleSourceData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  const setText = (name: string, value: string) => {
    let field: PDFTextField;
    try {
      field = form.getTextField(name);
    } catch {
      return; // field absent in this template revision — skip quietly
    }
    const clean = sanitize(value);
    field.setText(clean);
    if (clean && AUTOFIT_FIELDS.has(name)) {
      try {
        const { width, height } = field.acroField.getWidgets()[0].getRectangle();
        field.setFontSize(fitFontSize(clean, helv, width, height));
      } catch {
        field.setFontSize(9); // safe fallback if the widget rect is unavailable
      }
    }
  };

  const setDropdown = (name: string, value: string) => {
    try {
      form.getDropdown(name).select(value);
    } catch {
      /* option/field missing — ignore */
    }
  };

  // Header
  setText("Date", data.date);
  setText("Requested Date", data.date);
  setText("Requesting Installation", data.requestingInstallation);
  setText("Requiring Activity", data.requiringActivity);
  setText("Requesting Activity", data.requestingActivity);

  // Item / service
  setText("2 Estimated cost of the requirement", data.estimatedCost);
  setText("2a Required Delivery Date", data.requiredDeliveryDate);
  setText("3 Description of the item or service required", data.description);
  setText("etc", data.characteristics);
  setText("the results of any supporting market research as appropriate", data.marketResearch);

  // Justification
  setText("equipment", data.compatibilityNotes); // Section 6 — usually blank
  setDropdown("Yes/No", data.hasProprietary === "Yes" ? "Yes" : "No");
  setText("If yes list the proprietary data", data.proprietaryData); // Section 7
  setText("equipment_2", data.directReplacement || "N/A"); // Section 8

  // Contractor → Dealer/Rep column. Manufacturer column intentionally blank.
  setText("Text9", data.contractorName);
  setText("Text10", data.contractorAddress);
  setText("Text11", data.contractorCityStateZip);
  setText("Text12", data.contractorPoc);
  setText("Text13", data.contractorPhone);
  setText("Text14", data.contractorEmail);

  // Requestor (signature + contracting-officer blocks left blank for Acrobat).
  setText("Requestor Printed Name", data.requestorName);

  return pdf.save();
}

// ── Browser entry points ────────────────────────────────────────────────────────

function buildFilename(data: SoleSourceData): string {
  const dateStr = formatLocalDate(new Date());
  const safeName =
    (data.contractorName || "Sole-Source")
      .replace(/[^a-zA-Z0-9-_\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 30) || "Sole-Source";
  return `SoleSource-${safeName}-${dateStr}.pdf`;
}

export async function generateSoleSourceReport(
  data: SoleSourceData,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Could not load the sole source template.");
  const templateBytes = await response.arrayBuffer();

  const bytes = await fillSoleSourcePdf(templateBytes, data);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  return { blob, filename: buildFilename(data) };
}

export async function downloadSoleSourceReport(data: SoleSourceData): Promise<void> {
  const { blob, filename } = await generateSoleSourceReport(data);
  await saveBlobToDevice({
    blob,
    filename,
    shareTitle: "Sole Source Justification",
  });
}
