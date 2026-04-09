import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Brand Colors ──
const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const RED: [number, number, number] = [220, 38, 38];
const ORANGE: [number, number, number] = [234, 88, 12];
const WHITE: [number, number, number] = [255, 255, 255];

// ── Labels ──
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

function s(val: unknown, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
}

async function fetchPhoto(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const ct = res.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${b64}`;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  let step = "init";
  try {
    // ── AUTH ──
    step = "auth";
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "profile";
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("full_name, role").eq("id", user.id).single();

    // ── FETCH EQUIPMENT ──
    step = "fetch-equipment";
    const url = new URL(request.url);
    const singleId = url.searchParams.get("id");
    const filterCondition = url.searchParams.get("condition");

    let query = (supabase.from("equipment") as any)
      .select("*")
      .neq("status", "retired")
      .order("name", { ascending: true });
    if (singleId) query = query.eq("id", singleId);
    if (filterCondition) query = query.eq("condition_status", filterCondition);

    const { data: items, error: fetchErr } = await query;
    if (fetchErr) {
      return NextResponse.json({ error: "DB error", details: fetchErr.message }, { status: 500 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No equipment found" }, { status: 404 });
    }

    // ── FETCH PARTS & SERVICE RECORDS ──
    step = "fetch-parts-services";
    const equipmentIds = items.map((eq: any) => eq.id);

    const { data: allParts } = await (supabase.from("equipment_parts") as any)
      .select("*")
      .in("equipment_id", equipmentIds)
      .order("created_at", { ascending: false });

    const { data: allServiceRecords } = await (supabase.from("equipment_service_records") as any)
      .select("*")
      .in("equipment_id", equipmentIds)
      .order("service_date", { ascending: false });

    // Group by equipment_id
    const partsMap = new Map<string, any[]>();
    const serviceMap = new Map<string, any[]>();
    (allParts || []).forEach((p: any) => {
      if (!partsMap.has(p.equipment_id)) partsMap.set(p.equipment_id, []);
      partsMap.get(p.equipment_id)!.push(p);
    });
    (allServiceRecords || []).forEach((r: any) => {
      if (!serviceMap.has(r.equipment_id)) serviceMap.set(r.equipment_id, []);
      serviceMap.get(r.equipment_id)!.push(r);
    });

    // ── FETCH PHOTOS (parallel) ──
    step = "photos";
    const photoMap = new Map<string, string | null>();
    const fetches = items.map(async (eq: any) => {
      const photoUrl = (eq.photos && eq.photos.length > 0) ? eq.photos[0] : eq.photo_url;
      if (photoUrl) {
        const data = await fetchPhoto(photoUrl);
        photoMap.set(eq.id, data);
      }
    });
    await Promise.all(fetches);

    // ── BUILD PDF ──
    step = "pdf-init";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth(); // 297mm
    const ph = doc.internal.pageSize.getHeight(); // 210mm
    const m = 12; // margin

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    // ══════════════════════════════════════
    // PAGE 1: COVER / SUMMARY PAGE
    // ══════════════════════════════════════
    step = "pdf-cover";

    // Dark green header bar
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 50, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 50, pw, 2, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...WHITE);
    doc.text("Fleet Equipment Report", m + 5, 24);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Vehicle & Machinery Grounds Committee", m + 5, 35);

    // Right side info
    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.text(dateStr, pw - m - 5, 20, { align: "right" });
    if (profile?.full_name) {
      doc.text("Prepared by: " + profile.full_name, pw - m - 5, 30, { align: "right" });
    }
    doc.text(items.length + " Equipment Items", pw - m - 5, 40, { align: "right" });

    // Summary stats
    let y = 62;
    const good = items.filter((e: any) => e.condition_status === "good").length;
    const fair = items.filter((e: any) => e.condition_status === "fair").length;
    const repair = items.filter((e: any) => e.condition_status === "needs_repair").length;
    const beyond = items.filter((e: any) => e.condition_status === "beyond_repair").length;
    const partsCount = items.filter((e: any) => {
      const eqParts = partsMap.get(e.id) || [];
      return eqParts.some((p: any) => p.status === "needed" || p.status === "ordered") || e.needs_parts_ordered;
    }).length;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Fleet Condition Summary", m + 5, y);
    y += 8;

    // Stat boxes
    const statBoxW = (pw - m * 2 - 40) / 5;
    const stats = [
      { label: "Good", val: good, color: conditionColors.good },
      { label: "Fair", val: fair, color: conditionColors.fair },
      { label: "Needs Repair", val: repair, color: conditionColors.needs_repair },
      { label: "Beyond Repair", val: beyond, color: conditionColors.beyond_repair },
      { label: "Parts Needed", val: partsCount, color: ORANGE },
    ];

    stats.forEach((st, i) => {
      const x = m + 5 + i * (statBoxW + 8);
      // Box background
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, y, statBoxW, 28, 3, 3, "FD");
      // Color bar at top
      doc.setFillColor(...st.color);
      doc.rect(x, y, statBoxW, 3, "F");
      // Number
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(...st.color);
      doc.text(String(st.val), x + statBoxW / 2, y + 16, { align: "center" });
      // Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(st.label, x + statBoxW / 2, y + 23, { align: "center" });
    });
    y += 38;

    // Master inventory table
    step = "pdf-table";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Equipment Inventory", m + 5, y);
    y += 6;

    const rows = items.map((eq: any) => {
      const cond = eq.condition_status || "unknown";
      const isDRMO = cond === "beyond_repair" || eq.status === "out_of_service";
      const eqParts = partsMap.get(eq.id) || [];
      const neededParts = eqParts.filter((p: any) => p.status === "needed" || p.status === "ordered");
      const hasPartsNeeded = neededParts.length > 0 || eq.needs_parts_ordered;
      return [
        s(eq.name),
        typeLabels[eq.equipment_type] || s(eq.equipment_type),
        [eq.make, eq.model].filter(Boolean).join(" ") || "—",
        s(eq.serial_number),
        conditionLabels[cond] || cond,
        statusLabels[eq.status] || s(eq.status),
        hasPartsNeeded ? `${neededParts.length || "Yes"}` : "—",
        isDRMO ? "YES" : "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Name", "Type", "Make/Model", "Serial #", "Condition", "Status", "Parts?", "DRMO?"]],
      body: rows,
      margin: { left: m + 3, right: m + 3 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: BRAND_DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        6: { halign: "center" as const, cellWidth: 14 },
        7: { halign: "center" as const, cellWidth: 14 },
      },
    });

    // ══════════════════════════════════════
    // INDIVIDUAL EQUIPMENT PAGES (1 per page)
    // Like a PowerPoint slide: photo left, details right
    // ══════════════════════════════════════
    step = "pdf-details";

    for (let idx = 0; idx < items.length; idx++) {
      const eq = items[idx];
      const cond = eq.condition_status || "unknown";
      const condLabel = conditionLabels[cond] || cond;
      const condColor = conditionColors[cond] || GRAY_400;
      const eqStatus = statusLabels[eq.status] || eq.status || "Unknown";
      const isDRMO = cond === "beyond_repair" || eq.status === "out_of_service";
      const photo = photoMap.get(eq.id) || null;

      doc.addPage();

      // ── TOP HEADER BAR ──
      const headerColor = isDRMO ? RED : BRAND_DARK;
      doc.setFillColor(...headerColor);
      doc.rect(0, 0, pw, 22, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, 22, pw, 1.5, "F");

      // Equipment name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text(s(eq.name, "Unnamed Equipment"), m + 4, 14);

      // Condition badge on right
      const badgeText = isDRMO ? "DRMO — " + condLabel : condLabel;
      doc.setFontSize(10);
      const badgeW = doc.getTextWidth(badgeText) + 12;
      doc.setFillColor(...WHITE);
      doc.roundedRect(pw - m - badgeW - 2, 6, badgeW, 10, 3, 3, "F");
      doc.setTextColor(...condColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(badgeText.toUpperCase(), pw - m - badgeW / 2 - 2, 13, { align: "center" });

      // Page item number
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 200, 200);
      doc.text(`${idx + 1} of ${items.length}`, pw - m - 4, 20, { align: "right" });

      // ── LAYOUT: LEFT = PHOTO, RIGHT = DETAILS ──
      const contentTop = 30;
      const halfW = (pw - m * 2 - 10) / 2;
      const leftX = m;
      const rightX = m + halfW + 10;

      // ── LEFT SIDE: PHOTO ──
      if (photo) {
        try {
          const fmt = photo.includes("image/png") ? "PNG" : "JPEG";
          const maxPhotoW = halfW;
          const maxPhotoH = 110;
          // Maintain aspect ratio — use contain-style fit
          doc.addImage(photo, fmt, leftX, contentTop, maxPhotoW, maxPhotoH);
        } catch { /* skip */ }
      } else {
        // No photo placeholder
        doc.setFillColor(243, 244, 246);
        doc.setDrawColor(209, 213, 219);
        doc.roundedRect(leftX, contentTop, halfW, 110, 4, 4, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...GRAY_400);
        doc.text("No Photo Available", leftX + halfW / 2, contentTop + 55, { align: "center" });
      }

      // ── RIGHT SIDE: DETAILS ──
      let ry = contentTop;

      // Type badge
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(typeLabels[eq.equipment_type] || s(eq.equipment_type), rightX, ry + 5);
      ry += 10;

      // Detail rows helper
      const detailRow = (label: string, value: string) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY_600);
        doc.text(label, rightX, ry);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        doc.text(value, rightX + 38, ry);
        ry += 6;
      };

      detailRow("Make:", s(eq.make));
      detailRow("Model:", s(eq.model));
      detailRow("Year:", s(eq.year));
      detailRow("Serial #:", s(eq.serial_number));
      detailRow("Asset Tag:", s(eq.asset_tag));
      detailRow("Fuel Type:", fuelLabels[eq.fuel_type] || s(eq.fuel_type));
      detailRow("Hours:", eq.current_hours != null ? eq.current_hours + " hrs" : "—");
      detailRow("Location:", s(eq.location));
      ry += 2;

      // Status row with colored text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      doc.text("Condition:", rightX, ry);
      doc.setTextColor(...condColor);
      doc.text(condLabel, rightX + 38, ry);
      ry += 6;

      doc.setTextColor(...GRAY_600);
      doc.text("Status:", rightX, ry);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(eqStatus, rightX + 38, ry);
      ry += 8;

      // Condition notes
      if (eq.condition_notes) {
        doc.setDrawColor(229, 231, 235);
        doc.line(rightX, ry - 2, rightX + halfW - 5, ry - 2);
        ry += 2;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const noteLines = doc.splitTextToSize(eq.condition_notes, halfW - 10);
        doc.text(noteLines.slice(0, 4), rightX, ry);
        ry += Math.min(noteLines.length, 4) * 4 + 4;
      }

      // ── BOTTOM SECTIONS (full width) ──
      let by = Math.max(contentTop + 118, ry + 5);

      // ── PARTS NEEDED TABLE ──
      const eqParts = partsMap.get(eq.id) || [];
      const neededParts = eqParts.filter((p: any) => p.status === "needed" || p.status === "ordered");
      if (neededParts.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...ORANGE);
        doc.text("PARTS NEEDED", m + 4, by + 4);
        by += 6;

        const partStatusLabel: Record<string, string> = { needed: "Needed", ordered: "Ordered", received: "Received" };
        const partRows = neededParts.map((p: any) => [
          s(p.name),
          s(p.part_number),
          s(p.description),
          String(p.quantity || 1),
          partStatusLabel[p.status] || p.status,
          p.estimated_cost != null ? "$" + Number(p.estimated_cost).toFixed(2) : "—",
        ]);

        autoTable(doc, {
          startY: by,
          head: [["Part Name", "Part #", "Description", "Qty", "Status", "Est. Cost"]],
          body: partRows,
          margin: { left: m + 2, right: m + 2 },
          styles: { fontSize: 7, cellPadding: 1.2 },
          headStyles: { fillColor: ORANGE, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [255, 251, 235] },
          columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: 30 },
            2: { cellWidth: 80 },
            3: { cellWidth: 12, halign: "center" as const },
            4: { cellWidth: 22, halign: "center" as const },
            5: { cellWidth: 22, halign: "right" as const },
          },
        });
        by = (doc as any).lastAutoTable.finalY + 4;
      } else if (eq.needs_parts_ordered || eq.parts_needed) {
        // Legacy fallback for old data
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(251, 191, 36);
        doc.roundedRect(m, by, pw - m * 2, 14, 3, 3, "FD");
        doc.setFillColor(...ORANGE);
        doc.rect(m, by, 3, 14, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...ORANGE);
        doc.text("PARTS NEEDED", m + 8, by + 6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(s(eq.parts_needed, "Parts needed — see details"), m + 8, by + 11);
        by += 18;
      }

      // ── SERVICE HISTORY TABLE ──
      const eqServices = serviceMap.get(eq.id) || [];
      if (eqServices.length > 0) {
        // Check if we need a new page for service history
        if (by > ph - 55) {
          doc.addPage();
          // Mini header for continuation
          doc.setFillColor(...BRAND_DARK);
          doc.rect(0, 0, pw, 14, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...WHITE);
          doc.text(s(eq.name) + " — Service History (continued)", m + 4, 9);
          by = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...BRAND_GREEN);
        doc.text("SERVICE HISTORY", m + 4, by + 4);
        by += 6;

        const svcRows = eqServices.slice(0, 10).map((r: any) => [
          r.service_date ? new Date(r.service_date).toLocaleDateString("en-US") : "—",
          s(r.performed_by),
          s(r.description),
          s(r.parts_used),
          r.hours_at_service != null ? String(r.hours_at_service) : "—",
          r.cost != null ? "$" + Number(r.cost).toFixed(2) : "—",
        ]);

        autoTable(doc, {
          startY: by,
          head: [["Date", "Performed By", "Description", "Parts Used", "Hours", "Cost"]],
          body: svcRows,
          margin: { left: m + 2, right: m + 2 },
          styles: { fontSize: 7, cellPadding: 1.2 },
          headStyles: { fillColor: BRAND_GREEN, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [240, 253, 244] },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30 },
            2: { cellWidth: 80 },
            3: { cellWidth: 50 },
            4: { cellWidth: 16, halign: "center" as const },
            5: { cellWidth: 22, halign: "right" as const },
          },
        });
        by = (doc as any).lastAutoTable.finalY + 4;
      }

      // DRMO / Disposal recommendation
      if (isDRMO) {
        // Check if we need a new page
        if (by > ph - 30) {
          doc.addPage();
          by = 15;
        }
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.roundedRect(m, by, pw - m * 2, 18, 3, 3, "FD");
        doc.setFillColor(...RED);
        doc.rect(m, by, 3, 18, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...RED);
        doc.text("RECOMMENDED FOR DRMO / DISPOSAL", m + 8, by + 8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY_600);
        const reason = cond === "beyond_repair"
          ? "This equipment is beyond economical repair and should be submitted for DRMO processing."
          : "This equipment is currently out of service and may be a candidate for disposal.";
        doc.text(reason, m + 8, by + 14);
        by += 22;
      }

      // Notes
      if (eq.notes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const noteLines = doc.splitTextToSize("Notes: " + eq.notes, pw - m * 2 - 10);
        doc.text(noteLines.slice(0, 3), m + 4, by + 4);
        by += Math.min(noteLines.length, 3) * 3.5 + 6;
      }
    }

    // ══════════════════════════════════════
    // SIGNATURE PAGE (last page)
    // ══════════════════════════════════════
    step = "pdf-signatures";
    doc.addPage();

    // Header
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 22, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 22, pw, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text("Signatures & Approval", m + 4, 14);

    y = 35;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_600);
    doc.text(
      "I certify that the equipment conditions documented in this report are accurate to the best of my knowledge.",
      m + 4, y
    );
    y += 15;

    // Signature lines
    const sigLine = (label: string, yPos: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_600);
      doc.text(label, m + 4, yPos);
      doc.setDrawColor(180, 180, 180);
      doc.line(m + 50, yPos + 1, m + 140, yPos + 1);
      doc.text("Date:", m + 150, yPos);
      doc.line(m + 165, yPos + 1, m + 220, yPos + 1);
    };

    sigLine("Superintendent:", y);
    y += 20;
    sigLine("Director / Approver:", y);
    y += 20;
    sigLine("Additional Approval:", y);

    // Summary reminder at bottom
    y += 30;
    doc.setDrawColor(229, 231, 235);
    doc.line(m, y, pw - m, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Report Summary", m + 4, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_600);
    doc.text(`Total Equipment: ${items.length}  |  Good: ${good}  |  Fair: ${fair}  |  Needs Repair: ${repair}  |  Beyond Repair: ${beyond}  |  Parts Needed: ${partsCount}`, m + 4, y);

    // ── FOOTER ON ALL PAGES ──
    step = "pdf-footer";
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_400);
      doc.text("Page " + i + " of " + totalPages, pw / 2, ph - 6, { align: "center" });
      doc.text("VMGC GreenKeeper Pro", m, ph - 6);
      doc.text(new Date().toLocaleDateString(), pw - m, ph - 6, { align: "right" });
    }

    // ── OUTPUT ──
    step = "pdf-output";
    const buf = doc.output("arraybuffer");
    const fname = items.length === 1
      ? s(items[0].name, "equipment").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-").toLowerCase() + "-report.pdf"
      : "vmgc-equipment-report-" + new Date().toISOString().slice(0, 10) + ".pdf";

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="' + fname + '"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Equipment report error at step [" + step + "]:", msg, err);
    return NextResponse.json({ error: "Failed at: " + step, details: msg }, { status: 500 });
  }
}
