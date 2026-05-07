/**
 * Monthly Board Report — client-side PDF generator.
 *
 * Ported from /api/reports/monthly-board. Two-page portrait PDF:
 *   Page 1: Executive summary — metric cards for tasks/observations/chemical/
 *           equipment/weather/labor.
 *   Page 2: Details — top chemicals, top equipment service, expense breakdown,
 *           observations by priority.
 *
 * Gated client-side (button only shown to allowed roles). All queries go
 * through RLS, and any role-scoped views are the same ones the user can
 * already see in the UI.
 */
import { jsPDF } from "jspdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/rest";
import { formatLocalDate } from "@/lib/utils/date";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Data shape (inlined from src/lib/utils/monthly-board-data.ts) ─────────

interface MonthlyBoardData {
  period: { month: number; year: number; startDate: string; endDate: string };
  labor: { totalScheduledShifts: number; totalCrewMembers: number };
  chemical: {
    applicationCount: number;
    topProducts: { name: string; count: number }[];
  };
  equipment: {
    serviceRecordsCount: number;
    downtimeHours: number;
    topIssues: { equipment_name: string; count: number }[];
  };
  observations: {
    totalCount: number;
    resolvedCount: number;
    openCount: number;
    bySeverity: Record<string, number>;
  };
  tasks: {
    totalCreated: number;
    totalCompleted: number;
    completionRate: number;
    overdueCount: number;
  };
  weather: {
    avgHighF: number | null;
    avgLowF: number | null;
    totalRainInches: number | null;
    frostDays: number;
  };
  budget: {
    totalExpenses: number | null;
    categoryBreakdown: { category: string; amount: number }[];
  };
}

function getMonthDateRange(month: number, year: number) {
  const startDate = formatLocalDate(new Date(year, month - 1, 1));
  const endDate = formatLocalDate(new Date(year, month, 0));
  return { startDate, endDate };
}

async function fetchLabor(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("schedule")
      .select("id, user_id")
      .gte("schedule_date", startDate)
      .lte("schedule_date", endDate);
    if (error) throw error;
    const rows = data || [];
    const uniqueUsers = new Set(rows.map((r: any) => r.user_id));
    return { totalScheduledShifts: rows.length, totalCrewMembers: uniqueUsers.size };
  } catch {
    return { totalScheduledShifts: 0, totalCrewMembers: 0 };
  }
}

async function fetchChemical(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("chemical_applications")
      .select("id, product_id, chemical_products(product_name)")
      .gte("application_date", startDate)
      .lte("application_date", endDate);
    if (error) throw error;
    const rows = data || [];

    const productCounts: Record<string, number> = {};
    for (const row of rows) {
      const r = row as any;
      const name = r.chemical_products?.product_name || "Unknown";
      productCounts[name] = (productCounts[name] || 0) + 1;
    }

    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return { applicationCount: rows.length, topProducts };
  } catch {
    return { applicationCount: 0, topProducts: [] };
  }
}

async function fetchEquipment(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("equipment_logs")
      .select("id, equipment_id, log_type, description, downtime_hours, equipment(name)")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59");
    if (error) throw error;
    const rows = data || [];

    const serviceRows = rows.filter(
      (r: any) => r.log_type === "service" || r.log_type === "repair",
    );
    const totalDowntime = rows.reduce(
      (sum: number, r: any) =>
        sum + (typeof r.downtime_hours === "number" ? r.downtime_hours : 0),
      0,
    );

    const issueCounts: Record<string, number> = {};
    for (const row of serviceRows) {
      const r = row as any;
      const eqName = r.equipment?.name || "Unknown";
      issueCounts[eqName] = (issueCounts[eqName] || 0) + 1;
    }

    const topIssues = Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([equipment_name, count]) => ({ equipment_name, count }));

    return {
      serviceRecordsCount: serviceRows.length,
      downtimeHours: Math.round(totalDowntime * 10) / 10,
      topIssues,
    };
  } catch {
    return { serviceRecordsCount: 0, downtimeHours: 0, topIssues: [] };
  }
}

