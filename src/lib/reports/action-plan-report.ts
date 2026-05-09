/**
 * Action Plan Report — step-by-step, no-chemical fix procedures for every
 * open issue on the course (holes + greens), plus a built-in section for
 * silvery moss on Green 7 and the entire back nine (Greens 10–18).
 *
 * The user does not have spray clearance, so this report intentionally
 * excludes herbicides, fungicides, fertilizers, and any other chemical
 * product. Everything in here is cultural / mechanical / cleanup work.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import { getCachedUserId } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import {
  holeNonChemicalFixes,
  greenNonChemicalFixes,
  sortByPriorityThenHole,
  type ActionPlanProcedure,
} from "./non-chemical-fixes";
import { issueTypeLabels } from "@/lib/hole-constants";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import type {
  HoleIssueType,
  GreenIssueType,
  HoleObservation,
  GreenObservation,
} from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];

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

/** Greens that should always carry a silvery-moss action plan entry. */
export const MOSS_TARGET_GREENS: number[] = [7, 10, 11, 12, 13, 14, 15, 16, 17, 18];

interface ActionItem {
  surface: "Hole" | "Green";
  hole_number: number;
  title: string;
  issue_type: HoleIssueType | GreenIssueType;
  priority: "critical" | "high" | "normal" | "low";
  status: string;
  description: string | null;
  photo_url: string | null;
  procedure: ActionPlanProcedure;
  /** "auto" if this entry was injected (e.g. silvery moss back-nine), "logged" if from db. */
  origin: "auto" | "logged";
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

export class ActionPlanReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "ActionPlanReportError";
  }
}

export interface ActionPlanReportOptions {
  /**
   * Greens that should automatically carry a silvery-moss action plan entry.
   * Defaults to MOSS_TARGET_GREENS (Green 7 + Greens 10-18).
   */
  mossGreens?: number[];
  /**
   * If true, skip injecting auto moss entries for greens that already have a
   * "moss" observation logged. Defaults to true.
   */
  skipMossWhenAlreadyLogged?: boolean;
}

