/**
 * Fill the official CNIC 5300 NAF Performance Rating Form (Rev. 9 Sept 2025)
 * and its Individual Development Plan page.
 *
 * We do NOT redraw the form. We load the blank fillable PDF
 * (`public/templates/naf-performance-appraisal-cnic-5300.pdf`) and fill its
 * fields with pdf-lib, leaving them editable so the last 4 of the SSN and the
 * CAC signatures/dates can be added in Acrobat afterward.
 *
 * Notes on the template:
 *   - Item 6 is a grid of TEXT fields (one per element per rating column);
 *     the chosen column gets an "X".
 *   - Many fields ship with an auto-size font (`/Helv 0 Tf`), which pdf-lib
 *     renders badly, so every filled field gets an explicit size that fits.
 *   - Item 9 is one box. If the remarks don't fit at a readable size, the box
 *     says "see continuation sheet" and a continuation page is added right
 *     after page 1 ("Separate sheet may be attached").
 *   - Several fields have generic names (Text5, Check Box3, …); the mapping
 *     below was made by matching each widget's position to the printed form.
 */
import {
  PDFDocument,
  PDFTextField,
  StandardFonts,
  TextAlignment,
  rgb,
  type PDFFont,
  type PDFForm,
} from "pdf-lib";
import {
  FORM_TEMPLATE_URL,
  IDP_LINES,
  IDP_ORGANIZATION,
  NAF_ACTIVITY,
  RATING_LABELS,
  elementsFor,
} from "./form";
import { remarksText } from "./compose";
import { fiscalYearOf, fiscalYearPeriod } from "./period";
import {
  isRatingValue,
  type AwardKey,
  type RatingReason,
  type RatingValue,
  type StaffEvaluation,
} from "./types";

export interface EvaluationPrintData {
  evaluation: Pick<
    StaffEvaluation,
    | "period_start"
    | "period_end"
    | "period_label"
    | "status"
    | "rating_reason"
    | "supervisory"
    | "ratings"
    | "overall_rating"
    | "awards"
    | "narrative"
  >;
  /** Display name, e.g. "Jane Q Smith". */
  employeeName: string;
  /** Structured name from the personnel record, when known. */
  nameParts?: { last?: string | null; first?: string | null; middle?: string | null } | null;
  positionTitle: string | null;
  payPlanGrade: string | null;
  hireDate: string | null;
  /** "RFT" | "RPT" | "FLEX" from the personnel record. */
  workSchedule?: string | null;
}

// ── Field map ──────────────────────────────────────────────────────────────

const F = {
  name: "1 Name Last First MI",
  ssn: "2 Last 4 SSN",
  position: "3 Position Title Pay Plan Series Grade eg Clerk NF000001",
  activity: "4 Name and Location of NAF Activity eg CNIC N9 NSA Mid South",
  from: "From",
  to: "To",
  remarks: "9 Supervisors Remarks Separate sheet may be attached",
} as const;

const REASON_FIELDS: Record<RatingReason, string> = {
  ninety_day: "90 Day",
  interim: "Interim",
  annual: "Annual",
  separation: "SeparationClose Out",
};

/** Column prefix of the item 6 grid fields. */
const GRID_COLUMN: Record<RatingValue, string> = {
  5: "Outstanding",
  4: "Highly Satisfactory",
  3: "Satisfactory",
  2: "Minimally Satisfactory",
  1: "Unsatisfactory",
};

/** Row suffix of the item 6 grid fields (spacing is exactly as in the PDF). */
const GRID_ROW: Record<string, string> = {
  quality: "a Quality of Work",
  productivity: "b Productivity",
  dependability: "c Dependability",
  working_relationships: "d Working Relationships peers  supervisor",
  customer_relations: "e Customer  Patron Relations",
  leadership: "f Leadership",
  management_coaching: "g ManagementCoaching EffectivenessEEO Commitment",
  internal_controls: "h Management Internal Controls",
};

export function gridFieldName(elementKey: string, rating: RatingValue): string {
  return `${GRID_COLUMN[rating]}${GRID_ROW[elementKey]}`;
}

/** Item 7 check boxes, left to right on the form. */
const OVERALL_FIELDS: Record<RatingValue, string> = {
  5: "Outstanding",
  4: "Check Box1",
  3: "Check Box2",
  2: "Check Box3",
  1: "Check Box4",
};

/** Item 8 a/b/c: Yes box, Amount, No box. */
const AWARD_FIELDS: Record<AwardKey, { yes: string; amount: string; no: string }> = {
  pay_increase: { yes: "Check Box5", amount: "Text5", no: "Check Box8" },
  performance_award: { yes: "Check Box6", amount: "Text6", no: "Check Box17" },
  time_off_award: { yes: "Check Box7", amount: "Text7", no: "Check Box18" },
};

