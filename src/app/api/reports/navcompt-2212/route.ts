import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";

const BLACK: [number, number, number] = [0, 0, 0];
const DARK_GRAY: [number, number, number] = [80, 80, 80];
const LIGHT_GRAY_BG: [number, number, number] = [235, 235, 235];
const TABLE_LINE: [number, number, number] = [100, 100, 100];

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
    const equipmentId = url.searchParams.get("equipment_id");
    if (!equipmentId) {
      return NextResponse.json(
        { error: "equipment_id query parameter is required" },
        { status: 400 }
      );
    }

    // Fetch equipment
    const { data: equipment, error: equipError } = await supabase
      .from("equipment")
      .select("*")
      .eq("id", equipmentId)
      .single();

    if (equipError || !equipment) {
      return NextResponse.json(
        { error: "Equipment not found" },
        { status: 404 }
      );
    }

    // Fetch active disposal record
    const { data: disposal } = await supabase
      .from("asset_disposals")
      .select("*")
      .eq("equipment_id", equipmentId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── PDF Setup — Portrait, Letter size ──
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 215.9
    const pageHeight = doc.internal.pageSize.getHeight(); // 279.4
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });

    // ═══════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════
    let y = margin;

    // Light gray header background
    doc.setFillColor(...LIGHT_GRAY_BG);
    doc.rect(margin, y, contentWidth, 22, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BLACK);
    doc.text("CERTIFICATE OF DISPOSITION", pageWidth / 2, y + 8, {
      align: "center",
    });

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK_GRAY);
    doc.text("NAVCOMPT FORM 2212 (10-71)", pageWidth / 2, y + 15, {
      align: "center",
    });

    // Border around header
    doc.setDrawColor(...TABLE_LINE);
    doc.setLineWidth(0.4);
    doc.rect(margin, y, contentWidth, 22);

    y += 25;

    // ═══════════════════════════════════════
    // ACTIVITY / DATE / SHEET ROW
    // ═══════════════════════════════════════
    const rowH = 10;
    doc.setDrawColor(...TABLE_LINE);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, rowH);

    // Activity name/location (left)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text("ACTIVITY NAME/LOCATION:", margin + 2, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("VMGC Golf Course Maintenance", margin + 2, y + 8.5);

    // Date (right area)
    const dateFieldX = margin + contentWidth * 0.6;
    doc.setLineWidth(0.2);
    doc.line(dateFieldX, y, dateFieldX, y + rowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("DATE:", dateFieldX + 2, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(dateStr, dateFieldX + 2, y + 8.5);

    // Sheet
    const sheetFieldX = margin + contentWidth * 0.82;
    doc.line(sheetFieldX, y, sheetFieldX, y + rowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("SHEET", sheetFieldX + 2, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("1 OF 1", sheetFieldX + 2, y + 8.5);

    y += rowH + 3;

    // ═══════════════════════════════════════
    // TABLE
    // ═══════════════════════════════════════
    const colWidths = [
      contentWidth * 0.38, // Description of Item
      contentWidth * 0.08, // Units
      contentWidth * 0.15, // Unit Cost
      contentWidth * 0.15, // Total Value
      contentWidth * 0.24, // Reason for Disposition
    ];
    const colHeaders = [
      "DESCRIPTION OF ITEM",
      "UNITS",
      "UNIT COST",
      "TOTAL VALUE",
      "REASON FOR DISPOSITION",
    ];

    const headerRowH = 12;
    doc.setFillColor(...LIGHT_GRAY_BG);
    doc.setDrawColor(...TABLE_LINE);
    doc.setLineWidth(0.4);

    // Header row background
    doc.rect(margin, y, contentWidth, headerRowH, "FD");

    // Column headers
    let colX = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    for (let i = 0; i < colHeaders.length; i++) {
      // Vertical line between columns
      if (i > 0) {
        doc.line(colX, y, colX, y + headerRowH);
      }
      const headerLines = doc.splitTextToSize(colHeaders[i], colWidths[i] - 3);
      const textY = y + (headerRowH - headerLines.length * 3) / 2 + 3;
      doc.text(headerLines, colX + 2, textY);
      colX += colWidths[i];
    }

    y += headerRowH;

    // Data row
    const dataRowH = 30;
    doc.setDrawColor(...TABLE_LINE);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, dataRowH);

    // Build description text
    const descParts: string[] = [];
    if (equipment.name) descParts.push(equipment.name);
    if (equipment.make || equipment.model) {
      const mm = [equipment.make, equipment.model].filter(Boolean).join(" ");
      descParts.push(`Make/Model: ${mm}`);
    }
    if (equipment.serial_number)
      descParts.push(`S/N: ${equipment.serial_number}`);
    if (equipment.asset_tag) descParts.push(`Asset Tag: ${equipment.asset_tag}`);
    if (equipment.year) descParts.push(`Year: ${equipment.year}`);
    const descriptionText = descParts.join("\n");

    const unitCost =
      equipment.purchase_price != null
        ? `$${Number(equipment.purchase_price).toFixed(2)}`
        : "N/A";
    const totalValue = unitCost; // qty = 1
    const disposalReason = disposal?.reason || "N/A";

    // Render data cells
    colX = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);

    const cellData = [descriptionText, "1", unitCost, totalValue, disposalReason];

    for (let i = 0; i < cellData.length; i++) {
      if (i > 0) {
        doc.line(colX, y, colX, y + dataRowH);
      }
      const cellLines = doc.splitTextToSize(cellData[i], colWidths[i] - 4);
      doc.text(cellLines, colX + 2, y + 5);
      colX += colWidths[i];
    }

    y += dataRowH;

    // Empty rows for additional items (2 more rows)
    for (let r = 0; r < 2; r++) {
      const emptyRowH = 15;
      doc.setDrawColor(...TABLE_LINE);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, emptyRowH);
      colX = margin;
      for (let i = 1; i < colWidths.length; i++) {
        colX += colWidths[i - 1];
        doc.line(colX, y, colX, y + emptyRowH);
      }
      y += emptyRowH;
    }

    y += 8;

    // ═══════════════════════════════════════
    // CERTIFICATION TEXT
    // ═══════════════════════════════════════
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    const certText =
      "I certify that the property listed above has been disposed of as indicated, " +
      "that the proceeds, if any, have been deposited to the credit of the appropriate " +
      "fund, and that all applicable regulations have been complied with.";
    const certLines = doc.splitTextToSize(certText, contentWidth - 4);
    doc.text(certLines, margin + 2, y);
    y += certLines.length * 3.5 + 8;

    // ═══════════════════════════════════════
    // SIGNATURE BLOCKS
    // ═══════════════════════════════════════
    const sigLineWidth = contentWidth * 0.42;
    const sigGap = contentWidth - sigLineWidth * 2;
    const leftSigX = margin;
    const rightSigX = margin + sigLineWidth + sigGap;

    // Row 1: Mess Treasurer + Commanding Officer
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.3);

    // Left signature line
    doc.line(leftSigX, y, leftSigX + sigLineWidth, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BLACK);
    const sigLabel1 = doc.splitTextToSize(
      "SIGNATURE OF MESS TREASURER/CUSTODIAN OF RECREATION FUND",
      sigLineWidth
    );
    doc.text(sigLabel1, leftSigX, y + 3.5);

    // Right signature line
    doc.line(rightSigX, y, rightSigX + sigLineWidth, y);
    const sigLabel2 = doc.splitTextToSize(
      "APPROVED BY COMMANDING OFFICER",
      sigLineWidth
    );
    doc.text(sigLabel2, rightSigX, y + 3.5);

    y += 20;

    // Row 2: Witness 1 + Witness 2
    doc.line(leftSigX, y, leftSigX + sigLineWidth, y);
    doc.text("WITNESS 1 (Name/Date/Time):", leftSigX, y + 3.5);

    doc.line(rightSigX, y, rightSigX + sigLineWidth, y);
    const witness2Label = doc.splitTextToSize(
      "WITNESS 2 (Non-Golf Team Member - Name/Date/Time):",
      sigLineWidth
    );
    doc.text(witness2Label, rightSigX, y + 3.5);

    // ═══════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...DARK_GRAY);
    doc.text("S/N 0104-LF-706-5250", pageWidth / 2, pageHeight - 12, {
      align: "center",
    });

    // ── Output ──
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const safeName = (equipment.name || "equipment")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-");
    const fileDateStr = today.toISOString().split("T")[0];
    const filename = `NAVCOMPT-2212-${safeName}-${fileDateStr}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("NAVCOMPT 2212 PDF generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
