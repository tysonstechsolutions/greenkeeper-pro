import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import {
  mapToILRupRecord,
  validateILRupRecord,
} from "@/lib/compliance/illinois-rup";
import type {
  ChemicalApplication,
  ChemicalProduct,
  Profile,
} from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Brand Colors ──
const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];
const WARN_BG: [number, number, number] = [255, 251, 235];
const WARN_TEXT: [number, number, number] = [161, 98, 7];

const ALLOWED_ROLES = ["super", "asst_super", "director"];

export async function GET(request: NextRequest) {
  let step = "init";
  try {
    // ── AUTH ──
    step = "auth";
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── PARSE DATES ──
    step = "parse-dates";
    const url = new URL(request.url);
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");

    if (!since || !until || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      return NextResponse.json(
        { error: "Missing or invalid 'since' and 'until' date parameters (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // ── FETCH APPLICATIONS ──
    step = "fetch-applications";
    const { data: applicationsRaw, error: fetchErr } = await supabase
      .from("chemical_applications")
      .select(`
        *,
        product:chemical_products!product_id(*),
        applicator:profiles!applied_by(*)
      `)
      .gte("application_date", since)
      .lte("application_date", until)
      .order("application_date", { ascending: true });

    if (fetchErr) {
      return NextResponse.json(
        { error: "DB error", details: fetchErr.message },
        { status: 500 }
      );
    }

    const applications = (applicationsRaw || []) as (ChemicalApplication & {
      product: ChemicalProduct | null;
      applicator: Profile | null;
    })[];

    // ── MAP TO IL RUP RECORDS ──
    step = "map-records";
    const records = applications.map((app) => ({
      record: mapToILRupRecord(app, app.product, app.applicator),
      validation: validateILRupRecord(
        mapToILRupRecord(app, app.product, app.applicator)
      ),
    }));

    // ── BUILD PDF ──
    step = "pdf-init";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth(); // 297mm
    const ph = doc.internal.pageSize.getHeight(); // 210mm
    const m = 10;

    const sinceDisplay = new Date(since + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const untilDisplay = new Date(until + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ── HEADER ──
    step = "pdf-header";
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
    step = "pdf-table";
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

    drawTableHeader();

    for (let i = 0; i < records.length; i++) {
      const { record, validation } = records[i];

      // Check if we need a new page
      if (curY + rowH > ph - 14) {
        // Footer on current page
        drawFooter(doc, pw, ph, m, profile.full_name || user.email || "Unknown");
        doc.addPage();
        curY = 10;
        drawTableHeader();
      }

      // Alternating row background
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      let x = m;
      for (const col of colDefs) {
        doc.rect(x, curY, col.width, rowH, "F");
        x += col.width;
      }

      // Draw cell borders
      doc.setDrawColor(229, 231, 235);
      x = m;
      for (const col of colDefs) {
        doc.rect(x, curY, col.width, rowH, "S");
        x += col.width;
      }

      // Fill cells
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
          // Highlight missing fields
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

      // Completeness indicator at far right
      if (!validation.valid) {
        doc.setFontSize(5);
        doc.setTextColor(...WARN_TEXT);
        const totalW = colDefs.reduce((s, c) => s + c.width, 0);
        doc.text(
          `${validation.completedFields}/${validation.totalFields}`,
          m + totalW + 1,
          curY + 5
        );
      }

      curY += rowH;
    }

    // If no records
    if (records.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_400);
      doc.text("No chemical applications found in this date range.", m, curY + 10);
    }

    // ── FOOTER ──
    step = "pdf-footer";
    drawFooter(doc, pw, ph, m, profile.full_name || user.email || "Unknown");

    // ── OUTPUT ──
    step = "pdf-output";
    const buf = doc.output("arraybuffer");
    const fname = `vmgc-rup-records-${since}-to-${until}.pdf`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("IL RUP report error at step [" + step + "]:", msg, err);
    return NextResponse.json(
      { error: "Failed at: " + step, details: msg },
      { status: 500 }
    );
  }
}

function drawFooter(
  doc: jsPDF,
  pw: number,
  ph: number,
  m: number,
  preparedBy: string
) {
  const timestamp = new Date().toLocaleString("en-US");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...GRAY_400);
  doc.text(
    `Generated ${timestamp} by ${preparedBy} \u2014 Records per 415 ILCS 60 / 8 IAC 250. Retain for 7 years.`,
    m,
    ph - 5
  );
  doc.text("VMGC GreenKeeper Pro", pw - m, ph - 5, { align: "right" });
}
