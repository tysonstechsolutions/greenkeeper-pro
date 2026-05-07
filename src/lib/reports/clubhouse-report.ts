/**
 * Clubhouse Condition Report — client-side PDF generator.
 *
 * Ported from /api/reports/clubhouse-report. Landscape PDF with cover,
 * summary + category breakdown, master table, per-active-issue detail
 * page, signature page.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import { getCachedUserId } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const RED: [number, number, number] = [220, 38, 38];
const ORANGE: [number, number, number] = [234, 88, 12];
const BLUE: [number, number, number] = [59, 130, 246];
const PURPLE: [number, number, number] = [168, 85, 247];
const WHITE: [number, number, number] = [255, 255, 255];

const categoryLabels: Record<string, string> = {
  damage: "Damage",
  cleaning: "Cleaning",
  orders: "Orders",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

const categoryColors: Record<string, [number, number, number]> = {
  damage: RED,
  cleaning: BLUE,
  orders: PURPLE,
  maintenance: ORANGE,
  unknown: GRAY_400,
};

const priorityLabels: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const priorityColors: Record<string, [number, number, number]> = {
  urgent: RED,
  high: ORANGE,
  medium: [251, 146, 60],
  low: [34, 197, 94],
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  ordered: "Ordered",
  completed: "Completed",
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

export class ClubhouseReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "ClubhouseReportError";
  }
}

export async function generateClubhouseReport(): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const supabase = createClient();

    step = "auth";
    // Cached user-id read avoids the supabase.auth.getUser() wedge.
    const userId = getCachedUserId();
    if (!userId) throw new ClubhouseReportError(step, "Not signed in");

    step = "profile";
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role").eq("id", userId).single();

    step = "fetch-issues";
    const { data: items, error: fetchErr } = await supabase.from("clubhouse_issues")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (fetchErr) throw new ClubhouseReportError(step, fetchErr.message);
    if (!items || items.length === 0) {
      throw new ClubhouseReportError("no-data", "No issues found");
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
    doc.text("Clubhouse Condition Report", m + 5, 24);

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
    doc.text(items.length + " Issues", pw - m - 5, 40, { align: "right" });

    let y = 62;
    const open = items.filter((i: any) => i.status === "open").length;
    const inProgress = items.filter((i: any) => i.status === "in_progress").length;
    const ordered = items.filter((i: any) => i.status === "ordered").length;
    const completed = items.filter((i: any) => i.status === "completed").length;
    const urgent = items.filter((i: any) => i.priority === "urgent").length;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Issues Summary", m + 5, y);
    y += 8;

    const statBoxW = (pw - m * 2 - 40) / 5;
    const stats: Array<{ label: string; val: number; color: [number, number, number] }> = [
      { label: "Open", val: open, color: BLUE },
      { label: "In Progress", val: inProgress, color: ORANGE },
      { label: "Ordered", val: ordered, color: PURPLE },
      { label: "Completed", val: completed, color: [34, 197, 94] },
      { label: "Urgent", val: urgent, color: RED },
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

    // Category breakdown
    const damage = items.filter((i: any) => i.category === "damage").length;
    const cleaning = items.filter((i: any) => i.category === "cleaning").length;
    const orders = items.filter((i: any) => i.category === "orders").length;
    const maintenance = items.filter((i: any) => i.category === "maintenance").length;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Category Breakdown", m + 5, y);
    y += 8;

    const catBoxW = (pw - m * 2 - 30) / 4;
    const categories: Array<{ label: string; val: number; color: [number, number, number] }> = [
      { label: "Damage", val: damage, color: RED },
      { label: "Cleaning", val: cleaning, color: BLUE },
      { label: "Orders", val: orders, color: PURPLE },
      { label: "Maintenance", val: maintenance, color: ORANGE },
    ];

    categories.forEach((cat, i) => {
      const x = m + 5 + i * (catBoxW + 8);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, y, catBoxW, 24, 3, 3, "FD");
      doc.setFillColor(...cat.color);
      doc.rect(x, y, catBoxW, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...cat.color);
      doc.text(String(cat.val), x + catBoxW / 2, y + 13, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(cat.label, x + catBoxW / 2, y + 19, { align: "center" });
    });
    y += 32;

    step = "pdf-table";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Issues Inventory", m + 5, y);
    y += 6;

    const rows = items.map((issue: any) => {
      const catLabel = categoryLabels[issue.category] || s(issue.category);
      const priLabel = priorityLabels[issue.priority] || s(issue.priority);
      const statLabel = statusLabels[issue.status] || s(issue.status);
      return [
        s(issue.title),
        s(issue.location),
        catLabel,
        priLabel,
        statLabel,
        s(issue.assigned_to),
        issue.estimated_cost != null ? "$" + Number(issue.estimated_cost).toFixed(2) : "—",
        issue.created_at ? new Date(issue.created_at).toLocaleDateString("en-US") : "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Title", "Location", "Category", "Priority", "Status", "Assigned To", "Est. Cost", "Date"]],
      body: rows,
      margin: { left: m + 3, right: m + 3 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: BRAND_DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { halign: "center" as const, cellWidth: 22 },
        4: { halign: "center" as const, cellWidth: 25 },
        5: { cellWidth: 30 },
        6: { halign: "right" as const, cellWidth: 20 },
        7: { halign: "center" as const, cellWidth: 25 },
      },
    });

    // ── PER-ISSUE DETAIL PAGES (active only) ──
    step = "pdf-details";
    const detailIssues = items.filter((i: any) =>
      i.status === "open" || i.status === "in_progress" || i.status === "ordered"
    );

    for (let idx = 0; idx < detailIssues.length; idx++) {
      const issue = detailIssues[idx];
      const catLabel = categoryLabels[issue.category] || s(issue.category);
      const catColor = categoryColors[issue.category] || GRAY_400;
      const priLabel = priorityLabels[issue.priority] || s(issue.priority);
      const priColor = priorityColors[issue.priority] || GRAY_400;
      const statLabel = statusLabels[issue.status] || s(issue.status);
      const photo = photoMap.get(issue.id) || null;

      doc.addPage();

      doc.setFillColor(...catColor);
      doc.rect(0, 0, pw, 22, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, 22, pw, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text(s(issue.title, "Unnamed Issue"), m + 4, 14);

      const badgeText = priLabel.toUpperCase();
      doc.setFontSize(10);
      const badgeW = doc.getTextWidth(badgeText) + 12;
      doc.setFillColor(...WHITE);
      doc.roundedRect(pw - m - badgeW - 2, 6, badgeW, 10, 3, 3, "F");
      doc.setTextColor(...priColor);
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
      doc.setTextColor(...catColor);
      doc.text(catLabel, rightX, ry + 5);
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
      detailRow("Category:", catLabel);
      detailRow("Priority:", priLabel);
      detailRow("Status:", statLabel);
      detailRow("Assigned To:", s(issue.assigned_to));
      detailRow(
        "Estimated Cost:",
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
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY_600);
        doc.text("Description:", rightX, ry);
        ry += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        const descLines = doc.splitTextToSize(issue.description, halfW - 10);
        doc.text(descLines.slice(0, 3), rightX, ry);
        ry += Math.min(descLines.length, 3) * 3.5;
      }

      let by = Math.max(contentTop + 118, ry + 5);

      if (issue.repair_notes) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...BRAND_GREEN);
        doc.text("REPAIR NOTES", m + 4, by + 4);
        by += 6;

        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(134, 239, 172);
        doc.roundedRect(m, by, pw - m * 2, 24, 3, 3, "FD");
        doc.setFillColor(...BRAND_GREEN);
        doc.rect(m, by, 3, 24, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        const noteLines = doc.splitTextToSize(issue.repair_notes, pw - m * 2 - 10);
        doc.text(noteLines.slice(0, 4), m + 8, by + 5);
        by += 28;
      }

      if (issue.notes) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        const noteLines = doc.splitTextToSize("Internal Notes: " + issue.notes, pw - m * 2 - 10);
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
      "I certify that the clubhouse conditions documented in this report are accurate to the best of my knowledge.",
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
      `Total Issues: ${items.length}  |  Open: ${open}  |  In Progress: ${inProgress}  |  Ordered: ${ordered}  |  Completed: ${completed}  |  Urgent: ${urgent}`,
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
    const filename = "vmgc-clubhouse-report-" + todayLocal() + ".pdf";

    return { blob, filename };
  } catch (err) {
    if (err instanceof ClubhouseReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Clubhouse report error at step [${step}]:`, msg, err);
    throw new ClubhouseReportError(step, msg);
  }
}

export async function downloadClubhouseReport(): Promise<void> {
  const { blob, filename } = await generateClubhouseReport();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
