/**
 * morning-route — Deno edge function port of /api/morning-route.
 *
 * AI-powered morning crew routing with frost/dew/tee-time awareness. Pulls
 * the day's tasks + active crew + today's weather forecast, hands them to
 * Claude with strict routing rules, and returns per-crew-member route.
 * Falls back to a round-robin router if the LLM is unavailable.
 *
 * Auth: signed-in user; must be staff role (superintendent, assistant_super,
 *       or foreman).
 * Secrets needed: ANTHROPIC_API_KEY
 *                 NEXT_PUBLIC_WEATHER_API_KEY (for weatherapi.com forecast)
 *
 * Deploy:  supabase functions deploy morning-route
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Inlined from src/lib/constants.ts
const COURSE = {
  name: "Veterans Memorial Golf Course",
  lat: 42.3095,
  lng: -87.8475,
};

// ── Types ───────────────────────────────────────────────────────────────────

interface CrewMember {
  id: string;
  name: string;
  role: string;
  skills: string[];
}

interface MorningTask {
  id: string;
  title: string;
  zone: string;
  estimatedMinutes: number;
  requiredSkill?: string;
  priority: "critical" | "high" | "normal";
  equipment?: string;
}

interface MorningConditions {
  frostDelayUntil: string | null;
  dewBurnoffTime: string;
  firstTeeTime: string;
  sunrise: string;
  temperature_f: number;
  wind_mph: number;
}

interface RoutedTask {
  crewMemberId: string;
  crewMemberName: string;
  taskId: string;
  taskTitle: string;
  zone: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

interface MorningRoute {
  date: string;
  conditions: MorningConditions;
  routes: RoutedTask[];
  summary: string;
  generatedAt: string;
}

interface GenerateMorningRouteInput {
  date: string;
  tasks: MorningTask[];
  crew: CrewMember[];
  conditions: MorningConditions;
}

// ── Simple in-memory cache (per isolate, keyed by date) ─────────────────────

const routeCache = new Map<string, { data: MorningRoute; timestamp: number }>();

function getCachedRoute(date: string): MorningRoute | null {
  const entry = routeCache.get(date);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  if (entry) routeCache.delete(date);
  return null;
}

function setCachedRoute(date: string, data: MorningRoute): void {
  routeCache.set(date, { data, timestamp: Date.now() });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapPriority(p: string): "critical" | "high" | "normal" {
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  return "normal";
}

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

function parseSunriseTime(sunriseStr: string, date: string): Date {
  const match = sunriseStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return new Date(`${date}T06:00:00`);
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  return new Date(`${date}T${h}:${m}:00`);
}

function computeFrostDelay(
  minTemp: number,
  sunriseStr: string,
  date: string,
): string | null {
  if (minTemp >= 32) return null;
  const sunrise = parseSunriseTime(sunriseStr, date);
  return new Date(sunrise.getTime() + 2 * 60 * 60_000).toISOString();
}

function computeDewBurnoff(sunriseStr: string, date: string): string {
  const sunrise = parseSunriseTime(sunriseStr, date);
  return new Date(sunrise.getTime() + 1.5 * 60 * 60_000).toISOString();
}

// ── Weather fetch (inlined) ─────────────────────────────────────────────────

interface ForecastDay {
  date: string;
  max_temp_f: number;
  min_temp_f: number;
  max_wind_mph: number;
  avg_humidity: number;
  sunrise: string;
  sunset: string;
}

async function fetchForecastDay(
  lat: number,
  lng: number,
  targetDate: string,
): Promise<ForecastDay | null> {
  const apiKey = Deno.env.get("NEXT_PUBLIC_WEATHER_API_KEY") ??
    Deno.env.get("WEATHER_API_KEY");
  if (!apiKey) {
    console.error("Weather API key not configured");
    return null;
  }
  try {
    const res = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lng}&days=3&alerts=no&aqi=no`,
    );
    if (!res.ok) {
      console.error("Weather API error:", res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const days = (data.forecast?.forecastday || []) as any[];
    const match = days.find((d) => d.date === targetDate) || days[0];
    if (!match) return null;
    return {
      date: match.date,
      max_temp_f: match.day.maxtemp_f,
      min_temp_f: match.day.mintemp_f,
      max_wind_mph: match.day.maxwind_mph,
      avg_humidity: match.day.avghumidity,
      sunrise: match.astro.sunrise,
      sunset: match.astro.sunset,
    };
  } catch (err) {
    console.error("Weather fetch failed:", err);
    return null;
  }
}

// ── Prompt + Claude call ────────────────────────────────────────────────────

function buildRoutingPrompt(input: GenerateMorningRouteInput): string {
  const { date, tasks, crew, conditions } = input;

  const taskList = tasks
    .map((t) =>
      `- [${t.id}] "${t.title}" | Zone: ${t.zone} | Est: ${t.estimatedMinutes}min | Priority: ${t.priority}${
        t.requiredSkill ? ` | Requires: ${t.requiredSkill}` : ""
      }${t.equipment ? ` | Equipment: ${t.equipment}` : ""}`
    )
    .join("\n");

  const crewList = crew
    .map((c) => `- [${c.id}] ${c.name} | Role: ${c.role} | Skills: ${c.skills.join(", ")}`)
    .join("\n");

  return `You are the morning crew routing AI for a golf course. Plan the optimal morning work schedule for ${date}.

CONDITIONS:
- Sunrise: ${conditions.sunrise}
- Frost delay until: ${conditions.frostDelayUntil || "NONE (no frost)"}
- Dew burnoff time: ${conditions.dewBurnoffTime}
- First tee time: ${conditions.firstTeeTime}
- Temperature: ${conditions.temperature_f}°F
- Wind: ${conditions.wind_mph} mph

CREW:
${crewList}

TASKS:
${taskList}

ROUTING RULES (strict):
1. During frost delay: ONLY allow indoor work (shop maintenance, equipment prep). No outdoor tasks before frost delay lifts.
2. Do NOT mow greens or tees before dew burns off — poor cut quality and noise complaints.
3. Clear holes 1-3 area BEFORE the first tee time. This is the critical path — golfers must not see maintenance crews on the first few holes at tee time.
4. Balance workload across crew members as evenly as possible.
5. Group tasks geographically — minimize transit time between zones.
6. Match crew skills: spraying needs a licensed applicator, specialized mowing needs equipment certification.
7. All tasks must be assigned. If a crew member lacks the skill for any remaining task, assign the closest-skilled person with a note.

OUTPUT FORMAT:
Return a JSON object with exactly this structure (no markdown fencing, no extra text):
{
  "routes": [
    {
      "crewMemberId": "<crew member id>",
      "crewMemberName": "<crew member name>",
      "taskId": "<task id>",
      "taskTitle": "<task title>",
      "zone": "<zone>",
      "startTime": "<ISO 8601 datetime>",
      "endTime": "<ISO 8601 datetime>",
      "notes": "<brief reasoning for this assignment and timing>"
    }
  ],
  "summary": "<2-4 sentence plain-English summary of the plan, mentioning key constraints like frost delay, first tee, and how work is distributed>"
}

Use the date ${date} for all timestamps. Start times should be realistic — account for travel between zones (5 min between adjacent holes, 10 min across the course).`;
}

function generateFallbackRoute(input: GenerateMorningRouteInput): MorningRoute {
  const { date, tasks, crew, conditions } = input;

  const priorityOrder = { critical: 0, high: 1, normal: 2 };
  const sorted = [...tasks].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  const earliest = conditions.frostDelayUntil || conditions.sunrise;
  const routes: RoutedTask[] = [];
  const crewTimes: Record<string, Date> = {};
  for (const c of crew) crewTimes[c.id] = new Date(earliest);

  let crewIndex = 0;
  for (const task of sorted) {
    const member = crew[crewIndex % crew.length];
    const start = crewTimes[member.id];
    const end = new Date(start.getTime() + task.estimatedMinutes * 60_000);

    routes.push({
      crewMemberId: member.id,
      crewMemberName: member.name,
      taskId: task.id,
      taskTitle: task.title,
      zone: task.zone,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      notes: "Fallback assignment (AI unavailable) — round-robin by priority",
    });

    crewTimes[member.id] = end;
    crewIndex++;
  }

  return {
    date,
    conditions,
    routes,
    summary: `Fallback route: ${sorted.length} tasks assigned round-robin to ${crew.length} crew members. AI routing was unavailable — review and adjust manually.`,
    generatedAt: new Date().toISOString(),
  };
}

async function generateMorningRoute(
  input: GenerateMorningRouteInput,
): Promise<MorningRoute> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set — using fallback router");
    return generateFallbackRoute(input);
  }

  if (input.tasks.length === 0) {
    return {
      date: input.date,
      conditions: input.conditions,
      routes: [],
      summary: "No tasks scheduled for this date.",
      generatedAt: new Date().toISOString(),
    };
  }

  if (input.crew.length === 0) {
    return {
      date: input.date,
      conditions: input.conditions,
      routes: [],
      summary: "No crew members available for routing.",
      generatedAt: new Date().toISOString(),
    };
  }

  const prompt = buildRoutingPrompt(input);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Claude API error ${res.status}: ${errBody}`);
      return generateFallbackRoute(input);
    }

    const data = await res.json();
    const textContent = data.content
      ?.filter((b: { type: string }) => b.type === "text")
      ?.map((b: { text: string }) => b.text)
      ?.join("") || "";

    // Strip any markdown fencing if Claude added it
    const jsonStr = textContent
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    const parsed = JSON.parse(jsonStr);

    if (!parsed.routes || !Array.isArray(parsed.routes)) {
      console.error("Claude response missing routes array");
      return generateFallbackRoute(input);
    }

    const routes: RoutedTask[] = parsed.routes
      .map((r: RoutedTask) => ({
        crewMemberId: r.crewMemberId,
        crewMemberName: r.crewMemberName,
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        zone: r.zone,
        startTime: r.startTime,
        endTime: r.endTime,
        notes: r.notes,
      }))
      .sort((a: RoutedTask, b: RoutedTask) => {
        const crewCompare = a.crewMemberId.localeCompare(b.crewMemberId);
        if (crewCompare !== 0) return crewCompare;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });

    return {
      date: input.date,
      conditions: input.conditions,
      routes,
      summary: parsed.summary || "Morning route generated successfully.",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Morning route generation failed:", err);
    return generateFallbackRoute(input);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "GET") {
    const hasClaude = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    const hasWeather = Boolean(
      Deno.env.get("NEXT_PUBLIC_WEATHER_API_KEY") ?? Deno.env.get("WEATHER_API_KEY"),
    );
    return jsonResponse({ healthy: hasClaude, weatherConfigured: hasWeather, model: MODEL });
  }

  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const supabase = getUserClient(req);

    // Role check — staff only
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const staffRoles = ["superintendent", "assistant_superintendent", "foreman"];
    if (!profile || !staffRoles.includes((profile as { role: string }).role)) {
      return jsonError("Forbidden — staff only", 403);
    }

    const body = (await req.json().catch(() => ({}))) as { date?: unknown };
    const date = typeof body.date === "string" ? body.date : "";
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError("Invalid date. Expected YYYY-MM-DD.", 400);
    }

    // Cache check
    const cached = getCachedRoute(date);
    if (cached) return jsonResponse(cached);

    // 1. Tasks due on date (not completed/verified/cancelled)
    const { data: taskRows } = await supabase
      .from("tasks")
      .select(
        "id, title, category, priority, estimated_minutes, zone_id, equipment_needed, course_zones:course_zones!tasks_zone_id_fkey(name)",
      )
      .eq("due_date", date)
      .not("status", "eq", "completed")
      .not("status", "eq", "verified")
      .not("status", "eq", "cancelled");

    // deno-lint-ignore no-explicit-any
    const tasks: MorningTask[] = ((taskRows || []) as any[]).map((t: any) => ({
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

    // 2. Active crew
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

    const crew: CrewMember[] = ((crewRows || []) as Array<{
      id: string;
      full_name: string | null;
      role: string;
    }>).map((c) => ({
      id: c.id,
      name: c.full_name || "Unknown",
      role: c.role,
      skills: roleToSkills(c.role),
    }));

    // 3. Weather forecast for the target date
    const forecast = await fetchForecastDay(COURSE.lat, COURSE.lng, date);

    const sunriseStr = forecast?.sunrise || "06:00 AM";
    const minTemp = forecast?.min_temp_f ?? 40;
    const maxTemp = forecast?.max_temp_f ?? 65;
    const avgTemp = (minTemp + maxTemp) / 2;
    const windMph = forecast?.max_wind_mph ?? 5;

    const conditions: MorningConditions = {
      frostDelayUntil: computeFrostDelay(minTemp, sunriseStr, date),
      dewBurnoffTime: computeDewBurnoff(sunriseStr, date),
      firstTeeTime: `${date}T07:00:00`,
      sunrise: parseSunriseTime(sunriseStr, date).toISOString(),
      temperature_f: avgTemp,
      wind_mph: windMph,
    };

    // 4. First tee time override
    const { data: teeTimeRows } = await supabase
      .from("tee_times")
      .select("tee_time")
      .eq("date", date)
      .order("tee_time", { ascending: true })
      .limit(1);

    if (teeTimeRows && teeTimeRows.length > 0) {
      conditions.firstTeeTime = (teeTimeRows[0] as { tee_time: string }).tee_time;
    }

    // 5. Generate route
    const route = await generateMorningRoute({ date, tasks, crew, conditions });
    setCachedRoute(date, route);

    return jsonResponse(route);
  } catch (err) {
    console.error("Morning route API error:", err);
    return jsonError(
      err instanceof Error ? err.message : "Internal server error",
      500,
    );
  }
});
