/**
 * Schedule handouts — per-person daily PDF for the morning meeting.
 *
 * Generates a single PDF with one page per crew member who's working a
 * given day. Each page is a printable handout the super hands to that
 * person: their shift, their assigned tasks (with paper checkboxes),
 * zone, estimated minutes, and any task-level checklist items.
 *
 * Pure client-side — operates on the in-memory ScheduleBoard rather
 * than re-fetching from the DB, so it's instant and reflects whatever
 * the user is currently looking at on the board.
 */
import { jsPDF } from "jspdf";
import type { ScheduleBoard, BoardCell } from "@/lib/hooks/useScheduleBoard";
import { getBoardCell } from "@/lib/hooks/useScheduleBoard";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { Task, TaskPriority } from "@/types/database";
import { formatShiftTime, shiftTypeLabels } from "@/lib/hooks/useSchedule";

// Brand palette (matches daily-assignments-report.ts).
const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_400: [number, number, number] = [156, 163, 175];
const GRAY_700: [number, number, number] = [55, 65, 81];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  normal: "NORMAL",
  low: "LOW",
};

const PRIORITY_COLORS: Record<TaskPriority, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  normal: [22, 163, 74],
  low: [107, 114, 128],
};

export interface PerPersonHandoutOptions {
  board: ScheduleBoard;
  /** Date YYYY-MM-DD within board.dates. */
  date: string;
  /** Optional filter to a single crew member id. Default: all working crew. */
  userId?: string;
  /** Course / org name printed under the title. */
  courseName?: string;
  /** Person who prepared the handout (footer). */
  preparedBy?: string;
}

export interface HandoutResult {
  blob: Blob;
  filename: string;
  /** Number of crew pages emitted. 0 if nobody had tasks or a shift. */
  pageCount: number;
}

/**
 * Build the multi-page PDF. Pages are alphabetical-by-name within each
 * role group, matching the on-screen board ordering.
 */
export function generatePerPersonHandouts(
  options: PerPersonHandoutOptions,
): HandoutResult {
  const {
    board,
    date,
    userId,
    courseName = "Veterans Memorial Golf Course",
    preparedBy,
  } = options;

  // Pick the crew to print: filter by userId if provided, else everyone
  // who has either a non-off shift or any task on this date.
  const targets = board.crew.filter((c) => {
    if (userId && c.id !== userId) return false;
    const cell = getBoardCell(board, c.id, date);
    return shouldIncludeOnHandout(cell);
  });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  if (targets.length === 0) {
    drawHeader(doc, "Schedule", courseName, date, "0 assignments", pw, m);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_400);
    doc.text(
      "No crew is scheduled and no tasks are assigned for this date.",
      m,
      50,
    );
    drawFooter(doc, ph, pw, m, preparedBy);
    return {
      blob: doc.output("blob") as Blob,
      filename: filenameFor(date, userId ? targets[0]?.full_name : undefined),
      pageCount: 0,
    };
  }

  let pageCount = 0;
  for (let i = 0; i < targets.length; i++) {
    const member = targets[i];
    const cell = getBoardCell(board, member.id, date);
    if (i > 0) doc.addPage();
    drawPersonPage(doc, {
      name: member.display_name || member.full_name || "Crew",
      role: prettyRole(member.role),
      cell,
      date,
      courseName,
      pw,
      ph,
      m,
    });
    pageCount++;
  }

  // Footer applies to every page.
  drawFooter(doc, ph, pw, m, preparedBy);

  return {
    blob: doc.output("blob") as Blob,
    filename: filenameFor(
      date,
      userId ? targets[0]?.full_name : undefined,
    ),
    pageCount,
  };
}

// ── Drawing helpers ──────────────────────────────────────────────────────

interface PersonPageInput {
  name: string;
  role: string;
  cell: BoardCell;
  date: string;
  courseName: string;
  pw: number;
  ph: number;
  m: number;
}

