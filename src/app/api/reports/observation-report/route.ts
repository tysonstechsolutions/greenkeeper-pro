import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import { issueTypeLabels } from "@/lib/hole-constants";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import { readFileSync } from "fs";
import { join } from "path";

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];

const priorityColors: Record<string, [number, number, number]> = {
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

function loadHoleImage(holeNumber: number): string | null {
  try {
    const filePath = join(process.cwd(), "public", "holes", `hole-${holeNumber}.png`);
    const buffer = readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
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
    const type = url.searchParams.get("type") || "hole";

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

    // Fetch profile for header
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const labels = type === "green" ? greenIssueTypeLabels : issueTypeLabels;
    const obs = observations || [];

    // Pre-fetch all observation photos in parallel
    const photoPromises = obs.map((o: { photo_url: string | null }) =>
      o.photo_url ? fetchImageAsBase64(o.photo_url) : Promise.resolve(null)
    );
    const photos = await Promise.all(photoPromises);

    // Load hole/green base image
    const holeImage = type === "hole" ? loadHoleImage(holeNumber) : null;

    // ── PDF Setup — Landscape A4 ──
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth(); // 297
    const pageHeight = doc.internal.pageSize.getHeight(); // 210
    const margin = 12;
    const headerHeight = 28;
    const footerHeight = 12;

    // Layout columns
    const leftColWidth = 115; // hole image column
    const gutter = 6;
    const rightColX = margin + leftColWidth + gutter;
    const rightColWidth = pageWidth - rightColX - margin;

    // ── HEADER ──
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, headerHeight, pageWidth, 1.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...WHITE);
    doc.text(`Hole ${holeNumber} ${type === "green" ? "Green" : "Fairway"} Report`, margin, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Observation & Treatment Report", margin, 19);

    // Date + author on right
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
    doc.text(dateStr, pageWidth - margin, 12, { align: "right" });
    if (profile?.full_name) {
      doc.text(`Prepared by: ${profile.full_name}`, pageWidth - margin, 19, { align: "right" });
    }

    const contentTop = headerHeight + 4;
    const contentBottom = pageHeight - footerHeight;

    // ── LEFT COLUMN: Hole image with pins ──
    const imgX = margin;
    const imgY = contentTop;
    const imgW = leftColWidth;
    const imgH = Math.min(imgW * 0.75, contentBottom - contentTop - 30); // maintain aspect ratio, leave room for stats

    if (holeImage) {
      try {
        doc.addImage(holeImage, "PNG", imgX, imgY, imgW, imgH);
      } catch {
        // Fallback: draw placeholder
        doc.setFillColor(230, 240, 230);
        doc.roundedRect(imgX, imgY, imgW, imgH, 3, 3, "F");
        doc.setFontSize(14);
        doc.setTextColor(...BRAND_GREEN);
        doc.text(`Hole ${holeNumber}`, imgX + imgW / 2, imgY + imgH / 2, { align: "center" });
      }
    } else if (type === "green") {
      // Green placeholder — draw a green-colored shape
      doc.setFillColor(45, 90, 63);
      doc.roundedRect(imgX, imgY, imgW, imgH, 8, 8, "F");
      // Inner green surface
      const inset = 8;
      doc.setFillColor(106, 191, 94);
      doc.ellipse(imgX + imgW / 2, imgY + imgH / 2, imgW / 2 - inset, imgH / 2 - inset, "F");
      doc.setFontSize(11);
      doc.setTextColor(...WHITE);
      doc.text(`Green ${holeNumber}`, imgX + imgW / 2, imgY + imgH / 2 + 1, { align: "center" });
    } else {
      // Hole image not found — placeholder
      doc.setFillColor(230, 240, 230);
      doc.roundedRect(imgX, imgY, imgW, imgH, 3, 3, "F");
      doc.setFontSize(14);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(`Hole ${holeNumber}`, imgX + imgW / 2, imgY + imgH / 2, { align: "center" });
    }

    // ── Draw pin markers on the image ──
    obs.forEach((observation: { pin_x: number; pin_y: number; priority: string }, idx: number) => {
      if (observation.pin_x == null || observation.pin_y == null) return;
      const pinX = imgX + observation.pin_x * imgW;
      const pinY = imgY + observation.pin_y * imgH;
      const pColor = priorityColors[observation.priority] || GRAY_600;
      const radius = 3.5;

      // Circle background
      doc.setFillColor(...pColor);
      doc.circle(pinX, pinY, radius, "F");
      // White border
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(0.6);
      doc.circle(pinX, pinY, radius, "S");
      // Number
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...WHITE);
      doc.text(`${idx + 1}`, pinX, pinY + 1, { align: "center" });
    });

    // ── Stats below the image ──
    const statsY = imgY + imgH + 3;
    const openCount = obs.filter((o: { status: string }) => o.status !== "resolved").length;
    const criticalCount = obs.filter((o: { priority: string; status: string }) => o.priority === "critical" && o.status !== "resolved").length;
    const highCount = obs.filter((o: { priority: string; status: string }) => o.priority === "high" && o.status !== "resolved").length;

    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(imgX, statsY, imgW, 16, 2, 2, "FD");

    const statItems = [
      { label: "Total", value: obs.length.toString(), color: BRAND_GREEN },
      { label: "Open", value: openCount.toString(), color: [220, 38, 38] as [number, number, number] },
      { label: "Critical", value: criticalCount.toString(), color: [220, 38, 38] as [number, number, number] },
      { label: "High", value: highCount.toString(), color: [234, 88, 12] as [number, number, number] },
    ];
    const statColW = imgW / 4;
    statItems.forEach((stat, i) => {
      const sx = imgX + statColW * i + statColW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...stat.color);
      doc.text(stat.value, sx, statsY + 7, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...GRAY_600);
      doc.text(stat.label, sx, statsY + 12, { align: "center" });
    });

    // ── RIGHT COLUMN: Observation cards ──
    // Adaptive sizing based on number of observations
    let photoW: number, photoH: number;
    if (obs.length <= 2) {
      photoW = 50; photoH = 38;
    } else if (obs.length <= 4) {
      photoW = 35; photoH = 26;
    } else {
      photoW = 25; photoH = 19;
    }

    let ry = contentTop; // right column Y cursor

    const checkRightSpace = (needed: number) => {
      if (ry + needed > contentBottom) {
        doc.addPage();
        ry = margin;
      }
    };

    if (obs.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400);
      doc.text("No observations recorded for this hole.", rightColX, ry + 15);
    }

    for (let i = 0; i < obs.length; i++) {
      const observation = obs[i];
      const photo = photos[i];

      // Estimate card height
      const cardMinH = photo ? Math.max(photoH + 6, 20) : 18;
      checkRightSpace(cardMinH + 4);

      // ── Card header bar ──
      const pColor = priorityColors[observation.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.roundedRect(rightColX, ry, rightColWidth, 6, 1, 1, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      const titleText = `#${i + 1}  ${observation.title || "Untitled"}`;
      const maxTitleW = rightColWidth - 45;
      let displayTitle = titleText;
      if (doc.getTextWidth(titleText) > maxTitleW) {
        // Progressively trim until it fits
        let trimmed = titleText;
        while (doc.getTextWidth(trimmed + "...") > maxTitleW && trimmed.length > 10) {
          trimmed = trimmed.substring(0, trimmed.lastIndexOf(" ", trimmed.length - 2) || trimmed.length - 3);
        }
        displayTitle = trimmed + "...";
      }
      doc.text(displayTitle, rightColX + 2, ry + 4.2);

      // Status badge on right
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      const statusText = `${observation.priority.toUpperCase()} | ${statusLabels[observation.status] || observation.status}`;
      doc.text(statusText, rightColX + rightColWidth - 2, ry + 4.2, { align: "right" });

      ry += 7;

      // ── Issue type + date row ──
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY_600);
      const issueLabel = (labels as Record<string, string>)[observation.issue_type] || observation.issue_type;
      const reportDate = new Date(observation.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
      const reporterName = observation.reporter?.full_name || "Unknown";
      doc.text(`${issueLabel}  |  ${reportDate}  |  ${reporterName}`, rightColX + 1, ry + 2.5);
      ry += 4;

      // ── Photo + text side by side ──
      if (photo) {
        const textStartX = rightColX + photoW + 4;
        const textW = rightColWidth - photoW - 5;
        let textY = ry + 1;

        try {
          const imgFormat = photo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, imgFormat, rightColX + 1, ry, photoW, photoH);
        } catch {
          // Photo failed, draw placeholder
          doc.setFillColor(240, 240, 240);
          doc.rect(rightColX + 1, ry, photoW, photoH, "F");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY_400);
          doc.text("No image", rightColX + 1 + photoW / 2, ry + photoH / 2, { align: "center" });
        }

        // Description
        if (observation.description) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(...BRAND_DARK);
          doc.text("Description:", textStartX, textY);
          textY += 3;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...GRAY_600);
          const maxDescLines = obs.length <= 2 ? 6 : obs.length <= 4 ? 4 : 3;
          const descLines = doc.splitTextToSize(observation.description, textW);
          doc.text(descLines.slice(0, maxDescLines), textStartX, textY);
          textY += Math.min(descLines.length, maxDescLines) * 2.8;
        }

        // Fix instructions
        if (observation.fix_instructions) {
          textY += 1.5;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(180, 83, 9);
          doc.text("How to Fix:", textStartX, textY);
          textY += 3;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...GRAY_600);
          const maxFixLines = obs.length <= 2 ? 5 : obs.length <= 4 ? 3 : 2;
          const fixLines = doc.splitTextToSize(observation.fix_instructions, textW);
          doc.text(fixLines.slice(0, maxFixLines), textStartX, textY);
          textY += Math.min(fixLines.length, maxFixLines) * 2.8;
        }

        const textHeight = textY - ry;
        ry += Math.max(photoH, textHeight) + 2;
      } else {
        // No photo — text only, compact
        if (observation.description) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...GRAY_600);
          const descLines = doc.splitTextToSize(observation.description, rightColWidth - 4);
          doc.text(descLines.slice(0, 3), rightColX + 1, ry + 2.5);
          ry += Math.min(descLines.length, 3) * 2.8 + 2;
        }

        if (observation.fix_instructions) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(180, 83, 9);
          doc.text("Fix:", rightColX + 1, ry + 1.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...GRAY_600);
          const fixLines = doc.splitTextToSize(observation.fix_instructions, rightColWidth - 12);
          doc.text(fixLines.slice(0, 2), rightColX + 9, ry + 1.5);
          ry += Math.min(fixLines.length, 2) * 2.8 + 2;
        }

        ry += 1;
      }

      // Thin divider between cards
      if (i < obs.length - 1) {
        ry += 1;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(rightColX, ry, rightColX + rightColWidth, ry);
        ry += 2;
      }
    }

    // ── FOOTER on all pages ──
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_400);
      doc.text(
        `VMGC GreenKeeper Pro | Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: "center" }
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: "right" });
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
