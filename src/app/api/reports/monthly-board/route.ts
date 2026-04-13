import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import { fetchMonthlyBoardData, type MonthlyBoardData } from "@/lib/utils/monthly-board-data";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Brand Colors ──
const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ALLOWED_ROLES = ["super", "asst_super", "director"];

export async function GET(request: NextRequest) {
  let step = "init";
  try {
    // ── AUTH ──
    step = "auth";
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── PARSE PARAMS ──
    step = "parse-params";
    const url = new URL(request.url);
    const monthParam = parseInt(url.searchParams.get("month") || "", 10);
    const yearParam = parseInt(url.searchParams.get("year") || "", 10);

    const now = new Date();
    const month = monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1;
    const year = yearParam >= 2000 && yearParam <= 2100 ? yearParam : now.getFullYear();

    // ── FETCH DATA ──
    step = "fetch-data";
    const data = await fetchMonthlyBoardData(supabase, { month, year });

    // ── BUILD PDF ──
    step = "pdf-init";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth(); // 210
    const ph = doc.internal.pageSize.getHeight(); // 297
    const m = 14;

    const monthName = MONTH_NAMES[month - 1];
    const preparedBy = profile.full_name || user.email || "Unknown";

    // ═══════════════ PAGE 1 — Executive Summary ═══════════════
    step = "pdf-page1";
    drawHeader(doc, pw, m, `Monthly Board Report — ${monthName} ${year}`);

    let y = 40;

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_600);
    doc.text(
      `Reporting period: ${data.period.startDate} to ${data.period.endDate}`,
      m,
      y
    );
    y += 10;

    // ── Metric cards (2 columns, 3 rows) ──
    const cards = buildMetricCards(data);
    const cardW = (pw - m * 2 - 6) / 2;
    const cardH = 30;
    const gap = 6;

    for (let i = 0; i < cards.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = m + col * (cardW + gap);
      const cy = y + row * (cardH + gap);

      // Card background
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(cx, cy, cardW, cardH, 2, 2, "FD");

      // Card title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND_DARK);
      doc.text(cards[i].title.toUpperCase(), cx + 4, cy + 7);

      // Card value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...BRAND_DARK);
      doc.text(cards[i].value, cx + 4, cy + 19);

      // Card subtitle
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      doc.text(cards[i].subtitle, cx + 4, cy + 26);
    }

    // ═══════════════ PAGE 2 — Details ═══════════════
    step = "pdf-page2";
    doc.addPage();
    drawHeader(doc, pw, m, `${monthName} ${year} — Details`);

    y = 40;

    // ── Top 5 Chemical Products ──
    y = drawSection(doc, m, y, pw, "Top Chemical Products Used", () => {
      if (data.chemical.topProducts.length === 0) return "No chemical applications this period.";
      return data.chemical.topProducts
        .map((p, i) => `${i + 1}. ${p.name} — ${p.count} application${p.count !== 1 ? "s" : ""}`)
        .join("\n");
    });

    y += 6;

    // ── Top 5 Equipment Issues ──
    y = drawSection(doc, m, y, pw, "Top Equipment Service Items", () => {
      if (data.equipment.topIssues.length === 0) return "No equipment service records this period.";
      return data.equipment.topIssues
        .map((e, i) => `${i + 1}. ${e.equipment_name} — ${e.count} record${e.count !== 1 ? "s" : ""}`)
        .join("\n");
    });

    y += 6;

    // ── Budget Breakdown ──
    y = drawSection(doc, m, y, pw, "Expense Breakdown", () => {
      if (data.budget.totalExpenses === null || data.budget.categoryBreakdown.length === 0) {
        return "No approved expenses this period.";
      }
      return data.budget.categoryBreakdown
        .map((c) => `${c.category}: $${c.amount.toLocaleString()}`)
        .join("\n");
    });

    y += 6;

    // ── Observations by Priority ──
    y = drawSection(doc, m, y, pw, "Observations by Priority", () => {
      const entries = Object.entries(data.observations.bySeverity);
      if (entries.length === 0) return "No hole observations this period.";
      return entries
        .sort((a, b) => b[1] - a[1])
        .map(([level, count]) => `${level.charAt(0).toUpperCase() + level.slice(1)}: ${count}`)
        .join("\n");
    });

    // ── Footer on both pages ──
    step = "pdf-footer";
    const timestamp = new Date().toLocaleString("en-US");
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      doc.text(`Generated ${timestamp} by ${preparedBy}`, m, ph - 6);
      doc.text("VMGC GreenKeeper Pro", pw - m, ph - 6, { align: "right" });
      doc.text(`Page ${p} of ${doc.getNumberOfPages()}`, pw / 2, ph - 6, {
        align: "center",
      });
    }

    // ── OUTPUT ──
    step = "pdf-output";
    const buf = doc.output("arraybuffer");
    const mm = String(month).padStart(2, "0");
    const fname = `vmgc-board-report-${year}-${mm}.pdf`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Monthly board report error at step [" + step + "]:", msg, err);
    return NextResponse.json(
      { error: "Failed at: " + step, details: msg },
      { status: 500 }
    );
  }
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
  getContent: () => string
): number {
  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_DARK);
  doc.text(title, m, y);
  y += 5;

  // Divider
  doc.setDrawColor(...BRAND_GOLD);
  doc.setLineWidth(0.4);
  doc.line(m, y, pw - m, y);
  y += 5;

  // Content
  const content = getContent();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_600);

  const lines = doc.splitTextToSize(content, pw - m * 2);
  doc.text(lines, m, y);
  y += lines.length * 4;

  return y;
}