function drawPersonPage(doc: jsPDF, input: PersonPageInput): void {
  const { name, role, cell, date, courseName, pw, ph, m } = input;

  // ── Brand header bar ──
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 28, pw, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text(name, m, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(role, m, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text(formatLongDate(date), pw - m, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(courseName, pw - m, 22, { align: "right" });

  let y = 38;

  // ── Shift / Time-off banner ──
  if (cell.isTimeOff) {
    drawBanner(doc, m, y, pw - m * 2, "Approved time off", GRAY_400);
    y += 14;
  } else if (cell.shift?.shift_type) {
    const label = shiftLabel(cell.shift);
    drawBanner(doc, m, y, pw - m * 2, label, BRAND_DARK);
    y += 14;
  } else {
    drawBanner(doc, m, y, pw - m * 2, "Shift not set", GRAY_400);
    y += 14;
  }

  // ── Task list ──
  const tasks = [...cell.tasks].sort((a, b) => priorityRank(a) - priorityRank(b));

  if (tasks.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_400);
    doc.text("No tasks assigned for today.", m, y + 6);
    y += 16;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text(`Tasks (${tasks.length})`, m, y);
    y += 6;

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      y = drawTaskBlock(doc, t, i + 1, y, pw, m, ph);
      // Page-break fallback if a task block runs over (unlikely but defensive).
      if (y > ph - 20) {
        doc.addPage();
        // Re-draw a slim continuation header so the page is identifiable.
        drawContinuationHeader(doc, name, date, pw, m);
        y = 30;
      }
    }
  }

  // ── Notes section (paper space for handwritten notes) ──
  if (y < ph - 40) {
    doc.setDrawColor(...GRAY_400);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    doc.text("Notes", m, y + 6);
    let lineY = y + 9;
    const lineEnd = ph - 14;
    while (lineY < lineEnd) {
      doc.line(m, lineY, pw - m, lineY);
      lineY += 6;
    }
  }
}

/**
 * Draw one task block. Returns the new y position after the block.
 * Layout (per task):
 *   ☐ <priority pill>  Task title (bold)
 *      <zone> · <holes> · <est. minutes>
 *      <description, wrapped>
 *      ☐ checklist item 1
 *      ☐ checklist item 2
 */
function drawTaskBlock(
  doc: jsPDF,
  task: TaskWithRelations,
  index: number,
  startY: number,
  pw: number,
  m: number,
  ph: number,
): number {
  let y = startY;
  const innerWidth = pw - m * 2;
  const checkX = m;
  const labelX = m + 8;

  // Spacer between tasks for visual separation.
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  doc.line(m, y, pw - m, y);
  y += 4;

  // Task # + checkbox (paper completion).
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.rect(checkX, y - 4, 4.5, 4.5); // 4.5mm box

  // Priority pill — small colored rect with white text.
  const priority = task.priority;
  const pillW = 18;
  const pillH = 4;
  const [pr, pg, pb] = PRIORITY_COLORS[priority];
  doc.setFillColor(pr, pg, pb);
  doc.rect(labelX, y - 3.5, pillW, pillH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);
  doc.text(PRIORITY_LABELS[priority], labelX + pillW / 2, y - 0.5, {
    align: "center",
  });

  // Title (after pill).
  const titleX = labelX + pillW + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  // Wrap title if it overflows.
  const titleMaxWidth = innerWidth - (titleX - m);
  const titleLines = doc.splitTextToSize(
    `${index}. ${task.title}`,
    titleMaxWidth,
  );
  doc.text(titleLines, titleX, y);
  y += titleLines.length * 4.5 + 1;

  // Meta line: zone · holes · estimated time.
  const metaParts: string[] = [];
  if (task.zone?.name) metaParts.push(task.zone.name);
  if (Array.isArray(task.hole_numbers) && task.hole_numbers.length > 0) {
    metaParts.push(`Holes ${task.hole_numbers.join(", ")}`);
  }
  if (task.estimated_minutes != null) {
    metaParts.push(`Est. ${task.estimated_minutes} min`);
  }
  if (Array.isArray(task.equipment_needed) && task.equipment_needed.length > 0) {
    metaParts.push(`Equip: ${task.equipment_needed.join(", ")}`);
  }
  if (metaParts.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_700);
    const metaLines = doc.splitTextToSize(
      metaParts.join("  ·  "),
      innerWidth - (titleX - m),
    );
    doc.text(metaLines, titleX, y);
    y += metaLines.length * 3.8;
  }

  // Description / notes.
  const desc = (task.description || task.notes || "").trim();
  if (desc) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    const descLines = doc.splitTextToSize(
      desc,
      innerWidth - (titleX - m),
    );
    // Cap at 4 lines so a chatty description doesn't blow up the page.
    const capped = descLines.slice(0, 4);
    doc.text(capped, titleX, y + 2);
    y += capped.length * 4 + 2;
  }

  // Checklist items (paper checkboxes).
  const checklist = (task.checklist ?? []) as Task["checklist"];
  if (Array.isArray(checklist) && checklist.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    for (const item of checklist) {
      // Defensive: items may be plain strings or objects.
      const text =
        typeof item === "string"
          ? item
          : ((item as { text?: string; label?: string })?.text ??
            (item as { text?: string; label?: string })?.label ??
            "");
      if (!text) continue;
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.3);
      doc.rect(titleX, y - 3, 3, 3);
      const wrapWidth = innerWidth - (titleX - m) - 6;
      const wrapped = doc.splitTextToSize(text, wrapWidth);
      doc.text(wrapped, titleX + 5, y);
      y += wrapped.length * 4 + 1;
      if (y > ph - 25) break; // Don't overflow page; rest of checklist deferred.
    }
  }

  y += 3;
  return y;
}

