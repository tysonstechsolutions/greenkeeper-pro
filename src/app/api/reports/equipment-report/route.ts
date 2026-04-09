import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

// Extend jsPDF type for autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const BRAND_DARK = [27, 67, 50]; // #1B4332
const BRAND_GREEN = [45, 106, 79]; // #2D6A4F
const BRAND_GOLD = [182, 141, 64]; // #B68D40
const GRAY_600 = [75, 85, 99];
const GRAY_400 = [156, 163, 175];
const RED = [220, 38, 38];
const ORANGE = [234, 88, 12];

const conditionLabels: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  needs_repair: "Needs Repair",
  beyond_repair: "Beyond Repair",
  unknown: "Unknown",
};

const conditionColors: Record<string, number[]> = {
  good: [22, 163, 74],
  fair: [202, 138, 4],
  needs_repair: [234, 88, 12],
  beyond_repair: [220, 38, 38],
  unknown: [107, 114, 128],
};

const statusLabels: Record<string, string> = {
  operational: "Operational",
  needs_service: "Needs Service",
  in_repair: "In Repair",
  out_of_service: "Out of Service",
  retired: "Retired",
};

const equipmentTypeLabels: Record<string, string> = {
  mower_reel: "Reel Mower",
  mower_rotary: "Rotary Mower",
  mower_rough: "Rough Mower",
  aerator: "Aerator",
  sprayer: "Sprayer",
  topdresser: "Topdresser",
  utility_vehicle: "Utility Vehicle",
  tractor: "Tractor",
  blower: "Blower",
  trimmer: "Trimmer",
  chainsaw: "Chainsaw",
  roller: "Roller",
  seeder: "Seeder",
  hand_tool: "Hand Tool",
  pump: "Pump",
  other: "Other",
};

