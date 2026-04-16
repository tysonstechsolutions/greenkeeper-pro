import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateCronRequest } from "@/lib/cron-auth";
import { COURSE } from "@/lib/constants";

/**
 * Service-role Supabase client for cron operations (no user session needed).
 */
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Open-Meteo forecast response shape (only the fields we use) ──────────
interface OpenMeteoDaily {
  time: string[];
  precipitation_sum: number[];
  temperature_2m_max: number[];
  wind_speed_10m_max: number[];
}

interface OpenMeteoResponse {
  daily: OpenMeteoDaily;
}

interface AutomationAction {
  rule: "rain" | "heat" | "wind";
  action: string;
  details: string;
}

/**
 * GET /api/cron/weather-automation
 *
 * Fetches tomorrow's forecast from Open-Meteo (free, no API key required)
 * and applies three automation rules:
 *
 *   1. Rain > 5 mm  -> defer pending mowing tasks due tomorrow
 *   2. Temp > 35 C  -> create a heat-advisory safety task
 *   3. Wind > 40 km/h -> create a wind-advisory safety task
 *
 * Protected via the shared `validateCronRequest` helper.
 */
export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const actions: AutomationAction[] = [];
  const errors: string[] = [];

  try {
    // ── 1. Fetch 2-day forecast from Open-Meteo ──────────────────────
    const meteoUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${COURSE.lat}&longitude=${COURSE.lng}` +
      `&daily=precipitation_sum,temperature_2m_max,wind_speed_10m_max` +
      `&timezone=America/Chicago&forecast_days=2`;

    const meteoRes = await fetch(meteoUrl, { signal: AbortSignal.timeout(10000) });

    if (!meteoRes.ok) {
      throw new Error(`Open-Meteo API returned ${meteoRes.status}`);
    }

    const meteo: OpenMeteoResponse = await meteoRes.json();

    // Index 1 = tomorrow
    const tomorrowDate = meteo.daily.time[1]; // "YYYY-MM-DD"
    const precipMm = meteo.daily.precipitation_sum[1];
    const tempMaxC = meteo.daily.temperature_2m_max[1];
    const windMaxKmh = meteo.daily.wind_speed_10m_max[1];

    // Convert for readability
    const precipIn = Math.round(precipMm / 25.4 * 100) / 100;
    const tempMaxF = Math.round(tempMaxC * 9 / 5 + 32);
    const windMaxMph = Math.round(windMaxKmh / 1.609);

    // ── 2. Rule: Rain > 5 mm ─────────────────────────────────────────
    if (precipMm > 5) {
      const { data: mowingTasks, error: mowErr } = await supabase
        .from("tasks")
        .select("id, title, notes")
        .eq("category", "mowing")
        .eq("status", "pending")
        .eq("due_date", tomorrowDate);

      if (mowErr) {
        errors.push(`Failed to query mowing tasks: ${mowErr.message}`);
      } else if (mowingTasks && mowingTasks.length > 0) {
        for (const task of mowingTasks) {
          const appendNote = `${task.notes ? task.notes + "\n" : ""}[Auto] Deferred due to rain forecast (${precipIn}in / ${precipMm}mm expected)`;
          const { error: updErr } = await supabase
            .from("tasks")
            .update({ status: "deferred", notes: appendNote })
            .eq("id", task.id);

          if (updErr) {
            errors.push(`Failed to defer task "${task.title}": ${updErr.message}`);
          } else {
            actions.push({
              rule: "rain",
              action: "task_deferred",
              details: `Deferred "${task.title}" — ${precipIn}in (${precipMm}mm) rain expected`,
            });
          }
        }
      } else {
        actions.push({
          rule: "rain",
          action: "no_tasks_found",
          details: `Rain threshold met (${precipIn}in) but no pending mowing tasks due ${tomorrowDate}`,
        });
      }
    }

    // ── 3. Rule: Temp > 35 C (95 F) ─────────────────────────────────
    if (tempMaxC > 35) {
      // Check if a heat advisory task already exists for tomorrow
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .ilike("title", "%Heat advisory%")
        .eq("due_date", tomorrowDate)
        .in("status", ["pending", "in_progress"]);

      if (existing && existing.length > 0) {
        actions.push({
          rule: "heat",
          action: "task_exists",
          details: `Heat advisory task already exists for ${tomorrowDate}`,
        });
      } else {
        const { error: insertErr } = await supabase.from("tasks").insert({
          title: "Heat advisory — limit outdoor work to before 11am",
          category: "safety",
          priority: "critical",
          status: "pending",
          due_date: tomorrowDate,
          notes: `[Auto] Forecast high of ${tempMaxF}F (${Math.round(tempMaxC)}C) for ${tomorrowDate}. Limit outdoor work to early morning hours.`,
          hole_numbers: [],
          equipment_needed: [],
          materials_needed: [],
          checklist: [],
          requires_photo_before: false,
          requires_photo_after: false,
          weather_dependent: false,
        });

        if (insertErr) {
          errors.push(`Failed to create heat advisory task: ${insertErr.message}`);
        } else {
          actions.push({
            rule: "heat",
            action: "task_created",
            details: `Created heat advisory task — ${tempMaxF}F (${Math.round(tempMaxC)}C)`,
          });
        }
      }
    }

    // ── 4. Rule: Wind > 40 km/h (25 mph) ────────────────────────────
    if (windMaxKmh > 40) {
      // Check if a wind advisory task already exists for tomorrow
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .ilike("title", "%High wind advisory%")
        .eq("due_date", tomorrowDate)
        .in("status", ["pending", "in_progress"]);

      if (existing && existing.length > 0) {
        actions.push({
          rule: "wind",
          action: "task_exists",
          details: `Wind advisory task already exists for ${tomorrowDate}`,
        });
      } else {
        const { error: insertErr } = await supabase.from("tasks").insert({
          title: "High wind advisory — secure loose equipment and defer spray applications",
          category: "safety",
          priority: "high",
          status: "pending",
          due_date: tomorrowDate,
          notes: `[Auto] Forecast wind gusts up to ${windMaxMph}mph (${Math.round(windMaxKmh)}km/h) for ${tomorrowDate}. Secure all loose items and postpone any spray operations.`,
          hole_numbers: [],
          equipment_needed: [],
          materials_needed: [],
          checklist: [],
          requires_photo_before: false,
          requires_photo_after: false,
          weather_dependent: false,
        });

        if (insertErr) {
          errors.push(`Failed to create wind advisory task: ${insertErr.message}`);
        } else {
          actions.push({
            rule: "wind",
            action: "task_created",
            details: `Created wind advisory task — ${windMaxMph}mph (${Math.round(windMaxKmh)}km/h)`,
          });
        }
      }
    }

    return NextResponse.json({
      message: "Weather automation completed",
      forecast: {
        date: tomorrowDate,
        precipitation_mm: precipMm,
        precipitation_in: precipIn,
        temp_max_c: Math.round(tempMaxC),
        temp_max_f: tempMaxF,
        wind_max_kmh: Math.round(windMaxKmh),
        wind_max_mph: windMaxMph,
      },
      actions,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Weather automation cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
