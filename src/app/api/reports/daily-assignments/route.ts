import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Brand Colors ──
const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const WHITE: [number, number, number] = [255, 255, 255];

// Priority colors
const priorityColors: Record<string, [number, number, number]> = {
  critical: [147, 51, 234],
  high: [220, 38, 38],
  normal: [59, 130, 246],
  low: [107, 114, 128],
};

// Status labels
const statusLabels: Record<string, string> = {
  operational: "Operational",
  needs_service: "Needs Service",
  in_repair: "In Repair",
  out_of_service: "Out of Service",
};

const conditionLabels: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  needs_repair: "Needs Repair",
  beyond_repair: "Beyond Repair",
  unknown: "Unknown",
};

function s(val: unknown, fallback = "\u2014"): string {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(time: string | null): string {
  if (!time) return "\u2014";
  // time is HH:MM:SS - format to 12h
  const parts = time.split(":");
  if (parts.length < 2) return time;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m} ${ampm}`;
}

interface WeatherData {
  high: number;
  low: number;
  conditions: string;
  wind: string;
  precipitation: number;
}

async function fetchWeather(): Promise<WeatherData | null> {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=42.3&longitude=-87.85&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America/Chicago&forecast_days=1",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const daily = data.daily;
    if (!daily) return null;

    const weatherCodes: Record<number, string> = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      48: "Rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      71: "Slight snow",
      73: "Moderate snow",
      75: "Heavy snow",
      80: "Slight rain showers",
      81: "Moderate rain showers",
      82: "Violent rain showers",
      95: "Thunderstorm",
      96: "Thunderstorm with hail",
      99: "Thunderstorm with heavy hail",
    };

    return {
      high: Math.round(daily.temperature_2m_max?.[0] ?? 0),
      low: Math.round(daily.temperature_2m_min?.[0] ?? 0),
      conditions: weatherCodes[daily.weathercode?.[0]] || "Unknown",
      wind: `${Math.round(daily.windspeed_10m_max?.[0] ?? 0)} mph`,
      precipitation: daily.precipitation_probability_max?.[0] ?? 0,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Fetch all data in parallel
    const [tasksResult, schedulesResult, equipmentResult, weather] =
      await Promise.all([
        // Today's tasks
        supabase
          .from("tasks")
          .select("id, title, priority, status, assigned_to, zone_id, hole_numbers, equipment_needed")
          .eq("due_date", todayStr)
          .in("status", ["pending", "in_progress"])
          .order("priority", { ascending: true }),

        // Today's schedule
        supabase
          .from("schedules")
          .select("id, user_id, shift_type, shift_start, shift_end, crew_assignment")
          .eq("schedule_date", todayStr)
          .neq("shift_type", "off"),

        // Equipment needing attention
        supabase
          .from("equipment")
          .select("id, name, status, condition_status, notes")
          .in("status", ["needs_service", "in_repair"]),

        // Weather
        fetchWeather(),
      ]);

    const tasks = tasksResult.data || [];
    const schedules = schedulesResult.data || [];
    const equipment = equipmentResult.data || [];

    // Gather unique user IDs from tasks and schedules for name lookup
    const userIds = new Set<string>();
    tasks.forEach((t: any) => {
      if (t.assigned_to) userIds.add(t.assigned_to);
    });
    schedules.forEach((s: any) => {
      if (s.user_id) userIds.add(s.user_id);
    });

    // Fetch profile names
    const profileMap = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(userIds));

      (profiles || []).forEach((p: any) => {
        profileMap.set(p.id, p.full_name || "Unknown");
      });
    }

    // Fetch zone names for tasks
    const zoneIds = new Set<string>();
    tasks.forEach((t: any) => {
      if (t.zone_id) zoneIds.add(t.zone_id);
    });
    const zoneMap = new Map<string, string>();
    if (zoneIds.size > 0) {
      const { data: zones } = await supabase
        .from("zones")
        .select("id, name")
        .in("id", Array.from(zoneIds));

      (zones || []).forEach((z: any) => {
        zoneMap.set(z.id, z.name || "");
      });
    }

    // ── Generate PDF ──
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 40;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND_DARK);
    doc.text("VMGC Daily Assignments", 40, y);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_600);
    doc.text(formatDate(now), 40, y);
    y += 8;

    // Horizontal rule
    doc.setDrawColor(...BRAND_GOLD);
    doc.setLineWidth(2);
    doc.line(40, y, pageWidth - 40, y);
    y += 20;

    // ── Section 1: CREW SCHEDULE ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("CREW SCHEDULE", 40, y);
    y += 6;

    if (schedules.length > 0) {
      const scheduleRows = schedules.map((s: any) => {
        const name = profileMap.get(s.user_id) || "Unknown";
        const shift = s.shift_type
          ? s.shift_type.charAt(0).toUpperCase() + s.shift_type.slice(1)
          : "\u2014";
        const start = formatTime(s.shift_start);
        const end = formatTime(s.shift_end);
        return [name, shift, start, end];
      });

      autoTable(doc, {
        startY: y,
        head: [["Name", "Shift", "Start", "End"]],
        body: scheduleRows,
        margin: { left: 40, right: 40 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: WHITE,
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: { fontSize: 9, textColor: GRAY_600 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        theme: "grid",
      });

      y = (doc as any).lastAutoTable.finalY + 20;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_600);
      doc.text("No crew scheduled for today.", 40, y + 10);
      y += 30;
    }

    // ── Section 2: TODAY'S TASKS ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("TODAY'S TASKS", 40, y);
    y += 6;

    if (tasks.length > 0) {
      const taskRows = tasks.map((t: any) => {
        const assignedName = t.assigned_to
          ? profileMap.get(t.assigned_to) || "Unassigned"
          : "Unassigned";
        const location = t.zone_id
          ? zoneMap.get(t.zone_id) || ""
          : "";
        const holeStr =
          t.hole_numbers && t.hole_numbers.length > 0
            ? `Holes ${t.hole_numbers.join(", ")}`
            : "";
        const locationDisplay = [location, holeStr].filter(Boolean).join(" - ");
        const equipStr =
          t.equipment_needed && t.equipment_needed.length > 0
            ? t.equipment_needed.join(", ")
            : "\u2014";
        return [
          s(t.title),
          (t.priority || "normal").charAt(0).toUpperCase() +
            (t.priority || "normal").slice(1),
          assignedName,
          locationDisplay || "\u2014",
          equipStr,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["Task", "Priority", "Assigned To", "Location/Hole", "Equipment"]],
        body: taskRows,
        margin: { left: 40, right: 40 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: WHITE,
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: { fontSize: 8, textColor: GRAY_600 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 130 },
          1: { cellWidth: 55 },
          4: { cellWidth: 100 },
        },
        theme: "grid",
        didParseCell(data: any) {
          if (data.section === "body" && data.column.index === 1) {
            const priority = (data.cell.raw as string).toLowerCase();
            const color = priorityColors[priority];
            if (color) {
              data.cell.styles.textColor = color;
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 20;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_600);
      doc.text("No tasks assigned for today.", 40, y + 10);
      y += 30;
    }

    // ── Section 3: EQUIPMENT ALERTS ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("EQUIPMENT ALERTS", 40, y);
    y += 6;

    if (equipment.length > 0) {
      const equipRows = equipment.map((e: any) => [
        s(e.name),
        statusLabels[e.status] || e.status,
        conditionLabels[e.condition_status] || s(e.condition_status),
        s(e.notes, "None"),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Equipment Name", "Status", "Condition", "Notes"]],
        body: equipRows,
        margin: { left: 40, right: 40 },
        headStyles: {
          fillColor: BRAND_DARK,
          textColor: WHITE,
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: { fontSize: 9, textColor: GRAY_600 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          3: { cellWidth: 160 },
        },
        theme: "grid",
        didParseCell(data: any) {
          if (data.section === "body" && data.column.index === 1) {
            const status = Object.entries(statusLabels).find(
              ([, v]) => v === data.cell.raw
            )?.[0];
            if (status === "needs_service" || status === "in_repair") {
              data.cell.styles.textColor = [234, 88, 12] as [
                number,
                number,
                number,
              ];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 20;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_600);
      doc.text("All equipment operational.", 40, y + 10);
      y += 30;
    }

    // ── Section 4: WEATHER ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("WEATHER", 40, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY_600);

    if (weather) {
      const weatherLine = `High: ${weather.high}\u00B0F / Low: ${weather.low}\u00B0F  |  ${weather.conditions}  |  Wind: ${weather.wind}  |  Precipitation: ${weather.precipitation}%`;
      doc.text(weatherLine, 40, y);
    } else {
      doc.text("Weather data unavailable.", 40, y);
    }

    // ── Footer ──
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BRAND_GOLD);
    doc.setLineWidth(0.5);
    doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_600);
    const timestamp = now.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    doc.text(
      `Generated by GreenKeeper Pro \u2014 ${timestamp}`,
      40,
      pageHeight - 26
    );

    // Output PDF
    const pdfBytes = doc.output("arraybuffer");

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="VMGC-Daily-Assignments-${todayStr}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Error generating daily assignments PDF:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