async function fetchObservations(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data: holeObs, error: holeErr } = await supabase
      .from("hole_observations")
      .select("id, status, priority")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59");
    if (holeErr) throw holeErr;
    const rows = holeObs || [];

    const resolvedCount = rows.filter((r: any) => r.status === "resolved").length;
    const openCount = rows.filter(
      (r: any) => r.status === "open" || r.status === "monitoring",
    ).length;

    const bySeverity: Record<string, number> = {};
    for (const r of rows) {
      const prio = (r as any).priority || "normal";
      bySeverity[prio] = (bySeverity[prio] || 0) + 1;
    }

    let courseCount = 0;
    try {
      const { count } = await supabase
        .from("course_observations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59");
      if (count !== null) courseCount = count;
    } catch { /* ignore */ }

    let greenCount = 0;
    try {
      const { count } = await supabase
        .from("green_observations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59");
      if (count !== null) greenCount = count;
    } catch { /* ignore */ }

    return {
      totalCount: rows.length + courseCount + greenCount,
      resolvedCount,
      openCount,
      bySeverity,
    };
  } catch {
    return { totalCount: 0, resolvedCount: 0, openCount: 0, bySeverity: {} };
  }
}

async function fetchTasks(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, status, due_date, completed_at")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59");
    if (error) throw error;
    const rows = data || [];

    const totalCreated = rows.length;
    const totalCompleted = rows.filter(
      (r: any) => r.status === "completed" || r.status === "verified",
    ).length;
    const completionRate = totalCreated > 0
      ? Math.round((totalCompleted / totalCreated) * 100)
      : 0;

    const overdueCount = rows.filter((r: any) => {
      const isOpen = r.status !== "completed" && r.status !== "verified" && r.status !== "cancelled";
      return isOpen && r.due_date < endDate;
    }).length;

    return { totalCreated, totalCompleted, completionRate, overdueCount };
  } catch {
    return { totalCreated: 0, totalCompleted: 0, completionRate: 0, overdueCount: 0 };
  }
}

async function fetchWeather(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("weather_logs")
      .select("high_temp_f, low_temp_f, precipitation_inches, frost_observed")
      .gte("log_date", startDate)
      .lte("log_date", endDate);
    if (error) throw error;
    const rows = data || [];

    if (rows.length === 0) {
      return { avgHighF: null, avgLowF: null, totalRainInches: null, frostDays: 0 };
    }

    const highs = rows.map((r: any) => r.high_temp_f).filter((v: any): v is number => v !== null);
    const lows = rows.map((r: any) => r.low_temp_f).filter((v: any): v is number => v !== null);

    const avgHighF = highs.length > 0
      ? Math.round((highs.reduce((a: number, b: number) => a + b, 0) / highs.length) * 10) / 10
      : null;
    const avgLowF = lows.length > 0
      ? Math.round((lows.reduce((a: number, b: number) => a + b, 0) / lows.length) * 10) / 10
      : null;

    const totalRainInches = rows.reduce(
      (sum: number, r: any) => sum + (r.precipitation_inches || 0),
      0,
    );
    const frostDays = rows.filter((r: any) => r.frost_observed).length;

    return {
      avgHighF,
      avgLowF,
      totalRainInches: Math.round(totalRainInches * 100) / 100,
      frostDays,
    };
  } catch {
    return { avgHighF: null, avgLowF: null, totalRainInches: null, frostDays: 0 };
  }
}