export async function generateActionPlanReport(
  options: ActionPlanReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const mossGreens = options.mossGreens ?? MOSS_TARGET_GREENS;
    const skipMossWhenLogged = options.skipMossWhenAlreadyLogged !== false;

    const supabase = createClient();

    step = "auth";
    const userId = getCachedUserId();
    if (!userId) throw new ActionPlanReportError(step, "Not signed in");

    step = "fetch-profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    step = "fetch-hole-obs";
    const { data: holeObs, error: holeErr } = await (supabase
      .from("hole_observations") as any)
      .select(`*, reporter:profiles!reported_by(id, full_name)`)
      .neq("status", "resolved")
      .order("priority", { ascending: true })
      .order("hole_number", { ascending: true });
    if (holeErr) throw new ActionPlanReportError(step, holeErr.message);

    step = "fetch-green-obs";
    const { data: greenObs, error: greenErr } = await (supabase
      .from("green_observations") as any)
      .select(`*, reporter:profiles!reported_by(id, full_name)`)
      .neq("status", "resolved")
      .order("priority", { ascending: true })
      .order("hole_number", { ascending: true });
    if (greenErr) throw new ActionPlanReportError(step, greenErr.message);

    step = "build-action-items";
    const items: ActionItem[] = [];

    // Logged hole observations (open / in_progress / monitoring — anything not resolved)
    for (const o of (holeObs || []) as HoleObservation[]) {
      const procedure =
        holeNonChemicalFixes[o.issue_type] || holeNonChemicalFixes.other;
      items.push({
        surface: "Hole",
        hole_number: o.hole_number,
        title: o.title,
        issue_type: o.issue_type,
        priority: o.priority,
        status: o.status,
        description: o.description,
        photo_url: o.photo_url,
        procedure,
        origin: "logged",
      });
    }

    // Logged green observations
    for (const o of (greenObs || []) as GreenObservation[]) {
      const procedure =
        greenNonChemicalFixes[o.issue_type] || greenNonChemicalFixes.other;
      items.push({
        surface: "Green",
        hole_number: o.hole_number,
        title: o.title,
        issue_type: o.issue_type,
        priority: o.priority,
        status: o.status,
        description: o.description,
        photo_url: o.photo_url,
        procedure,
        origin: "logged",
      });
    }

    // Auto-add silvery moss entries for the configured greens (Green 7 + back nine)
    const greenObsByHole = new Map<number, GreenObservation[]>();
    for (const o of (greenObs || []) as GreenObservation[]) {
      const list = greenObsByHole.get(o.hole_number) ?? [];
      list.push(o);
      greenObsByHole.set(o.hole_number, list);
    }

    for (const holeNum of mossGreens) {
      const existing = greenObsByHole.get(holeNum) ?? [];
      const alreadyHasMoss = existing.some((o) => o.issue_type === "moss");
      if (skipMossWhenLogged && alreadyHasMoss) continue;
      items.push({
        surface: "Green",
        hole_number: holeNum,
        title: "Silvery Moss — Putting Surface",
        issue_type: "moss",
        priority: "high",
        status: "open",
        description:
          "Silvery moss patches on the putting surface. Treat with mechanical and cultural practices only — no chemicals authorized.",
        photo_url: null,
        procedure: greenNonChemicalFixes.moss,
        origin: "auto",
      });
    }

    items.sort(sortByPriorityThenHole);

    step = "fetch-photos";
    const photoPromises = items.map((it) =>
      it.photo_url ? fetchImageAsDataURL(it.photo_url) : Promise.resolve(null),
    );
    const photos = await Promise.all(photoPromises);

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
      if (y + needed > pageHeight - 20) addPage();
    };

    const drawSectionDivider = () => {
      checkPageSpace(8);
      y += 2;
      doc.setDrawColor(...GRAY_400);
      doc.setLineDashPattern([1.2, 1.2], 0);
      doc.line(margin + 4, y, pageWidth - margin - 4, y);
      doc.setLineDashPattern([], 0);
      y += 6;
    };

    // ── COVER HEADER ──
    step = "pdf-header";
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, 36, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 36, pageWidth, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("Course Action Plan", margin, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Step-by-Step Fix Procedures (No-Chemical)", margin, 23);

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
      `${items.length} action item${items.length === 1 ? "" : "s"}`,
      pageWidth - margin,
      30,
      { align: "right" },
    );

    y = 44;

    // ── INTRO BOX (rules + how to use) ──
    step = "pdf-intro";
    const introHeight = 38;
    checkPageSpace(introHeight + 4);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, introHeight, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, introHeight, 3, 3, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text("How to use this plan", margin + 4, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_600);
    const introLines = [
      "• Items are sorted by priority (Critical → Low), then by hole number.",
      "• Every procedure is mechanical/cultural — no herbicide, fungicide, fertilizer, or any chemical product.",
      "• Take a fresh photo of each area BEFORE starting work and AFTER the fix to prove resolution.",
      "• Mark the issue Resolved in the app and upload the after-photos. The Resolution History keeps a permanent record.",
      "• Silvery-moss entries for Green 7 and Greens 10-18 are included automatically per superintendent request.",
    ];
    doc.text(introLines, margin + 4, y + 13, { lineHeightFactor: 1.4 });

    y += introHeight + 6;

    // ── SUMMARY ──
    step = "pdf-summary";
    const counts = {
      total: items.length,
      critical: items.filter((i) => i.priority === "critical").length,
      high: items.filter((i) => i.priority === "high").length,
      holes: items.filter((i) => i.surface === "Hole").length,
      greens: items.filter((i) => i.surface === "Green").length,
      auto: items.filter((i) => i.origin === "auto").length,
    };

    checkPageSpace(28);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "S");

    const summaryY = y + 9;
    const colW = contentWidth / 5;
    const stats: Array<{
      label: string;
      value: string;
      color: [number, number, number];
    }> = [
      { label: "Total Items", value: counts.total.toString(), color: BRAND_GREEN },
      { label: "Critical", value: counts.critical.toString(), color: [220, 38, 38] },
      { label: "High", value: counts.high.toString(), color: [234, 88, 12] },
      { label: "On Holes", value: counts.holes.toString(), color: BRAND_DARK },
      { label: "On Greens", value: counts.greens.toString(), color: BRAND_DARK },
    ];
    stats.forEach((stat, i) => {
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

    // ── TABLE OF CONTENTS (compact) ──
    step = "pdf-toc";
    if (items.length > 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Action Item Index", margin, y);
      y += 4;

      const tocBody = items.map((it, i) => [
        `${i + 1}.`,
        `${it.surface} ${it.hole_number}`,
        it.title,
        it.priority.toUpperCase(),
        it.origin === "auto" ? "Auto" : "Logged",
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["#", "Where", "Issue", "Priority", "Source"]],
        body: tocBody,
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 22, fontStyle: "bold" },
          3: { cellWidth: 22 },
          4: { cellWidth: 18 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── DETAIL: ONE ENTRY PER ACTION ITEM ──
    step = "pdf-items";
    if (items.length === 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400);
      doc.text(
        "No open issues — course is in great shape.",
        margin,
        y + 10,
      );
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const photo = photos[i];
      const proc = item.procedure;
      const labelMap =
        item.surface === "Hole" ? issueTypeLabels : greenIssueTypeLabels;
      const issueLabel =
        (labelMap as Record<string, string>)[item.issue_type] || item.issue_type;

      // Each action item is its own page so the procedure stays whole.
      if (i > 0) addPage();
      else if (y > pageHeight - 80) addPage();

      // Header ribbon
      const pColor = priorityColors[item.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.rect(margin, y, contentWidth, 10, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      const headerLeft = `#${i + 1}  ${item.surface} ${item.hole_number}`;
      const headerRight = `${item.priority.toUpperCase()}  |  ${
        statusLabels[item.status] || item.status
      }`;
      doc.text(headerLeft, margin + 3, y + 6.8);
      doc.text(headerRight, pageWidth - margin - 3, y + 6.8, { align: "right" });
      y += 14;

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...BRAND_DARK);
      doc.text(item.title, margin, y);
      y += 5;

      // Issue type + origin
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      const subline = `${issueLabel}${
        item.origin === "auto" ? "  •  Auto-included by request" : ""
      }`;
      doc.text(subline, margin, y);
      y += 5;

      // Photo + description (if present)
      if (photo) {
        try {
          const imgWidth = 60;
          const imgHeight = 45;
          const imgFormat = photo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, imgFormat, margin, y, imgWidth, imgHeight);

          if (item.description) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY_600);
            const textX = margin + imgWidth + 5;
            const textWidth = contentWidth - imgWidth - 5;
            const descLines = doc.splitTextToSize(
              item.description,
              textWidth,
            );
            doc.text(descLines.slice(0, 10), textX, y + 4);
          }
          y += imgHeight + 4;
        } catch {
          y += 2;
        }
      } else if (item.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY_600);
        const lines = doc.splitTextToSize(item.description, contentWidth);
        doc.text(lines.slice(0, 5), margin, y);
        y += Math.min(lines.length, 5) * 4 + 2;
      }

      drawSectionDivider();

      // Procedure title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text(`Procedure: ${proc.title}`, margin, y);
      y += 5;

      // Best window / crew / duration as a 3-column meta strip
      checkPageSpace(16);
      doc.setFillColor(247, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND_GREEN);
      doc.text("BEST WINDOW", margin + 3, y + 4);
      doc.text("CREW", margin + contentWidth / 3 + 3, y + 4);
      doc.text("DURATION", margin + (2 * contentWidth) / 3 + 3, y + 4);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      const winLines = doc.splitTextToSize(
        proc.best_window,
        contentWidth / 3 - 6,
      );
      doc.text(winLines.slice(0, 2), margin + 3, y + 8);
      doc.text(proc.crew, margin + contentWidth / 3 + 3, y + 8);
      doc.text(
        proc.duration,
        margin + (2 * contentWidth) / 3 + 3,
        y + 8,
      );

      y += 16;

      // Tools
      checkPageSpace(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Tools & Materials", margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      proc.tools_needed.forEach((tool) => {
        checkPageSpace(5);
        const lines = doc.splitTextToSize(`• ${tool}`, contentWidth - 4);
        doc.text(lines, margin + 2, y);
        y += lines.length * 3.4;
      });
      y += 2;

      // Steps — the heart of the report
      checkPageSpace(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Step-by-Step Procedure", margin, y);
      y += 4;

      const stepsBody = proc.steps.map((s, idx) => [
        `${idx + 1}`,
        s.action,
        s.detail || "",
      ]);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["#", "Action", "Detail"]],
        body: stepsBody,
        styles: { fontSize: 8, cellPadding: 2, valign: "top" },
        headStyles: {
          fillColor: BRAND_GREEN,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 76, fontStyle: "bold" },
          2: { cellWidth: contentWidth - 84, textColor: GRAY_600 },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // Follow-up
      if (proc.follow_up.length > 0) {
        checkPageSpace(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_DARK);
        doc.text("Follow-up", margin, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        proc.follow_up.forEach((f) => {
          checkPageSpace(5);
          const lines = doc.splitTextToSize(`• ${f}`, contentWidth - 4);
          doc.text(lines, margin + 2, y);
          y += lines.length * 3.4;
        });
        y += 2;
      }

      // Monitor
      if (proc.monitor) {
        checkPageSpace(15);
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(254, 215, 170);
        const monLines = doc.splitTextToSize(proc.monitor, contentWidth - 8);
        const boxHeight = 8 + monLines.length * 3.4 + 2;
        doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        doc.text("How you'll know it worked", margin + 3, y + 5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        doc.text(monLines, margin + 3, y + 9);
        y += boxHeight + 4;
      }

      // Resolution proof reminder (every entry — this is what the user asked for)
      checkPageSpace(14);
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(6, 95, 70);
      doc.text("Document the fix", margin + 3, y + 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY_600);
      doc.text(
        "Open this issue in the app, take new photos of the area, add notes, and tap Resolve. The Resolution History page keeps a permanent before/after record.",
        margin + 3,
        y + 8,
      );
      y += 14;
    }

    // ── FOOTER ──
    step = "pdf-footer";
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_400);
      doc.text(
        `VMGC GreenKeeper Pro — Action Plan | Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" },
        )}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" },
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8, {
        align: "right",
      });
    }

    step = "pdf-output";
    const filename = `Course-Action-Plan-${todayLocal()}.pdf`;
    const blob = doc.output("blob") as Blob;
    return { blob, filename };
  } catch (err) {
    if (err instanceof ActionPlanReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Action plan report error at step [${step}]:`, msg, err);
    throw new ActionPlanReportError(step, msg);
  }
}

/** Convenience wrapper: generate + trigger a browser download. */
export async function downloadActionPlanReport(
  options: ActionPlanReportOptions = {},
): Promise<void> {
  const { blob, filename } = await generateActionPlanReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