/** Page 5 — Individual Development Plan. */
const IDP = {
  name: "Text12",
  ssn: "Text24",
  position: "Text14",
  organization: "Text30",
  appointed: "Text26",
  from: "Text31",
  to: "Text28",
  learning: ["Text15", "Text20", "Text8"],
  conferences: ["Text22", "Text10", "Text23"],
  remarks: "8 Remarks",
  schedule: {
    RFT: "Regular Full Time",
    RPT: "Regular Part Time",
    FLEX: "Flexible Schedule",
  } as Record<string, string>,
} as const;

// ── Text helpers ───────────────────────────────────────────────────────────

const SMART_CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...", "•": "-", "·": "-",
  " ": " ",
};
const SMART_CHAR_RE = /[‘’‚‛“”„‟–—―−…•· ]/g;
// Keep only what the form's WinAnsi Helvetica can encode.
const NON_ENCODABLE_RE = /[^\t\n\r\x20-\x7E¡-ÿ]/g;

/** Make AI/typed text safe for the PDF's standard font. */
export function pdfSafe(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(SMART_CHAR_RE, (ch) => SMART_CHAR_MAP[ch] ?? " ").replace(NON_ENCODABLE_RE, "");
}

/** "2025-10-01" → "10/01/2025". */
export function formDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/** Item 1 — "Last, First M." from the personnel record, else from the full name. */
export function nameLastFirstMi(
  fullName: string,
  parts?: EvaluationPrintData["nameParts"],
): string {
  let last = parts?.last?.trim() ?? "";
  let first = parts?.first?.trim() ?? "";
  let middle = parts?.middle?.trim() ?? "";
  if (!last || !first) {
    const tokens = fullName.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 1) return tokens[0];
    first = first || tokens[0] || "";
    last = last || tokens[tokens.length - 1] || "";
    middle = middle || (tokens.length > 2 ? tokens[1] : "");
  }
  const mi = middle ? ` ${middle.charAt(0).toUpperCase()}.` : "";
  return `${last}, ${first}${mi}`;
}

/** Item 3 — "Laborer, NA-5703-05". */
export function positionLine(title: string | null, payPlanGrade: string | null): string {
  return [title?.trim(), payPlanGrade?.trim()].filter(Boolean).join(", ");
}

/** Word-wrap `text` to `maxWidth` at `size`, honouring explicit newlines. */
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

/** Smallest size we'll print item 9 at before moving it to a continuation sheet. */
export const MIN_REMARKS_SIZE = 7.5;

/** Largest size ≤ maxSize whose wrapped text fits the box, or null if none ≥ minSize. */
export function fitMultiline(
  text: string,
  font: PDFFont,
  boxW: number,
  boxH: number,
  maxSize: number,
  minSize: number,
): number | null {
  const maxWidth = boxW - 8;
  const maxHeight = boxH - 8;
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    if (wrapLines(text, font, size, maxWidth).length * size * 1.2 <= maxHeight) return size;
  }
  return null;
}

/** Largest size ≤ maxSize at which one line of text fits the box. */
function fitSingleLine(text: string, font: PDFFont, boxW: number, boxH: number, maxSize: number): number {
  const cap = Math.min(maxSize, Math.max(5, boxH - 3));
  for (let size = cap; size > 5; size -= 0.5) {
    if (font.widthOfTextAtSize(text, size) <= boxW - 4) return size;
  }
  return 5;
}

function daSize(field: PDFTextField): number {
  const da = field.acroField.getDefaultAppearance() ?? "";
  const m = da.match(/([\d.]+)\s+Tf/);
  const n = m ? Number(m[1]) : 0;
  return Number.isFinite(n) ? n : 0;
}

// ── Core fill (pure — no DOM/fetch, so it is unit-testable in Node) ─────────

export interface FillResult {
  bytes: Uint8Array;
  /** True when item 9 went on a continuation sheet. */
  remarksContinued: boolean;
}

