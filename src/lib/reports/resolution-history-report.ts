/**
 * Resolution History Report — a printable record of every resolved course
 * issue with the before photo, after photos, what was done, and who did it.
 *
 * This is the "proof of work" report — meant to be shared with directors,
 * GMs, or kept on file to document everything that's been fixed since the
 * superintendent took over.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import {
  directSelectList,
  getCachedUserId,
} from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import { issueTypeLabels } from "@/lib/hole-constants";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import type {
  HoleIssueType,
  HoleObservation,
  GreenIssueType,
  GreenObservation,
} from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const GRAY_200: [number, number, number] = [229, 231, 235];
const EMERALD_600: [number, number, number] = [5, 150, 105];
const EMERALD_50: [number, number, number] = [236, 253, 245];

const priorityColors: Record<string, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  normal: [37, 99, 235],
  low: [107, 114, 128],
};

interface ResolvedItem {
  surface: "Hole" | "Green";
  id: string;
  hole_number: number;
  title: string;
  issueLabel: string;
  priority: string;
  description: string | null;
  fix_instructions: string | null;
  before_photo_url: string | null;
  resolution_photos: string[];
  resolution_notes: string | null;
  resolved_at: string;
  resolved_by: string | null;
  reported_by: string | null;
  reporter_name: string | null;
  resolver_name: string | null;
  created_at: string;
}

async function fetchImageAsDataURL(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export class ResolutionHistoryReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "ResolutionHistoryReportError";
  }
}

export interface ResolutionHistoryReportOptions {
  /** Optional: only include items resolved on or after this ISO date. */
  fromDate?: string;
  /** Optional: only include items resolved on or before this ISO date. */
  toDate?: string;
  /** Optional: filter to a single hole number. */
  holeNumber?: number;
  /** Optional: filter to a single surface. */
  surface?: "hole" | "green";
  /** If true, only include items that have at least one resolution photo. Default: false. */
  withPhotosOnly?: boolean;
}

