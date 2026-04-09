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
const ORANGE: [number, number, number] = [234, 88, 12];
const WHITE: [number, number, number] = [255, 255, 255];

// ── Category Colors ──
const categoryColors: Record<string, [number, number, number]> = {
  clubhouse: [37, 99, 235],
  cart_paths: [124, 58, 237],
  turf_course: [22, 163, 74],
  general: [107, 114, 128],
};

// ── Labels ──
const categoryLabels: Record<string, string> = {
  clubhouse: "Clubhouse",
  cart_paths: "Cart Paths",
  turf_course: "Turf Course",
  general: "General",
};

const priorityLabels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  ordered: "Ordered",
  received: "Received",
  in_stock: "In Stock",
  needed: "Needed",
};

function s(val: unknown, fallback = "—"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
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

    // ── FETCH ORDER ITEMS ──
    step = "fetch-order-items";
    const { data: orderItems, error: orderErr } = await (supabase.from("order_items") as any)
      .select("*")
      .order("category", { ascending: true })
      .order("priority", { ascending: true });

    if (orderErr) {
      return NextResponse.json({ error: "DB error", details: orderErr.message }, { status: 500 });
    }

    // ── FETCH EQUIPMENT PARTS (needed/ordered) ──
    step = "fetch-parts";
    const { data: equipmentParts, error: partsErr } = await (supabase.from("equipment_parts") as any)
      .select("*")
      .in("status", ["needed", "ordered"])
      .order("equipment_id", { ascending: true });

    if (partsErr) {
      return NextResponse.json({ error: "DB error", details: partsErr.message }, { status: 500 });
    }

    // ── FETCH EQUIPMENT NAMES FOR PARTS ──
    step = "fetch-equipment";
    const equipmentIds = (equipmentParts || []).map((p: any) => p.equipment_id);
    let equipmentMap = new Map<string, string>();

    if (equipmentIds.length > 0) {
      const { data: equipment } = await (supabase.from("equipment") as any)
        .select("id, name")
        .in("id", equipmentIds);

      (equipment || []).forEach((eq: any) => {
        equipmentMap.set(eq.id, eq.name);
      });
    }

    // ── VALIDATE DATA ──
    const items = orderItems || [];
    const parts = equipmentParts || [];

    if (items.length === 0 && parts.length === 0) {
      return NextResponse.json({ error: "No order items or equipment parts found" }, { status: 404 });
    }

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
    doc.text("VMGC GreenKeeper Pro", m + 5, 24);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Order List Report", m + 5, 35);

    // Right side info
    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.text(dateStr, pw - m - 5, 20, { align: "right" });
    if (profile?.full_name) {
      doc.text("Prepared by: " + profile.full_name, pw - m - 5, 30, { align: "right" });
    }
    doc.text(items.length + " Items", pw - m - 5, 40, { align: "right" });

    // Summary stats
    let y = 62;
    const totalItemsNeeded = items.length + parts.length;
    const totalCost = items.reduce((sum: number, item: any) => {
      const cost = Number(item.estimated_cost) || 0;
      return sum + cost;
    }, 0) + parts.reduce((sum: number, part: any) => {
      const cost = Number(part.estimated_cost) || 0;
      return sum + cost;
    }, 0);

    // Count by category for items
    const categoryBreakdown: Record<string, number> = {};
    items.forEach((item: any) => {
      const cat = item.category || "general";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Order Summary", m + 5, y);
    y += 8;

    // Stat boxes
    const statBoxW = (pw - m * 2 - 40) / 3;
    const stats = [
      { label: "Total Items", val: totalItemsNeeded, color: BRAND_GREEN },
      { label: "Est. Total Cost", val: "$" + totalCost.toFixed(2), color: BRAND_GOLD },
      { label: "Categories", val: Object.keys(categoryBreakdown).length + " types", color: ORANGE },
    ];

    stats.forEach((st, i) => {
      const x = m + 5 + i * (statBoxW + 8);
      // Box background
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, y, statBoxW, 28, 3, 3, "FD");
      // Color bar at top
      doc.setFillColor(...(st.color as [number, number, number]));
      doc.rect(x, y, statBoxW, 3, "F");
      // Number/Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...(st.color as [number, number, number]));
      doc.text(String(st.val), x + statBoxW / 2, y + 16, { align: "center" });
      // Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(st.label, x + statBoxW / 2, y + 23, { align: "center" });
    });
    y += 38;

    // Category breakdown
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Category Breakdown:", m + 5, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const categoryList = Object.entries(categoryBreakdown)
      .map(([cat, count]) => categoryLabels[cat] + ": " + count)
      .join("  |  ");
    doc.setTextColor(...GRAY_600);
    doc.text(categoryList, m + 5, y);
    y += 10;

    // ══════════════════════════════════════
    // PAGE 2: MASTER TABLE
    // ══════════════════════════════════════
    step = "pdf-table";
    doc.addPage();

    // Header
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 18, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 18, pw, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text("Master Order List", m + 4, 12);

    y = 25;

    // Order items table
    if (items.length > 0) {
      const rows = items.map((item: any) => [
        s(item.item_name),
        categoryLabels[item.category] || s(item.category),
        String(item.quantity || 1),
        "$" + Number(item.estimated_cost || 0).toFixed(2),
        priorityLabels[item.priority] || s(item.priority),
        statusLabels[item.status] || s(item.status),
        s(item.vendor),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Item", "Category", "Qty", "Est Cost", "Priority", "Status", "Vendor"]],
        body: rows,
        margin: { left: m + 2, right: m + 2 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: BRAND_GREEN, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 60 },
          1: { cellWidth: 35 },
          2: { halign: "center" as const, cellWidth: 15 },
          3: { halign: "right" as const, cellWidth: 25 },
          4: { halign: "center" as const, cellWidth: 22 },
          5: { halign: "center" as const, cellWidth: 25 },
          6: { cellWidth: 35 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Equipment parts section
    if (parts.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ORANGE);
      doc.text("Equipment Parts Needed/Ordered", m + 2, y);
      y += 5;

      const partRows = parts.map((part: any) => [
        s(part.name),
        equipmentMap.get(part.equipment_id) || "—",
        s(part.part_number),
        String(part.quantity || 1),
        "$" + Number(part.estimated_cost || 0).toFixed(2),
        statusLabels[part.status] || s(part.status),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Part Name", "Equipment", "Part #", "Qty", "Est Cost", "Status"]],
        body: partRows,
        margin: { left: m + 2, right: m + 2 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: ORANGE, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 60 },
          1: { cellWidth: 50 },
          2: { cellWidth: 30 },
          3: { halign: "center" as const, cellWidth: 15 },
          4: { halign: "right" as const, cellWidth: 25 },
          5: { halign: "center" as const, cellWidth: 25 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
    }

    // ══════════════════════════════════════
    // CATEGORY SECTIONS (pages 3+)
    // ══════════════════════════════════════
    step = "pdf-categories";

    const categories: string[] = [...new Set(items.map((i: any) => i.category || "general") as string[])].sort();

    for (const category of categories) {
      const catItems = items.filter((i: any) => (i.category || "general") === category);
      if (catItems.length === 0) continue;

      doc.addPage();

      // Header with category color
      const catColor = categoryColors[category] || [107, 114, 128];
      doc.setFillColor(...(catColor as [number, number, number]));
      doc.rect(0, 0, pw, 20, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, 20, pw, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...WHITE);
      doc.text(categoryLabels[category] || category, m + 4, 13);

      y = 30;

      // Category table
      const catRows = catItems.map((item: any) => [
        s(item.item_name),
        String(item.quantity || 1),
        "$" + Number(item.estimated_cost || 0).toFixed(2),
        priorityLabels[item.priority] || s(item.priority),
        statusLabels[item.status] || s(item.status),
        s(item.vendor),
        s(item.notes),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Item Name", "Qty", "Est Cost", "Priority", "Status", "Vendor", "Notes"]],
        body: catRows,
        margin: { left: m + 2, right: m + 2 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: {
          fillColor: catColor as [number, number, number],
          textColor: WHITE,
          fontStyle: "bold",
          fontSize: 7
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 80 },
          1: { halign: "center" as const, cellWidth: 15 },
          2: { halign: "right" as const, cellWidth: 25 },
          3: { halign: "center" as const, cellWidth: 22 },
          4: { halign: "center" as const, cellWidth: 25 },
          5: { cellWidth: 40 },
          6: { cellWidth: 50 },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // Subtotal
      const subtotal = catItems.reduce((sum: number, item: any) => {
        return sum + (Number(item.estimated_cost) || 0);
      }, 0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...(catColor as [number, number, number]));
      doc.text(
        categoryLabels[category] + " Subtotal: $" + subtotal.toFixed(2),
        pw - m - 80,
        y,
        { align: "right" }
      );
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

    y = 40;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_600);
    doc.text(
      "I certify that this order list is accurate and complete to the best of my knowledge.",
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
    doc.text(
      `Total Items: ${totalItemsNeeded}  |  Total Est. Cost: $${totalCost.toFixed(2)}  |  Equipment Parts: ${parts.length}`,
      m + 4,
      y
    );

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
    const fname = "vmgc-order-list-report-" + new Date().toISOString().slice(0, 10) + ".pdf";

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
    console.error("Order list report error at step [" + step + "]:", msg, err);
    return NextResponse.json({ error: "Failed at: " + step, details: msg }, { status: 500 });
  }
}
