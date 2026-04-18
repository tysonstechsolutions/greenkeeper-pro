/**
 * Parking Lot & Cart Path Report — client-side PDF generator.
 *
 * Ported from /api/reports/parking-lot-report. Landscape PDF with cover,
 * master issues table, per-active-issue detail page (photo left, details
 * right), and a signature page.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const RED: [number, number, number] = [220, 38, 38];
const ORANGE: [number, number, number] = [234, 88, 12];
const WHITE: [number, number, number] = [255, 255, 255];

const severityLabels: Record<string, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface ParkingLotReportOptions {
  status?: string | null;
}

export class ParkingLotReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "ParkingLotReportError";
  }
}

export async function generateParkingLotReport(
  options: ParkingLotReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const supabase = createClient();

    step = "auth";
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new ParkingLotReportError(step, "Not signed in");

    step = "profile";
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role").eq("id", user.id).single();

    step = "fetch-issues";
    let query = supabase.from("parking_lot_issues")
      .select("*")
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });
    if (options.status) query = query.eq("status", options.status);

    const { data: items, error: fetchErr } = await query;
    if (fetchErr) throw new ParkingLotReportError(step, fetchErr.message);
    if (!items || items.length === 0) {
      throw new ParkingLotReportError("no-data", "No parking lot issues found");
    }

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

    step = "pdf-init";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 12;

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    // ── COVER ──
    step = "pdf-cover";
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 50, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 50, pw, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...WHITE);
    doc.text("Parking Lot & Cart Path Report", m + 5, 24);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Vehicle & Machinery Grounds Committee", m + 5, 35);

    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.text(dateStr, pw - m - 5, 20, { align: "right" });
    if (profile?.full_name) {
      doc.text("Prepared by: " + profile.full_name, pw - m - 5, 30, { align: "right" });
    }
    doc.text(items.length + " Issues Reported", pw - m - 5, 40, { align: "right" });

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

    const statBoxW = (pw - m * 2 - 40) / 5;
    const stats: Array<{ label: string; val: number; color: [number, number, number] }> = [
      { label: "Open", val: open, color: RED },
      { label: "In Progress", val: inProgress, color: ORANGE },
      { label: "Scheduled", val: scheduled, color: [202, 138, 4] },
      { label: "Completed", val: completed, color: [22, 163, 74] },
      { label: "Critical", val: critical, color: [139, 0, 0] },
    ];

    stats.forEach((st, i) => {
      const x = m + 5 + i * (statBoxW + 8);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, y, statBoxW, 28, 3, 3, "FD");
      doc.setFillColor(...st.color);
      doc.rect(x, y, statBoxW, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(...st.color);
      doc.text(String(st.val), x + statBoxW / 2, y + 16, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(st.label, x + statBoxW / 2, y + 23, { align: "center" });
    });
    y += 38;

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

    // ── PER-ISSUE DETAIL PAGES (active only) ──
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

      doc.setFillColor(...BRAND_DARK);
      doc.rect(0, 0, pw, 22, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, 22, pw, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text(s(issue.title, "Unnamed Issue"), m + 4, 14);

      doc.setFontSize(10);
      const badgeText = sevLabel.toUpperCase();
      const badgeW = doc.getTextWidth(badgeText) + 12;
      doc.setFillColor(...WHITE);
      doc.roundedRect(pw - m - badgeW - 2, 6, badgeW, 10, 3, 3, "F");
      doc.setTextColor(...sevColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(badgeText, pw - m - badgeW / 2 - 2, 13, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 200, 200);
      doc.text(`${idx + 1} of ${detailIssues.length}`, pw - m - 4, 20, { align: "right" });

      const contentTop = 30;
      const halfW = (pw - m * 2 - 10) / 2;
      const leftX = m;
      const rightX = m + halfW + 10;

      if (photo) {
        try {
          const fmt = photo.includes("image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, fmt, leftX, contentTop, halfW, 110);
        } catch { /* skip */ }
      } else {
        doc.setFillColor(243, 244, 246);
        doc.setDrawColor(209, 213, 219);
        doc.roundedRect(leftX, contentTop, halfW, 110, 4, 4, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...GRAY_400);
        doc.text("No Photo Available", leftX + halfW / 2, contentTop + 55, { align: "center" });
      }

      let ry = contentTop;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(typeLabels[issue.issue_type] || s(issue.issue_type), rightX, ry + 5);
      ry += 10;

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
      detailRow(
        "Est. Cost:",
        issue.estimated_cost != null ? "$" + Number(issue.estimated_cost).toFixed(2) : "—",
      );
      detailRow(
        "Reported:",
        issue.created_at ? new Date(issue.created_at).toLocaleDateString("en-US") : "—",
      );
      ry += 2;

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

      let by = Math.max(contentTop + 118, ry + 5);

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

      if (issue.notes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const noteLines = doc.splitTextToSize("Additional Notes: " + issue.notes, pw - m * 2 - 10);
        doc.text(noteLines.slice(0, 3), m + 4, by + 4);
        by += Math.min(noteLines.length, 3) * 3.5 + 6;
      }
    }

    // ── SIGNATURE ──
    step = "pdf-signatures";
    doc.addPage();

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
      m + 4, y,
    );
    y += 15;

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
      `Total Issues: ${items.length}  |  Open: ${open}  |  In Progress: ${inProgress}  |  Scheduled: ${scheduled}  |  Completed: ${completed}  |  Critical: ${critical}`,
      m + 4,
      y,
    );

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

    step = "pdf-output";
    const blob = doc.output("blob") as Blob;
    const filename = "vmgc-parking-lot-report-" + new Date().toISOString().slice(0, 10) + ".pdf";

    return { blob, filename };
  } catch (err) {
    if (err instanceof ParkingLotReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Parking lot report error at step [${step}]:`, msg, err);
    throw new ParkingLotReportError(step, msg);
  }
}

export async function downloadParkingLotReport(
  options: ParkingLotReportOptions = {},
): Promise<void> {
  const { blob, filename } = await generateParkingLotReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