const fuelTypeLabels: Record<string, string> = {
  gasoline: "Gasoline",
  diesel: "Diesel",
  electric: "Electric",
  hybrid: "Hybrid",
  manual: "Manual/None",
  other: "Other",
};

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const equipmentId = url.searchParams.get("id");

    if (!equipmentId) {
      return NextResponse.json(
        { error: "Equipment ID required" },
        { status: 400 }
      );
    }

    // Fetch equipment data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: equipment, error } = await (supabase.from("equipment") as any)
      .select("*")
      .eq("id", equipmentId)
      .single();

    if (error || !equipment) {
      return NextResponse.json(
        { error: "Equipment not found" },
        { status: 404 }
      );
    }

    // Fetch maintenance logs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logs } = await (supabase.from("equipment_logs") as any)
      .select(
        `
        *,
        performer:profiles!performed_by(id, full_name, role)
      `
      )
      .eq("equipment_id", equipmentId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch user profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    // Pre-fetch photos
    const allPhotoUrls: string[] = [];
    if (equipment.photos && equipment.photos.length > 0) {
      allPhotoUrls.push(...equipment.photos);
    } else if (equipment.photo_url) {
      allPhotoUrls.push(equipment.photo_url);
    }

    const photoPromises = allPhotoUrls.map((url: string) =>
      fetchImageAsBase64(url)
    );
    const photos = await Promise.all(photoPromises);

    // ── Generate PDF ──
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPageSpace = (needed: number) => {
      if (y + needed > pageHeight - 20) {
        doc.addPage();
        y = margin;
      }
    };

    const addFooter = () => {
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(...(GRAY_400 as [number, number, number]));
        doc.text(
          `Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
        doc.text(
          "VMGC GreenKeeper Pro — Equipment Report",
          margin,
          pageHeight - 8
        );
        doc.text(
          new Date().toLocaleDateString(),
          pageWidth - margin,
          pageHeight - 8,
          { align: "right" }
        );
      }
    };

    // ── HEADER BAR ──
    doc.setFillColor(...(BRAND_DARK as [number, number, number]));
    doc.rect(0, 0, pageWidth, 34, "F");
    doc.setFillColor(...(BRAND_GOLD as [number, number, number]));
    doc.rect(0, 34, pageWidth, 1.5, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text("Equipment Condition Report", margin, 16);

    // Subtitle — DRMO / Disposal Assessment
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...(BRAND_GOLD as [number, number, number]));
    const isDRMO =
      equipment.condition_status === "beyond_repair" ||
      equipment.status === "out_of_service";
    doc.text(
      isDRMO ? "DRMO / Disposal Assessment" : "Condition & Maintenance Summary",
      margin,
      24
    );

    // Right side meta
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(dateStr, pageWidth - margin, 14, { align: "right" });
    if (profile?.full_name) {
      doc.text(`Prepared by: ${profile.full_name}`, pageWidth - margin, 20, {
        align: "right",
      });
    }
    doc.text(`Asset Tag: ${equipment.asset_tag || "N/A"}`, pageWidth - margin, 26, {
      align: "right",
    });

    y = 42;

    // ── EQUIPMENT IDENTIFICATION ──
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 28, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, 28, 3, 3, "S");

    // Equipment name — large
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...(BRAND_DARK as [number, number, number]));
    const equipName = equipment.name || "Unnamed Equipment";
    doc.text(equipName, margin + 5, y + 10);

    // Type badge
    const typeLabel =
      equipmentTypeLabels[equipment.equipment_type] || equipment.equipment_type || "Other";
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(BRAND_GREEN as [number, number, number]));
    doc.text(typeLabel, margin + 5, y + 17);

    // Make / Model / Year
    const makeModel = [equipment.make, equipment.model, equipment.year]
      .filter(Boolean)
      .join(" • ");
    if (makeModel) {
      doc.setTextColor(...(GRAY_600 as [number, number, number]));
      doc.text(makeModel, margin + 5, y + 23);
    }

    // Condition badge — right side
    const condition = equipment.condition_status || "unknown";
    const condLabel = conditionLabels[condition] || condition;
    const condColor = conditionColors[condition] || GRAY_400;

    const badgeWidth = doc.getTextWidth(condLabel) + 10;
    const badgeX = pageWidth - margin - badgeWidth - 3;
    doc.setFillColor(...(condColor as [number, number, number]));
    doc.roundedRect(badgeX, y + 4, badgeWidth, 7, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(condLabel.toUpperCase(), badgeX + badgeWidth / 2, y + 9, {
      align: "center",
    });

    // Status badge below condition
    const statusLabel = statusLabels[equipment.status] || equipment.status;
    const statusBadgeW = doc.getTextWidth(statusLabel) + 10;
    const statusBadgeX = pageWidth - margin - statusBadgeW - 3;
    const statusColor =
      equipment.status === "operational"
        ? [22, 163, 74]
        : equipment.status === "needs_service"
          ? ORANGE
          : equipment.status === "in_repair"
            ? [37, 99, 235]
            : equipment.status === "out_of_service"
              ? RED
              : GRAY_400;
    doc.setFillColor(...(statusColor as [number, number, number]));
    doc.roundedRect(statusBadgeX, y + 14, statusBadgeW, 7, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(statusLabel.toUpperCase(), statusBadgeX + statusBadgeW / 2, y + 19, {
      align: "center",
    });

    y += 34;

    // ── PHOTO SECTION ──
    if (photos.length > 0 && photos[0]) {
      checkPageSpace(75);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...(BRAND_DARK as [number, number, number]));
      doc.text("Equipment Photo", margin, y + 5);
      y += 9;

      try {
        const photoData = photos[0];
        const imgFormat = photoData.includes("image/png") ? "PNG" : "JPEG";
        // Center the photo, max 80mm tall, full width
        const imgWidth = Math.min(contentWidth, 130);
        const imgHeight = 70;
        const imgX = margin + (contentWidth - imgWidth) / 2;
        doc.addImage(photoData, imgFormat, imgX, y, imgWidth, imgHeight);
        y += imgHeight + 5;
      } catch {
        // Skip photo if it fails
      }

      // Additional photos (smaller thumbnails)
      if (photos.length > 1) {
        const thumbSize = 35;
        const thumbGap = 4;
        let thumbX = margin;
        for (let i = 1; i < Math.min(photos.length, 5); i++) {
          if (photos[i]) {
            try {
              const fmt = photos[i]!.includes("image/png") ? "PNG" : "JPEG";
              if (thumbX + thumbSize > pageWidth - margin) {
                thumbX = margin;
                y += thumbSize + thumbGap;
                checkPageSpace(thumbSize + thumbGap);
              }
              doc.addImage(photos[i]!, fmt, thumbX, y, thumbSize, thumbSize);
              thumbX += thumbSize + thumbGap;
            } catch {
              // skip
            }
          }
        }
        y += thumbSize + 5;
      }
    }

    // ── DETAILS TABLE ──
    checkPageSpace(50);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...(BRAND_DARK as [number, number, number]));
    doc.text("Equipment Details", margin, y + 5);
    y += 9;

    const detailRows: string[][] = [];
    detailRows.push(["Name", equipment.name || "—"]);
    detailRows.push([
      "Type",
      equipmentTypeLabels[equipment.equipment_type] || equipment.equipment_type || "—",
    ]);
    detailRows.push(["Make", equipment.make || "—"]);
    detailRows.push(["Model", equipment.model || "—"]);
    detailRows.push(["Year", equipment.year?.toString() || "—"]);
    detailRows.push(["Serial Number", equipment.serial_number || "—"]);
    detailRows.push(["Asset Tag", equipment.asset_tag || "—"]);
    detailRows.push([
      "Fuel Type",
      fuelTypeLabels[equipment.fuel_type] || equipment.fuel_type || "—",
    ]);
    detailRows.push(["Location", equipment.location || "—"]);
    detailRows.push([
      "Current Hours",
      equipment.current_hours != null ? `${equipment.current_hours} hrs` : "—",
    ]);
    if (equipment.purchase_date) {
      detailRows.push([
        "Purchase Date",
        new Date(equipment.purchase_date).toLocaleDateString(),
      ]);
    }
    if (equipment.purchase_price != null) {
      detailRows.push([
        "Purchase Price",
        `$${Number(equipment.purchase_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      ]);
    }

    doc.autoTable({
      startY: y,
      head: [["Field", "Value"]],
      body: detailRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: {
        fillColor: BRAND_DARK,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45, textColor: GRAY_600 },
        1: { cellWidth: "auto" },
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // ── CONDITION & REPAIR SECTION ──
    checkPageSpace(40);

    // Section header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...(BRAND_DARK as [number, number, number]));
    doc.text("Condition Assessment", margin, y + 5);
    y += 9;

    // Condition box
    const condBoxHeight =
      12 +
      (equipment.condition_notes ? 8 : 0) +
      (equipment.parts_needed ? 8 : 0) +
      (equipment.estimated_repair_cost != null ? 8 : 0);

    const actualBoxHeight = Math.max(condBoxHeight, 20);
    checkPageSpace(actualBoxHeight + 5);

    doc.setFillColor(
      condition === "beyond_repair" ? 254 : 245,
      condition === "beyond_repair" ? 242 : 247,
      condition === "beyond_repair" ? 242 : 250
    );
    doc.roundedRect(margin, y, contentWidth, actualBoxHeight, 3, 3, "F");

    // Left accent bar with condition color
    doc.setFillColor(...(condColor as [number, number, number]));
    doc.rect(margin, y, 3, actualBoxHeight, "F");

    let boxY = y + 7;

    // Condition status
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...(condColor as [number, number, number]));
    doc.text(`Condition: ${condLabel}`, margin + 8, boxY);

    // Equipment status
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...(GRAY_600 as [number, number, number]));
    doc.text(`Status: ${statusLabel}`, margin + contentWidth / 2, boxY);

    boxY += 7;

    // Condition notes
    if (equipment.condition_notes) {
      doc.setFontSize(9);
      doc.setTextColor(...(GRAY_600 as [number, number, number]));
      const noteLines = doc.splitTextToSize(
        `Notes: ${equipment.condition_notes}`,
        contentWidth - 16
      );
      doc.text(noteLines, margin + 8, boxY);
      boxY += noteLines.length * 4;
    }

    y += actualBoxHeight + 6;

    // ── PARTS NEEDED SECTION ──
    if (equipment.needs_parts_ordered || equipment.parts_needed) {
      checkPageSpace(25);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...(ORANGE as [number, number, number]));
      doc.text("Parts Needed", margin, y + 5);
      y += 9;

      doc.setFillColor(255, 247, 237); // orange-50
      doc.roundedRect(margin, y, contentWidth, 18, 3, 3, "F");
      doc.setDrawColor(251, 191, 36); // amber-400
      doc.roundedRect(margin, y, contentWidth, 18, 3, 3, "S");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...(GRAY_600 as [number, number, number]));

      const partsText = equipment.parts_needed || "Parts required (unspecified)";
      const partsLines = doc.splitTextToSize(partsText, contentWidth - 16);
      doc.text(partsLines, margin + 6, y + 7);

      if (equipment.estimated_repair_cost != null) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...(ORANGE as [number, number, number]));
        doc.text(
          `Estimated Repair Cost: $${Number(equipment.estimated_repair_cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          margin + 6,
          y + 14
        );
      }

      y += 22;
    }

    // ── DRMO / DISPOSAL RECOMMENDATION ──
    if (isDRMO) {
      checkPageSpace(35);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...(RED as [number, number, number]));
      doc.text("DRMO / Disposal Recommendation", margin, y + 5);
      y += 9;

      doc.setFillColor(254, 242, 242); // red-50
      doc.roundedRect(margin, y, contentWidth, 24, 3, 3, "F");
      doc.setDrawColor(252, 165, 165); // red-300
      doc.roundedRect(margin, y, contentWidth, 24, 3, 3, "S");

      // Red accent bar
      doc.setFillColor(...(RED as [number, number, number]));
      doc.rect(margin, y, 3, 24, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...(RED as [number, number, number]));
      doc.text("RECOMMENDED FOR DISPOSAL", margin + 8, y + 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...(GRAY_600 as [number, number, number]));

      const drmoReason =
        equipment.condition_status === "beyond_repair"
          ? "This equipment has been assessed as beyond economical repair."
          : "This equipment is currently out of service.";

      doc.text(drmoReason, margin + 8, y + 15);

      const repairCostNote = equipment.estimated_repair_cost != null
        ? `Estimated repair cost ($${Number(equipment.estimated_repair_cost).toLocaleString()}) may exceed replacement value.`
        : "No repair cost estimate available — manual assessment recommended.";
      doc.text(repairCostNote, margin + 8, y + 21);

      y += 30;
    }

    // ── GENERAL NOTES ──
    if (equipment.notes) {
      checkPageSpace(25);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...(BRAND_DARK as [number, number, number]));
      doc.text("Notes", margin, y + 5);
      y += 9;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...(GRAY_600 as [number, number, number]));
      const noteLines = doc.splitTextToSize(equipment.notes, contentWidth - 8);
      checkPageSpace(noteLines.length * 4 + 4);
      doc.text(noteLines, margin + 4, y + 4);
      y += noteLines.length * 4 + 8;
    }

    // ── MAINTENANCE HISTORY ──
    if (logs && logs.length > 0) {
      checkPageSpace(30);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...(BRAND_DARK as [number, number, number]));
      doc.text("Recent Maintenance History", margin, y + 5);
      y += 9;

      const logRows = logs.slice(0, 15).map(
        (log: {
          created_at: string;
          log_type: string;
          description: string;
          cost: number | null;
          performer: { full_name: string } | null;
        }) => [
          new Date(log.created_at).toLocaleDateString(),
          log.log_type
            ? log.log_type.charAt(0).toUpperCase() + log.log_type.slice(1)
            : "—",
          (log.description || "—").substring(0, 60),
          log.cost != null ? `$${Number(log.cost).toFixed(2)}` : "—",
          log.performer?.full_name || "—",
        ]
      );

      doc.autoTable({
        startY: y,
        head: [["Date", "Type", "Description", "Cost", "Performed By"]],
        body: logRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: {
          fillColor: BRAND_GREEN,
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 22 },
          2: { cellWidth: "auto" },
          3: { cellWidth: 20, halign: "right" },
          4: { cellWidth: 30 },
        },
      });

      y = doc.lastAutoTable.finalY + 8;
    }

    // ── SIGNATURE BLOCK ──
    checkPageSpace(35);

    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...(GRAY_600 as [number, number, number]));

    // Left signature
    doc.text("Superintendent Signature:", margin, y);
    doc.line(margin + 42, y + 1, margin + 100, y + 1);
    doc.text("Date:", margin + 105, y);
    doc.line(margin + 115, y + 1, margin + 150, y + 1);

    y += 12;

    // Right signature
    doc.text("Director / Approver:", margin, y);
    doc.line(margin + 36, y + 1, margin + 100, y + 1);
    doc.text("Date:", margin + 105, y);
    doc.line(margin + 115, y + 1, margin + 150, y + 1);

    // ── FOOTER ──
    addFooter();

    // ── Output ──
    const pdfBuffer = doc.output("arraybuffer");
    const safeName = (equipment.name || "equipment")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-report.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Equipment report error:", err);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