async function fetchBudget(supabase: SupabaseClient, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("amount, description")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .in("status", ["approved", "paid"]);
    if (error) throw error;
    const rows = data || [];

    if (rows.length === 0) {
      return { totalExpenses: null, categoryBreakdown: [] };
    }

    const totalExpenses = rows.reduce((sum: number, r: any) => sum + r.amount, 0);

    const cats: Record<string, number> = {};
    for (const row of rows) {
      const r = row as any;
      const cat = r.description ? r.description.split(" ")[0] : "Other";
      cats[cat] = (cats[cat] || 0) + r.amount;
    }

    const categoryBreakdown = Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
      }));

    return {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      categoryBreakdown,
    };
  } catch {
    return { totalExpenses: null, categoryBreakdown: [] };
  }
}

async function fetchMonthlyBoardData(
  supabase: SupabaseClient,
  { month, year }: { month: number; year: number },
): Promise<MonthlyBoardData> {
  const { startDate, endDate } = getMonthDateRange(month, year);

  const [labor, chemical, equipment, observations, tasks, weather, budget] =
    await Promise.all([
      fetchLabor(supabase, startDate, endDate),
      fetchChemical(supabase, startDate, endDate),
      fetchEquipment(supabase, startDate, endDate),
      fetchObservations(supabase, startDate, endDate),
      fetchTasks(supabase, startDate, endDate),
      fetchWeather(supabase, startDate, endDate),
      fetchBudget(supabase, startDate, endDate),
    ]);

  return {
    period: { month, year, startDate, endDate },
    labor, chemical, equipment, observations, tasks, weather, budget,
  };
}

// ── PDF helpers ──

function drawHeader(doc: jsPDF, pw: number, m: number, subtitle: string) {
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pw, 28, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, 28, pw, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  doc.text("Veterans Memorial GC", m, 12);

  doc.setFontSize(11);
  doc.text(subtitle, m, 21);
}

function buildMetricCards(data: MonthlyBoardData) {
  return [
    {
      title: "Tasks",
      value: String(data.tasks.totalCreated),
      subtitle: `${data.tasks.totalCompleted} completed (${data.tasks.completionRate}%) · ${data.tasks.overdueCount} overdue`,
    },
    {
      title: "Observations",
      value: String(data.observations.totalCount),
      subtitle: `${data.observations.resolvedCount} resolved · ${data.observations.openCount} open`,
    },
    {
      title: "Chemical Apps",
      value: String(data.chemical.applicationCount),
      subtitle: data.chemical.topProducts[0]
        ? `Top: ${data.chemical.topProducts[0].name}`
        : "No applications",
    },
    {
      title: "Equipment",
      value: String(data.equipment.serviceRecordsCount),
      subtitle: `service records · ${data.equipment.downtimeHours}h downtime`,
    },
    {
      title: "Weather",
      value: data.weather.avgHighF !== null
        ? `${data.weather.avgHighF}/${data.weather.avgLowF ?? "—"}°F`
        : "No data",
      subtitle: data.weather.totalRainInches !== null
        ? `${data.weather.totalRainInches}" rain · ${data.weather.frostDays} frost days`
        : "No weather logs",
    },
    {
      title: "Labor",
      value: String(data.labor.totalScheduledShifts),
      subtitle: `scheduled shifts · ${data.labor.totalCrewMembers} crew members`,
    },
  ];
}

function drawSection(
  doc: jsPDF,
  m: number,
  y: number,
  pw: number,
  title: string,
  getContent: () => string,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_DARK);
  doc.text(title, m, y);
  y += 5;

  doc.setDrawColor(...BRAND_GOLD);
  doc.setLineWidth(0.4);
  doc.line(m, y, pw - m, y);
  y += 5;

  const content = getContent();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_600);

  const lines = doc.splitTextToSize(content, pw - m * 2);
  doc.text(lines, m, y);
  y += lines.length * 4;

  return y;
}

export interface MonthlyBoardReportOptions {
  month?: number;
  year?: number;
}

export class MonthlyBoardReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthlyBoardReportError";
  }
}

