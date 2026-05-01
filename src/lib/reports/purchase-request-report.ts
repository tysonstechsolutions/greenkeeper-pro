/**
 * NAVMIDLANT NAF Purchase Request — client-side PDF generator.
 *
 * Renders a saved purchase_requests row as a 1- or 2-page PDF that mirrors
 * the FY2025 form layout (header band, three columns of details, line-items
 * table, IGE/justification footer, attached-item checkboxes, approval
 * signature lines). The output is what the user emails to
 * midlantnafproc@us.navy.mil.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatInternalOrder } from "@/lib/pr-internal-order";
import type { PurchaseRequest, PurchaseRequestItem } from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */

const NAVY_DARK: [number, number, number] = [27, 67, 50];
const NAVY_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_700: [number, number, number] = [55, 65, 81];
const GRAY_500: [number, number, number] = [107, 114, 128];
const GRAY_300: [number, number, number] = [209, 213, 219];
const WHITE: [number, number, number] = [255, 255, 255];

function s(v: string | null | undefined, fallback = ""): string {
  return v == null ? fallback : v;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(n: number): string {
  if (!n && n !== 0) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export class PurchaseRequestReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "PurchaseRequestReportError";
  }
}

export async function generatePurchaseRequestReport(
  pr: PurchaseRequest,
): Promise<Blob> {
  let step = "init";
  try {
    step = "pdf-init";
    // Landscape letter mirrors the original Navy form orientation.
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 8;

    // ── HEADER BAND ──────────────────────────────────────────────────────
    step = "pdf-header";
    doc.setFillColor(...NAVY_DARK);
    doc.rect(0, 0, pw, 22, "F");
    doc.setFillColor(...NAVY_GOLD);
    doc.rect(0, 22, pw, 1.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text("NON-APPROPRIATED FUND PURCHASE REQUEST", pw / 2, 9, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...NAVY_GOLD);
    doc.text("NAVY REGION MID-ATLANTIC", m + 2, 14);
    doc.setTextColor(...WHITE);
    doc.text("Phone: (757) 444-0464", m + 2, 17.5);
    doc.text("midlantnafproc@us.navy.mil", m + 2, 21);

    // Top-right header info
    const rightCol = pw - 90;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...NAVY_GOLD);
    doc.text("DATE PREPARED:", rightCol, 11);
    doc.text("REQUIRED DELIVERY DATE:", rightCol + 45, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(formatDate(pr.date_prepared), rightCol, 15);
    doc.text(formatDate(pr.required_delivery_date), rightCol + 45, 15);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...NAVY_GOLD);
    doc.text("REQUEST VIA:", rightCol, 18);
    doc.text("CURRENCY:", rightCol + 45, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text(s(pr.request_via), rightCol, 21);
    doc.text(s(pr.currency), rightCol + 45, 21);

    // ── THREE-COLUMN INFO BLOCK ──────────────────────────────────────────
    step = "pdf-info";
    let y = 27;
    const colW = (pw - m * 2 - 4) / 3;
    const col1X = m;
    const col2X = m + colW + 2;
    const col3X = m + (colW + 2) * 2;

    // Column section headers
    doc.setFillColor(...GRAY_300);
    doc.rect(col1X, y, colW, 4, "F");
    doc.rect(col2X, y, colW, 4, "F");
    doc.rect(col3X, y, colW, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    doc.text("SUGGESTED SOURCES", col1X + colW / 2, y + 2.8, { align: "center" });
    doc.text("REQUESTOR", col2X + colW / 2, y + 2.8, { align: "center" });
    doc.text("ACCOUNTING", col3X + colW / 2, y + 2.8, { align: "center" });
    y += 5;

    function labelValue(x: number, yy: number, label: string, value: string): number {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY_500);
      doc.text(label.toUpperCase(), x, yy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_700);
      const wrapped = doc.splitTextToSize(value || "—", colW - 2);
      doc.text(wrapped[0], x, yy + 3);
      // underline
      doc.setDrawColor(...GRAY_300);
      doc.setLineWidth(0.15);
      doc.line(x, yy + 3.5, x + colW - 4, yy + 3.5);
      return yy + 5.5;
    }

    // Column 1 — Suggested sources / Vendor 1
    let y1 = y;
    y1 = labelValue(col1X, y1, "Vendor 1", s(pr.vendor1_name));
    y1 = labelValue(col1X, y1, "Address", s(pr.vendor1_address));
    y1 = labelValue(col1X, y1, "Line 2", s(pr.vendor1_line2));
    y1 = labelValue(col1X, y1, "City, State ZIP", s(pr.vendor1_city_state_zip));
    y1 = labelValue(col1X, y1, "POC", s(pr.vendor1_poc));
    y1 = labelValue(col1X, y1, "Email", s(pr.vendor1_email));
    y1 = labelValue(col1X, y1, "Phone", s(pr.vendor1_phone));
    y1 = labelValue(col1X, y1, "SAP Vendor No", s(pr.vendor1_sap_no));
    y1 = labelValue(col1X, y1, "GSA / NAF / Other No", s(pr.vendor1_gsa_naf_no));
    y1 = labelValue(col1X, y1, "Vendor 2", s(pr.vendor2_name));
    y1 = labelValue(col1X, y1, "Vendor 3", s(pr.vendor3_name));

    // Column 2 — Requestor + Invoice Address
    let y2 = y;
    y2 = labelValue(col2X, y2, "Name", s(pr.requestor_name));
    y2 = labelValue(col2X, y2, "Email", s(pr.requestor_email));
    y2 = labelValue(col2X, y2, "Phone", s(pr.requestor_phone));
    // Sub-header for invoice
    doc.setFillColor(...GRAY_300);
    doc.rect(col2X, y2, colW, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    doc.text("INVOICE ADDRESS", col2X + colW / 2, y2 + 2.8, { align: "center" });
    y2 += 5;
    y2 = labelValue(col2X, y2, "Address", s(pr.invoice_address));
    y2 = labelValue(col2X, y2, "Line 2", s(pr.invoice_line2));
    y2 = labelValue(col2X, y2, "City, State ZIP", s(pr.invoice_city_state_zip));
    y2 = labelValue(col2X, y2, "POC", s(pr.invoice_poc));
    y2 = labelValue(col2X, y2, "Phone", s(pr.invoice_phone));
    y2 = labelValue(col2X, y2, "Email", s(pr.invoice_email));

    // Column 3 — Accounting + Delivery Address
    let y3 = y;
    y3 = labelValue(col3X, y3, "Company Code", s(pr.company_code));
    y3 = labelValue(col3X, y3, "Requesting Facility / Code", s(pr.requesting_facility_code));
    // Internal Order is auto-derived from pr_sequence_number + date_prepared.
    // Falls back to the legacy internal_order field for old hand-edited rows.
    const computedIO =
      formatInternalOrder(pr.pr_sequence_number, pr.date_prepared) ||
      pr.internal_order ||
      "";
    y3 = labelValue(col3X, y3, "Internal Order", computedIO);
    y3 = labelValue(col3X, y3, "Project No", s(pr.project_no));
    y3 = labelValue(col3X, y3, "Program", s(pr.program));
    // Sub-header for delivery
    doc.setFillColor(...GRAY_300);
    doc.rect(col3X, y3, colW, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    doc.text("DELIVERY ADDRESS", col3X + colW / 2, y3 + 2.8, { align: "center" });
    y3 += 5;
    y3 = labelValue(col3X, y3, "Address", s(pr.delivery_address));
    y3 = labelValue(col3X, y3, "Line 2", s(pr.delivery_line2));
    y3 = labelValue(col3X, y3, "City, State ZIP", s(pr.delivery_city_state_zip));
    y3 = labelValue(col3X, y3, "POC", s(pr.delivery_poc));
    y3 = labelValue(col3X, y3, "Phone", s(pr.delivery_phone));
    y3 = labelValue(col3X, y3, "Email", s(pr.delivery_email));

    const yAfterCols = Math.max(y1, y2, y3) + 3;

    // ── LINE ITEMS TABLE ─────────────────────────────────────────────────
    step = "pdf-items";
    const rows = (pr.items || []).map((it: PurchaseRequestItem) => {
      const ext = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
      // Description column: name + part number on a separate line so the
      // procurement office sees both in the same cell.
      const descLines = [s(it.description)];
      if (it.part_number) descLines.push("Part #: " + it.part_number);
      const desc = descLines.filter(Boolean).join("\n");
      return [
        String(it.item),
        s(it.site),
        s(it.cost_ctr),
        s(it.gl_acct),
        desc,
        it.qty ? String(it.qty) : "",
        s(it.unit),
        formatMoney(Number(it.unit_price) || 0),
        formatMoney(ext),
      ];
    });

    // Pad to a minimum number of rows so the table looks like a form.
    const MIN_ROWS = 12;
    while (rows.length < MIN_ROWS) {
      rows.push(["", "", "", "", "", "", "", "", ""]);
    }

    autoTable(doc, {
      startY: yAfterCols,
      head: [
        [
          "ITEM",
          "SITE",
          "COST CTR",
          "G/L ACCT",
          "ITEM DESCRIPTION",
          "QTY",
          "UNIT",
          "UNIT PRICE",
          "EXTENDED PRICE",
        ],
      ],
      body: rows,
      theme: "grid",
      headStyles: {
        fillColor: NAVY_DARK,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        cellPadding: 1.5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: GRAY_700,
        cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 },
        lineColor: GRAY_300,
        lineWidth: 0.2,
        valign: "middle",
        minCellHeight: 5.2,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 16 },
        2: { cellWidth: 18 },
        3: { cellWidth: 18 },
        4: { cellWidth: "auto" },
        5: { cellWidth: 14, halign: "right" },
        6: { cellWidth: 14 },
        7: { cellWidth: 24, halign: "right" },
        8: { cellWidth: 28, halign: "right" },
      },
      margin: { left: m, right: m },
    });

    // ── IGE / SIGNATURES FOOTER ──────────────────────────────────────────
    step = "pdf-footer";
    let yF = (doc as any).lastAutoTable?.finalY || yAfterCols;
    if (yF + 50 > ph - m) {
      doc.addPage();
      yF = m;
    } else {
      yF += 2;
    }

    // Row 1 — Financial analyst + IGE excess + IGE amount
    const fa_w = (pw - m * 2) * 0.45;
    const ige_w = (pw - m * 2) - fa_w;

    doc.setDrawColor(...GRAY_300);
    doc.setLineWidth(0.2);
    doc.rect(m, yF, fa_w, 8, "S");
    doc.rect(m + fa_w, yF, ige_w, 8, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("FINANCIAL ANALYST:", m + 1.5, yF + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    doc.text(s(pr.financial_analyst), m + 35, yF + 5);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY_500);
    doc.text(
      "The contracting officer or cardholder is",
      m + fa_w + 1.5,
      yF + 2.5,
    );
    doc.text(
      "authorized to exceed this IGE Amount by:",
      m + fa_w + 1.5,
      yF + 5,
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY_DARK);
    doc.text(`${pr.ige_excess_pct}%`, m + fa_w + 65, yF + 5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_500);
    doc.text("IGE AMOUNT:", m + fa_w + 75, yF + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text("(incl page 2)", m + fa_w + 91, yF + 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...NAVY_DARK);
    doc.text(formatMoney(Number(pr.ige_amount) || 0), pw - m - 2, yF + 6, {
      align: "right",
    });
    yF += 8;

    // Row 2 — Approving authority + Justification
    const aa_w = fa_w;
    const just_w = ige_w;
    const aa_h = 18;

    doc.rect(m, yF, aa_w, aa_h, "S");
    doc.rect(m + aa_w, yF, just_w, aa_h, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("APPROVING AUTHORITY:", m + 1.5, yF + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    doc.text(s(pr.approving_authority), m + 1.5, yF + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("SIGNATURE & DATE:", m + 1.5, yF + 11);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    doc.text(
      `${s(pr.approving_authority)}  ·  ${formatDate(pr.approving_signature_date)}`.trim(),
      m + 1.5,
      yF + 15,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("JUSTIFICATION FOR PURCHASE:", m + aa_w + 1.5, yF + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    const justWrap = doc.splitTextToSize(s(pr.justification), just_w - 4);
    doc.text(justWrap.slice(0, 3), m + aa_w + 1.5, yF + 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("IGE BASED ON:", m + aa_w + 1.5, yF + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    const igeBasedWrap = doc.splitTextToSize(s(pr.ige_based_on), just_w - 30);
    if (igeBasedWrap[0]) doc.text(igeBasedWrap[0], m + aa_w + 22, yF + 16);

    // Cert text
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_500);
    doc.text(
      "I certify that all necessary approvals have been obtained and that funds are available and committed for this purchase.",
      m + 1.5,
      yF + aa_h + 2.5,
    );
    yF += aa_h + 3;

    // Row 3 — Second approval + Attached items
    const sa_w = fa_w;
    const att_w = ige_w;
    const sa_h = 14;

    doc.rect(m, yF, sa_w, sa_h, "S");
    doc.rect(m + sa_w, yF, att_w, sa_h, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("SECOND APPROVAL:", m + 1.5, yF + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    doc.text(s(pr.second_approval), m + 1.5, yF + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("SIGNATURE & DATE:", m + 1.5, yF + 11);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    if (pr.second_approval || pr.second_signature_date) {
      doc.text(
        `${s(pr.second_approval)}  ·  ${formatDate(pr.second_signature_date)}`.trim(),
        m + 35,
        yF + 11,
      );
    }

    // Attached items
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_500);
    doc.text("ATTACHED ITEM:", m + sa_w + sa_w / 2 - 12, yF + 3);

    const attaches: Array<{ label: string; checked: boolean }> = [
      { label: "SSJ", checked: pr.attached_ssj },
      { label: "BNJ", checked: pr.attached_bnj },
      { label: "PWS", checked: pr.attached_pws },
      { label: "ITPR", checked: pr.attached_itpr },
      { label: "Other", checked: !!pr.attached_other },
    ];
    let cx = m + sa_w + 2;
    attaches.forEach((a) => {
      doc.setDrawColor(...GRAY_500);
      doc.setLineWidth(0.3);
      doc.rect(cx, yF + 6, 3, 3, "S");
      if (a.checked) {
        doc.setLineWidth(0.5);
        doc.line(cx + 0.5, yF + 7.5, cx + 1.3, yF + 8.3);
        doc.line(cx + 1.3, yF + 8.3, cx + 2.7, yF + 6.3);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_700);
      doc.text(a.label, cx + 4, yF + 8.5);
      cx += 18;
    });

    // Section 889 in second row
    doc.setDrawColor(...GRAY_500);
    doc.setLineWidth(0.3);
    doc.rect(m + sa_w + 2, yF + 11, 3, 3, "S");
    if (pr.attached_section_889) {
      doc.setLineWidth(0.5);
      doc.line(m + sa_w + 2.5, yF + 12.5, m + sa_w + 3.3, yF + 13.3);
      doc.line(m + sa_w + 3.3, yF + 13.3, m + sa_w + 4.7, yF + 11.3);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_700);
    doc.text("Section 889", m + sa_w + 6, yF + 13.5);

    // Other text
    if (pr.attached_other) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_500);
      doc.text(`Other: ${pr.attached_other}`, m + sa_w + 30, yF + 13.5);
    }

    // FY2025 footer marker
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_500);
    doc.text("FY2025", m, ph - 4);
    doc.text(
      "Second approval, if required locally",
      m + 35,
      ph - 4,
    );

    step = "pdf-output";
    return doc.output("blob");
  } catch (err: any) {
    if (err instanceof PurchaseRequestReportError) throw err;
    throw new PurchaseRequestReportError(
      step,
      err?.message || "Failed to generate PDF",
    );
  }
}

export function purchaseRequestFilename(pr: PurchaseRequest): string {
  const d = pr.date_prepared.replace(/-/g, "");
  const vendor = (pr.vendor1_name || "vendor")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `PR-${d}-${vendor}.pdf`;
}
