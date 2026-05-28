/**
 * Sprinkler System Report — client-side PDF generator.
 *
 * Produces a multi-section PDF covering:
 *   1. Cover + summary stats
 *   2. Open issues table
 *   3. Full sprinkler inventory grouped by satellite
 *   4. Station inventory grid per satellite
 *
 * Brand palette + page setup match observation-report.ts.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import { getCachedUserId } from "@/lib/supabase/rest";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AreaType = "green" | "tee" | "fairway";

type IssueType =
  | "low_pressure"
  | "one_side_only"
  | "no_spray"
  | "broken"
  | "leaking"
  | "clogged"
  | "stuck_on"
  | "stuck_off"
  | "other";

type IssueSeverity = "low" | "medium" | "high";
type IssueStatus = "open" | "resolved";
type StationStatus = "unused" | "broken" | "note_only";

interface Sprinkler {
  id: string;
  satellite_num: number;
  station_num: number;
  hole_number: number;
  area_type: AreaType;
  x_pct: number;
  y_pct: number;
  label: string | null;
  notes: string | null;
}

interface SprinklerIssue {
  id: string;
  sprinkler_id: string;
  issue_type: IssueType;
  severity: IssueSeverity;
  description: string | null;
  status: IssueStatus;
  reported_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

interface SatelliteStation {
  satellite_num: number;
  station_num: number;
  status: StationStatus;
  notes: string | null;
}

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  low_pressure: "Low pressure",
  one_side_only: "One side only",
  no_spray: "No spray",
  broken: "Broken head",
  leaking: "Leaking",
  clogged: "Clogged",
  stuck_on: "Stuck on",
  stuck_off: "Stuck off",
  other: "Other",
};

const AREA_LABELS: Record<AreaType, string> = {
  green: "Green",
  tee: "Tee",
  fairway: "Fairway",
};

const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  unused: "Unused",
  broken: "Broken",
  note_only: "Note",
};

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];

const RUNNING_HDR_H = 13;

const SEVERITY_COLORS: Record<IssueSeverity, [number, number, number]> = {
  low: [234, 179, 8], // amber-500
  medium: [249, 115, 22], // orange-500
  high: [220, 38, 38], // red-600
};

const AREA_PALETTE: Record<AreaType, [number, number, number]> = {
  green: [34, 197, 94],
  tee: [132, 204, 22],
  fairway: [59, 130, 246],
};

const STATION_STATUS_PALETTE: Record<StationStatus, [number, number, number]> = {
  unused: [156, 163, 175], // gray-400
  broken: [220, 38, 38], // red-600
  note_only: [245, 158, 11], // amber-500
};

export class SprinklerReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "SprinklerReportError";
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function highestOpenIssue(
  sprinklerId: string,
  issues: SprinklerIssue[],
): SprinklerIssue | null {
  const open = issues.filter(
    (i) => i.sprinkler_id === sprinklerId && i.status === "open",
  );
  if (open.length === 0) return null;
  return open.reduce((best, cur) =>
    SEVERITY_RANK[cur.severity] > SEVERITY_RANK[best.severity] ? cur : best,
  );
}

function lastServicedAt(
  sprinklerId: string,
  issues: SprinklerIssue[],
): string | null {
  const resolved = issues
    .filter(
      (i) =>
        i.sprinkler_id === sprinklerId &&
        i.status === "resolved" &&
        i.resolved_at,
    )
    .map((i) => i.resolved_at as string);
  if (resolved.length === 0) return null;
  return resolved.reduce((a, b) => (a > b ? a : b));
}

export async function generateSprinklerReport(): Promise<{
  blob: Blob;
  filename: string;
}> {
  let step = "init";
  try {
    const supabase = createClient();

    step = "auth";
    const userId = getCachedUserId();
    if (!userId) throw new SprinklerReportError(step, "Not signed in");

    step = "fetch-profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    step = "fetch-data";
    const [sprinklersRes, issuesRes, stationsRes] = await Promise.all([
      (supabase.from("irrigation_sprinklers") as any)
        .select("*")
        .order("satellite_num", { ascending: true })
        .order("station_num", { ascending: true })
        .order("hole_number", { ascending: true }),
      (supabase.from("irrigation_sprinkler_issues") as any)
        .select("*")
        .order("reported_at", { ascending: false }),
      (supabase.from("irrigation_satellite_stations") as any)
        .select("*")
        .order("satellite_num", { ascending: true })
        .order("station_num", { ascending: true }),
    ]);

    if (sprinklersRes.error)
      throw new SprinklerReportError(step, sprinklersRes.error.message);
    if (issuesRes.error)
      throw new SprinklerReportError(step, issuesRes.error.message);
    if (stationsRes.error)
      throw new SprinklerReportError(step, stationsRes.error.message);

    const sprinklers = (sprinklersRes.data ?? []) as Sprinkler[];
    const issues = (issuesRes.data ?? []) as SprinklerIssue[];
    const stationNotes = (stationsRes.data ?? []) as SatelliteStation[];

    step = "pdf-init";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const BOTTOM_LIMIT = pageHeight - 15;
    let y = margin;

    const reportTitle = "Sprinkler System Report";

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
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND_GOLD);
      doc.text(reportTitle, pageWidth / 2, RUNNING_HDR_H - 4.5, {
        align: "center",
      });
    };

    const addPage = () => {
      doc.addPage();
      renderRunningHdr();
      y = RUNNING_HDR_H + 5;
    };

    const checkPageSpace = (needed: number) => {
      if (y + needed > BOTTOM_LIMIT) addPage();
    };

    // ── COVER ─────────────────────────────────────────────────────────────
    step = "pdf-cover";
    const COVER_HDR_H = 58;
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, COVER_HDR_H, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 0, 3.5, COVER_HDR_H, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, COVER_HDR_H, pageWidth, 1.5, "F");

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const dateShort = new Date().toISOString().slice(0, 10);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("VMGC  ·  GreenKeeper Pro", margin + 5, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(190, 200, 210);
    doc.text(dateStr, pageWidth - margin, 9, { align: "right" });

    doc.setDrawColor(...BRAND_GOLD);
    doc.setLineWidth(0.25);
    doc.line(margin + 5, 12, pageWidth - margin, 12);
    doc.setLineWidth(0.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text("Sprinkler System Report", margin + 5, 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Rainbird satellite + station inventory", margin + 5, 36);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(170, 185, 200);
    doc.text("PREPARED BY", pageWidth - margin, 20, { align: "right" });
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

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(110, 125, 140);
    doc.text(
      "Confidential — For Internal Course Operations Use Only",
      margin + 5,
      55,
    );

    y = COVER_HDR_H + 9;

    // ── SUMMARY BOX ──────────────────────────────────────────────────────
    step = "pdf-summary";
    const openIssues = issues.filter((i) => i.status === "open");
    const highIssues = openIssues.filter((i) => i.severity === "high");
    const sprinklersWithOpen = new Set(openIssues.map((i) => i.sprinkler_id))
      .size;
    const distinctSats = new Set(sprinklers.map((s) => s.satellite_num)).size;
    const stationCount =
      new Set(sprinklers.map((s) => `${s.satellite_num}-${s.station_num}`))
        .size;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 28, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, 28, 3, 3, "S");

    const stats: Array<{
      label: string;
      value: string;
      color: [number, number, number];
    }> = [
      { label: "Sprinklers", value: String(sprinklers.length), color: BRAND_GREEN },
      { label: "Satellites", value: String(distinctSats), color: BRAND_GREEN },
      { label: "Stations used", value: String(stationCount), color: BRAND_GREEN },
      { label: "Open issues", value: String(openIssues.length), color: openIssues.length > 0 ? [220, 38, 38] : BRAND_GREEN },
      { label: "High sev.", value: String(highIssues.length), color: SEVERITY_COLORS.high },
      { label: "Affected heads", value: String(sprinklersWithOpen), color: openIssues.length > 0 ? [220, 38, 38] : BRAND_GREEN },
    ];

    const colW = contentWidth / stats.length;
    stats.forEach((stat, idx) => {
      const cx = margin + idx * colW + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...stat.color);
      doc.text(stat.value, cx, y + 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      doc.text(stat.label, cx, y + 19, { align: "center" });
    });
    y += 32;

    // ── OPEN ISSUES TABLE ────────────────────────────────────────────────
    step = "pdf-issues";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Open Issues", margin, y);
    y += 5;

    if (openIssues.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      doc.text("No open issues — all sprinklers in service.", margin, y);
      y += 8;
    } else {
      // Sort by severity desc, then hole asc
      const sortedIssues = [...openIssues]
        .map((iss) => {
          const sp = sprinklers.find((s) => s.id === iss.sprinkler_id);
          return { iss, sp };
        })
        .filter((row) => row.sp !== undefined)
        .sort((a, b) => {
          const sevDiff =
            SEVERITY_RANK[b.iss.severity] - SEVERITY_RANK[a.iss.severity];
          if (sevDiff !== 0) return sevDiff;
          return (a.sp!.hole_number ?? 0) - (b.sp!.hole_number ?? 0);
        });

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Hole", "Area", "Sat", "Sta", "Issue", "Sev.", "Reported", "Description"]],
        body: sortedIssues.map(({ iss, sp }) => [
          sp!.hole_number.toString(),
          AREA_LABELS[sp!.area_type],
          sp!.satellite_num.toString(),
          sp!.station_num.toString(),
          ISSUE_TYPE_LABELS[iss.issue_type],
          iss.severity.toUpperCase(),
          fmtDate(iss.reported_at),
          (iss.description ?? "") + (sp!.label ? ` (${sp!.label})` : ""),
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 16 },
          2: { cellWidth: 10, halign: "center" },
          3: { cellWidth: 10, halign: "center" },
          4: { cellWidth: 26 },
          5: { cellWidth: 14, halign: "center" },
          6: { cellWidth: 20 },
          7: { cellWidth: "auto" as any },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const sev = (data.cell.raw as string).toLowerCase() as IssueSeverity;
            const color = SEVERITY_COLORS[sev];
            if (color) {
              data.cell.styles.fillColor = color;
              data.cell.styles.textColor = 255;
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
        didDrawPage: () => renderRunningHdr(),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── FULL INVENTORY BY SATELLITE ──────────────────────────────────────
    step = "pdf-inventory";
    checkPageSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_DARK);
    doc.text("Full Inventory — By Satellite", margin, y);
    y += 5;

    const satellites = Array.from(
      new Set([
        ...sprinklers.map((s) => s.satellite_num),
        ...stationNotes.map((n) => n.satellite_num),
      ]),
    ).sort((a, b) => a - b);

    if (satellites.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_600);
      doc.text("No sprinklers mapped yet.", margin, y);
      y += 8;
    }

    for (const sat of satellites) {
      const satSprinklers = sprinklers.filter((s) => s.satellite_num === sat);
      const satNotes = stationNotes.filter((n) => n.satellite_num === sat);
      const satOpenCount = satSprinklers.filter(
        (s) => highestOpenIssue(s.id, issues) !== null,
      ).length;

      checkPageSpace(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND_DARK);
      doc.text(`Satellite ${sat}`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(
        `${satSprinklers.length} ${satSprinklers.length === 1 ? "head" : "heads"} · ${satOpenCount} open issue${satOpenCount === 1 ? "" : "s"}`,
        margin + 30,
        y,
      );
      y += 3;

      // Build rows: each sprinkler + any station notes (no sprinklers)
      const rows: any[][] = [];
      satSprinklers.forEach((s) => {
        const openIss = highestOpenIssue(s.id, issues);
        const ls = lastServicedAt(s.id, issues);
        rows.push([
          s.station_num.toString(),
          s.hole_number.toString(),
          AREA_LABELS[s.area_type],
          s.label ?? "",
          openIss ? `${ISSUE_TYPE_LABELS[openIss.issue_type]} (${openIss.severity})` : "OK",
          ls ? fmtDate(ls) : "—",
        ]);
      });
      satNotes.forEach((n) => {
        rows.push([
          n.station_num.toString(),
          "—",
          "—",
          STATION_STATUS_LABELS[n.status],
          n.notes ?? "",
          "—",
        ]);
      });

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Station", "Hole", "Area", "Label", "Status", "Last serviced"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 1.2 },
        headStyles: {
          fillColor: BRAND_GREEN,
          textColor: 255,
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 16, halign: "center" },
          1: { cellWidth: 12, halign: "center" },
          2: { cellWidth: 18 },
          3: { cellWidth: 35 },
          4: { cellWidth: "auto" as any },
          5: { cellWidth: 26 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
            const text = (data.cell.raw as string) ?? "";
            if (text !== "OK" && text !== "—") {
              // Style based on whether it's a "Broken" station note or an issue
              const isBroken = text === STATION_STATUS_LABELS.broken;
              const isUnused = text === STATION_STATUS_LABELS.unused;
              if (isBroken) {
                data.cell.styles.fillColor = STATION_STATUS_PALETTE.broken;
                data.cell.styles.textColor = 255;
              } else if (isUnused) {
                data.cell.styles.fillColor = STATION_STATUS_PALETTE.unused;
                data.cell.styles.textColor = 255;
              } else if (text.includes("(high)")) {
                data.cell.styles.fillColor = SEVERITY_COLORS.high;
                data.cell.styles.textColor = 255;
              } else if (text.includes("(medium)")) {
                data.cell.styles.fillColor = SEVERITY_COLORS.medium;
                data.cell.styles.textColor = 255;
              } else if (text.includes("(low)")) {
                data.cell.styles.fillColor = SEVERITY_COLORS.low;
                data.cell.styles.textColor = 0;
              }
            } else if (text === "OK") {
              data.cell.styles.textColor = BRAND_GREEN as any;
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
        didDrawPage: () => renderRunningHdr(),
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ── STATION INVENTORY GRIDS ──────────────────────────────────────────
    step = "pdf-station-grids";
    if (satellites.length > 0) {
      checkPageSpace(40);
      // New page for clarity
      addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Station Inventory Grids", margin, y);
      y += 6;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(
        "Per-satellite station grid. Color shows what each station number controls.",
        margin,
        y,
      );
      y += 6;

      // Legend
      const legendItems: Array<{ color: [number, number, number]; label: string }> = [
        { color: AREA_PALETTE.green, label: "Green heads" },
        { color: AREA_PALETTE.tee, label: "Tee heads" },
        { color: AREA_PALETTE.fairway, label: "Fairway heads" },
        { color: STATION_STATUS_PALETTE.unused, label: "Unused" },
        { color: STATION_STATUS_PALETTE.broken, label: "Broken" },
        { color: STATION_STATUS_PALETTE.note_only, label: "Note only" },
        { color: [229, 231, 235], label: "Unknown" },
      ];

      let lx = margin;
      const ly = y;
      legendItems.forEach((item) => {
        doc.setFillColor(...item.color);
        doc.roundedRect(lx, ly - 3, 4, 4, 0.6, 0.6, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        doc.text(item.label, lx + 5.2, ly + 0.2);
        lx += 5.2 + doc.getTextWidth(item.label) + 5;
        if (lx > pageWidth - margin - 25) {
          lx = margin;
          y += 6;
        }
      });
      y += 8;

      // Grid params
      const CELL_SIZE = 7; // mm
      const CELL_GAP = 0.8;
      const COLS = 16; // columns per row, fits A4 with our margin

      for (const sat of satellites) {
        const satSprinklers = sprinklers.filter((s) => s.satellite_num === sat);
        const satNotes = stationNotes.filter((n) => n.satellite_num === sat);

        const maxSta = Math.max(
          24,
          ...satSprinklers.map((s) => s.station_num),
          ...satNotes.map((n) => n.station_num),
        );
        const totalStations = Math.ceil(maxSta / 12) * 12;
        const rows = Math.ceil(totalStations / COLS);
        const gridHeight = rows * (CELL_SIZE + CELL_GAP) + 6;

        checkPageSpace(gridHeight + 10);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...BRAND_DARK);
        doc.text(`Satellite ${sat}`, margin, y);
        y += 4;

        for (let i = 0; i < totalStations; i++) {
          const sta = i + 1;
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const cx = margin + col * (CELL_SIZE + CELL_GAP);
          const cy = y + row * (CELL_SIZE + CELL_GAP);

          const head = satSprinklers.find((s) => s.station_num === sta);
          const note = satNotes.find((n) => n.station_num === sta);

          let bg: [number, number, number] = [229, 231, 235]; // unknown
          let textColor: [number, number, number] = [55, 65, 81];
          if (head) {
            bg = AREA_PALETTE[head.area_type];
            textColor = [255, 255, 255];
          } else if (note) {
            bg = STATION_STATUS_PALETTE[note.status];
            textColor = [255, 255, 255];
          }

          doc.setFillColor(...bg);
          doc.roundedRect(cx, cy, CELL_SIZE, CELL_SIZE, 0.8, 0.8, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(...textColor);
          doc.text(
            String(sta),
            cx + CELL_SIZE / 2,
            cy + CELL_SIZE / 2 + 1.2,
            { align: "center" },
          );

          // Open-issue indicator (small red dot in corner)
          if (head && highestOpenIssue(head.id, issues)) {
            doc.setFillColor(...SEVERITY_COLORS.high);
            doc.circle(cx + CELL_SIZE - 1, cy + 1, 0.9, "F");
          }
        }

        y += rows * (CELL_SIZE + CELL_GAP) + 6;
      }
    }

    // ── FOOTER ON ALL PAGES ──────────────────────────────────────────────
    step = "pdf-footer";
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(...BRAND_GOLD);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY_600);
      doc.text(
        `Generated ${dateShort} · VMGC Sprinkler Report`,
        margin,
        pageHeight - 7,
      );
      doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 7, {
        align: "right",
      });
    }

    step = "blob";
    const blob = doc.output("blob");
    return { blob, filename: `VMGC-sprinkler-report-${dateShort}.pdf` };
  } catch (err) {
    if (err instanceof SprinklerReportError) throw err;
    throw new SprinklerReportError(
      step,
      err instanceof Error ? err.message : String(err),
    );
  }
}
