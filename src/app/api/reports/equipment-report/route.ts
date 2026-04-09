import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const RED: [number, number, number] = [220, 38, 38];
const ORANGE: [number, number, number] = [234, 88, 12];
const WHITE: [number, number, number] = [255, 255, 255];

const conditionLabels: Record<string, string> = {
  good: "Good", fair: "Fair", needs_repair: "Needs Repair",
  beyond_repair: "Beyond Repair", unknown: "Unknown",
};
const conditionColors: Record<string, [number, number, number]> = {
  good: [22, 163, 74], fair: [202, 138, 4], needs_repair: [234, 88, 12],
  beyond_repair: [220, 38, 38], unknown: [107, 114, 128],
};
const statusLabels: Record<string, string> = {
  operational: "Operational", needs_service: "Needs Service",
  in_repair: "In Repair", out_of_service: "Out of Service", retired: "Retired",
};
const typeLabels: Record<string, string> = {
  mower_reel: "Reel Mower", mower_rotary: "Rotary Mower", mower_rough: "Rough Mower",
  aerator: "Aerator", sprayer: "Sprayer", topdresser: "Topdresser",
  utility_vehicle: "Utility Vehicle", tractor: "Tractor", blower: "Blower",
  trimmer: "Trimmer", chainsaw: "Chainsaw", roller: "Roller", seeder: "Seeder",
  hand_tool: "Hand Tool", pump: "Pump", other: "Other",
};
const fuelLabels: Record<string, string> = {
  gasoline: "Gasoline", diesel: "Diesel", electric: "Electric",
  hybrid: "Hybrid", manual: "Manual/None", other: "Other",
};

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const ct = res.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${base64}`;
  } catch { return null; }
}

function safe(val: unknown, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user profile
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("full_name, role").eq("id", user.id).single();

    const url = new URL(request.url);
    const singleId = url.searchParams.get("id");
    const filterCondition = url.searchParams.get("condition"); // e.g. "beyond_repair"

    // Fetch equipment
    let query = (supabase.from("equipment") as any)
      .select("*")
      .neq("status", "retired")
      .order("name", { ascending: true });

    if (singleId) {
      query = query.eq("id", singleId);
    }
    if (filterCondition) {
      query = query.eq("condition_status", filterCondition);
    }

    const { data: equipmentList, error } = await query;
    if (error) {
      console.error("Equipment query error:", error);
      return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
    }
    if (!equipmentList || equipmentList.length === 0) {
      return NextResponse.json({ error: "No equipment found" }, { status: 404 });
    }

    // Pre-fetch first photo for each equipment (limit to 10 concurrent)
    const photoMap = new Map<string, string | null>();
    const photoFetches = equipmentList.slice(0, 50).map(async (eq: any) => {
      const photoUrl = eq.photos?.[0] || eq.photo_url;
      if (photoUrl) {
        const data = await fetchImageAsBase64(photoUrl);
        photoMap.set(eq.id, data);
      }
    });
    await Promise.all(photoFetches);

    // ── Generate PDF ──
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 15;
    const cw = pw - m * 2;
    let y = m;

    const checkSpace = (needed: number) => {
      if (y + needed > ph - 20) { doc.addPage(); y = m; }
    };

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const isSingleReport = equipmentList.length === 1;
    const hasDRMOItems = equipmentList.some((eq: any) =>
      eq.condition_status === "beyond_repair" || eq.status === "out_of_service"
    );

    // ═══════════════════════════════════════════
    // HEADER BAR
    // ═══════════════════════════════════════════
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 34, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 34, pw, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...WHITE);
    doc.text(
      isSingleReport ? "Equipment Condition Report" : "Fleet Equipment Report",
      m, 16
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text(
      hasDRMOItems ? "Includes DRMO / Disposal Candidates" : "Condition & Inventory Summary",
      m, 24
    );

    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(dateStr, pw - m, 14, { align: "right" });
    if (profile?.full_name) {
      doc.text(`Prepared by: ${profile.full_name}`, pw - m, 20, { align: "right" });
    }
    doc.text(`${equipmentList.length} item${equipmentList.length > 1 ? "s" : ""}`, pw - m, 26, { align: "right" });

    y = 42;

    // ═══════════════════════════════════════════
    // SUMMARY STATS (fleet report only)
    // ═══════════════════════════════════════════
    if (!isSingleReport) {
      const stats = {
        good: equipmentList.filter((e: any) => e.condition_status === "good").length,
        fair: equipmentList.filter((e: any) => e.condition_status === "fair").length,
        needs_repair: equipmentList.filter((e: any) => e.condition_status === "needs_repair").length,
        beyond_repair: equipmentList.filter((e: any) => e.condition_status === "beyond_repair").length,
        parts_ordered: equipmentList.filter((e: any) => e.needs_parts_ordered).length,
      };

      doc.setFillColor(245, 247, 250);
      doc.roundedRect(m, y, cw, 22, 3, 3, "F");
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(m, y, cw, 22, 3, 3, "S");

      const colW = cw / 5;
      const statItems = [
        { label: "Good", val: stats.good, color: conditionColors.good },
        { label: "Fair", val: stats.fair, color: conditionColors.fair },
        { label: "Needs Repair", val: stats.needs_repair, color: conditionColors.needs_repair },
        { label: "Beyond Repair", val: stats.beyond_repair, color: conditionColors.beyond_repair },
        { label: "Parts Ordered", val: stats.parts_ordered, color: ORANGE },
      ];

      statItems.forEach((s, i) => {
        const cx = m + colW * i + colW / 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...s.color);
        doc.text(String(s.val), cx, y + 10, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        doc.text(s.label, cx, y + 17, { align: "center" });
      });

      y += 28;

      // ═══════════════════════════════════════════
      // MASTER TABLE — all equipment
      // ═══════════════════════════════════════════
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Equipment Inventory", m, y + 5);
      y += 9;

      const tableRows = equipmentList.map((eq: any) => [
        safe(eq.name),
        typeLabels[eq.equipment_type] || safe(eq.equipment_type),
        [eq.make, eq.model].filter(Boolean).join(" ") || "—",
        safe(eq.serial_number),
        safe(eq.asset_tag),
        conditionLabels[eq.condition_status] || safe(eq.condition_status),
        statusLabels[eq.status] || safe(eq.status),
        eq.parts_needed ? "Yes" : "—",
      ]);

      doc.autoTable({
        startY: y,
        head: [["Name", "Type", "Make/Model", "Serial #", "Tag", "Condition", "Status", "Parts?"]],
        body: tableRows,
        margin: { left: m, right: m },
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: BRAND_DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 22 },
          2: { cellWidth: 28 },
          3: { cellWidth: 22 },
          4: { cellWidth: 12 },
          5: { cellWidth: 22 },
          6: { cellWidth: 22 },
          7: { cellWidth: 14 },
        },
        didParseCell: (data: any) => {
          // Color condition column
          if (data.column.index === 5 && data.section === "body") {
            const val = data.cell.raw as string;
            if (val === "Beyond Repair") data.cell.styles.textColor = RED;
            else if (val === "Needs Repair") data.cell.styles.textColor = ORANGE;
            else if (val === "Good") data.cell.styles.textColor = conditionColors.good;
          }
        },
      });

      y = doc.lastAutoTable.finalY + 10;
    }

    // ═══════════════════════════════════════════
    // DETAILED SECTIONS — each equipment item
    // ═══════════════════════════════════════════
    for (let idx = 0; idx < equipmentList.length; idx++) {
      const eq = equipmentList[idx];
      const condition = eq.condition_status || "unknown";
      const condLabel = conditionLabels[condition] || condition;
      const condColor = conditionColors[condition] || GRAY_400;
      const eqStatus = statusLabels[eq.status] || eq.status || "Unknown";
      const isDRMO = condition === "beyond_repair" || eq.status === "out_of_service";
      const photo = photoMap.get(eq.id) || null;

      // Page break if near bottom
      checkSpace(80);

      // ── Equipment header bar ──
      const headerH = 14;
      doc.setFillColor(...(isDRMO ? RED : BRAND_GREEN));
      doc.roundedRect(m, y, cw, headerH, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...WHITE);
      doc.text(safe(eq.name, "Unnamed"), m + 4, y + 9);

      // Condition badge — right
      doc.setFontSize(8);
      const badgeText = isDRMO ? `DRMO — ${condLabel}` : condLabel;
      const bw = doc.getTextWidth(badgeText) + 8;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pw - m - bw - 3, y + 3, bw, 8, 2, 2, "F");
      doc.setTextColor(...condColor);
      doc.text(badgeText.toUpperCase(), pw - m - bw / 2 - 3, y + 8.5, { align: "center" });

      y += headerH + 3;

      // ── Photo + Details side by side ──
      const detailStartY = y;
      const photoWidth = photo ? 55 : 0;
      const detailX = m + (photo ? photoWidth + 5 : 0);
      const detailW = cw - (photo ? photoWidth + 5 : 0);

      if (photo) {
        try {
          const fmt = photo.includes("image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, fmt, m, y, photoWidth, 40);
        } catch {
          // skip photo
        }
      }

      // Detail text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);

      const lines = [
        `Type: ${typeLabels[eq.equipment_type] || safe(eq.equipment_type)}`,
        `Make/Model: ${[eq.make, eq.model].filter(Boolean).join(" ") || "—"}`,
        `Year: ${safe(eq.year)}  |  Serial: ${safe(eq.serial_number)}`,
        `Asset Tag: ${safe(eq.asset_tag)}  |  Fuel: ${fuelLabels[eq.fuel_type] || safe(eq.fuel_type)}`,
        `Hours: ${eq.current_hours != null ? eq.current_hours + " hrs" : "—"}  |  Location: ${safe(eq.location)}`,
        `Status: ${eqStatus}  |  Condition: ${condLabel}`,
      ];

      lines.forEach((line, i) => {
        doc.text(line, detailX, y + 5 + i * 4.5);
      });

      y = Math.max(y + lines.length * 4.5 + 5, detailStartY + (photo ? 42 : 0));

      // ── Condition notes ──
      if (eq.condition_notes) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const noteLines = doc.splitTextToSize(`Notes: ${eq.condition_notes}`, cw - 8);
        checkSpace(noteLines.length * 3.5 + 4);
        doc.text(noteLines, m + 4, y);
        y += noteLines.length * 3.5 + 2;
      }

      // ── Parts needed ──
      if (eq.needs_parts_ordered || eq.parts_needed) {
        checkSpace(14);
        doc.setFillColor(255, 247, 237);
        doc.roundedRect(m, y, cw, 12, 2, 2, "F");
        doc.setDrawColor(251, 191, 36);
        doc.roundedRect(m, y, cw, 12, 2, 2, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...ORANGE);
        doc.text("PARTS NEEDED:", m + 4, y + 5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GRAY_600);
        doc.text(safe(eq.parts_needed, "Unspecified"), m + 35, y + 5);
        if (eq.estimated_repair_cost != null) {
          doc.text(
            `Est. Cost: $${Number(eq.estimated_repair_cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
            m + 4, y + 10
          );
        }
        y += 14;
      }

      // ── DRMO box ──
      if (isDRMO) {
        checkSpace(12);
        doc.setFillColor(254, 242, 242);
        doc.roundedRect(m, y, cw, 10, 2, 2, "F");
        doc.setFillColor(...RED);
        doc.rect(m, y, 2.5, 10, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...RED);
        doc.text("RECOMMENDED FOR DRMO / DISPOSAL", m + 6, y + 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        const reason = condition === "beyond_repair"
          ? "Beyond economical repair."
          : "Currently out of service.";
        doc.text(reason, m + 6, y + 8);
        y += 12;
      }

      // ── General notes ──
      if (eq.notes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        const nl = doc.splitTextToSize(`Notes: ${eq.notes}`, cw - 8);
        const truncated = nl.slice(0, 3);
        checkSpace(truncated.length * 3 + 2);
        doc.text(truncated, m + 4, y + 3);
        y += truncated.length * 3 + 4;
      }

      // Separator
      y += 3;
      if (idx < equipmentList.length - 1) {
        doc.setDrawColor(229, 231, 235);
        doc.line(m, y, pw - m, y);
        y += 5;
      }
    }

    // ═══════════════════════════════════════════
    // SIGNATURE BLOCK
    // ═══════════════════════════════════════════
    checkSpace(30);
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(m, y, pw - m, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_600);
    doc.text("Superintendent Signature:", m, y);
    doc.line(m + 42, y + 1, m + 100, y + 1);
    doc.text("Date:", m + 105, y);
    doc.line(m + 115, y + 1, m + 150, y + 1);
    y += 12;
    doc.text("Director / Approver:", m, y);
    doc.line(m + 36, y + 1, m + 100, y + 1);
    doc.text("Date:", m + 105, y);
    doc.line(m + 115, y + 1, m + 150, y + 1);

    // ═══════════════════════════════════════════
    // FOOTER on all pages
    // ═══════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_400);
      doc.text(`Page ${i} of ${totalPages}`, pw / 2, ph - 8, { align: "center" });
      doc.text("VMGC GreenKeeper Pro — Equipment Report", m, ph - 8);
      doc.text(new Date().toLocaleDateString(), pw - m, ph - 8, { align: "right" });
    }

    // ═══════════════════════════════════════════
    // OUTPUT
    // ═══════════════════════════════════════════
    const pdfBuffer = doc.output("arraybuffer");
    const fileName = isSingleReport
      ? `${safe(equipmentList[0].name, "equipment").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase()}-report.pdf`
      : `vmgc-equipment-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Equipment report error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
