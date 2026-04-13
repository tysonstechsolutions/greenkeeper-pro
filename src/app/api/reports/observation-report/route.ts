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
    // Try fetching the public URL directly first
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Extract the storage path from a Supabase public URL.
 * URL format: https://<project>.supabase.co/storage/v1/object/public/photos/<path>
 */
function extractStoragePath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/photos/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.substring(idx + marker.length);
}

/**
 * Download a photo using the authenticated Supabase server client.
 * Falls back to direct public URL fetch if storage download fails.
 */
async function fetchPhotoViaSupabase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photoUrl: string
): Promise<string | null> {
  // First try: download via Supabase storage API (authenticated)
  const storagePath = extractStoragePath(photoUrl);
  if (storagePath) {
    try {
      const { data, error } = await supabase.storage
        .from("photos")
        .download(storagePath);
      if (!error && data) {
        const buffer = await data.arrayBuffer();
        if (buffer.byteLength > 0) {
          const base64 = Buffer.from(buffer).toString("base64");
          const contentType = data.type || "image/jpeg";
          return `data:${contentType};base64,${base64}`;
        }
      }
    } catch {
      // Fall through to public URL fetch
    }
  }

  // Second try: direct public URL fetch
  return fetchImageAsBase64(photoUrl);
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

function loadGreenImage(holeNumber: number): string | null {
  try {
    const filePath = join(process.cwd(), "public", "greens", `green-${holeNumber}.png`);
    const buffer = readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Renders the header bar for every page.
 */
function renderHeader(
  doc: jsPDF,
  holeNumber: number,
  type: string,
  profileName: string | null,
  pageLabel?: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const headerHeight = 24;

  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pageWidth, headerHeight, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, headerHeight, pageWidth, 0.8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  const title = `Hole ${holeNumber} ${type === "green" ? "Green" : "Fairway"} Report`;
  doc.text(pageLabel ? `${title} ${pageLabel}` : title, margin, 10.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_GOLD);
  doc.text("Course Condition Report", margin, 17);

  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.text(dateStr, pageWidth - margin, 10.5, { align: "right" });
  if (profileName) {
    doc.setTextColor(200, 200, 200);
    doc.text(`Prepared by: ${profileName}`, pageWidth - margin, 17, { align: "right" });
  }
}

/**
 * Professional report layout:
 * - Centered hole image at top with dark surround
 * - Stats bar below image
 * - Full-width observation cards with photos
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderHolePage(
  doc: jsPDF,
  holeNumber: number,
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obs: any[],
  photos: (string | null)[],
  labels: Record<string, string>,
  profileName: string | null,
  isFirstPage: boolean
) {
  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const margin = 14;
  const headerHeight = 25;
  const footerHeight = 10;
  const contentBottom = pageHeight - footerHeight;

  if (!isFirstPage) doc.addPage();

  // ── PAGE 1: Hole overview ──
  renderHeader(doc, holeNumber, type, profileName);

  // Dark background for image area
  const imgAreaY = headerHeight + 2;
  const imgAreaH = 95;
  doc.setFillColor(20, 30, 25);
  doc.rect(0, imgAreaY, pageWidth, imgAreaH, "F");

  // Center hole image within the dark area
  const holeImage = type === "hole" ? loadHoleImage(holeNumber) : loadGreenImage(holeNumber);
  if (holeImage) {
    try {
      // Calculate aspect-fit dimensions
      const maxImgH = imgAreaH - 6;
      const maxImgW = 80;
      doc.addImage(holeImage, "PNG", pageWidth / 2 - maxImgW / 2, imgAreaY + 3, maxImgW, maxImgH);
    } catch {
      doc.setFontSize(20);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(`Hole ${holeNumber}`, pageWidth / 2, imgAreaY + imgAreaH / 2, { align: "center" });
    }
  } else {
    doc.setFontSize(20);
    doc.setTextColor(100, 160, 120);
    doc.text(`Hole ${holeNumber}`, pageWidth / 2, imgAreaY + imgAreaH / 2, { align: "center" });
  }

  // Draw pin markers on the image
  if (holeImage) {
    const maxImgH = imgAreaH - 6;
    const maxImgW = 80;
    const imgX = pageWidth / 2 - maxImgW / 2;
    const imgY = imgAreaY + 3;
    obs.forEach((observation: { pin_x: number; pin_y: number; priority: string }, idx: number) => {
      if (observation.pin_x == null || observation.pin_y == null) return;
      const pinX = imgX + observation.pin_x * maxImgW;
      const pinY = imgY + observation.pin_y * maxImgH;
      const pColor = priorityColors[observation.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.circle(pinX, pinY, 3, "F");
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(0.5);
      doc.circle(pinX, pinY, 3, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...WHITE);
      doc.text(`${idx + 1}`, pinX, pinY + 0.8, { align: "center" });
    });
  }

  // ── Stats bar ──
  const statsY = imgAreaY + imgAreaH + 2;
  const statsH = 14;
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(margin, statsY, pageWidth - margin * 2, statsH, 2, 2, "FD");

  const openCount = obs.filter((o: { status: string }) => o.status !== "resolved").length;
  const criticalCount = obs.filter((o: { priority: string; status: string }) => o.priority === "critical" && o.status !== "resolved").length;
  const highCount = obs.filter((o: { priority: string; status: string }) => o.priority === "high" && o.status !== "resolved").length;
  const resolvedCount = obs.filter((o: { status: string }) => o.status === "resolved").length;

  const statItems = [
    { label: "Total Issues", value: obs.length.toString(), color: BRAND_DARK },
    { label: "Open", value: openCount.toString(), color: [220, 38, 38] as [number, number, number] },
    { label: "Critical", value: criticalCount.toString(), color: [185, 28, 28] as [number, number, number] },
    { label: "High", value: highCount.toString(), color: [234, 88, 12] as [number, number, number] },
    { label: "Resolved", value: resolvedCount.toString(), color: [22, 163, 74] as [number, number, number] },
  ];
  const barW = pageWidth - margin * 2;
  const statColW = barW / statItems.length;
  statItems.forEach((stat, i) => {
    const sx = margin + statColW * i + statColW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, sx, statsY + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_600);
    doc.text(stat.label, sx, statsY + 10.5, { align: "center" });
  });

  // ── Observation cards (full width below stats) ──
  let cy = statsY + statsH + 4;
  const cardW = pageWidth - margin * 2;
  const photoW = 40;
  const photoH = 30;
  let continuationCount = 0;

  if (obs.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_400);
    doc.text("No observations recorded for this hole.", pageWidth / 2, cy + 10, { align: "center" });
    return;
  }

  for (let i = 0; i < obs.length; i++) {
    const observation = obs[i];
    const photo = photos[i];
    const cardMinH = photo ? Math.max(photoH + 4, 18) : 14;

    // Check if we need a new page
    if (cy + cardMinH > contentBottom) {
      doc.addPage();
      continuationCount++;
      renderHeader(doc, holeNumber, type, profileName, `(cont. ${continuationCount})`);
      cy = headerHeight + 4;
    }

    // ── Priority accent bar (thin left border) ──
    const pColor = priorityColors[observation.priority] || GRAY_600;
    doc.setFillColor(...pColor);
    doc.rect(margin, cy, 2, cardMinH, "F");

    // Light card background
    doc.setFillColor(252, 252, 253);
    doc.setDrawColor(235, 235, 240);
    doc.rect(margin + 2, cy, cardW - 2, cardMinH, "FD");

    // ── Card content ──
    const cx = margin + 5;
    let ty = cy + 4;

    // Title row
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_DARK);
    const titleText = `#${i + 1}  ${observation.title || "Untitled"}`;
    doc.text(titleText.substring(0, 60), cx, ty);

    // Priority + Status badges on right
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...pColor);
    const badgeText = `${observation.priority.toUpperCase()}`;
    doc.text(badgeText, margin + cardW - 4, ty, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_400);
    const statusText = statusLabels[observation.status] || observation.status;
    doc.text(statusText, margin + cardW - 4, ty + 3.5, { align: "right" });

    ty += 4;

    // Meta line: type | date | reporter
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY_600);
    const issueLabel = labels[observation.issue_type] || observation.issue_type;
    const reportDate = new Date(observation.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const reporterName = observation.reporter?.full_name || "Unknown";
    doc.text(`${issueLabel}  \u00B7  ${reportDate}  \u00B7  ${reporterName}`, cx, ty);
    ty += 3.5;

    // Photo + description side by side
    if (photo) {
      const photoX = cx;
      const photoY = ty;
      try {
        const imgFormat = photo.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(photo, imgFormat, photoX, photoY, photoW, photoH);
      } catch {
        doc.setFillColor(240, 240, 240);
        doc.rect(photoX, photoY, photoW, photoH, "F");
      }

      // Text next to photo
      const textX = photoX + photoW + 4;
      const textW = cardW - photoW - 12;
      let textY = photoY + 1;

      if (observation.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 70);
        const descLines = doc.splitTextToSize(observation.description, textW);
        doc.text(descLines.slice(0, 5), textX, textY);
        textY += Math.min(descLines.length, 5) * 3;
      }

      if (observation.fix_instructions) {
        textY += 1;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(180, 83, 9);
        doc.text("Recommended Action:", textX, textY);
        textY += 3;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 80, 50);
        const fixLines = doc.splitTextToSize(observation.fix_instructions, textW);
        doc.text(fixLines.slice(0, 4), textX, textY);
      }

      cy += Math.max(photoH + 4, cardMinH) + 3;
    } else {
      // No photo — description only
      if (observation.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 70);
        const descLines = doc.splitTextToSize(observation.description, cardW - 10);
        doc.text(descLines.slice(0, 3), cx, ty);
        ty += Math.min(descLines.length, 3) * 3;
      }
      if (observation.fix_instructions) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(180, 83, 9);
        doc.text("Fix: ", cx, ty);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 80, 50);
        const fixLines = doc.splitTextToSize(observation.fix_instructions, cardW - 18);
        doc.text(fixLines.slice(0, 2), cx + 8, ty);
      }
      cy += cardMinH + 3;
    }
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
    const holeParam = url.searchParams.get("hole");
    const type = url.searchParams.get("type") || "hole";

    // Determine which holes to generate
    // If a specific hole is given, generate just that one; otherwise generate all 18
    let holeNumbers: number[];
    if (holeParam) {
      const h = parseInt(holeParam);
      if (!h || h < 1 || h > 18) {
        return NextResponse.json({ error: "Invalid hole number" }, { status: 400 });
      }
      holeNumbers = [h];
    } else {
      holeNumbers = Array.from({ length: 18 }, (_, i) => i + 1);
    }

    // Fetch profile for header
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const labels = (type === "green" ? greenIssueTypeLabels : issueTypeLabels) as Record<string, string>;
    const table = type === "green" ? "green_observations" : "hole_observations";

    // Fetch all observations for the requested holes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allObservations, error } = await (supabase.from(table) as any)
      .select(`
        *,
        reporter:profiles!reported_by(id, full_name, avatar_url, role)
      `)
      .in("hole_number", holeNumbers)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch observations" }, { status: 500 });
    }

    const allObs = allObservations || [];

    // Group observations by hole number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obsByHole: Record<number, any[]> = {};
    for (const h of holeNumbers) {
      obsByHole[h] = allObs.filter((o: { hole_number: number }) => o.hole_number === h);
    }

    // Pre-fetch ALL photos in parallel using authenticated Supabase client
    const allPhotoUrls = allObs.map((o: { photo_url: string | null }) => o.photo_url);
    const allPhotoResults = await Promise.all(
      allPhotoUrls.map((photoUrl: string | null) =>
        photoUrl ? fetchPhotoViaSupabase(supabase, photoUrl) : Promise.resolve(null)
      )
    );

    // Build a map from observation id to photo
    const photoMap = new Map<string, string | null>();
    allObs.forEach((o: { id: string }, idx: number) => {
      photoMap.set(o.id, allPhotoResults[idx]);
    });

    // ── PDF Setup — Landscape A4 ──
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // Render each hole as its own page
    for (let hi = 0; hi < holeNumbers.length; hi++) {
      const holeNum = holeNumbers[hi];
      const holeObs = obsByHole[holeNum];
      const holePhotos = holeObs.map((o: { id: string }) => photoMap.get(o.id) || null);

      renderHolePage(
        doc,
        holeNum,
        type,
        holeObs,
        holePhotos,
        labels,
        profile?.full_name || null,
        hi === 0 // first page doesn't need addPage
      );
    }

    // ── PARTS TO ORDER SUMMARY PAGE ──
    // Fetch all equipment parts with status "needed" across all equipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: neededParts } = await (supabase.from("equipment_parts") as any)
      .select("*, equipment:equipment!equipment_id(id, name, equipment_type)")
      .eq("status", "needed")
      .order("created_at", { ascending: false });

    if (neededParts && neededParts.length > 0) {
      doc.addPage();
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const m = 12;
      const hh = 28;

      // Header
      doc.setFillColor(...BRAND_DARK);
      doc.rect(0, 0, pw, hh, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, hh, pw, 1.2, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...WHITE);
      doc.text("Parts To Order", m, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_GOLD);
      doc.text("Purchase Request Summary", m, 19);

      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      const partsDateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      doc.text(partsDateStr, pw - m, 12, { align: "right" });
      if (profile?.full_name) {
        doc.text(`Prepared by: ${profile.full_name}`, pw - m, 19, { align: "right" });
      }

      // Table header
      let py = hh + 6;
      const colX = [m, m + 75, m + 140, m + 190, m + 215, m + 245];
      const colLabels = ["Equipment", "Part Name", "Part #", "Qty", "Est. Cost", "Notes"];

      doc.setFillColor(245, 247, 250);
      doc.rect(m, py - 1, pw - m * 2, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND_DARK);
      colLabels.forEach((label, i) => {
        doc.text(label, colX[i], py + 3.5);
      });
      py += 8;

      // Table rows
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      let totalCost = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const part of neededParts as any[]) {
        if (py > ph - 20) {
          // Overflow to new page
          doc.addPage();
          py = m + 5;
          // Re-draw table header
          doc.setFillColor(245, 247, 250);
          doc.rect(m, py - 1, pw - m * 2, 7, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(...BRAND_DARK);
          colLabels.forEach((label, i) => {
            doc.text(label, colX[i], py + 3.5);
          });
          py += 8;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
        }

        doc.setTextColor(...GRAY_600);
        const equipName = part.equipment?.name || "Unknown";
        doc.text(equipName.substring(0, 35), colX[0], py);
        doc.text(part.name.substring(0, 30), colX[1], py);
        doc.text(part.part_number || "-", colX[2], py);
        doc.text(String(part.quantity || 1), colX[3], py);
        const cost = part.estimated_cost != null ? `$${Number(part.estimated_cost).toFixed(2)}` : "-";
        doc.text(cost, colX[4], py);
        if (part.estimated_cost != null) totalCost += Number(part.estimated_cost) * (part.quantity || 1);
        const notes = part.delay_reason || part.description || "";
        doc.text(notes.substring(0, 25), colX[5], py);

        py += 5;

        // Light divider
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.15);
        doc.line(m, py - 1.5, pw - m, py - 1.5);
      }

      // Total row
      py += 3;
      doc.setDrawColor(...BRAND_DARK);
      doc.setLineWidth(0.5);
      doc.line(m, py - 1, pw - m, py - 1);
      py += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND_DARK);
      doc.text(`Total Parts: ${neededParts.length}`, m, py);
      doc.text(`Estimated Total: $${totalCost.toFixed(2)}`, colX[4] - 20, py);
    }

    // ── FOOTER on all pages ──
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
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
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - 12, pageHeight - 5, { align: "right" });
    }

    // Output
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = holeNumbers.length === 1
      ? `Hole-${holeNumbers[0]}-${type === "green" ? "Green" : "Fairway"}-Report-${new Date().toISOString().split("T")[0]}.pdf`
      : `All-Holes-${type === "green" ? "Green" : "Fairway"}-Report-${new Date().toISOString().split("T")[0]}.pdf`;

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