function drawBanner(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
  color: [number, number, number],
): void {
  doc.setFillColor(...color);
  doc.rect(x, y, w, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(text, x + 3, y + 6);
}

function drawHeader(
  doc: jsPDF,
  title: string,
  courseName: string,
  date: string,
  rightLabel: string,
  pw: number,
  m: number,
): void {
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 28, pw, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text(title, m, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(courseName, m, 21);
  doc.setFontSize(10);
  doc.setTextColor(...WHITE);
  doc.text(formatLongDate(date), pw - m, 13, { align: "right" });
  doc.setFontSize(8);
  doc.text(rightLabel, pw - m, 21, { align: "right" });
}

function drawContinuationHeader(
  doc: jsPDF,
  name: string,
  date: string,
  pw: number,
  m: number,
): void {
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(`${name} (cont.)`, m, 9);
  doc.text(formatLongDate(date), pw - m, 9, { align: "right" });
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
    doc.text(left, m, ph - 6);
    doc.text(`Page ${p} of ${total}`, pw / 2, ph - 6, { align: "center" });
    doc.text("VMGC GreenKeeper Pro", pw - m, ph - 6, { align: "right" });
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────

function shouldIncludeOnHandout(cell: BoardCell): boolean {
  if (cell.tasks.length > 0) return true;
  if (cell.isTimeOff) return false;
  if (cell.shift?.shift_type && cell.shift.shift_type !== "off") return true;
  return false;
}

function priorityRank(t: TaskWithRelations): number {
  const r: Record<TaskPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  return r[t.priority];
}

function shiftLabel(shift: import("@/types/database").Schedule): string {
  const t = shift.shift_type;
  if (!t) return "Shift";
  const time = formatShiftTime(shift.shift_start, shift.shift_end);
  return time
    ? `${shiftTypeLabels[t]}  ·  ${time}`
    : shiftTypeLabels[t];
}

function formatLongDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function prettyRole(role: string): string {
  // Mirror the labels used elsewhere — kept inline so this module has no
  // hook dependency at import time.
  switch (role) {
    case "super":
      return "Superintendent";
    case "asst_super":
      return "Asst. Superintendent";
    case "foreman":
      return "Foreman";
    case "mechanic":
      return "Mechanic";
    case "crew":
      return "Crew Member";
    case "seasonal":
      return "Seasonal";
    case "director":
      return "Director";
    case "gm":
      return "General Manager";
    case "pro":
      return "Golf Professional";
    default:
      return role;
  }
}

function filenameFor(date: string, single?: string | null): string {
  const safe = single
    ? single.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
    : null;
  return safe
    ? `VMGC-Schedule-${date}-${safe}.pdf`
    : `VMGC-Schedule-${date}.pdf`;
}

// ─── Per-person WEEKLY handout ──────────────────────────────────────────

export interface PerPersonWeeklyHandoutOptions {
  board: ScheduleBoard;
  /** Optional filter to a single crew member id. */
  userId?: string;
  courseName?: string;
  preparedBy?: string;
}

/**
 * One page per crew member, showing the whole Sun-Sat week. Each day
 * gets its shift band + assigned tasks (compact, with paper checkboxes).
 *
 * Use case: super hands each crew member their weekly schedule on Monday
 * morning. Daily handouts cover one day; this covers the whole week.
 */
export function generatePerPersonWeeklyHandouts(
  options: PerPersonWeeklyHandoutOptions,
): HandoutResult {
  const {
    board,
    userId,
    courseName = "Veterans Memorial Golf Course",
    preparedBy,
  } = options;

  // Crew to print: anyone with at least one shift or task across the week.
  const targets = board.crew.filter((c) => {
    if (userId && c.id !== userId) return false;
    return board.dates.some((d) => {
      const cell = getBoardCell(board, c.id, d);
      return shouldIncludeOnHandout(cell);
    });
  });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  if (targets.length === 0) {
    drawHeader(doc, "Weekly Schedule", courseName, board.dates[0], "0 assignments", pw, m);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_400);
    doc.text(
      "No crew is scheduled for this week.",
      m,
      50,
    );
    drawFooter(doc, ph, pw, m, preparedBy);
    return {
      blob: doc.output("blob") as Blob,
      filename: weeklyFilenameFor(board.dates[0], userId ? targets[0]?.full_name : undefined),
      pageCount: 0,
    };
  }

  let pageCount = 0;
  for (let i = 0; i < targets.length; i++) {
    const member = targets[i];
    if (i > 0) doc.addPage();
    drawWeeklyPersonPage(doc, {
      name: member.display_name || member.full_name || "Crew",
      role: prettyRole(member.role),
      board,
      memberId: member.id,
      courseName,
      pw,
      ph,
      m,
    });
    pageCount++;
  }

  drawFooter(doc, ph, pw, m, preparedBy);

  return {
    blob: doc.output("blob") as Blob,
    filename: weeklyFilenameFor(
      board.dates[0],
      userId ? targets[0]?.full_name : undefined,
    ),
    pageCount,
  };
}

interface WeeklyPersonPageInput {
  name: string;
  role: string;
  board: ScheduleBoard;
  memberId: string;
  courseName: string;
  pw: number;
  ph: number;
  m: number;
}

function drawWeeklyPersonPage(doc: jsPDF, input: WeeklyPersonPageInput): void {
  const { name, role, board, memberId, courseName, pw, ph, m } = input;
  const dates = board.dates;

  // ── Brand header bar ──
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 28, pw, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text(name, m, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(role, m, 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text(formatWeekRangeLabel(dates), pw - m, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_GOLD);
  doc.text(courseName, pw - m, 22, { align: "right" });

  // ── 7 day sections ──
  let y = 36;
  for (const date of dates) {
    const cell = getBoardCell(board, memberId, date);

    // Day strip — bold day label + shift status, light gray underline.
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(m, y, pw - m, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text(formatDayHeader(date), m, y);

    // Shift / time-off label on the right of the day strip.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_700);
    let shiftLabel = "—";
    if (cell.isTimeOff) {
      shiftLabel = "Time off";
    } else if (cell.shift?.shift_type) {
      shiftLabel = shiftLine(cell.shift);
    }
    doc.text(shiftLabel, pw - m, y, { align: "right" });
    y += 4;

    // Tasks for this day (sorted by priority).
    const tasks = [...cell.tasks].sort(
      (a, b) => priorityRank(a) - priorityRank(b),
    );

    if (tasks.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY_400);
      doc.text(cell.isTimeOff ? "" : "(no tasks)", m + 6, y);
      y += 5;
    } else {
      for (const t of tasks) {
        // Stop drawing if we'd overflow the page; tasks beyond cap roll
        // off the printable area (rare with daily-cadence tasks).
        if (y > ph - 18) break;

        // Paper checkbox on the left.
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.3);
        doc.rect(m + 4, y - 3.2, 3.2, 3.2);

        // Title (with priority color cue) — single-line trim if too long.
        const [pr, pg, pb] = PRIORITY_COLORS[t.priority];
        doc.setFillColor(pr, pg, pb);
        doc.circle(m + 11, y - 1.5, 0.9, "F");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...BLACK);
        const titleX = m + 14;
        const innerWidth = pw - m - titleX;
        const titleLines = doc.splitTextToSize(t.title, innerWidth);
        // Cap at 1 line in the weekly view to keep density tight.
        doc.text(titleLines[0], titleX, y);

        // Inline meta (right-aligned): zone · est mins.
        const meta: string[] = [];
        if (t.zone?.name) meta.push(t.zone.name);
        if (t.estimated_minutes != null) meta.push(`${t.estimated_minutes}m`);
        if (meta.length > 0) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(...GRAY_700);
          doc.text(meta.join(" · "), pw - m, y, { align: "right" });
        }
        y += 5;
      }
    }
    y += 2;
  }
}

function shiftLine(shift: import("@/types/database").Schedule): string {
  const t = shift.shift_type;
  if (!t) return "";
  const time = formatShiftTime(shift.shift_start, shift.shift_end);
  return time ? `${shiftTypeLabels[t]} · ${time}` : shiftTypeLabels[t];
}

function formatDayHeader(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatWeekRangeLabel(dates: string[]): string {
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[6] + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Week of ${startStr} – ${endStr}`;
}

function weeklyFilenameFor(weekStart: string, single?: string | null): string {
  const safe = single
    ? single.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
    : null;
  return safe
    ? `VMGC-Schedule-Week-${weekStart}-${safe}.pdf`
    : `VMGC-Schedule-Week-${weekStart}.pdf`;
}
