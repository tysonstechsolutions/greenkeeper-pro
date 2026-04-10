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
const severityLabels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const severityColors: Record<string, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  medium: [202, 138, 4],
  low: [22, 163, 74],
};
const typeLabels: Record<string, string> = {
  pothole: "Pothole",
  crack: "Crack",
  drainage: "Drainage Issue",
  marking: "Line Marking",
  surface_damage: "Surface Damage",
  lighting: "Lighting",
  signage: "Signage",
  vegetation: "Vegetation",
  other: "Other",
};
const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  scheduled: "Scheduled",
  completed: "Completed",
  on_hold: "On Hold",
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
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role").eq("id", user.id).single();

    // ── FETCH PARKING LOT ISSUES ──
    step = "fetch-issues";
    const url = new URL(request.url);
    const filterStatus = url.searchParams.get("status");

    let query = supabase.from("parking_lot_issues")
      .select("*")
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });
    if (filterStatus) query = query.eq("status", filterStatus);

    const { data: items, error: fetchErr } = await query;
    if (fetchErr) {
      return NextResponse.json({ error: "DB error", details: fetchErr.message }, { status: 500 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No parking lot issues found" }, { status: 404 });
    }

    // ── FETCH PHOTOS (parallel) ──
    step = "photos";
    const photoMap = new Map<string, string | null>();
    const fetches = items.map(async (issue: any) => {
      const photoUrl = (issue.photos && issue.photos.length > 0) ? issue.photos[0] : issue.photo_url;
      if (photoUrl) {
        const data = await fetchPhoto(photoUrl);
        photoMap.set(issue.id, data);
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
    doc.text("Parking Lot & Cart Path Report", m + 5, 24);

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
    doc.text(items.length + " Issues Reported", pw - m - 5, 40, { align: "right" });

    // Summary stats
    let y = 62;
    const open = items.filter((i: any) => i.status === "open").length;
    const inProgress = items.filter((i: any) => i.status === "in_progress").length;
    const scheduled = items.filter((i: any) => i.status === "scheduled").length;
    const completed = items.filter((i: any) => i.status === "completed").length;
    const critical = items.filter((i: any) => i.severity === "critical").length;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Issues Summary", m + 5, y);
    y += 8;

    // Stat boxes
    const statBoxW = (pw - m * 2 - 40) / 5;
    const stats = [
      { label: "Open", val: open, color: RED },
      { label: "In Progress", val: inProgress, color: ORANGE },
      { label: "Scheduled", val: scheduled, color: [202, 138, 4] },
      { label: "Completed", val: completed, color: [22, 163, 74] },
      { label: "Critical", val: critical, color: [139, 0, 0] },
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
      // Number
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(...(st.color as [number, number, number]));
      doc.text(String(st.val), x + statBoxW / 2, y + 16, { align: "center" });
      // Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(st.label, x + statBoxW / 2, y + 23, { align: "center" });
    });
    y += 38;

    // Master issues table
    step = "pdf-table";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Parking Lot Issues", m + 5, y);
    y += 6;

    const rows = items.map((issue: any) => {
      const sev = issue.severity || "unknown";
      return [
        s(issue.title),
        s(issue.location),
        typeLabels[issue.issue_type] || s(issue.issue_type),
        severityLabels[sev] || sev,
        statusLabels[issue.status] || s(issue.status),
        issue.estimated_cost != null ? "$" + Number(issue.estimated_cost).toFixed(2) : "—",
        issue.created_at ? new Date(issue.created_at).toLocaleDateString("en-US") : "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Title", "Location", "Type", "Severity", "Status", "Est. Cost", "Date"]],
      body: rows,
      margin: { left: m + 3, right: m + 3 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: BRAND_DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { cellWidth: 45 },
        2: { cellWidth: 35 },
        3: { halign: "center" as const, cellWidth: 20 },
        4: { halign: "center" as const, cellWidth: 20 },
        5: { halign: "right" as const, cellWidth: 20 },
        6: { halign: "center" as const, cellWidth: 22 },
      },
    });

    // ══════════════════════════════════════
    // INDIVIDUAL ISSUE PAGES
    // Like a PowerPoint slide: photo left, details right
    // Only for open, in_progress, and scheduled issues
    // ══════════════════════════════════════
    step = "pdf-details";

    const detailIssues = items.filter((issue: any) =>
      issue.status === "open" || issue.status === "in_progress" || issue.status === "scheduled"
    );

    for (let idx = 0; idx < detailIssues.length; idx++) {
      const issue = detailIssues[idx];
      const sev = issue.severity || "low";
      const sevLabel = severityLabels[sev] || sev;
      const sevColor = severityColors[sev] || GRAY_400;
      const issueStatus = statusLabels[issue.status] || issue.status || "Unknown";
      const photo = photoMap.get(issue.id) || null;

      doc.addPage();

      // ── TOP HEADER BAR ──
      doc.setFillColor(...BRAND_DARK);
      doc.rect(0, 0, pw, 22, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, 22, pw, 1.5, "F");

      // Issue title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text(s(issue.title, "Unnamed Issue"), m + 4, 14);

      // Severity badge on right
      doc.setFontSize(10);
      const badgeText = sevLabel.toUpperCase();
      const badgeW = doc.getTextWidth(badgeText) + 12;
      doc.setFillColor(...WHITE);
      doc.roundedRect(pw - m - badgeW - 2, 6, badgeW, 10, 3, 3, "F");
      doc.setTextColor(...sevColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(badgeText, pw - m - badgeW / 2 - 2, 13, { align: "center" });

      // Page item number
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 200, 200);
      doc.text(`${idx + 1} of ${detailIssues.length}`, pw - m - 4, 20, { align: "right" });

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
      doc.text(typeLabels[issue.issue_type] || s(issue.issue_type), rightX, ry + 5);
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

      detailRow("Location:", s(issue.location));
      detailRow("Severity:", sevLabel);
      detailRow("Status:", issueStatus);
      detailRow("Est. Cost:", issue.estimated_cost != null ? "$" + Number(issue.estimated_cost).toFixed(2) : "—");
      detailRow("Reported:", issue.created_at ? new Date(issue.created_at).toLocaleDateString("en-US") : "—");
      ry += 2;

      // Description
      if (issue.description) {
        doc.setDrawColor(229, 231, 235);
        doc.line(rightX, ry - 2, rightX + halfW - 5, ry - 2);
        ry += 2;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const descLines = doc.splitTextToSize(issue.description, halfW - 10);
        doc.text(descLines.slice(0, 4), rightX, ry);
        ry += Math.min(descLines.length, 4) * 4 + 4;
      }

      // ── BOTTOM SECTIONS (full width) ──
      let by = Math.max(contentTop + 118, ry + 5);

      // ── REPAIR NOTES SECTION ──
      if (issue.repair_notes) {
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(m, by, pw - m * 2, 18, 3, 3, "FD");
        doc.setFillColor(...BRAND_GREEN);
        doc.rect(m, by, 3, 18, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...BRAND_GREEN);
        doc.text("REPAIR NOTES", m + 8, by + 8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        const noteLines = doc.splitTextToSize(s(issue.repair_notes), pw - m * 2 - 16);
        doc.text(noteLines.slice(0, 1), m + 8, by + 14);
        by += 22;
      }

      // Notes
      if (issue.notes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const noteLines = doc.splitTextToSize("Additional Notes: " + issue.notes, pw - m * 2 - 10);
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
      "I certify that the parking lot and cart path conditions documented in this report are accurate to the best of my knowledge.",
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
    doc.text(`Total Issues: ${items.length}  |  Open: ${open}  |  In Progress: ${inProgress}  |  Scheduled: ${scheduled}  |  Completed: ${completed}  |  Critical: ${critical}`, m + 4, y);

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
    const fname = "vmgc-parking-lot-report-" + new Date().toISOString().slice(0, 10) + ".pdf";

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
    console.error("Parking lot report error at step [" + step + "]:", msg, err);
    return NextResponse.json({ error: "Failed at: " + step, details: msg }, { status: 500 });
  }
}