export async function generateMonthlyBoardReport(
  options: MonthlyBoardReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const supabase = createClient();

  // Cached user read avoids the supabase.auth.getUser() wedge.
  const user = getCachedUser();
  if (!user) throw new MonthlyBoardReportError("Not signed in");

  const { data: profile } = await supabase.from("profiles")
    .select("full_name, role").eq("id", user.id).single();
  const p = profile as { full_name: string | null; role: string } | null;
  const preparedBy = p?.full_name || user.email || "Unknown";

  const now = new Date();
  const month = options.month && options.month >= 1 && options.month <= 12
    ? options.month
    : now.getMonth() + 1;
  const year = options.year && options.year >= 2000 && options.year <= 2100
    ? options.year
    : now.getFullYear();

  const data = await fetchMonthlyBoardData(supabase, { month, year });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  const monthName = MONTH_NAMES[month - 1];

  // ── PAGE 1 ──
  drawHeader(doc, pw, m, `Monthly Board Report — ${monthName} ${year}`);

  let y = 40;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_600);
  doc.text(
    `Reporting period: ${data.period.startDate} to ${data.period.endDate}`,
    m,
    y,
  );
  y += 10;

  const cards = buildMetricCards(data);
  const cardW = (pw - m * 2 - 6) / 2;
  const cardH = 30;
  const gap = 6;

  for (let i = 0; i < cards.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = m + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_DARK);
    doc.text(cards[i].title.toUpperCase(), cx + 4, cy + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND_DARK);
    doc.text(cards[i].value, cx + 4, cy + 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_600);
    doc.text(cards[i].subtitle, cx + 4, cy + 26);
  }

  // ── PAGE 2 ──
  doc.addPage();
  drawHeader(doc, pw, m, `${monthName} ${year} — Details`);
  y = 40;

  y = drawSection(doc, m, y, pw, "Top Chemical Products Used", () => {
    if (data.chemical.topProducts.length === 0) return "No chemical applications this period.";
    return data.chemical.topProducts
      .map((p, i) => `${i + 1}. ${p.name} — ${p.count} application${p.count !== 1 ? "s" : ""}`)
      .join("\n");
  });
  y += 6;

  y = drawSection(doc, m, y, pw, "Top Equipment Service Items", () => {
    if (data.equipment.topIssues.length === 0) return "No equipment service records this period.";
    return data.equipment.topIssues
      .map((e, i) => `${i + 1}. ${e.equipment_name} — ${e.count} record${e.count !== 1 ? "s" : ""}`)
      .join("\n");
  });
  y += 6;

  y = drawSection(doc, m, y, pw, "Expense Breakdown", () => {
    if (data.budget.totalExpenses === null || data.budget.categoryBreakdown.length === 0) {
      return "No approved expenses this period.";
    }
    return data.budget.categoryBreakdown
      .map((c) => `${c.category}: $${c.amount.toLocaleString()}`)
      .join("\n");
  });
  y += 6;

  y = drawSection(doc, m, y, pw, "Observations by Priority", () => {
    const entries = Object.entries(data.observations.bySeverity);
    if (entries.length === 0) return "No hole observations this period.";
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([level, count]) => `${level.charAt(0).toUpperCase() + level.slice(1)}: ${count}`)
      .join("\n");
  });

  const timestamp = new Date().toLocaleString("en-US");
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_400);
    doc.text(`Generated ${timestamp} by ${preparedBy}`, m, ph - 6);
    doc.text("VMGC GreenKeeper Pro", pw - m, ph - 6, { align: "right" });
    doc.text(`Page ${p} of ${doc.getNumberOfPages()}`, pw / 2, ph - 6, { align: "center" });
  }

  const blob = doc.output("blob") as Blob;
  const mm = String(month).padStart(2, "0");
  const filename = `vmgc-board-report-${year}-${mm}.pdf`;

  return { blob, filename };
}

export async function downloadMonthlyBoardReport(
  options: MonthlyBoardReportOptions = {},
): Promise<void> {
  const { blob, filename } = await generateMonthlyBoardReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