export async function generateResolutionHistoryReport(
  options: ResolutionHistoryReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const supabase = createClient();

    step = "auth";
    const userId = getCachedUserId();
    if (!userId) {
      throw new ResolutionHistoryReportError(step, "Not signed in");
    }

    step = "fetch-profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    // ── Fetch resolved observations ──
    const filters: string[] = ["status=eq.resolved"];
    if (options.fromDate) {
      filters.push(`resolved_at=gte.${encodeURIComponent(options.fromDate)}`);
    }
    if (options.toDate) {
      filters.push(`resolved_at=lte.${encodeURIComponent(options.toDate)}`);
    }
    if (typeof options.holeNumber === "number") {
      filters.push(`hole_number=eq.${options.holeNumber}`);
    }

    step = "fetch-resolved-holes";
    let holeRows: HoleObservation[] = [];
    if (options.surface !== "green") {
      holeRows = await directSelectList<HoleObservation>("hole_observations", {
        columns:
          "*, reporter:profiles!reported_by(id, full_name)",
        filters,
        orderBy: [{ column: "resolved_at", ascending: false }],
        label: "resolution-history-report.fetchHoles",
      });
    }

    step = "fetch-resolved-greens";
    let greenRows: GreenObservation[] = [];
    if (options.surface !== "hole") {
      greenRows = await directSelectList<GreenObservation>(
        "green_observations",
        {
          columns:
            "*, reporter:profiles!reported_by(id, full_name)",
          filters,
          orderBy: [{ column: "resolved_at", ascending: false }],
          label: "resolution-history-report.fetchGreens",
        },
      );
    }

    // ── Resolve names for the resolved_by field (separate fetch) ──
    step = "fetch-resolver-names";
    const resolverIds = new Set<string>();
    for (const r of holeRows) if (r.resolved_by) resolverIds.add(r.resolved_by);
    for (const r of greenRows) if (r.resolved_by) resolverIds.add(r.resolved_by);

    const resolverNames: Record<string, string> = {};
    if (resolverIds.size > 0) {
      const profiles = await directSelectList<{ id: string; full_name: string }>(
        "profiles",
        {
          columns: "id, full_name",
          filters: [`id=in.(${Array.from(resolverIds).join(",")})`],
          label: "resolution-history-report.resolverNames",
        },
      );
      for (const p of profiles) resolverNames[p.id] = p.full_name;
    }

    // ── Build unified item list ──
    step = "build-items";
    const items: ResolvedItem[] = [];

    for (const h of holeRows) {
      if (!h.resolved_at) continue;
      items.push({
        surface: "Hole",
        id: h.id,
        hole_number: h.hole_number,
        title: h.title,
        issueLabel:
          issueTypeLabels[h.issue_type as HoleIssueType] || h.issue_type,
        priority: h.priority,
        description: h.description,
        fix_instructions: h.fix_instructions,
        before_photo_url: h.photo_url,
        resolution_photos: h.resolution_photos ?? [],
        resolution_notes: h.resolution_notes ?? null,
        resolved_at: h.resolved_at,
        resolved_by: h.resolved_by,
        reported_by: h.reported_by,
        reporter_name: h.reporter?.full_name ?? null,
        resolver_name: h.resolved_by ? resolverNames[h.resolved_by] ?? null : null,
        created_at: h.created_at,
      });
    }

    for (const g of greenRows) {
      if (!g.resolved_at) continue;
      items.push({
        surface: "Green",
        id: g.id,
        hole_number: g.hole_number,
        title: g.title,
        issueLabel:
          greenIssueTypeLabels[g.issue_type as GreenIssueType] || g.issue_type,
        priority: g.priority,
        description: g.description,
        fix_instructions: g.fix_instructions,
        before_photo_url: g.photo_url,
        resolution_photos: g.resolution_photos ?? [],
        resolution_notes: g.resolution_notes ?? null,
        resolved_at: g.resolved_at,
        resolved_by: g.resolved_by,
        reported_by: g.reported_by,
        reporter_name: g.reporter?.full_name ?? null,
        resolver_name: g.resolved_by ? resolverNames[g.resolved_by] ?? null : null,
        created_at: g.created_at,
      });
    }

    // Optional: only items with at least one resolution photo
    const filteredItems = options.withPhotosOnly
      ? items.filter((i) => i.resolution_photos.length > 0)
      : items;

    filteredItems.sort((a, b) => b.resolved_at.localeCompare(a.resolved_at));

    // ── Pre-fetch all photos as data URLs (parallel, with timeouts) ──
    step = "fetch-photos";
    const beforePhotoPromises = filteredItems.map((it) =>
      it.before_photo_url
        ? fetchImageAsDataURL(it.before_photo_url)
        : Promise.resolve(null),
    );
    const afterPhotoPromises = filteredItems.map((it) =>
      Promise.all(it.resolution_photos.map((u) => fetchImageAsDataURL(u))),
    );
    const [beforePhotos, afterPhotos] = await Promise.all([
      Promise.all(beforePhotoPromises),
      Promise.all(afterPhotoPromises),
    ]);

    // ── PDF init ──
    step = "pdf-init";
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addPage = () => {
      doc.addPage();
      y = margin;
    };

    const checkPageSpace = (needed: number) => {
      if (y + needed > pageHeight - 18) addPage();
    };

    // ── HEADER ──
    step = "pdf-header";
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, 36, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 36, pageWidth, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("Resolution History", margin, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Proof-of-Work Report — Before / After Photos", margin, 23);

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(dateStr, pageWidth - margin, 16, { align: "right" });
    if (profile?.full_name) {
      doc.text(`Prepared by: ${profile.full_name}`, pageWidth - margin, 23, {
        align: "right",
      });
    }
    doc.text(
      `${filteredItems.length} resolved issue${filteredItems.length === 1 ? "" : "s"}`,
      pageWidth - margin,
      30,
      { align: "right" },
    );

    y = 44;

    // ── Filter / scope summary ──
    step = "pdf-scope";
    const scopeLines: string[] = [];
    if (options.fromDate || options.toDate) {
      const from = options.fromDate
        ? new Date(options.fromDate).toLocaleDateString()
        : "the beginning";
      const to = options.toDate
        ? new Date(options.toDate).toLocaleDateString()
        : "today";
      scopeLines.push(`Date range: ${from} → ${to}`);
    } else if (filteredItems.length > 0) {
      const earliest = filteredItems.reduce(
        (a, b) => (a.resolved_at < b.resolved_at ? a : b),
        filteredItems[0],
      );
      scopeLines.push(
        `Earliest resolution: ${new Date(earliest.resolved_at).toLocaleDateString()}`,
      );
    }
    if (typeof options.holeNumber === "number") {
      scopeLines.push(`Hole filter: ${options.holeNumber}`);
    }
    if (options.surface) {
      scopeLines.push(`Surface filter: ${options.surface === "hole" ? "Holes only" : "Greens only"}`);
    }
    if (options.withPhotosOnly) {
      scopeLines.push("Showing items with at least one resolution photo");
    }

    if (scopeLines.length > 0) {
      checkPageSpace(scopeLines.length * 5 + 6);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      scopeLines.forEach((line) => {
        doc.text(line, margin, y);
        y += 4.5;
      });
      y += 3;
    }

    // ── SUMMARY ──
    step = "pdf-summary";
    const stats = {
      total: filteredItems.length,
      withPhotos: filteredItems.filter((i) => i.resolution_photos.length > 0)
        .length,
      holes: filteredItems.filter((i) => i.surface === "Hole").length,
      greens: filteredItems.filter((i) => i.surface === "Green").length,
      thisYear: filteredItems.filter(
        (i) => new Date(i.resolved_at).getFullYear() === new Date().getFullYear(),
      ).length,
    };

    checkPageSpace(28);
    doc.setFillColor(...EMERALD_50);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "F");
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "S");

    const summaryY = y + 9;
    const colW = contentWidth / 5;
    const summaryStats: Array<{
      label: string;
      value: string;
      color: [number, number, number];
    }> = [
      { label: "Total Resolved", value: stats.total.toString(), color: EMERALD_600 },
      { label: "With Proof", value: stats.withPhotos.toString(), color: BRAND_GREEN },
      { label: "On Holes", value: stats.holes.toString(), color: BRAND_DARK },
      { label: "On Greens", value: stats.greens.toString(), color: BRAND_DARK },
      { label: "This Year", value: stats.thisYear.toString(), color: BRAND_GREEN },
    ];
    summaryStats.forEach((stat, i) => {
      const x = margin + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...stat.color);
      doc.text(stat.value, x, summaryY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      doc.text(stat.label, x, summaryY + 7, { align: "center" });
    });
    y += 28;

    // ── INDEX TABLE ──
    step = "pdf-index";
    if (filteredItems.length > 0) {
      checkPageSpace(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Index", margin, y);
      y += 4;

      const idxBody = filteredItems.map((it, i) => [
        `${i + 1}.`,
        new Date(it.resolved_at).toLocaleDateString(),
        `${it.surface} ${it.hole_number}`,
        it.title.length > 40 ? it.title.slice(0, 38) + "…" : it.title,
        it.resolution_photos.length.toString(),
        it.resolver_name || "—",
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["#", "Resolved", "Where", "Issue", "Photos", "By"]],
        body: idxBody,
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 9 },
          1: { cellWidth: 24 },
          2: { cellWidth: 22, fontStyle: "bold" },
          4: { cellWidth: 16, halign: "center" },
          5: { cellWidth: 30 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── DETAIL: ONE PAGE PER ITEM ──
    step = "pdf-items";
    if (filteredItems.length === 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400);
      doc.text(
        "No resolved issues match the requested filters.",
        margin,
        y + 10,
      );
    }

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const beforePhoto = beforePhotos[i];
      const afterDataUrls = (afterPhotos[i] || []).filter(
        (u): u is string => !!u,
      );

      // Each item gets its own page for clean printing.
      if (i > 0) addPage();
      else if (y > pageHeight - 90) addPage();

      // Header ribbon
      const pColor = priorityColors[item.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.rect(margin, y, contentWidth, 10, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      const headerLeft = `#${i + 1}  ${item.surface} ${item.hole_number}`;
      const headerRight = `RESOLVED  ${new Date(item.resolved_at).toLocaleDateString()}`;
      doc.text(headerLeft, margin + 3, y + 6.8);
      doc.text(headerRight, pageWidth - margin - 3, y + 6.8, {
        align: "right",
      });
      y += 14;

      // Title + issue label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...BRAND_DARK);
      const titleLines = doc.splitTextToSize(item.title, contentWidth);
      doc.text(titleLines.slice(0, 2), margin, y);
      y += titleLines.slice(0, 2).length * 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      doc.text(
        `${item.issueLabel}  •  Priority: ${item.priority.toUpperCase()}`,
        margin,
        y,
      );
      y += 5;

      // Resolution meta line
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      const metaParts: string[] = [];
      if (item.resolver_name) metaParts.push(`Resolved by: ${item.resolver_name}`);
      if (item.reporter_name) metaParts.push(`Reported by: ${item.reporter_name}`);
      metaParts.push(`Reported: ${new Date(item.created_at).toLocaleDateString()}`);
      doc.text(metaParts.join("  •  "), margin, y);
      y += 6;

      // Before / After photos side-by-side
      const photoRowHeight = 55;
      checkPageSpace(photoRowHeight + 10);

      const halfWidth = (contentWidth - 4) / 2;
      const photoY = y;

      // Before column
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      doc.text("BEFORE", margin, photoY);

      if (beforePhoto) {
        try {
          const fmt = beforePhoto.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(beforePhoto, fmt, margin, photoY + 2, halfWidth, photoRowHeight - 4);
        } catch {
          // ignore — fall through to placeholder
          doc.setDrawColor(...GRAY_200);
          doc.rect(margin, photoY + 2, halfWidth, photoRowHeight - 4);
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY_400);
          doc.text("(image unavailable)", margin + halfWidth / 2, photoY + photoRowHeight / 2, { align: "center" });
        }
      } else {
        doc.setDrawColor(...GRAY_200);
        doc.rect(margin, photoY + 2, halfWidth, photoRowHeight - 4);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_400);
        doc.text("No before photo", margin + halfWidth / 2, photoY + photoRowHeight / 2, { align: "center" });
      }

      // After column header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...EMERALD_600);
      doc.text(`AFTER (${afterDataUrls.length})`, margin + halfWidth + 4, photoY);

      // After photo (first one, if any) — multiple photos rendered later in a grid
      if (afterDataUrls.length > 0) {
        try {
          const fmt = afterDataUrls[0].startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(
            afterDataUrls[0],
            fmt,
            margin + halfWidth + 4,
            photoY + 2,
            halfWidth,
            photoRowHeight - 4,
          );
        } catch {
          doc.setDrawColor(...GRAY_200);
          doc.rect(margin + halfWidth + 4, photoY + 2, halfWidth, photoRowHeight - 4);
        }
      } else {
        doc.setDrawColor(...GRAY_200);
        doc.rect(margin + halfWidth + 4, photoY + 2, halfWidth, photoRowHeight - 4);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_400);
        doc.text(
          "No resolution photos",
          margin + halfWidth + 4 + halfWidth / 2,
          photoY + photoRowHeight / 2,
          { align: "center" },
        );
      }

      y += photoRowHeight + 4;

      // Additional after photos in a 3-up grid (skip the first since it's already shown)
      if (afterDataUrls.length > 1) {
        const extras = afterDataUrls.slice(1);
        const cellW = (contentWidth - 4) / 3;
        const cellH = 38;
        let col = 0;

        for (const url of extras) {
          checkPageSpace(cellH + 4);
          const x = margin + col * (cellW + 2);
          try {
            const fmt = url.startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(url, fmt, x, y, cellW, cellH);
          } catch {
            doc.setDrawColor(...GRAY_200);
            doc.rect(x, y, cellW, cellH);
          }
          col += 1;
          if (col === 3) {
            col = 0;
            y += cellH + 2;
          }
        }
        if (col !== 0) {
          y += cellH + 2;
        }
        y += 1;
      }

      // What was done (resolution notes)
      if (item.resolution_notes) {
        checkPageSpace(20);
        const linesArr = doc.splitTextToSize(item.resolution_notes, contentWidth - 8);
        const boxHeight = 9 + linesArr.length * 4 + 2;
        doc.setFillColor(...EMERALD_50);
        doc.setDrawColor(167, 243, 208);
        doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...EMERALD_600);
        doc.text("What was done", margin + 3, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY_600);
        doc.text(linesArr, margin + 3, y + 10);

        y += boxHeight + 4;
      }

      // Original description
      if (item.description) {
        checkPageSpace(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_DARK);
        doc.text("Original report", margin, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY_600);
        const descLines = doc.splitTextToSize(item.description, contentWidth);
        doc.text(descLines.slice(0, 8), margin, y);
        y += Math.min(descLines.length, 8) * 3.7 + 3;
      }

      // Fix plan that was followed
      if (item.fix_instructions) {
        checkPageSpace(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(180, 83, 9);
        doc.text("Fix plan that was followed", margin, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY_600);
        const fixLines = doc.splitTextToSize(item.fix_instructions, contentWidth);
        doc.text(fixLines.slice(0, 12), margin, y);
        y += Math.min(fixLines.length, 12) * 3.7;
      }
    }

    // ── FOOTER ──
    step = "pdf-footer";
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_400);
      doc.text(
        `VMGC GreenKeeper Pro — Resolution History | Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" },
        )}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" },
      );
      doc.text(
        `Page ${p} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 8,
        { align: "right" },
      );
    }

    step = "pdf-output";
    const scopeTag = options.holeNumber
      ? `Hole-${options.holeNumber}`
      : options.surface === "hole"
        ? "Holes"
        : options.surface === "green"
          ? "Greens"
          : "All";
    const filename = `Resolution-History-${scopeTag}-${todayLocal()}.pdf`;
    const blob = doc.output("blob") as Blob;
    return { blob, filename };
  } catch (err) {
    if (err instanceof ResolutionHistoryReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `Resolution history report error at step [${step}]:`,
      msg,
      err,
    );
    throw new ResolutionHistoryReportError(step, msg);
  }
}

/** Convenience wrapper: generate + trigger a browser download. */
export async function downloadResolutionHistoryReport(
  options: ResolutionHistoryReportOptions = {},
): Promise<void> {
  const { blob, filename } = await generateResolutionHistoryReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
