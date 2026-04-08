import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { issueTypeLabels } from "@/lib/hole-constants";
import { greenIssueTypeLabels } from "@/lib/green-constants";

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

const priorityColors: Record<string, number[]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  normal: [37, 99, 235],
  low: [107, 114, 128],
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  monitoring: "Monitoring",
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const holeNumber = parseInt(url.searchParams.get("hole") || "0");
    const type = url.searchParams.get("type") || "hole"; // "hole" or "green"

    if (!holeNumber || holeNumber < 1 || holeNumber > 18) {
      return NextResponse.json({ error: "Invalid hole number" }, { status: 400 });
    }

    // Fetch observations
    const table = type === "green" ? "green_observations" : "hole_observations";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: observations, error } = await (supabase.from(table) as any)
      .select(`
        *,
        reporter:profiles!reported_by(id, full_name, avatar_url, role)
      `)
      .eq("hole_number", holeNumber)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch observations" }, { status: 500 });
    }

    // Fetch profile for the header
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const labels = type === "green" ? greenIssueTypeLabels : issueTypeLabels;

    // Pre-fetch all photos in parallel
    const photoPromises = (observations || []).map((obs: { photo_url: string | null }) =>
      obs.photo_url ? fetchImageAsBase64(obs.photo_url) : Promise.resolve(null)
    );
    const photos = await Promise.all(photoPromises);

    // Generate PDF
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // ── Helper functions ──
    const addPage = () => {
      doc.addPage();
      y = margin;
    };

    const checkPageSpace = (needed: number) => {
      if (y + needed > pageHeight - 20) {
        addPage();
      }
    };

    const truncateText = (text: string, maxWidth: number, fontSize: number) => {
      doc.setFontSize(fontSize);
      if (doc.getTextWidth(text) <= maxWidth) return text;
      let truncated = text;
      while (doc.getTextWidth(truncated + "…") > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + "…";
    };

    // ── HEADER ──
    // Brand bar
    doc.setFillColor(...BRAND_DARK as [number, number, number]);
    doc.rect(0, 0, pageWidth, 32, "F");

    // Gold accent line
    doc.setFillColor(...BRAND_GOLD as [number, number, number]);
    doc.rect(0, 32, pageWidth, 1.5, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(`Hole ${holeNumber} ${type === "green" ? "Green" : "Fairway"} Report`, margin, 15);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD as [number, number, number]);
    doc.text("Observation & Treatment Report", margin, 22);

    // Report meta - right side
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    doc.text(dateStr, pageWidth - margin, 15, { align: "right" });
    if (profile?.full_name) {
      doc.text(`Prepared by: ${profile.full_name}`, pageWidth - margin, 22, { align: "right" });
    }

    y = 40;

    // ── SUMMARY BOX ──
    const obs = observations || [];
    const openCount = obs.filter((o: { status: string }) => o.status !== "resolved").length;
    const criticalCount = obs.filter((o: { priority: string; status: string }) => o.priority === "critical" && o.status !== "resolved").length;
    const highCount = obs.filter((o: { priority: string; status: string }) => o.priority === "high" && o.status !== "resolved").length;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "S");

    const statsY = y + 9;
    const colW = contentWidth / 4;

    // Stat boxes
    const stats = [
      { label: "Total Issues", value: obs.length.toString(), color: BRAND_GREEN },
      { label: "Open", value: openCount.toString(), color: [220, 38, 38] },
      { label: "Critical", value: criticalCount.toString(), color: [220, 38, 38] },
      { label: "High Priority", value: highCount.toString(), color: [234, 88, 12] },
    ];

    stats.forEach((stat, i) => {
      const x = margin + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...stat.color as [number, number, number]);
      doc.text(stat.value, x, statsY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600 as [number, number, number]);
      doc.text(stat.label, x, statsY + 7, { align: "center" });
    });

    y += 28;

    // ── OBSERVATIONS ──
    if (obs.length === 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400 as [number, number, number]);
      doc.text("No observations recorded for this hole.", margin, y + 10);
    }

    for (let i = 0; i < obs.length; i++) {
      const observation = obs[i];
      const photo = photos[i];
      const diag = observation.diagnosis_result;

      // Estimate space needed for this observation
      const estimatedHeight = photo ? 100 : 50;
      checkPageSpace(estimatedHeight);

      // ── Observation header bar ──
      const pColor = priorityColors[observation.priority] || GRAY_600;
      doc.setFillColor(...pColor as [number, number, number]);
      doc.rect(margin, y, contentWidth, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);

      // Measure status text first to know how much space the title has
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const statusText = `${observation.priority.toUpperCase()} | ${statusLabels[observation.status] || observation.status}`;
      const statusWidth = doc.getTextWidth(statusText) + 8;

      // Truncate title to fit
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const titlePrefix = `#${i + 1}  `;
      const maxTitleWidth = contentWidth - statusWidth - 8;
      const truncatedTitle = truncateText(observation.title, maxTitleWidth - doc.getTextWidth(titlePrefix), 10);
      doc.text(`${titlePrefix}${truncatedTitle}`, margin + 3, y + 5.5);

      // Priority + status on right
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(statusText, pageWidth - margin - 3, y + 5.5, { align: "right" });

      y += 10;

      // ── Issue type + date row ──
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600 as [number, number, number]);
      const issueLabel = (labels as Record<string, string>)[observation.issue_type] || observation.issue_type;
      const reportDate = new Date(observation.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const reporterName = observation.reporter?.full_name || "Unknown";
      doc.text(`Type: ${issueLabel}  |  Reported: ${reportDate}  |  By: ${reporterName}`, margin + 2, y + 3);
      y += 6;

      // ── Photo ──
      if (photo) {
        checkPageSpace(65);
        try {
          const imgWidth = 60;
          const imgHeight = 45;
          // Auto-detect format from data URL (supports JPEG, PNG, WebP)
          const imgFormat = photo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, imgFormat, margin + 2, y, imgWidth, imgHeight);

          // Description next to photo
          const textX = margin + imgWidth + 6;
          const textWidth = contentWidth - imgWidth - 8;
          let textY = y + 2;

          if (observation.description) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...BRAND_DARK as [number, number, number]);
            doc.text("Description:", textX, textY);
            textY += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY_600 as [number, number, number]);
            const descLines = doc.splitTextToSize(observation.description, textWidth);
            doc.text(descLines.slice(0, 6), textX, textY);
            textY += Math.min(descLines.length, 6) * 3.5;
          }

          if (observation.fix_instructions) {
            textY += 2;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(180, 83, 9); // amber-700
            doc.text("Fix Instructions:", textX, textY);
            textY += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY_600 as [number, number, number]);
            const fixLines = doc.splitTextToSize(observation.fix_instructions, textWidth);
            doc.text(fixLines.slice(0, 5), textX, textY);
            textY += Math.min(fixLines.length, 5) * 3.5;
          }

          // Use whichever is taller: the image or the text beside it
          const textHeight = textY - y;
          y += Math.max(imgHeight, textHeight) + 3;
        } catch {
          // Photo failed to embed, skip it
          y += 2;
        }
      } else {
        // No photo — show description inline
        if (observation.description) {
          checkPageSpace(15);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY_600 as [number, number, number]);
          const descLines = doc.splitTextToSize(observation.description, contentWidth - 4);
          doc.text(descLines.slice(0, 4), margin + 2, y + 3);
          y += Math.min(descLines.length, 4) * 3.5 + 3;
        }

        if (observation.fix_instructions) {
          checkPageSpace(15);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(180, 83, 9);
          doc.text("Fix Instructions:", margin + 2, y + 2);
          y += 5;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...GRAY_600 as [number, number, number]);
          const fixLines = doc.splitTextToSize(observation.fix_instructions, contentWidth - 4);
          doc.text(fixLines.slice(0, 4), margin + 2, y);
          y += Math.min(fixLines.length, 4) * 3.5 + 2;
        }
      }

      // ── Diagnosis & Treatment Plan ──
      if (diag?.diagnosis) {
        checkPageSpace(30);

        // Diagnosis box — measure condition text to size box dynamically
        const conditionText = `${diag.diagnosis.condition || "Unknown Condition"}${diag.diagnosis.scientific_name ? ` (${diag.diagnosis.scientific_name})` : ""}`;
        doc.setFontSize(8);
        const conditionLines = doc.splitTextToSize(conditionText, contentWidth - 14);
        const conditionHeight = conditionLines.length * 3.5;
        const diagBoxHeight = Math.max(18, 8 + conditionHeight + 6);

        doc.setFillColor(240, 253, 244); // green-50
        doc.setDrawColor(187, 247, 208); // green-200
        doc.roundedRect(margin + 2, y, contentWidth - 4, diagBoxHeight, 2, 2, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_DARK as [number, number, number]);
        doc.text("AI Diagnosis", margin + 5, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND_GREEN as [number, number, number]);
        doc.text(conditionLines, margin + 5, y + 10);

        const severityY = y + 10 + conditionHeight + 1;
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_600 as [number, number, number]);
        const severityDisplay = diag.diagnosis.severity_label
          ? `${diag.diagnosis.severity_label} (${diag.diagnosis.severity}/5)`
          : `${diag.diagnosis.severity}/5`;
        doc.text(
          `Severity: ${severityDisplay}  |  Confidence: ${diag.diagnosis.confidence || "N/A"}  |  Category: ${diag.diagnosis.category || "N/A"}`,
          margin + 5, severityY
        );

        y += diagBoxHeight + 3;

        // Treatment products table
        if (diag.treatment?.products?.length > 0) {
          checkPageSpace(25);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND_DARK as [number, number, number]);
          doc.text("Recommended Products:", margin + 2, y + 3);
          y += 5;

          const tableData = diag.treatment.products.map((p: {
            name?: string;
            active_ingredient?: string;
            application_rate?: string;
            method?: string;
            in_inventory?: boolean;
            timing?: string;
          }) => [
            p.name || "Unknown Product",
            p.active_ingredient || "—",
            p.application_rate || "—",
            p.method || "—",
            p.in_inventory ? "In Stock" : "Not in Stock",
            p.timing || "—",
          ]);

          doc.autoTable({
            startY: y,
            margin: { left: margin + 2, right: margin + 2 },
            head: [["Product", "Active Ingredient", "Rate", "Method", "Inventory", "Timing"]],
            body: tableData,
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: {
              fillColor: BRAND_DARK,
              textColor: [255, 255, 255],
              fontSize: 7,
              fontStyle: "bold",
            },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            columnStyles: {
              0: { fontStyle: "bold", cellWidth: 28 },
              4: { cellWidth: 18 },
            },
          });

          y = doc.lastAutoTable.finalY + 3;
        }

        // Application window
        if (diag.treatment?.application_window) {
          checkPageSpace(18);
          const aw = diag.treatment.application_window;
          doc.setFillColor(239, 246, 255); // blue-50
          doc.setDrawColor(191, 219, 254); // blue-200
          doc.roundedRect(margin + 2, y, contentWidth - 4, 14, 2, 2, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(30, 64, 175); // blue-800
          doc.text("Application Window", margin + 5, y + 4);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY_600 as [number, number, number]);
          doc.text(
            `Best Date: ${aw.best_date || "TBD"}  |  Time: ${aw.best_time || "TBD"}  |  Temp: ${aw.ideal_temp_range || "N/A"}`,
            margin + 5, y + 8.5
          );
          doc.text(
            `Max Wind: ${aw.max_wind || "N/A"}  |  Rain Buffer: ${aw.rain_buffer || "N/A"}`,
            margin + 5, y + 12
          );

          y += 17;
        }

        // Follow-up schedule
        if (diag.treatment?.follow_up?.length > 0) {
          checkPageSpace(20);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND_DARK as [number, number, number]);
          doc.text("Follow-up Schedule:", margin + 2, y + 3);
          y += 5;

          const followData = diag.treatment.follow_up.map((fu: {
            days_after: number;
            action: string;
            what_to_look_for: string;
            if_no_improvement: string;
          }) => [
            `Day ${fu.days_after}`,
            fu.action,
            fu.what_to_look_for,
            fu.if_no_improvement || "—",
          ]);

          doc.autoTable({
            startY: y,
            margin: { left: margin + 2, right: margin + 2 },
            head: [["When", "Action", "Look For", "If No Improvement"]],
            body: followData,
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: {
              fillColor: BRAND_GREEN as number[],
              textColor: [255, 255, 255],
              fontSize: 7,
              fontStyle: "bold",
            },
            alternateRowStyles: { fillColor: [245, 247, 250] },
          });

          y = doc.lastAutoTable.finalY + 3;
        }

        // Prevention tips
        if (diag.prevention?.length > 0) {
          checkPageSpace(15);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND_DARK as [number, number, number]);
          doc.text("Prevention:", margin + 2, y + 3);
          y += 5;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY_600 as [number, number, number]);
          diag.prevention.forEach((tip: string) => {
            checkPageSpace(5);
            const lines = doc.splitTextToSize(`- ${tip}`, contentWidth - 6);
            doc.text(lines, margin + 4, y + 2);
            y += lines.length * 3 + 1;
          });
          y += 2;
        }
      }

      // Divider between observations
      if (i < obs.length - 1) {
        y += 3;
        checkPageSpace(5);
        doc.setDrawColor(...GRAY_400 as [number, number, number]);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(margin + 10, y, pageWidth - margin - 10, y);
        doc.setLineDashPattern([], 0);
        y += 5;
      }
    }

    // Add footer to all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_400 as [number, number, number]);
      doc.text(
        `VMGC GreenKeeper Pro | Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" }
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    // Output
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `Hole-${holeNumber}-${type === "green" ? "Green" : "Fairway"}-Report-${new Date().toISOString().split("T")[0]}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
