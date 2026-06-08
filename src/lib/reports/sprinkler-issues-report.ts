/**
 * Sprinkler Issues Report — client-side PDF.
 *
 * A focused, printable list of every OPEN sprinkler issue. For any issue that
 * forced a valve shut, it also lists the full set of heads that valve feeds —
 * every sprinkler that's offline until the issue is resolved.
 *
 * Brand palette + page setup match sprinkler-report.ts.
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
  | "other"
  | "wont_pop_up"
  | "stuck_up"
  | "not_rotating"
  | "misaligned"
  | "sunken"
  | "mower_damage"
  | "valve"
  | "wiring"
  | "no_comm";

type IssueSeverity = "low" | "medium" | "high";
type IssueStatus = "open" | "resolved";

interface Sprinkler {
  id: string;
  satellite_num: number;
  station_num: number;
  hole_number: number;
  area_type: AreaType;
  label: string | null;
}

interface SprinklerIssue {
  id: string;
  sprinkler_id: string;
  issue_type: IssueType;
  severity: IssueSeverity;
  description: string | null;
  status: IssueStatus;
  reported_at: string;
  valve_id: string | null;
}

interface Valve {
  id: string;
  label: string;
  member_sprinkler_ids: string[];
}

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  low_pressure: "Low pressure",
  no_spray: "No spray",
  one_side_only: "One side only",
  not_rotating: "Not rotating",
  clogged: "Clogged nozzle",
  misaligned: "Misaligned / overspray",
  leaking: "Leaking",
  wont_pop_up: "Won't pop up",
  stuck_up: "Stuck up (won't retract)",
  stuck_on: "Stuck on (won't shut off)",
  stuck_off: "Stuck off (won't run)",
  sunken: "Sunken / low head",
  broken: "Broken head",
  mower_damage: "Mower / cart damage",
  valve: "Valve issue",
  wiring: "Wiring / solenoid",
  no_comm: "No communication",
  other: "Other",
};

const AREA_LABELS: Record<AreaType, string> = {
  green: "Green",
  tee: "Tee",
  fairway: "Fairway",
};

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const SLATE: [number, number, number] = [71, 85, 105];

const SEVERITY_COLORS: Record<IssueSeverity, [number, number, number]> = {
  low: [234, 179, 8],
  medium: [249, 115, 22],
  high: [220, 38, 38],
};

const RUNNING_HDR_H = 13;

export class SprinklerIssuesReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "SprinklerIssuesReportError";
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function issueLabel(t: IssueType): string {
  return ISSUE_TYPE_LABELS[t] ?? String(t);
}

export async function generateSprinklerIssuesReport(): Promise<{
  blob: Blob;
  filename: string;
}> {
  let step = "init";
  try {
    const supabase = createClient();

    step = "auth";
    const userId = getCachedUserId();
    if (!userId) throw new SprinklerIssuesReportError(step, "Not signed in");

    step = "fetch-profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    step = "fetch-data";
    const [sprinklersRes, issuesRes, valvesRes] = await Promise.all([
      (supabase.from("irrigation_sprinklers") as any)
        .select("id,satellite_num,station_num,hole_number,area_type,label")
        .order("hole_number", { ascending: true })
        .order("satellite_num", { ascending: true })
        .order("station_num", { ascending: true }),
      (supabase.from("irrigation_sprinkler_issues") as any)
        .select("*")
        .order("reported_at", { ascending: false }),
      // Valves may not exist before the 20260605 migration — tolerate that.
      (supabase.from("irrigation_valves") as any).select("*"),
    ]);

    if (sprinklersRes.error)
      throw new SprinklerIssuesReportError(step, sprinklersRes.error.message);
    if (issuesRes.error)
      throw new SprinklerIssuesReportError(step, issuesRes.error.message);

    const sprinklers = (sprinklersRes.data ?? []) as Sprinkler[];
    const issues = (issuesRes.data ?? []) as SprinklerIssue[];
    const valves = (valvesRes?.error ? [] : valvesRes?.data ?? []) as Valve[];

    const spById = new Map(sprinklers.map((s) => [s.id, s]));
    const valveById = new Map(valves.map((v) => [v.id, v]));
    const headLabel = (s: Sprinkler) => `${s.satellite_num}-${s.station_num}`;

    // Open issues, sorted by severity (high → low) then hole.
    const openIssues = issues
      .filter((i) => i.status === "open")
      .map((iss) => ({ iss, sp: spById.get(iss.sprinkler_id) }))
      .filter((r): r is { iss: SprinklerIssue; sp: Sprinkler } => !!r.sp)
      .sort((a, b) => {
        const sd = SEVERITY_RANK[b.iss.severity] - SEVERITY_RANK[a.iss.severity];
        if (sd !== 0) return sd;
        return a.sp.hole_number - b.sp.hole_number;
      });

    // Valve shutoffs among the open issues + the heads they knock offline.
    const shutoffs = openIssues
      .filter(({ iss }) => iss.valve_id && valveById.has(iss.valve_id))
      .map(({ iss, sp }) => {
        const valve = valveById.get(iss.valve_id as string)!;
        const affected = valve.member_sprinkler_ids
          .map((id) => spById.get(id))
          .filter((s): s is Sprinkler => !!s)
          .sort(
            (a, b) =>
              a.hole_number - b.hole_number ||
              a.satellite_num - b.satellite_num ||
              a.station_num - b.station_num,
          );
        return { iss, sp, valve, affected };
      });

    const offlineHeadIds = new Set<string>();
    shutoffs.forEach((s) => s.affected.forEach((h) => offlineHeadIds.add(h.id)));

    step = "pdf-init";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const BOTTOM_LIMIT = pageHeight - 15;
    let y = margin;

    const reportTitle = "Sprinkler Issues Report";

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
    doc.text("Sprinkler Issues Report", margin + 5, 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Open issues + every head a shut valve takes offline", margin + 5, 36);

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

    // ── SUMMARY ──────────────────────────────────────────────────────────
    step = "pdf-summary";
    const highCount = openIssues.filter((r) => r.iss.severity === "high").length;
    const stats: Array<{
      label: string;
      value: string;
      color: [number, number, number];
    }> = [
      {
        label: "Open issues",
        value: String(openIssues.length),
        color: openIssues.length > 0 ? [220, 38, 38] : BRAND_DARK,
      },
      {
        label: "High sev.",
        value: String(highCount),
        color: highCount > 0 ? SEVERITY_COLORS.high : BRAND_DARK,
      },
      {
        label: "Valve shutoffs",
        value: String(shutoffs.length),
        color: shutoffs.length > 0 ? SLATE : BRAND_DARK,
      },
      {
        label: "Heads offline",
        value: String(offlineHeadIds.size),
        color: offlineHeadIds.size > 0 ? SLATE : BRAND_DARK,
      },
    ];

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 26, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, 26, 3, 3, "S");
    const colW = contentWidth / stats.length;
    stats.forEach((stat, idx) => {
      const cx = margin + idx * colW + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...stat.color);
      doc.text(stat.value, cx, y + 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
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
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [
          ["Hole", "Area", "Head", "Issue", "Sev.", "Reported", "Valve shut", "Description"],
        ],
        body: openIssues.map(({ iss, sp }) => {
          const valve = iss.valve_id ? valveById.get(iss.valve_id) : null;
          return [
            sp.hole_number.toString(),
            AREA_LABELS[sp.area_type],
            headLabel(sp),
            issueLabel(iss.issue_type),
            iss.severity.toUpperCase(),
            fmtDate(iss.reported_at),
            valve ? valve.label : "—",
            (iss.description ?? "") + (sp.label ? ` (${sp.label})` : ""),
          ];
        }),
        styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 11, halign: "center" },
          1: { cellWidth: 15 },
          2: { cellWidth: 13, halign: "center" },
          3: { cellWidth: 27 },
          4: { cellWidth: 13, halign: "center" },
          5: { cellWidth: 18 },
          6: { cellWidth: 24 },
          7: { cellWidth: "auto" as any },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
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

    // ── VALVE SHUTOFFS — AFFECTED SPRINKLERS ─────────────────────────────
    step = "pdf-shutoffs";
    if (shutoffs.length > 0) {
      checkPageSpace(24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND_DARK);
      doc.text("Valve Shutoffs — Affected Sprinklers", margin, y);
      y += 4;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      doc.text(
        "Every head fed by a shut valve is offline until its issue is resolved.",
        margin,
        y,
      );
      y += 6;

      for (const { iss, sp, valve, affected } of shutoffs) {
        checkPageSpace(26);
        // Shutoff heading band.
        doc.setFillColor(241, 245, 249); // slate-100
        doc.roundedRect(margin, y - 4, contentWidth, 12, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...SLATE);
        doc.text(`Valve: ${valve.label}`, margin + 3, y + 1);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY_600);
        doc.text(
          `Shut for ${headLabel(sp)} (Hole ${sp.hole_number} ${AREA_LABELS[sp.area_type]} — ${issueLabel(iss.issue_type)}, ${iss.severity}) · ${affected.length} ${affected.length === 1 ? "head" : "heads"} offline`,
          margin + 3,
          y + 5.5,
        );
        y += 11;

        if (affected.length === 0) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY_600);
          doc.text("(no mapped heads on this valve)", margin + 3, y + 2);
          y += 7;
          continue;
        }

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [["Head", "Hole", "Area", "Label", "Note"]],
          body: affected.map((h) => [
            headLabel(h),
            h.hole_number.toString(),
            AREA_LABELS[h.area_type],
            h.label ?? "",
            h.id === sp.id ? "Issue is here" : "Offline",
          ]),
          styles: { fontSize: 8, cellPadding: 1.2 },
          headStyles: { fillColor: SLATE, textColor: 255, fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 18, halign: "center" },
            1: { cellWidth: 14, halign: "center" },
            2: { cellWidth: 20 },
            3: { cellWidth: "auto" as any },
            4: { cellWidth: 26 },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 4) {
              if ((data.cell.raw as string) === "Issue is here") {
                data.cell.styles.textColor = SEVERITY_COLORS.high as any;
                data.cell.styles.fontStyle = "bold";
              } else {
                data.cell.styles.textColor = SLATE as any;
              }
            }
          },
          didDrawPage: () => renderRunningHdr(),
        });
        y = (doc as any).lastAutoTable.finalY + 7;
      }
    }

    // ── FOOTER ───────────────────────────────────────────────────────────
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
        `Generated ${dateShort} · VMGC Sprinkler Issues`,
        margin,
        pageHeight - 7,
      );
      doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 7, {
        align: "right",
      });
    }

    step = "blob";
    const blob = doc.output("blob");
    return { blob, filename: `VMGC-sprinkler-issues-${dateShort}.pdf` };
  } catch (err) {
    if (err instanceof SprinklerIssuesReportError) throw err;
    throw new SprinklerIssuesReportError(
      step,
      err instanceof Error ? err.message : String(err),
    );
  }
}
