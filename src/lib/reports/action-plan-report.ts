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
import { getCachedUserId } from "@/lib/supabase/rest";
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

    // Initialise the running-header section label before the items loop.
    if (items.length > 0) {
      currentSection = items[0].surface === "Hole"
        ? (locale === "es" ? "SECCIÓN I — CANCHAS Y ROUGH" : "SECTION I — FAIRWAYS & ROUGH")
        : (locale === "es" ? "SECCIÓN II — GREENS" : "SECTION II — PUTTING SURFACES");
    }

    // ── DETAIL: ONE ISSUE PER PAGE ──
    step = "pdf-items";
    if (items.length === 0) {
      addPage(currentSection);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400);
      doc.text(L.noOpenIssues, margin, y + 10);
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

      const holeSectionLabel = locale === "es" ? "SECCIÓN I — CANCHAS Y ROUGH" : "SECTION I — FAIRWAYS & ROUGH";
      const greenSectionLabel = locale === "es" ? "SECCIÓN II — GREENS" : "SECTION II — PUTTING SURFACES";
      const prevSurface = i > 0 ? items[i - 1].surface : null;
      const isFirstGreen = item.surface === "Green" && prevSurface === "Hole";

      if (isFirstGreen) {
        // Section break panel on its own page
        addPage(greenSectionLabel);
        doc.setFillColor(...BRAND_GREEN);
        doc.rect(margin, y, contentWidth, 22, "F");
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(margin, y, 3.5, 22, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(255, 255, 255);
        doc.text(locale === "es" ? "SECCIÓN II" : "SECTION II", margin + 8, y + 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...BRAND_GOLD);
        doc.text(
          locale === "es" ? "Superficies de Putting — Greens" : "Putting Surfaces — Greens",
          margin + 8, y + 19,
        );
        const greenCount = items.filter((it) => it.surface === "Green").length;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(
          locale === "es" ? `${greenCount} elementos` : `${greenCount} items`,
          pageWidth - margin, y + 13, { align: "right" },
        );
        // Item starts on its own fresh page
        addPage(greenSectionLabel);
      } else {
        // Every item — including the first — gets its own page
        addPage(item.surface === "Hole" ? holeSectionLabel : greenSectionLabel);
      }

      // ── HEADER RIBBON ──
      const pColor = priorityColors[item.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.rect(margin, y, contentWidth, 12, "F");
      doc.setFillColor(...BRAND_GOLD);
      doc.rect(margin, y, 3.5, 12, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(`#${i + 1}`, margin + 7, y + 4.5);
      doc.setFontSize(12);
      doc.text(`${getSurfaceLabel(item.surface, locale)} ${item.hole_number}`, margin + 7, y + 10);
      doc.setFontSize(8);
      doc.text(
        `${getPriorityLabel(item.priority, locale).toUpperCase()}  ·  ${getStatusLabel(item.status, locale).toUpperCase()}`,
        pageWidth - margin - 3, y + 7, { align: "right" },
      );
      y += 15;

      // ── PHOTO (right) + TITLE / DESCRIPTION (left) ──
      const photoW = 55;
      const photoH = 42;
      const hasPhoto = !!photo;
      const textW = hasPhoto ? contentWidth - photoW - 5 : contentWidth;

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      const titleLines = doc.splitTextToSize(item.title, textW);
      doc.text(titleLines.slice(0, 2), margin, y + 4);
      let textY = y + 4 + titleLines.slice(0, 2).length * 5;

      // Issue type tag
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      const subline = `${issueLabel}${item.origin === "auto" ? L.autoIncluded : ""}`;
      doc.text(subline, margin, textY + 2);
      textY += 7;

      // Description (up to 4 lines beside the photo)
      if (item.description) {
        const descLines = doc.splitTextToSize(item.description, textW);
        doc.text(descLines.slice(0, 4), margin, textY);
        textY += descLines.slice(0, 4).length * 3.4 + 2;
      }

      // Photo on the right
      if (hasPhoto) {
        try {
          const imgFormat = photo!.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(photo!, imgFormat, margin + contentWidth - photoW, y, photoW, photoH);
        } catch { /* skip broken images */ }
      }

      y = Math.max(textY, hasPhoto ? y + photoH : y) + 4;

      // ── THIN RULE SEPARATOR ──
      doc.setDrawColor(...GRAY_400);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(margin, y, pageWidth - margin, y);
      doc.setLineDashPattern([], 0);
      y += 5;

      // ── META STRIP (Best Window · Crew · Duration) ──
      doc.setFillColor(247, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(margin, y, contentWidth, 11, 2, 2, "FD");

      const col3 = contentWidth / 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(L.bestWindow, margin + 3, y + 3.5);
      doc.text(L.crew, margin + col3 + 3, y + 3.5);
      doc.text(L.duration, margin + col3 * 2 + 3, y + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      const bwLines = doc.splitTextToSize(proc.best_window, col3 - 6);
      doc.text(bwLines.slice(0, 1), margin + 3, y + 8);
      doc.text(proc.crew, margin + col3 + 3, y + 8);
      doc.text(proc.duration, margin + col3 * 2 + 3, y + 8);
      y += 14;

      // ── TOOLS & MATERIALS ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...BRAND_DARK);
      doc.text(L.toolsAndMaterials, margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY_600);

      // Two-column tool list
      const toolList = proc.tools_needed;
      const halfLen = Math.ceil(toolList.length / 2);
      const colToolW = (contentWidth - 8) / 2;
      let col1Y = y;
      let col2Y = y;
      toolList.forEach((tool, ti) => {
        const colX = ti < halfLen ? margin + 2 : margin + 2 + colToolW + 4;
        const currentColY = ti < halfLen ? col1Y : col2Y;
        const lines = doc.splitTextToSize(`• ${tool}`, colToolW - 2);
        doc.text(lines, colX, currentColY);
        if (ti < halfLen) col1Y += lines.length * 3.3;
        else col2Y += lines.length * 3.3;
      });
      y = Math.max(col1Y, col2Y) + 3;

      // ── STEP-BY-STEP ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
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
        styles: { fontSize: 7.5, cellPadding: 2, valign: "top" },
        headStyles: {
          fillColor: BRAND_GREEN,
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: "bold",
          minCellHeight: 8,
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 72, fontStyle: "bold" },
          2: { cellWidth: contentWidth - 80, textColor: GRAY_600 },
        },
        didDrawPage: () => { renderRunningHdr(); },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
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
