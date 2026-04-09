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

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  // Step-by-step with try/catch per section for debugging
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

    // ── FETCH PHOTOS (parallel, max 30) ──
    step = "photos";
    const photoMap = new Map<string, string | null>();
    const fetches = items.slice(0, 30).map(async (eq: any) => {
      const photoUrl = (eq.photos && eq.photos.length > 0) ? eq.photos[0] : eq.photo_url;
      if (photoUrl) {
        const data = await fetchPhoto(photoUrl);
        photoMap.set(eq.id, data);
      }
    });
    await Promise.all(fetches);

    // ── BUILD PDF ──
    step = "pdf-init";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 15;
    const cw = pw - m * 2;
    let y = m;

    const needPage = (h: number) => { if (y + h > ph - 20) { doc.addPage(); y = m; } };
    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    // ═══ HEADER ═══
    step = "pdf-header";
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 34, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 34, pw, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...WHITE);
    doc.text(items.length === 1 ? "Equipment Condition Report" : "Fleet Equipment Report", m, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Condition & Inventory Summary", m, 24);

    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(dateStr, pw - m, 14, { align: "right" });
    if (profile?.full_name) doc.text("Prepared by: " + profile.full_name, pw - m, 20, { align: "right" });
    doc.text(items.length + " item" + (items.length > 1 ? "s" : ""), pw - m, 26, { align: "right" });
    y = 42;

    // ═══ SUMMARY STATS ═══
    if (items.length > 1) {
      step = "pdf-stats";
      const good = items.filter((e: any) => e.condition_status === "good").length;
      const fair = items.filter((e: any) => e.condition_status === "fair").length;
      const repair = items.filter((e: any) => e.condition_status === "needs_repair").length;
      const beyond = items.filter((e: any) => e.condition_status === "beyond_repair").length;
      const parts = items.filter((e: any) => e.needs_parts_ordered).length;

      doc.setFillColor(245, 247, 250);
      doc.roundedRect(m, y, cw, 22, 3, 3, "F");
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(m, y, cw, 22, 3, 3, "S");

      const colW = cw / 5;
      const statData = [
        { label: "Good", val: good, color: conditionColors.good },
        { label: "Fair", val: fair, color: conditionColors.fair },
        { label: "Needs Repair", val: repair, color: conditionColors.needs_repair },
        { label: "Beyond Repair", val: beyond, color: conditionColors.beyond_repair },
        { label: "Parts Ordered", val: parts, color: ORANGE },
      ];
      statData.forEach((st, i) => {
        const cx = m + colW * i + colW / 2;
        doc.setFont("helvetica", "bold"); doc.setFontSize(16);
        doc.setTextColor(...st.color);
        doc.text(String(st.val), cx, y + 10, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        doc.text(st.label, cx, y + 17, { align: "center" });
      });
      y += 28;

      // ═══ MASTER TABLE ═══
      step = "pdf-table";
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Equipment Inventory", m, y + 5);
      y += 9;

      const rows = items.map((eq: any) => [
        s(eq.name),
        typeLabels[eq.equipment_type] || s(eq.equipment_type),
        [eq.make, eq.model].filter(Boolean).join(" ") || "—",
        s(eq.serial_number),
        s(eq.asset_tag),
        conditionLabels[eq.condition_status] || s(eq.condition_status),
        statusLabels[eq.status] || s(eq.status),
        eq.parts_needed ? "Yes" : "—",
      ]);

      doc.autoTable({
        startY: y,
        head: [["Name", "Type", "Make/Model", "Serial #", "Tag", "Condition", "Status", "Parts?"]],
        body: rows,
        margin: { left: m, right: m },
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: BRAND_DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ═══ DETAIL SECTIONS ═══
    step = "pdf-details";
    for (let idx = 0; idx < items.length; idx++) {
      const eq = items[idx];
      const cond = eq.condition_status || "unknown";
      const condLabel = conditionLabels[cond] || cond;
      const condColor = conditionColors[cond] || GRAY_400;
      const eqStatus = statusLabels[eq.status] || eq.status || "Unknown";
      const isDRMO = cond === "beyond_repair" || eq.status === "out_of_service";
      const photo = photoMap.get(eq.id) || null;

      needPage(75);

      // Header bar
      doc.setFillColor(...(isDRMO ? RED : BRAND_GREEN));
      doc.roundedRect(m, y, cw, 14, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.setTextColor(...WHITE);
      doc.text(s(eq.name, "Unnamed"), m + 4, y + 9);

      // Condition badge
      doc.setFontSize(8);
      const badgeTxt = isDRMO ? "DRMO - " + condLabel : condLabel;
      const bw = doc.getTextWidth(badgeTxt) + 8;
      doc.setFillColor(...WHITE);
      doc.roundedRect(pw - m - bw - 3, y + 3, bw, 8, 2, 2, "F");
      doc.setTextColor(...condColor);
      doc.text(badgeTxt.toUpperCase(), pw - m - bw / 2 - 3, y + 8.5, { align: "center" });
      y += 17;

      // Photo + details
      const detailStartY = y;
      const photoW = photo ? 55 : 0;
      const detailX = m + (photo ? photoW + 5 : 0);

      if (photo) {
        try {
          const fmt = photo.includes("image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, fmt, m, y, photoW, 40);
        } catch { /* skip photo */ }
      }

      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      const lines = [
        "Type: " + (typeLabels[eq.equipment_type] || s(eq.equipment_type)),
        "Make/Model: " + ([eq.make, eq.model].filter(Boolean).join(" ") || "—"),
        "Year: " + s(eq.year) + "  |  Serial: " + s(eq.serial_number),
        "Asset Tag: " + s(eq.asset_tag) + "  |  Fuel: " + (fuelLabels[eq.fuel_type] || s(eq.fuel_type)),
        "Hours: " + (eq.current_hours != null ? eq.current_hours + " hrs" : "—") + "  |  Location: " + s(eq.location),
        "Status: " + eqStatus + "  |  Condition: " + condLabel,
      ];
      lines.forEach((line, i) => { doc.text(line, detailX, y + 5 + i * 4.5); });
      y = Math.max(y + lines.length * 4.5 + 5, detailStartY + (photo ? 42 : 0));

      // Condition notes
      if (eq.condition_notes) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const nl = doc.splitTextToSize("Notes: " + eq.condition_notes, cw - 8);
        needPage(nl.length * 3.5 + 4);
        doc.text(nl, m + 4, y);
        y += nl.length * 3.5 + 2;
      }

      // Parts needed
      if (eq.needs_parts_ordered || eq.parts_needed) {
        needPage(14);
        doc.setFillColor(255, 247, 237);
        doc.roundedRect(m, y, cw, 12, 2, 2, "F");
        doc.setDrawColor(251, 191, 36);
        doc.roundedRect(m, y, cw, 12, 2, 2, "S");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        doc.setTextColor(...ORANGE);
        doc.text("PARTS NEEDED:", m + 4, y + 5);
        doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY_600);
        doc.text(s(eq.parts_needed, "Unspecified"), m + 35, y + 5);
        if (eq.estimated_repair_cost != null) {
          doc.text("Est. Cost: $" + Number(eq.estimated_repair_cost).toLocaleString("en-US", { minimumFractionDigits: 2 }), m + 4, y + 10);
        }
        y += 14;
      }

      // DRMO box
      if (isDRMO) {
        needPage(12);
        doc.setFillColor(254, 242, 242);
        doc.roundedRect(m, y, cw, 10, 2, 2, "F");
        doc.setFillColor(...RED);
        doc.rect(m, y, 2.5, 10, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        doc.setTextColor(...RED);
        doc.text("RECOMMENDED FOR DRMO / DISPOSAL", m + 6, y + 4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        doc.text(cond === "beyond_repair" ? "Beyond economical repair." : "Currently out of service.", m + 6, y + 8);
        y += 12;
      }

      // Notes (truncated)
      if (eq.notes) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        const nl = doc.splitTextToSize("Notes: " + eq.notes, cw - 8);
        const trunc = nl.slice(0, 3);
        needPage(trunc.length * 3 + 2);
        doc.text(trunc, m + 4, y + 3);
        y += trunc.length * 3 + 4;
      }

      // Separator
      y += 3;
      if (idx < items.length - 1) {
        doc.setDrawColor(229, 231, 235);
        doc.line(m, y, pw - m, y);
        y += 5;
      }
    }

    // ═══ SIGNATURE BLOCK ═══
    step = "pdf-signatures";
    needPage(30);
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(m, y, pw - m, y);
    y += 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
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

    // ═══ FOOTER ═══
    step = "pdf-footer";
    const tp = doc.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(...GRAY_400);
      doc.text("Page " + i + " of " + tp, pw / 2, ph - 8, { align: "center" });
      doc.text("VMGC GreenKeeper Pro", m, ph - 8);
      doc.text(new Date().toLocaleDateString(), pw - m, ph - 8, { align: "right" });
    }

    // ═══ OUTPUT ═══
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
