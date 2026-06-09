/**
 * Daily Assignments — client-side PDF generator.
 *
 * New client-side report that replaces the dashboard's old
 * /api/reports/daily-assignments call (that route was already removed from
 * the migration branch, so the button was 404-ing). Fetches today's tasks
 * grouped by assignee and prints a one-page briefing suitable for handing
 * to the crew at morning muster.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];

const priorityLabels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const priorityColors: Record<string, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  normal: [37, 99, 235],
  low: [107, 114, 128],
};

const categoryLabels: Record<string, string> = {
  mowing: "Mowing",
  irrigation: "Irrigation",
  chemical: "Chemical",
  mechanical: "Mechanical",
  landscaping: "Landscaping",
  construction: "Construction",
  bunker: "Bunker",
  greens: "Greens",
  admin: "Admin",
  safety: "Safety",
  grounds: "Grounds",
  tees: "Tees",
};

export interface DailyAssignmentsReportOptions {
  /** Date YYYY-MM-DD. Defaults to today. */
  date?: string;
}

export class DailyAssignmentsReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyAssignmentsReportError";
  }
}

export async function generateDailyAssignmentsReport(
  options: DailyAssignmentsReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const supabase = createClient();

  // Cached user read avoids the supabase.auth.getUser() wedge.
  const user = getCachedUser();
  if (!user) throw new DailyAssignmentsReportError("Not signed in");

  const { data: profile } = await supabase.from("profiles")
    .select("full_name, role").eq("id", user.id).single();

  const today = todayLocal();
  const date = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)
    ? options.date
    : today;

  const { data: tasks, error: fetchErr } = await supabase
    .from("tasks")
    .select(`
      id, title, description, category, priority, status, due_date,
      estimated_minutes, hole_numbers, notes, assigned_to,
      profiles:assigned_to(full_name)
    `)
    .eq("due_date", date)
    .not("status", "in", '("completed","verified","cancelled")')
    .order("priority", { ascending: true })
    .order("title", { ascending: true });

  if (fetchErr) throw new DailyAssignmentsReportError(fetchErr.message);

  const rows = (tasks || []) as Array<{
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    priority: string | null;
    status: string | null;
    due_date: string | null;
    estimated_minutes: number | null;
    hole_numbers: number[] | null;
    notes: string | null;
    profiles: { full_name: string } | null;
  }>;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── HEADER ──
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 28, pw, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text("Daily Assignments", m, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GOLD);
  doc.text("Veterans Memorial Golf Course", m, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...WHITE);
  doc.text(displayDate, pw - m, 13, { align: "right" });
  doc.setFontSize(8);
  doc.text(`${rows.length} assignment${rows.length === 1 ? "" : "s"}`, pw - m, 21, {
    align: "right",
  });

  let y = 38;

  // ── Group by assignee ──
  const byAssignee = new Map<string, typeof rows>();
  for (const task of rows) {
    const name = task.profiles?.full_name || "Unassigned";
    if (!byAssignee.has(name)) byAssignee.set(name, []);
    byAssignee.get(name)!.push(task);
  }

  // Sort sections: named assignees A-Z, Unassigned last
  const assigneeNames = Array.from(byAssignee.keys()).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  if (assigneeNames.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_400);
    doc.text("No assignments for today.", m, y + 10);
  }

  for (const name of assigneeNames) {
    const assigneeTasks = byAssignee.get(name)!;

    // Page break if needed
    if (y > ph - 50) {
      doc.addPage();
      y = m;
    }

    // Assignee header
    doc.setFillColor(...BRAND_DARK);
    doc.rect(m, y, pw - m * 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.text(name, m + 3, y + 5.5);
    doc.setFontSize(8);
    doc.text(
      `${assigneeTasks.length} task${assigneeTasks.length === 1 ? "" : "s"}`,
      pw - m - 3,
      y + 5.5,
      { align: "right" },
    );
    y += 10;

    const tableRows = assigneeTasks.map((t) => [
      priorityLabels[t.priority || "normal"] || t.priority || "",
      t.title,
      categoryLabels[t.category || ""] || t.category || "—",
      t.estimated_minutes ? `${t.estimated_minutes} min` : "—",
      t.hole_numbers && t.hole_numbers.length > 0
        ? t.hole_numbers.join(", ")
        : "—",
      t.notes || t.description || "",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Priority", "Task", "Category", "Est. Time", "Holes", "Notes"]],
      body: tableRows,
      margin: { left: m, right: m },
      styles: { fontSize: 8, cellPadding: 1.8, valign: "top" as const },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: BRAND_DARK,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 18, halign: "center" as const, fontStyle: "bold" },
        1: { cellWidth: 52, fontStyle: "bold" },
        2: { cellWidth: 22 },
        3: { cellWidth: 18, halign: "center" as const },
        4: { cellWidth: 20, halign: "center" as const },
        5: { cellWidth: "auto" as const },
      },
      didParseCell: (d) => {
        // Color-code priority cell
        if (d.column.index === 0 && d.section === "body") {
          const raw = String(d.cell.raw).toLowerCase();
          const color = priorityColors[raw] || GRAY_400;
          d.cell.styles.textColor = color;
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── FOOTER ──
  const timestamp = new Date().toLocaleString("en-US");
  const preparedBy = (profile as { full_name?: string } | null)?.full_name || user.email || "Unknown";
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_400);
    doc.text(`Generated ${timestamp} by ${preparedBy}`, m, ph - 6);
    doc.text("VMGC GreenKeeper Pro", pw - m, ph - 6, { align: "right" });
  }

  const blob = doc.output("blob") as Blob;
  const filename = `VMGC-Daily-Assignments-${date}.pdf`;

  return { blob, filename };
}

export async function downloadDailyAssignmentsReport(
  options: DailyAssignmentsReportOptions = {},
): Promise<void> {
  const { blob, filename } = await generateDailyAssignmentsReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