function makeSetters(form: PDFForm, font: PDFFont) {
  const setText = (
    name: string,
    value: string,
    opts: { center?: boolean; maxSize?: number; size?: number } = {},
  ) => {
    let field: PDFTextField;
    try {
      field = form.getTextField(name);
    } catch {
      return; // not in this template revision — skip quietly
    }
    const clean = pdfSafe(value);
    field.setText(clean);
    if (opts.center) field.setAlignment(TextAlignment.Center);
    if (!clean) return;
    if (opts.size) {
      field.setFontSize(opts.size);
      return;
    }
    const { width, height } = field.acroField.getWidgets()[0].getRectangle();
    const max = opts.maxSize ?? (daSize(field) || 10);
    field.setFontSize(
      field.isMultiline()
        ? fitMultiline(clean, font, width, height, max, 5) ?? 5
        : fitSingleLine(clean, font, width, height, max),
    );
  };
  const check = (name: string, on: boolean) => {
    try {
      const box = form.getCheckBox(name);
      if (on) box.check();
      else box.uncheck();
    } catch {
      /* missing — ignore */
    }
  };
  /** The size at which `value` fits a single-line field (for matching pairs). */
  const fitSize = (name: string, value: string, maxSize: number): number => {
    try {
      const { width, height } = form.getTextField(name).acroField.getWidgets()[0].getRectangle();
      return fitSingleLine(pdfSafe(value), font, width, height, maxSize);
    } catch {
      return maxSize;
    }
  };
  return { setText, check, fitSize };
}

/**
 * Fill the template bytes with one evaluation. Returns the saved PDF bytes;
 * fields stay editable (not flattened).
 */
export async function fillEvaluationPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  data: EvaluationPrintData,
): Promise<FillResult> {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { setText, check, fitSize } = makeSetters(form, helv);
  const ev = data.evaluation;
  const name = nameLastFirstMi(data.employeeName, data.nameParts);
  const position = positionLine(data.positionTitle, data.payPlanGrade);

  // Items 1–5
  setText(F.name, name, { maxSize: 11 });
  setText(F.ssn, "");
  setText(F.position, position, { maxSize: 11 });
  setText(F.activity, NAF_ACTIVITY, { maxSize: 11 });
  // From/To boxes differ in width; print both dates at the same size.
  const fromText = formDate(ev.period_start);
  const toText = formDate(ev.period_end);
  const dateSize = Math.min(fitSize(F.from, fromText, 10), fitSize(F.to, toText, 10));
  setText(F.from, fromText, { size: dateSize });
  setText(F.to, toText, { size: dateSize });
  for (const [reason, field] of Object.entries(REASON_FIELDS)) {
    check(field, (ev.rating_reason ?? "annual") === reason);
  }

  // Item 6 — an X in the chosen column for each element that applies.
  const applicable = new Set(elementsFor(!!ev.supervisory).map((e) => e.key));
  for (const key of Object.keys(GRID_ROW)) {
    const rating = ev.ratings?.[key];
    for (const value of [5, 4, 3, 2, 1] as RatingValue[]) {
      setText(gridFieldName(key, value), applicable.has(key) && rating === value ? "X" : "", {
        center: true,
        maxSize: 9,
      });
    }
  }

  // Item 7
  for (const value of [5, 4, 3, 2, 1] as RatingValue[]) {
    check(OVERALL_FIELDS[value], ev.overall_rating === value);
  }

  // Item 8 — every line gets Yes or No.
  for (const [key, f] of Object.entries(AWARD_FIELDS) as [AwardKey, (typeof AWARD_FIELDS)[AwardKey]][]) {
    const decision = ev.awards?.[key];
    const granted = !!decision?.granted;
    check(f.yes, granted);
    check(f.no, !granted);
    setText(f.amount, granted ? (decision?.amount ?? "").trim().replace(/^\$\s*/, "") : "", { maxSize: 9 });
  }

  // Item 9 — the remarks box, or a continuation sheet when it won't fit.
  const remarks = pdfSafe(remarksText(ev.narrative));
  const remarksField = form.getTextField(F.remarks);
  const box = remarksField.acroField.getWidgets()[0].getRectangle();
  const size = remarks ? fitMultiline(remarks, helv, box.width, box.height, 10, MIN_REMARKS_SIZE) : 10;
  const remarksContinued = size === null;
  if (remarksContinued) {
    remarksField.setText("See attached continuation sheet for Item 9, Supervisor's Remarks.");
    remarksField.setFontSize(10);
  } else {
    remarksField.setText(remarks);
    remarksField.setFontSize(size);
  }

  // Items 10–12: signatures and dates are left for the signers.

  // Page 5 — Individual Development Plan.
  const idp = ev.narrative?.idp;
  const nextPeriod = fiscalYearPeriod(fiscalYearOf(ev.period_end) + 1);
  setText(IDP.name, name, { maxSize: 11 });
  setText(IDP.ssn, "");
  setText(IDP.position, position, { maxSize: 10 });
  const schedule = (data.workSchedule ?? "").toUpperCase();
  for (const [code, field] of Object.entries(IDP.schedule)) check(field, schedule === code);
  setText(IDP.organization, IDP_ORGANIZATION, { maxSize: 10 });
  setText(IDP.appointed, formDate(data.hireDate), { maxSize: 11 });
  const idpFrom = formDate(nextPeriod.start);
  const idpTo = formDate(nextPeriod.end);
  const idpDateSize = Math.min(fitSize(IDP.from, idpFrom, 9), fitSize(IDP.to, idpTo, 9));
  setText(IDP.from, idpFrom, { size: idpDateSize });
  setText(IDP.to, idpTo, { size: idpDateSize });
  for (let i = 0; i < IDP_LINES; i++) {
    setText(IDP.learning[i], idp?.learning?.[i] ?? "", { maxSize: 10 });
    setText(IDP.conferences[i], idp?.conferences?.[i] ?? "", { maxSize: 10 });
  }
  setText(IDP.remarks, idp?.remarks ?? "", { maxSize: 10 });

  // Continuation sheet goes right after page 1.
  if (remarksContinued) {
    addContinuationPages(pdf, helv, helvBold, {
      heading: "CNIC 5300 - Item 9. Supervisor's Remarks (continued)",
      subheading: `Employee: ${name}    Rating period: ${formDate(ev.period_start)} to ${formDate(ev.period_end)}`,
      body: remarks,
      insertAt: 1,
    });
  }

  if (ev.status !== "final") {
    const first = pdf.getPage(0);
    first.drawText("DRAFT", {
      x: first.getWidth() - 80,
      y: first.getHeight() - 22,
      size: 14,
      font: helvBold,
      color: rgb(0.8, 0.1, 0.1),
    });
  }

  return { bytes: await pdf.save(), remarksContinued };
}

