/**
 * Evaluation paperwork — client-side PDF.
 *
 * Draws the generic layout described in form.ts: employee block, a rating
 * table (element / rating / comment), the overall rating with every level
 * shown and the chosen one checked, the written sections, and signature
 * lines. Several evaluations can go in one PDF (each starts on a new page) so
 * the whole crew prints in one go.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { COURSE_NAME } from "@/lib/config/org";
import {
  EMPLOYEE_ACKNOWLEDGEMENT,
  FORM_TITLE,
  NARRATIVE_SECTIONS,
  PERFORMANCE_ELEMENTS,
  RATING_LABELS,
  SIGNATURE_LINES,
} from "./form";
import { periodDisplay } from "./period";
import { RATING_VALUES, isRatingValue, type StaffEvaluation } from "./types";

export interface EvaluationPrintData {
  evaluation: Pick<
    StaffEvaluation,
    "period_start" | "period_end" | "period_label" | "status" | "ratings" | "overall_rating" | "narrative"
  >;
  employeeName: string;
  positionTitle: string | null;
  payPlanGrade: string | null;
  hireDate: string | null;
  supervisorName: string;
}

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const GRAY_600: [number, number, number] = [75, 85, 99];
const MARGIN = 15; // mm

const SMART_CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...", "•": "-", "·": "-",
  " ": " ",
};
const SMART_CHAR_RE = /[‘’‚‛“”„‟–—―−…•· ]/g;
// Keep only what jsPDF's built-in WinAnsi fonts can encode.
const NON_ENCODABLE_RE = /[^\t\n\r\x20-\x7E¡-ÿ]/g;

/** Make AI/typed text safe for jsPDF's standard fonts. */
export function pdfSafe(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(SMART_CHAR_RE, (ch) => SMART_CHAR_MAP[ch] ?? " ").replace(NON_ENCODABLE_RE, "");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US");
}

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
}

