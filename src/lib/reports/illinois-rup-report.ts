/**
 * Illinois Restricted Use Pesticide Records — client-side PDF generator.
 *
 * Ported from /api/reports/illinois-rup. Landscape PDF tabular export of
 * chemical_applications over a date range, mapped to Illinois RUP record
 * fields (415 ILCS 60 / 8 IAC 250). Highlights INCOMPLETE cells.
 */
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/rest";
import {
  mapToILRupRecord,
  validateILRupRecord,
} from "@/lib/compliance/illinois-rup";
import type {
  ChemicalApplication,
  ChemicalProduct,
  Profile,
} from "@/types/database";

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];
const WARN_BG: [number, number, number] = [255, 251, 235];
const WARN_TEXT: [number, number, number] = [161, 98, 7];

export interface IllinoisRupReportOptions {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export class IllinoisRupReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllinoisRupReportError";
  }
}

export async function generateIllinoisRupReport(
  options: IllinoisRupReportOptions,
): Promise<{ blob: Blob; filename: string }> {
  if (!options.since || !options.until ||
      !/^\d{4}-\d{2}-\d{2}$/.test(options.since) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(options.until)) {
    throw new IllinoisRupReportError(
      "Missing or invalid 'since' and 'until' date parameters (YYYY-MM-DD)",
    );
  }

  const supabase = createClient();

  // Cached user read avoids the supabase.auth.getUser() wedge.
  const user = getCachedUser();
  if (!user) throw new IllinoisRupReportError("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const { data: applicationsRaw, error: fetchErr } = await supabase
    .from("chemical_applications")
    .select(`
      *,
      product:chemical_products!product_id(*),
      applicator:profiles!applied_by(*)
    `)
    .gte("application_date", options.since)
    .lte("application_date", options.until)
    .order("application_date", { ascending: true });

  if (fetchErr) throw new IllinoisRupReportError(fetchErr.message);

  const applications = (applicationsRaw || []) as (ChemicalApplication & {
    product: ChemicalProduct | null;
    applicator: Profile | null;
  })[];

  const records = applications.map((app) => {
    const rec = mapToILRupRecord(app, app.product, app.applicator);
    return { record: rec, validation: validateILRupRecord(rec) };
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10;

  const sinceDisplay = new Date(options.since + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const untilDisplay = new Date(options.until + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ── HEADER ──
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 22, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 22, pw, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  doc.text("Restricted Use Pesticide Application Records", m, 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Veterans Memorial Golf Course, Naval Station Great Lakes, IL", m, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(`${sinceDisplay} to ${untilDisplay}`, pw - m, 10, { align: "right" });
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.text(`${records.length} application(s)`, pw - m, 17, { align: "right" });

  // ── TABLE ──
  const colDefs = [
    { header: "Date", width: 22 },
    { header: "Start", width: 14 },
    { header: "End", width: 14 },
    { header: "Applicator", width: 28 },
    { header: "Cert #", width: 20 },
    { header: "Location", width: 36 },
    { header: "Product", width: 30 },
    { header: "EPA Registration Number", width: 28 },
    { header: "Amount", width: 20 },
    { header: "Rate", width: 24 },
    { header: "Target Pest", width: 22 },
    { header: "Wind", width: 18 },
    { header: "Temp", width: 14 },
  ];

  let curY = 28;
  const rowH = 8;
  const headerH = 7;
  const preparedBy = (profile as { full_name?: string } | null)?.full_name || user.email || "Unknown";

  function drawTableHeader() {
    doc.setFillColor(...BRAND_DARK);
    let x = m;
    for (const col of colDefs) {
      doc.rect(x, curY, col.width, headerH, "F");
      x += col.width;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...WHITE);
    x = m;
    for (const col of colDefs) {
      doc.text(col.header, x + 1.5, curY + 4.5, { maxWidth: col.width - 3 });
      x += col.width;
    }
    curY += headerH;
  }

  function drawFooter() {
    const timestamp = new Date().toLocaleString("en-US");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_400);
    doc.text(
      `Generated ${timestamp} by ${preparedBy} — Records per 415 ILCS 60 / 8 IAC 250. Retain for 7 years.`,
      m,
      ph - 5,
    );
    doc.text("VMGC GreenKeeper Pro", pw - m, ph - 5, { align: "right" });
  }

  drawTableHeader();

  for (let i = 0; i < records.length; i++) {
    const { record, validation } = records[i];

    if (curY + rowH > ph - 14) {
      drawFooter();
      doc.addPage();
      curY = 10;
      drawTableHeader();
    }

    if (i % 2 === 0) doc.setFillColor(248, 250, 252);
    else doc.setFillColor(255, 255, 255);
    let x = m;
    for (const col of colDefs) {
      doc.rect(x, curY, col.width, rowH, "F");
      x += col.width;
    }

    doc.setDrawColor(229, 231, 235);
    x = m;
    for (const col of colDefs) {
      doc.rect(x, curY, col.width, rowH, "S");
      x += col.width;
    }

    const values = [
      record.applicationDate,
      record.startTime,
      record.endTime,
      record.applicatorName,
      record.certificationNumber,
      record.location,
      record.productName,
      record.epaRegNumber,
      record.totalAmount,
      record.applicationRate,
      record.targetPest,
      record.windSpeed,
      record.temperature,
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    x = m;

    for (let c = 0; c < values.length; c++) {
      const val = values[c];
      const col = colDefs[c];

      if (!val || String(val).trim() === "") {
        doc.setFillColor(...WARN_BG);
        doc.rect(x + 0.3, curY + 0.3, col.width - 0.6, rowH - 0.6, "F");
        doc.setTextColor(...WARN_TEXT);
        doc.setFont("helvetica", "italic");
        doc.text("\u26A0 INCOMPLETE", x + 1.5, curY + 5, { maxWidth: col.width - 3 });
        doc.setFont("helvetica", "normal");
      } else {
        doc.setTextColor(...GRAY_600);
        const lines = doc.splitTextToSize(String(val), col.width - 3);
        doc.text(lines.slice(0, 2), x + 1.5, curY + 4);
      }
      x += col.width;
    }

    if (!validation.valid) {
      doc.setFontSize(5);
      doc.setTextColor(...WARN_TEXT);
      const totalW = colDefs.reduce((s, c) => s + c.width, 0);
      doc.text(
        `${validation.completedFields}/${validation.totalFields}`,
        m + totalW + 1,
        curY + 5,
      );
    }

    curY += rowH;
  }

  if (records.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_400);
    doc.text("No chemical applications found in this date range.", m, curY + 10);
  }

  drawFooter();

  const blob = doc.output("blob") as Blob;
  const filename = `vmgc-rup-records-${options.since}-to-${options.until}.pdf`;
  return { blob, filename };
}

export async function downloadIllinoisRupReport(
  options: IllinoisRupReportOptions,
): Promise<void> {
  const { blob, filename } = await generateIllinoisRupReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