function addContinuationPages(
  pdf: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  args: { heading: string; subheading: string; body: string; insertAt: number },
) {
  const W = 612;
  const H = 792;
  const margin = 54;
  const size = 10.5;
  const leading = size * 1.35;
  const lines = wrapLines(args.body, font, size, W - margin * 2);
  let index = args.insertAt;
  let page = pdf.insertPage(index++, [W, H]);
  let y = H - margin;
  const header = () => {
    page.drawText(args.heading, { x: margin, y, size: 12, font: bold });
    y -= 18;
    page.drawText(pdfSafe(args.subheading), { x: margin, y, size: 9.5, font });
    y -= 24;
  };
  header();
  for (const line of lines) {
    if (y < margin + leading) {
      page = pdf.insertPage(index++, [W, H]);
      y = H - margin;
      header();
    }
    page.drawText(line, { x: margin, y, size, font });
    y -= leading;
  }
}

/**
 * Fill several evaluations and merge them into one print-ready PDF. The pages
 * keep each field's filled-in appearance, but the merged file carries no form
 * of its own (the copies would share field names). Not flattened: pdf-lib's
 * flatten leaves dangling references that PDF readers report as broken.
 */
export async function fillEvaluationsCombined(
  templateBytes: ArrayBuffer | Uint8Array,
  items: EvaluationPrintData[],
): Promise<Uint8Array> {
  if (items.length === 0) throw new Error("Nothing to print");
  const merged = await PDFDocument.create();
  for (const item of items) {
    const { bytes } = await fillEvaluationPdf(templateBytes, item);
    const filled = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(filled, filled.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save({ useObjectStreams: false });
}

// ── Browser entry points ───────────────────────────────────────────────────

let templateCache: ArrayBuffer | null = null;

export async function loadEvaluationTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache.slice(0);
  const res = await fetch(FORM_TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the evaluation form template.");
  templateCache = await res.arrayBuffer();
  return templateCache.slice(0);
}

function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: "application/pdf",
  });
}

/** One employee's filled, still-editable form. */
export async function evaluationPdfBlob(item: EvaluationPrintData): Promise<Blob> {
  const { bytes } = await fillEvaluationPdf(await loadEvaluationTemplate(), item);
  return toBlob(bytes);
}

/** Everyone in one flattened PDF, ready to print. */
export async function combinedEvaluationsPdfBlob(items: EvaluationPrintData[]): Promise<Blob> {
  return toBlob(await fillEvaluationsCombined(await loadEvaluationTemplate(), items));
}

/** "Evaluation_FY2026_Jane_Smith.pdf" or "Evaluations_FY2026_All.pdf". */
export function evaluationFilename(periodLabel: string, employeeName?: string): string {
  const clean = (s: string) => s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return employeeName
    ? `Evaluation_${clean(periodLabel)}_${clean(employeeName)}.pdf`
    : `Evaluations_${clean(periodLabel)}_All.pdf`;
}

/** Plain-language label for item 7, for the UI. */
export function overallLabel(value: RatingValue | null | undefined): string {
  return isRatingValue(value) ? RATING_LABELS[value] : "";
}