/** Draw one evaluation starting at the top of the current page. */
function drawEvaluation(doc: jsPDF, data: EvaluationPrintData): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const ev = data.evaluation;

  // ── Title block ───────────────────────────────────────────────────────
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(FORM_TITLE, MARGIN, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(pdfSafe(`${COURSE_NAME}  |  Rating period: ${periodDisplay({
    start: ev.period_start,
    end: ev.period_end,
    label: ev.period_label,
  })}`), MARGIN, 17);
  if (ev.status !== "final") {
    doc.setFont("helvetica", "bold");
    doc.text("DRAFT", pageW - MARGIN, 10, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);

  // ── Employee block ────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 27,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: { fontSize: 9.5, cellPadding: 2, textColor: [0, 0, 0] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [243, 244, 246], cellWidth: 32 },
      2: { fontStyle: "bold", fillColor: [243, 244, 246], cellWidth: 32 },
    },
    body: [
      ["Employee", pdfSafe(data.employeeName), "Position", pdfSafe(data.positionTitle ?? "")],
      ["Pay plan / grade", pdfSafe(data.payPlanGrade ?? ""), "Hire date", fmtDate(data.hireDate)],
      ["Rating supervisor", pdfSafe(data.supervisorName), "Rating period", pdfSafe(ev.period_label)],
    ],
  });

  // ── Element ratings ───────────────────────────────────────────────────
  autoTable(doc, {
    startY: lastY(doc) + 5,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    headStyles: { fillColor: BRAND_DARK, textColor: [255, 255, 255], fontSize: 9.5 },
    styles: { fontSize: 9, cellPadding: 2, valign: "top", textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: "bold" },
      1: { cellWidth: 34 },
      2: { cellWidth: "auto" },
    },
    head: [["Performance element", "Rating", "Comments"]],
    body: PERFORMANCE_ELEMENTS.map((el) => {
      const r = ev.ratings?.[el.key];
      return [
        el.label,
        isRatingValue(r) ? `${r} - ${RATING_LABELS[r]}` : "",
        pdfSafe(ev.narrative?.elements?.[el.key] ?? ""),
      ];
    }),
  });

  // ── Overall rating: every level listed, the chosen one checked ────────
  autoTable(doc, {
    startY: lastY(doc) + 5,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    headStyles: { fillColor: BRAND_DARK, textColor: [255, 255, 255], fontSize: 9.5, halign: "center" },
    styles: { fontSize: 8.5, cellPadding: 2, halign: "center", textColor: [0, 0, 0] },
    head: [[{ content: "Overall summary rating", colSpan: RATING_VALUES.length }]],
    body: [
      RATING_VALUES.map((v) => `${ev.overall_rating === v ? "[X]" : "[  ]"} ${v} - ${RATING_LABELS[v]}`),
    ],
    didParseCell: (hook) => {
      if (hook.section === "body" && RATING_VALUES[hook.column.index] === ev.overall_rating) {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = [220, 252, 231];
      }
    },
  });

  // ── Written sections ──────────────────────────────────────────────────
  for (const section of NARRATIVE_SECTIONS) {
    autoTable(doc, {
      startY: lastY(doc) + 5,
      margin: { left: MARGIN, right: MARGIN },
      theme: "grid",
      headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontSize: 9.5 },
      styles: { fontSize: 9.5, cellPadding: 2.5, textColor: [0, 0, 0] },
      head: [[section.title]],
      body: [[pdfSafe(ev.narrative?.[section.key] ?? "")]],
    });
  }

  // ── Signatures ────────────────────────────────────────────────────────
  const sigBlockH = 14 + SIGNATURE_LINES.length * 14;
  let y = lastY(doc) + 8;
  if (y + sigBlockH > pageH - 12) {
    doc.addPage();
    y = MARGIN + 5;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_600);
  doc.text(EMPLOYEE_ACKNOWLEDGEMENT, MARGIN, y, { maxWidth: contentW });
  doc.setTextColor(0, 0, 0);
  y += 12;
  const dateW = 40;
  const sigW = contentW - dateW - 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const who of SIGNATURE_LINES) {
    doc.line(MARGIN, y, MARGIN + sigW, y);
    doc.line(MARGIN + sigW + 8, y, MARGIN + contentW, y);
    doc.text(`${who} signature`, MARGIN, y + 4);
    doc.text("Date", MARGIN + sigW + 8, y + 4);
    y += 14;
  }
}

/** Build one PDF holding every evaluation passed in, each on its own pages. */
export function buildEvaluationsPdf(items: EvaluationPrintData[]): jsPDF {
  if (items.length === 0) throw new Error("Nothing to print");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const starts: { page: number; name: string }[] = [];
  items.forEach((item, i) => {
    if (i > 0) doc.addPage();
    starts.push({ page: doc.getNumberOfPages(), name: item.employeeName });
    drawEvaluation(doc, item);
  });

  // Footer: "<Name> — page n of m" counted per employee.
  const total = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].page - 1 : total;
    for (let p = s.page; p <= end; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(
        pdfSafe(`${s.name} - ${FORM_TITLE} - page ${p - s.page + 1} of ${end - s.page + 1}`),
        pageW / 2,
        pageH - 6,
        { align: "center" },
      );
    }
  });
  doc.setTextColor(0, 0, 0);
  return doc;
}

export function evaluationsPdfBlob(items: EvaluationPrintData[]): Blob {
  return buildEvaluationsPdf(items).output("blob") as Blob;
}

/** "Evaluation_FY2026_Jane_Smith.pdf" or "Evaluations_FY2026_All.pdf". */
export function evaluationFilename(periodLabel: string, employeeName?: string): string {
  const clean = (s: string) => s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return employeeName
    ? `Evaluation_${clean(periodLabel)}_${clean(employeeName)}.pdf`
    : `Evaluations_${clean(periodLabel)}_All.pdf`;
}
