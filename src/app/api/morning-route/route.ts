import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/utils/weather";
import { COURSE } from "@/lib/constants";
import {
  generateMorningRoute,
  type CrewMember,
  type MorningTask,
  type MorningConditions,
  type MorningRoute,
} from "@/lib/ai/morning-router";

// ─── Simple in-memory cache (1 hour, keyed by date) ─────────────────────────

const routeCache = new Map<string, { data: MorningRoute; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedRoute(date: string): MorningRoute | null {
  const entry = routeCache.get(date);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  if (entry) routeCache.delete(date);
  return null;
}

function setCachedRoute(date: string, data: MorningRoute): void {
  routeCache.set(date, { data, timestamp: Date.now() });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map task priority string to the MorningTask priority union */
function mapPriority(p: string): "critical" | "high" | "normal" {
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  return "normal";
}

/** Map task category to a rough skill tag */
function categoryToSkill(category: string): string | undefined {
  const map: Record<string, string> = {
    mowing: "mowing",
    chemical_application: "spraying",
    irrigation: "irrigation",
    bunker_maintenance: "bunkers",
    landscaping: "landscaping",
  };
  return map[category];
}

/** Derive skill tags from profile role */
function roleToSkills(role: string): string[] {
  switch (role) {
    case "superintendent":
      return ["mowing", "spraying", "irrigation", "bunkers", "landscaping", "equipment"];
    case "assistant_superintendent":
      return ["mowing", "spraying", "irrigation", "bunkers", "landscaping"];
    case "foreman":
      return ["mowing", "irrigation", "bunkers", "landscaping", "equipment"];
    case "technician":
      return ["mowing", "bunkers", "landscaping"];
    case "operator":
      return ["mowing", "equipment"];
    default:
      return ["mowing", "bunkers", "landscaping"];
  }
}

/**
 * Compute frost delay from forecast data.
 * If min temp < 32F, frost delay until sunrise + 2 hours (approx).
 */
function computeFrostDelay(
  minTemp: number,
  sunriseStr: string,
  date: string
): string | null {
  if (minTemp >= 32) return null;
  const sunrise = parseSunriseTime(sunriseStr, date);
  const delay = new Date(sunrise.getTime() + 2 * 60 * 60_000);
  return delay.toISOString();
}

/**
 * Compute dew burnoff time — sunrise + 1.5 hours as approximation.
 */
function computeDewBurnoff(sunriseStr: string, date: string): string {
  const sunrise = parseSunriseTime(sunriseStr, date);
  const burnoff = new Date(sunrise.getTime() + 1.5 * 60 * 60_000);
  return burnoff.toISOString();
}

/**
 * Parse a sunrise string like "06:32 AM" into a Date object for the given date.
 */
function parseSunriseTime(sunriseStr: string, date: string): Date {
  // sunrise comes as "06:32 AM" from weather API
  const match = sunriseStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    // Fallback: 6:00 AM
    return new Date(`${date}T06:00:00`);
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  return new Date(`${date}T${h}:${m}:00`);
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check role — staff only (super, assistant_super, foreman)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const staffRoles = [
      "superintendent",
      "assistant_superintendent",
      "foreman",
    ];
    if (!profile || !staffRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden — staff only" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { date } = body as { date?: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date. Expected YYYY-MM-DD." },
        { status: 400 }
      );
    }

    // Check cache
    const cached = getCachedRoute(date);
    if (cached) {
      return NextResponse.json(cached);
    }

    // 1. Fetch tasks for the date
    const { data: taskRows } = await supabase
      .from("tasks")
      .select(
        "id, title, category, priority, estimated_minutes, zone_id, equipment_needed, course_zones:course_zones!tasks_zone_id_fkey(name)"
      )
      .eq("due_date", date)
      .not("status", "eq", "completed")
      .not("status", "eq", "verified")
      .not("status", "eq", "cancelled");

    // Supabase returns joined relations as arrays; we pick the first element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks: MorningTask[] = (taskRows || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      zone:
        (Array.isArray(t.course_zones)
          ? t.course_zones[0]?.name
          : t.course_zones?.name) || "General",
      estimatedMinutes: t.estimated_minutes || 30,
      requiredSkill: categoryToSkill(t.category),
      priority: mapPriority(t.priority),
      equipment: t.equipment_needed?.[0],
    }));

    // 2. Fetch active crew
    const { data: crewRows } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .in("role", [
        "superintendent",
        "assistant_superintendent",
        "foreman",
        "technician",
        "operator",
        "crew_member",
      ]);

    const crew: CrewMember[] = (crewRows || []).map(
      (c: { id: string; full_name: string | null; role: string }) => ({
        id: c.id,
        name: c.full_name || "Unknown",
        role: c.role,
        skills: roleToSkills(c.role),
      })
    );

    // 3. Fetch weather forecast
    const weather = await fetchWeather(COURSE.lat, COURSE.lng, 3);
    const forecast = weather?.forecast?.find((d) => d.date === date);

    // Compute conditions
    const sunriseStr = forecast?.sunrise || "06:00 AM";
    const minTemp = forecast?.min_temp_f ?? 40;
    const maxTemp = forecast?.max_temp_f ?? 65;
    const avgTemp = (minTemp + maxTemp) / 2;
    const windMph = forecast?.max_wind_mph ?? 5;

    const conditions: MorningConditions = {
      frostDelayUntil: computeFrostDelay(minTemp, sunriseStr, date),
      dewBurnoffTime: computeDewBurnoff(sunriseStr, date),
      firstTeeTime: `${date}T07:00:00`, // Default first tee
      sunrise: parseSunriseTime(sunriseStr, date).toISOString(),
      temperature_f: avgTemp,
      wind_mph: windMph,
    };

    // 4. Try to get first tee time from the tee_times table
    const { data: teeTimeRows } = await supabase
      .from("tee_times")
      .select("tee_time")
      .eq("date", date)
      .order("tee_time", { ascending: true })
      .limit(1);

    if (teeTimeRows && teeTimeRows.length > 0) {
      conditions.firstTeeTime = teeTimeRows[0].tee_time;
    }

    // 5. Generate the route
    const route = await generateMorningRoute({
      date,
      tasks,
      crew,
      conditions,
    });

    // Cache the result
    setCachedRoute(date, route);

    return NextResponse.json(route);
  } catch (err) {
    console.error("Morning route API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
