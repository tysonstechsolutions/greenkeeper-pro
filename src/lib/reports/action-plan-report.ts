/**
 * Action Plan Report — step-by-step fix procedures for every open issue on
 * the course (holes + greens), plus a built-in section for silvery moss on
 * Green 7 and the entire back nine (Greens 10–18).
 *
 * Each item includes the cultural/mechanical work AND the recommended
 * chemical applications (fertilizer, herbicide, fungicide, insecticide,
 * wetting agent, moss control, etc.) where they are part of the standard
 * treatment. Exception: GRUB DAMAGE procedures intentionally do not include
 * any chemical applications — they only address the bare spot left behind
 * (per superintendent direction).
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import { directSelectList, getCachedUserId } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import {
  holeFixProcedures,
  greenFixProcedures,
  sortByPriorityThenHole,
  type ActionPlanProcedure,
} from "./fix-procedures";
import {
  holeFixProceduresEs,
  greenFixProceduresEs,
} from "./fix-procedures-es";
import {
  getReportLabels,
  getHoleIssueLabel,
  getGreenIssueLabel,
  getPriorityLabel,
  getSurfaceLabel,
  getStatusLabel,
  getMossAutoTitle,
  getMossAutoDescription,
  type ReportLocale,
} from "./action-plan-i18n";
import { matchTools, type ToolMatch } from "./tool-inventory";
import { issueTypeLabels } from "@/lib/hole-constants";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import type {
  Equipment,
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

const RUNNING_HDR_H = 13; // mm — brand stripe on every non-cover page

// Status labels are localized via getStatusLabel() from action-plan-i18n.ts.

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
  /**
   * Output language. "en" (English) or "es" (Spanish). Defaults to "en".
   * The Spanish version is intended to be printed for crew use — every
   * translatable string in the PDF (UI, procedure steps, chemical info,
   * tool annotations) renders in Spanish. Brand names stay in English.
   */
  locale?: ReportLocale;
}

