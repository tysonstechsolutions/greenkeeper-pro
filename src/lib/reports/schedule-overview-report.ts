/**
 * Schedule overview prints — companion to schedule-handout-report.ts.
 *
 *  • generateDailyOverview — one portrait page summarizing every crew
 *    member's shift + tasks for a single day. Super's reference copy.
 *  • generateWeeklyOverview — one landscape page showing the whole
 *    Sun-Sat grid: rows = crew, columns = days, cells = task chips.
 *
 * Both operate on the in-memory ScheduleBoard so they reflect whatever
 * the user is currently looking at. No DB fetch.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScheduleBoard, BoardCell } from "@/lib/hooks/useScheduleBoard";
import { getBoardCell, SUN_DAY_LABELS } from "@/lib/hooks/useScheduleBoard";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { TaskPriority } from "@/types/database";
import { formatShiftTime, shiftTypeLabels } from "@/lib/hooks/useSchedule";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_400: [number, number, number] = [156, 163, 175];
const GRAY_700: [number, number, number] = [55, 65, 81];
const WHITE: [number, number, number] = [255, 255, 255];

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<TaskPriority, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  normal: [22, 163, 74],
  low: [107, 114, 128],
};

interface CommonOpts {
  board: ScheduleBoard;
  courseName?: string;
  preparedBy?: string;
}

export interface DailyOverviewOptions extends CommonOpts {
  date: string;
}

// Weekly overview takes the same options as the daily; the date range
// comes from board.dates so no extra fields are needed.
export type WeeklyOverviewOptions = CommonOpts;

export interface OverviewResult {
  blob: Blob;
  filename: string;
}

// ─── Daily overview ─────────────────────────────────────────────────────

export function generateDailyOverview(
  options: DailyOverviewOptions,
): OverviewResult {
  const {
    board,
    date,
    courseName = "Veterans Memorial Golf Course",
    preparedBy,
  } = options;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  // ── Header bar ──
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 28, pw, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text("Daily Schedule Overview", m, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(courseName, m, 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(formatLongDate(date), pw - m, 13, { align: "right" });

  // Count shown crew + tasks for the right-side header subtext.
  let totalCrew = 0;
  let totalTasks = 0;
  for (const c of board.crew) {
    const cell = getBoardCell(board, c.id, date);
    if (isWorkingCell(cell) || cell.tasks.length > 0) totalCrew++;
    totalTasks += cell.tasks.length;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `${totalCrew} crew · ${totalTasks} task${totalTasks === 1 ? "" : "s"}`,
    pw - m,
    21,
    { align: "right" },
  );

  // ── Body table ──
  const tableRows: any[][] = [];
  for (const c of board.crew) {
    const cell = getBoardCell(board, c.id, date);
    if (!isWorkingCell(cell) && cell.tasks.length === 0 && !cell.isTimeOff)
      continue;

    const name = c.display_name || c.full_name || "Crew";
    const shiftCol = formatShiftCell(cell);
    const tasks = [...cell.tasks].sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );
    const taskCol =
      tasks.length === 0
        ? "—"
        : tasks
            .map((t) => `• ${t.title}${formatTaskMeta(t)}`)
            .join("\n");

    tableRows.push([name, shiftCol, taskCol]);
  }

  if (tableRows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_400);
    doc.text("No crew is scheduled for this date.", m, 50);
  } else {
    autoTable(doc, {
      startY: 38,
      head: [["Crew", "Shift", "Tasks"]],
      body: tableRows,
      margin: { left: m, right: m },
      styles: {
        fontSize: 9,
        cellPadding: 2,
        valign: "top" as const,
        textColor: GRAY_700,
      },
      headStyles: {
        fillColor: BRAND_DARK,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: "bold", textColor: BRAND_DARK },
        1: { cellWidth: 38 },
        2: { cellWidth: "auto" as const },
      },
    });
  }

  drawFooter(doc, ph, pw, m, preparedBy);
  return {
    blob: doc.output("blob") as Blob,
    filename: `VMGC-Schedule-Daily-${date}.pdf`,
  };
}

// ─── Weekly overview ────────────────────────────────────────────────────

export function generateWeeklyOverview(
  options: WeeklyOverviewOptions,
): OverviewResult {
  const {
    board,
    courseName = "Veterans Memorial Golf Course",
    preparedBy,
  } = options;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10;

  // ── Header ──
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 22, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 22, pw, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text("Weekly Schedule", m, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(courseName, m, 17);

  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(formatWeekRange(board.dates), pw - m, 11, { align: "right" });

  // ── Build week-grid table ──
  const dayHeaders = board.dates.map((d) => formatGridHeader(d));
  const head = [["Crew", ...dayHeaders]];

  const body = board.crew.map((c) => {
    const name = c.display_name || c.full_name || "Crew";
    const cells = board.dates.map((d) => {
      const cell = getBoardCell(board, c.id, d);
      return formatGridCell(cell);
    });
    return [name, ...cells];
  });

  // Compute column widths so the day columns share equal space.
  const usable = pw - m * 2;
  const crewWidth = 32;
  const dayWidth = (usable - crewWidth) / 7;

  autoTable(doc, {
    startY: 28,
    head,
    body,
    margin: { left: m, right: m },
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      valign: "top" as const,
      textColor: GRAY_700,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: BRAND_DARK,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center" as const,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: {
        cellWidth: crewWidth,
        fontStyle: "bold",
        textColor: BRAND_DARK,
        fontSize: 8,
      },
      1: { cellWidth: dayWidth },
      2: { cellWidth: dayWidth },
      3: { cellWidth: dayWidth },
      4: { cellWidth: dayWidth },
      5: { cellWidth: dayWidth },
      6: { cellWidth: dayWidth },
      7: { cellWidth: dayWidth },
    },
    didParseCell: (d: any) => {
      // Highlight time-off cells with a light gray fill.
      if (d.section === "body" && d.column.index >= 1) {
        const raw = String(d.cell.raw || "");
        if (raw.startsWith("[OFF]")) {
          d.cell.styles.fillColor = [240, 240, 240];
          d.cell.styles.textColor = GRAY_400;
          d.cell.text = ["Time off"];
        }
      }
    },
  });

  drawFooter(doc, ph, pw, m, preparedBy);
  return {
    blob: doc.output("blob") as Blob,
    filename: `VMGC-Schedule-Week-${board.dates[0]}.pdf`,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isWorkingCell(cell: BoardCell): boolean {
  if (cell.isTimeOff) return false;
  if (!cell.shift?.shift_type) return false;
  return cell.shift.shift_type !== "off";
}

function formatShiftCell(cell: BoardCell): string {
  if (cell.isTimeOff) return "Time off";
  if (!cell.shift?.shift_type) return "—";
  const type = cell.shift.shift_type;
  const time = formatShiftTime(cell.shift.shift_start, cell.shift.shift_end);
  return time
    ? `${shiftTypeLabels[type]}\n${time}`
    : shiftTypeLabels[type];
}

function formatGridHeader(date: string): string {
  const d = new Date(date + "T00:00:00");
  const day = SUN_DAY_LABELS[d.getDay()];
  const md = `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
  return `${day}\n${md}`;
}

function formatGridCell(cell: BoardCell): string {
  if (cell.isTimeOff) return "[OFF] Time off";
  const lines: string[] = [];
  if (cell.shift?.shift_type) {
    const type = cell.shift.shift_type;
    const time = formatShiftTime(cell.shift.shift_start, cell.shift.shift_end);
    lines.push(time ? `▸ ${time}` : `▸ ${shiftTypeLabels[type]}`);
  }
  const sorted = [...cell.tasks].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  for (const t of sorted) {
    const prefix = t.priority === "critical" ? "! " : "• ";
    lines.push(`${prefix}${t.title}`);
  }
  return lines.join("\n") || "—";
}

function formatTaskMeta(t: TaskWithRelations): string {
  const parts: string[] = [];
  if (t.zone?.name) parts.push(t.zone.name);
  if (Array.isArray(t.hole_numbers) && t.hole_numbers.length > 0) {
    parts.push(`H${t.hole_numbers.join(",")}`);
  }
  if (t.estimated_minutes != null) parts.push(`${t.estimated_minutes}m`);
  return parts.length > 0 ? `  (${parts.join(", ")})` : "";
}

function formatLongDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekRange(dates: string[]): string {
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[6] + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

function drawFooter(
  doc: jsPDF,
  ph: number,
  pw: number,
  m: number,
  preparedBy?: string,
): void {
  const timestamp = new Date().toLocaleString("en-US");
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_400);
    const left = preparedBy
      ? `Generated ${timestamp} by ${preparedBy}`
      : `Generated ${timestamp}`;
    doc.text(left, m, ph - 5);
    doc.text(`Page ${p} of ${total}`, pw / 2, ph - 5, { align: "center" });
    doc.text("VMGC GreenKeeper Pro", pw - m, ph - 5, { align: "right" });
  }
}

// Re-exported for prettier import sites.
export { PRIORITY_COLORS };