export async function generateActionPlanReport(
  options: ActionPlanReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const mossGreens = options.mossGreens ?? MOSS_TARGET_GREENS;
    const skipMossWhenLogged = options.skipMossWhenAlreadyLogged !== false;
    const locale: ReportLocale = options.locale === "es" ? "es" : "en";
    const L = getReportLabels(locale);
    const holeProcs = locale === "es" ? holeFixProceduresEs : holeFixProcedures;
    const greenProcs = locale === "es" ? greenFixProceduresEs : greenFixProcedures;

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

    // Equipment / asset list — used to annotate the Tools & Materials section
    // with availability ("in repair", "needs replacement", "NOT IN INVENTORY",
    // etc.). Retired equipment is excluded by default — the user only cares
    // about the active fleet.
    step = "fetch-equipment";
    let equipment: Equipment[] = [];
    try {
      equipment = await directSelectList<Equipment>("equipment", {
        columns:
          "id, name, equipment_type, status, condition_status, make, model, asset_tag",
        filters: ["status=neq.retired"],
        orderBy: [{ column: "name", ascending: true }],
        label: "action-plan-report.fetchEquipment",
      });
    } catch (eqErr) {
      // If the equipment fetch fails, continue without inventory annotation
      // — better to ship the report than to block on a side feature.
      console.warn("Action plan: equipment fetch failed, tool annotations will be skipped:", eqErr);
      equipment = [];
    }

    step = "build-action-items";
    const items: ActionItem[] = [];

    // Logged hole observations (open / in_progress / monitoring — anything not resolved)
    for (const o of (holeObs || []) as HoleObservation[]) {
      const procedure = holeProcs[o.issue_type] || holeProcs.other;
      // Prefer the Spanish title stored on the observation when in Spanish
      // mode and one is available; otherwise use the original title.
      const title =
        locale === "es" && o.title_es && o.title_es.trim()
          ? o.title_es
          : o.title;
      const description =
        locale === "es" && o.description_es && o.description_es.trim()
          ? o.description_es
          : o.description;
      items.push({
        surface: "Hole",
        hole_number: o.hole_number,
        title,
        issue_type: o.issue_type,
        priority: o.priority,
        status: o.status,
        description,
        photo_url: o.photo_url,
        procedure,
        origin: "logged",
      });
    }

    // Logged green observations
    for (const o of (greenObs || []) as GreenObservation[]) {
      const procedure = greenProcs[o.issue_type] || greenProcs.other;
      const title =
        locale === "es" && o.title_es && o.title_es.trim()
          ? o.title_es
          : o.title;
      const description =
        locale === "es" && o.description_es && o.description_es.trim()
          ? o.description_es
          : o.description;
      items.push({
        surface: "Green",
        hole_number: o.hole_number,
        title,
        issue_type: o.issue_type,
        priority: o.priority,
        status: o.status,
        description,
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
        title: getMossAutoTitle(locale),
        issue_type: "moss",
        priority: "high",
        status: "open",
        description: getMossAutoDescription(locale),
        photo_url: null,
        procedure: greenProcs.moss,
        origin: "auto",
      });
    }

    // Surface first (Holes on top, Greens at the bottom of the report),
    // then priority (Critical → Low), then hole number ascending.
    items.sort((a, b) => {
      if (a.surface !== b.surface) {
        // "Hole" < "Green" alphabetically would put Greens first; flip it
        // so Holes come first.
        return a.surface === "Hole" ? -1 : 1;
      }
      return sortByPriorityThenHole(a, b);
    });

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

    let currentSection = "";
    const renderRunningHdr = () => {
      const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
      if (pg <= 1) return;
      doc.setFillColor(...BRAND_DARK);
      doc.rect(0, 0, pageWidth, RUNNING_HDR_H - 0.8, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(0, RUNNING_HDR_H - 0.8, pageWidth, 0.8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text("VMGC  ·  GreenKeeper Pro", margin, RUNNING_HDR_H - 4.5);
      if (currentSection) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...BRAND_GOLD);
        doc.text(currentSection, pageWidth / 2, RUNNING_HDR_H - 4.5, { align: "center" });
      }
    };
    const addPage = (section?: string) => {
      if (section !== undefined) currentSection = section;
      doc.addPage();
      renderRunningHdr();
      y = RUNNING_HDR_H + 5;
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
    const COVER_HDR_H = 60;
    // Dark background
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, COVER_HDR_H, "F");
    // Gold left accent bar
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 0, 3.5, COVER_HDR_H, "F");
    // Gold bottom stripe
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, COVER_HDR_H, pageWidth, 1.5, "F");

    const dateLocale = locale === "es" ? "es-MX" : "en-US";
    const dateStr = new Date().toLocaleDateString(dateLocale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Org identifier + date (top strip)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("VMGC  ·  GreenKeeper Pro", margin + 5, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(190, 200, 210);
    doc.text(dateStr, pageWidth - margin, 9, { align: "right" });

    // Thin rule
    doc.setDrawColor(...BRAND_GOLD);
    doc.setLineWidth(0.25);
    doc.line(margin + 5, 12, pageWidth - margin, 12);
    doc.setLineWidth(0.2);

    // Main title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(27);
    doc.setTextColor(255, 255, 255);
    doc.text(L.title, margin + 5, 29);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text(L.subtitle, margin + 5, 37);

    // Prepared by (right side)
    const prepByLabel = locale === "es" ? "PREPARADO POR" : "PREPARED BY";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(170, 185, 200);
    doc.text(prepByLabel, pageWidth - margin, 20, { align: "right" });
    if (profile?.full_name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(profile.full_name, pageWidth - margin, 27, { align: "right" });
    }
    if (profile?.role) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND_GOLD);
      doc.text(profile.role, pageWidth - margin, 34, { align: "right" });
    }

    // Action item count
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(L.actionItemCount(items.length), margin + 5, 48);

    // Confidential notice
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(110, 125, 140);
    const confLabel = locale === "es"
      ? "Documento confidencial — Exclusivo para uso interno de operaciones del campo"
      : "Confidential — For Internal Course Operations Use Only";
    doc.text(confLabel, margin + 5, 56);

    y = COVER_HDR_H + 9;

    // ── INTRO BOX (rules + how to use) ──
    step = "pdf-intro";
    // Wrap each bullet first so we know how tall the box needs to be.
    // Spanish translations can be ~30% longer than English, so a fixed
    // height would clip text in es mode.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const bulletWidth = contentWidth - 10;
    const introWrapped: string[] = [];
    for (const b of L.introBullets) {
      const wrapped = doc.splitTextToSize(`• ${b}`, bulletWidth);
      introWrapped.push(...wrapped);
    }
    // Line height (mm) at fontSize 9 with lineHeightFactor 1.35 ≈ 4.3.
    // Add 12mm header padding + 5mm bottom padding.
    const introHeight = 12 + introWrapped.length * 4.3 + 5;
    checkPageSpace(introHeight + 4);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, introHeight, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, introHeight, 3, 3, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text(L.introHeading, margin + 4, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_600);
    doc.text(introWrapped, margin + 4, y + 13, { lineHeightFactor: 1.35 });

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
      { label: L.totalItems, value: counts.total.toString(), color: BRAND_GREEN },
      { label: L.critical, value: counts.critical.toString(), color: [220, 38, 38] },
      { label: L.high, value: counts.high.toString(), color: [234, 88, 12] },
      { label: L.onHoles, value: counts.holes.toString(), color: BRAND_DARK },
      { label: L.onGreens, value: counts.greens.toString(), color: BRAND_DARK },
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

    // ── EQUIPMENT INVENTORY SUMMARY (across every action item) ──
    // Roll up every Tools & Materials line that's flagged so the
    // superintendent can see the full equipment story up front instead of
    // hunting through each item.
    step = "pdf-inventory-summary";
    type FlaggedTool = ReturnType<typeof matchTools>[number];
    const flaggedAll: { tool: FlaggedTool; itemContext: string }[] = [];
    for (const it of items) {
      const tm = matchTools(it.procedure.tools_needed, equipment, locale);
      for (const t of tm) {
        if (t.isProblem) {
          flaggedAll.push({
            tool: t,
            itemContext: `${getSurfaceLabel(it.surface, locale)} ${it.hole_number} — ${it.title}`,
          });
        }
      }
    }
    // De-dup by displayText so the same missing tool doesn't list 18x
    const seenDisplay = new Set<string>();
    const uniqueFlagged: { tool: FlaggedTool; uses: number; firstContext: string }[] = [];
    for (const f of flaggedAll) {
      const key = f.tool.displayText;
      const existing = uniqueFlagged.find((u) => u.tool.displayText === key);
      if (existing) {
        existing.uses += 1;
      } else {
        seenDisplay.add(key);
        uniqueFlagged.push({
          tool: f.tool,
          uses: 1,
          firstContext: f.itemContext,
        });
      }
    }
    // Sort by severity: missing > out > issue, then by use count desc
    const severityRank: Record<string, number> = { missing: 0, out: 1, issue: 2, ok: 3 };
    uniqueFlagged.sort((a, b) => {
      const r = severityRank[a.tool.status] - severityRank[b.tool.status];
      if (r !== 0) return r;
      return b.uses - a.uses;
    });

    if (uniqueFlagged.length > 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND_DARK);
      doc.text(L.inventoryHeading, margin, y);
      y += 4;

      const invBody = uniqueFlagged.map((u) => {
        const statusTag =
          u.tool.status === "missing"
            ? L.notInInventory
            : u.tool.status === "out"
              ? L.needsReplacement
              : L.repairOrService;
        return [
          statusTag,
          u.tool.displayText.replace(/ — .*$/, "").replace(/ \(.*\)$/, ""),
          u.tool.displayText.includes(" — ")
            ? u.tool.displayText.split(" — ")[1]
            : u.tool.displayText.includes(" (")
              ? u.tool.displayText.match(/\(([^)]+)\)/)?.[1] ?? ""
              : "",
          u.uses.toString(),
        ];
      });

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, top: RUNNING_HDR_H + 4 },
        head: [[L.invSeverity, L.invTool, L.invDetail, L.invUsedBy]],
        body: invBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: {
          fillColor: [180, 83, 9],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          minCellHeight: 8,
        },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        columnStyles: {
          0: { cellWidth: 32, fontStyle: "bold" },
          3: { cellWidth: 16, halign: "center" },
        },
        didDrawPage: () => { renderRunningHdr(); },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 0) {
            const txt = String(data.cell.raw ?? "");
            if (txt === L.notInInventory) {
              data.cell.styles.textColor = [220, 38, 38];
            } else if (txt === L.needsReplacement) {
              data.cell.styles.textColor = [234, 88, 12];
            } else {
              data.cell.styles.textColor = [180, 83, 9];
            }
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 2;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_400);
      doc.text(L.inventoryUsedByNote, margin, y + 3);
      y += 8;
    } else if (equipment.length > 0) {
      // Inventory was checked successfully and nothing is flagged — let the
      // user know with a brief positive note.
      checkPageSpace(10);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text(L.inventoryAllOk(equipment.length), margin, y);
      y += 8;
    }

    // ── TABLE OF CONTENTS (compact) ──
    step = "pdf-toc";
    if (items.length > 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      doc.text(L.indexHeading, margin, y);
      y += 4;

      const tocBody = items.map((it, i) => [
        `${i + 1}.`,
        `${getSurfaceLabel(it.surface, locale)} ${it.hole_number}`,
        it.title,
        getPriorityLabel(it.priority, locale),
        it.origin === "auto" ? L.sourceAuto : L.sourceLogged,
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, top: RUNNING_HDR_H + 4 },
        head: [[L.idxNum, L.idxWhere, L.idxIssue, L.idxPriority, L.idxSource]],
        body: tocBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          minCellHeight: 8,
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 28, fontStyle: "bold" },
          3: { cellWidth: 22 },
          4: { cellWidth: 22 },
        },
        didDrawPage: () => { renderRunningHdr(); },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Initialise the running-header section label before the items loop.
    if (items.length > 0) {
      currentSection = items[0].surface === "Hole"
        ? (locale === "es" ? "SECCIÓN I — CANCHAS Y ROUGH" : "SECTION I — FAIRWAYS & ROUGH")
        : (locale === "es" ? "SECCIÓN II — GREENS" : "SECTION II — PUTTING SURFACES");
    }

    // ── DETAIL: ONE ENTRY PER ACTION ITEM ──
    step = "pdf-items";
    if (items.length === 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400);
      doc.text(
        L.noOpenIssues,
        margin,
        y + 10,
      );
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const photo = photos[i];
      const proc = item.procedure;
      const issueLabel =
        locale === "es"
          ? item.surface === "Hole"
            ? getHoleIssueLabel(item.issue_type as HoleIssueType, locale)
            : getGreenIssueLabel(item.issue_type as GreenIssueType, locale)
          : (
              (item.surface === "Hole" ? issueTypeLabels : greenIssueTypeLabels) as Record<string, string>
            )[item.issue_type] || item.issue_type;

      // Section labels for running header.
      const holeSectionLabel = locale === "es" ? "SECCIÓN I — CANCHAS Y ROUGH" : "SECTION I — FAIRWAYS & ROUGH";
      const greenSectionLabel = locale === "es" ? "SECCIÓN II — GREENS" : "SECTION II — PUTTING SURFACES";
      const prevSurface = i > 0 ? items[i - 1].surface : null;
      const isFirstGreen = item.surface === "Green" && prevSurface === "Hole";

      if (isFirstGreen) {
        // Section break: draw a "Putting Surfaces" header panel, then the item follows on the same page.
        addPage(greenSectionLabel);
        doc.setFillColor(...BRAND_GREEN);
        doc.rect(margin, y, contentWidth, 20, "F");
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(margin, y, 3.5, 20, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(255, 255, 255);
        doc.text(locale === "es" ? "SECCIÓN II" : "SECTION II", margin + 8, y + 11);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...BRAND_GOLD);
        doc.text(
          locale === "es" ? "Superficies de Putting — Greens" : "Putting Surfaces — Greens",
          margin + 8, y + 17.5,
        );
        const greenCount = items.filter((it) => it.surface === "Green").length;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(
          locale === "es" ? `${greenCount} elementos` : `${greenCount} items`,
          pageWidth - margin, y + 12, { align: "right" },
        );
        y += 26;
        // New page for the item itself so it isn't squeezed below the section panel.
        addPage(greenSectionLabel);
      } else if (i > 0) {
        addPage(item.surface === "Hole" ? holeSectionLabel : greenSectionLabel);
      } else if (y > pageHeight - 80) {
        addPage(holeSectionLabel);
      }

      // Header ribbon — priority-colored with gold left accent bar
      const pColor = priorityColors[item.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.rect(margin, y, contentWidth, 14, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(margin, y, 3.5, 14, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(`#${i + 1}`, margin + 7, y + 5.5);
      doc.setFontSize(13);
      doc.text(`${getSurfaceLabel(item.surface, locale)} ${item.hole_number}`, margin + 7, y + 11.5);
      const headerRight = `${getPriorityLabel(item.priority, locale).toUpperCase()}  ·  ${getStatusLabel(item.status, locale).toUpperCase()}`;
      doc.setFontSize(8.5);
      doc.text(headerRight, pageWidth - margin - 3, y + 8.5, { align: "right" });
      y += 18;

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
        item.origin === "auto" ? L.autoIncluded : ""
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
      doc.text(L.procedureHeading(proc.title), margin, y);
      y += 5;

      // Best window / crew / duration as a 3-column meta strip
      checkPageSpace(16);
      doc.setFillColor(247, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(L.bestWindow, margin + 3, y + 4);
      doc.text(L.crew, margin + contentWidth / 3 + 3, y + 4);
      doc.text(L.duration, margin + (2 * contentWidth) / 3 + 3, y + 4);

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

      // Tools — annotated against the live equipment inventory.
      // Basic hand tools / materials pass through unchanged. Powered
      // equipment is matched to the asset list and tagged with status.
      checkPageSpace(15);
      const toolMatches: ToolMatch[] = matchTools(
        proc.tools_needed,
        equipment,
        locale,
      );
      const problemCount = toolMatches.filter((t) => t.isProblem).length;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_DARK);
      const toolHeading =
        problemCount > 0
          ? L.toolsNeedAttention(problemCount)
          : L.toolsAndMaterials;
      doc.text(toolHeading, margin, y);
      y += 4;
      doc.setFontSize(8);
      toolMatches.forEach((t) => {
        checkPageSpace(5);
        // Color-code by status:
        //   ok      → gray (default)
        //   issue   → orange (in repair / needs service / condition: needs repair)
        //   out     → red-orange (out of service / retired)
        //   missing → red (not in inventory)
        if (t.status === "missing") {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(220, 38, 38); // red-600
        } else if (t.status === "out") {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(234, 88, 12); // orange-600
        } else if (t.status === "issue") {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(180, 83, 9); // amber-700
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...GRAY_600);
        }
        const lines = doc.splitTextToSize(`• ${t.displayText}`, contentWidth - 4);
        doc.text(lines, margin + 2, y);
        y += lines.length * 3.4;
      });
      // Reset color after the loop so subsequent text isn't tinted.
      doc.setTextColor(...GRAY_600);
      y += 2;

      // Steps — the heart of the report
      checkPageSpace(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_DARK);
      doc.text(L.stepByStep, margin, y);
      y += 4;

      const stepsBody = proc.steps.map((s, idx) => [
        `${idx + 1}`,
        s.action,
        s.detail || "",
      ]);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, top: RUNNING_HDR_H + 4 },
        head: [[L.stepNum, L.stepAction, L.stepDetail]],
        body: stepsBody,
        styles: { fontSize: 8, cellPadding: 2.5, valign: "top" },
        headStyles: {
          fillColor: BRAND_GREEN,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          minCellHeight: 9,
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 76, fontStyle: "bold" },
          2: { cellWidth: contentWidth - 84, textColor: GRAY_600 },
        },
        didDrawPage: () => { renderRunningHdr(); },
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      // Chemical Applications — only when the procedure has any.
      // GRUB DAMAGE intentionally omits this section per superintendent direction.
      if (proc.chemicals && proc.chemicals.length > 0) {
        checkPageSpace(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(180, 83, 9);
        doc.text(L.chemicalApplications, margin, y);
        y += 4;

        const chemRows: string[][] = [];
        for (const c of proc.chemicals) {
          const examples = c.product_examples.join("; ");
          const rei =
            c.rei_hours == null
              ? L.chemREINone
              : `${c.rei_hours} ${L.chemREIShort}`;
          chemRows.push([
            c.product_type,
            examples,
            c.rate,
            c.method,
            c.timing,
            rei,
          ]);
        }

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin, top: RUNNING_HDR_H + 4 },
          head: [
            [
              L.chemProductType,
              L.chemExamples,
              L.chemRate,
              L.chemMethod,
              L.chemTiming,
              L.chemREI,
            ],
          ],
          body: chemRows,
          styles: { fontSize: 7.5, cellPadding: 2, valign: "top" },
          headStyles: {
            fillColor: [180, 83, 9],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: "bold",
            minCellHeight: 8,
          },
          alternateRowStyles: { fillColor: [255, 251, 235] },
          columnStyles: {
            0: { cellWidth: 28, fontStyle: "bold" },
            1: { cellWidth: 40 },
            2: { cellWidth: 28 },
            3: { cellWidth: 28 },
            4: { cellWidth: contentWidth - 28 - 40 - 28 - 28 - 14 },
            5: { cellWidth: 14, halign: "center" },
          },
          didDrawPage: () => { renderRunningHdr(); },
        });
        y = (doc as any).lastAutoTable.finalY + 3;

        // Per-chemical precautions list (collapsed, 1 line per precaution)
        for (const c of proc.chemicals) {
          if (!c.precautions || c.precautions.length === 0) continue;
          checkPageSpace(10);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(180, 83, 9);
          doc.text(L.precautionsFor(c.product_type), margin + 2, y);
          y += 3.5;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...GRAY_600);
          for (const p of c.precautions) {
            checkPageSpace(4);
            const lines = doc.splitTextToSize(`• ${p}`, contentWidth - 6);
            doc.text(lines, margin + 4, y);
            y += lines.length * 3.2;
          }
          y += 1;
        }
        y += 2;
      }

      // Follow-up
      if (proc.follow_up.length > 0) {
        checkPageSpace(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_DARK);
        doc.text(L.followUp, margin, y);
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
        doc.text(L.monitorBoxHeading, margin + 3, y + 5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        doc.text(monLines, margin + 3, y + 9);
        y += boxHeight + 4;
      }

      // Resolution proof reminder (every entry — this is what the user asked for)
      // The body text wraps so it fits across the box width. We size the box
      // to fit the wrapped text dynamically — Spanish text often wraps to 2
      // lines where English fits in 1.
      const docFixWrapped = doc.splitTextToSize(
        L.documentTheFixBody,
        contentWidth - 6,
      );
      const docFixBoxHeight = 6 + docFixWrapped.length * 3.4 + 2;
      checkPageSpace(docFixBoxHeight + 4);
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.roundedRect(margin, y, contentWidth, docFixBoxHeight, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(6, 95, 70);
      doc.text(L.documentTheFix, margin + 3, y + 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY_600);
      doc.text(docFixWrapped, margin + 3, y + 8);
      y += docFixBoxHeight + 4;
    }

    // ── FOOTER (all pages) ──
    step = "pdf-footer";
    const totalPages = doc.getNumberOfPages();
    const footerDate = new Date().toLocaleDateString(dateLocale);
    const footerTime = new Date().toLocaleTimeString(
      dateLocale === "es-MX" ? "es-MX" : [],
      { hour: "2-digit", minute: "2-digit" },
    );
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      // Rule above footer
      doc.setDrawColor(...GRAY_400);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      doc.setLineWidth(0.2);
      // Footer text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_400);
      doc.text("VMGC GreenKeeper Pro", margin, pageHeight - 7);
      doc.text(
        L.footer(footerDate, footerTime),
        pageWidth / 2,
        pageHeight - 7,
        { align: "center" },
      );
      doc.text(L.pageOfTotal(p, totalPages), pageWidth - margin, pageHeight - 7, {
        align: "right",
      });
    }

    step = "pdf-output";
    const filename = `${L.filenamePrefix}-${todayLocal()}.pdf`;
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
