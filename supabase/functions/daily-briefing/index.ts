/**
 * daily-briefing — Deno edge function port of /api/daily-briefing.
 *
 * Generates and optionally posts the morning briefing to the "All Staff"
 * channel. Pulls weather, staff on duty, priority tasks, alerts (overdue
 * work, equipment needing service, low chemical stock, expiring certs),
 * yesterday's recap, and upcoming plan goals.
 *
 * Auth: bearer-token header — this runs from pg_cron / scheduled trigger,
 *       NOT from a signed-in user, so it authenticates via a shared secret
 *       (DAILY_BRIEFING_SECRET) and uses the admin client.
 *
 * Secrets needed: DAILY_BRIEFING_SECRET
 *                 (optional) NEXT_PUBLIC_WEATHER_API_KEY — for live weather
 *
 * Deploy:  supabase functions deploy daily-briefing
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ── Types ───────────────────────────────────────────────────────────────────

interface BriefingSettings {
  enabled: boolean;
  time: string;
  includeWeather: boolean;
  includeStaffRoster: boolean;
  includePriorities: boolean;
  includeAlerts: boolean;
  includeYesterdayRecap: boolean;
  includeUpcoming: boolean;
}

const DEFAULT_BRIEFING_SETTINGS: BriefingSettings = {
  enabled: true,
  time: "05:00",
  includeWeather: true,
  includeStaffRoster: true,
  includePriorities: true,
  includeAlerts: true,
  includeYesterdayRecap: true,
  includeUpcoming: true,
};

interface StaffOnDuty {
  name: string;
  shift: string;
  role: string;
}

interface PriorityTask {
  title: string;
  assignee: string;
  priority: string;
}

interface Alert {
  type: string;
  message: string;
}

interface BriefingData {
  date: Date;
  weather: {
    high_temp_f: number | null;
    low_temp_f: number | null;
    conditions: string | null;
    wind_max_mph: number | null;
    precipitation_inches: number | null;
    humidity_avg: number | null;
  } | null;
  staffOnDuty: StaffOnDuty[];
  priorityTasks: PriorityTask[];
  alerts: Alert[];
  yesterdayStats: {
    completed: number;
    total: number;
    notableCompletions: string[];
  };
  upcomingEvents: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBriefingDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShiftTime(start: string | null, end: string | null): string {
  if (!start || !end) return "All day";
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };
  return `${formatTime(start)} - ${formatTime(end)}`;
}

async function getBriefingSettings(
  supabase: SupabaseClient,
): Promise<BriefingSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "daily_briefing")
    .single();

  if (data?.value) {
    return { ...DEFAULT_BRIEFING_SETTINGS, ...(data.value as Partial<BriefingSettings>) };
  }
  return DEFAULT_BRIEFING_SETTINGS;
}

async function ensureWeatherLogExists(
  supabase: SupabaseClient,
  date: Date,
): Promise<boolean> {
  const dateStr = date.toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("weather_logs")
    .select("id")
    .eq("log_date", dateStr)
    .single();

  if (existing) return true;

  const { error } = await supabase.from("weather_logs").insert({
    log_date: dateStr,
    high_temp_f: null,
    low_temp_f: null,
    conditions: "No data available",
    wind_max_mph: null,
    humidity_avg: null,
    precipitation_inches: null,
    frost_observed: false,
    notes: "Auto-generated placeholder",
  });

  return !error;
}

async function fetchBriefingData(
  supabase: SupabaseClient,
  date: Date,
): Promise<BriefingData> {
  const dateStr = date.toISOString().split("T")[0];
  const yesterdayDate = new Date(date);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

  // Weather for today
  const { data: weatherData } = await supabase
    .from("weather_logs")
    .select(
      "high_temp_f, low_temp_f, conditions, wind_max_mph, precipitation_inches, humidity_avg",
    )
    .eq("log_date", dateStr)
    .single();

  // Staff scheduled for today
  const { data: schedules } = await supabase
    .from("schedules")
    .select(`
      shift_start,
      shift_end,
      shift_type,
      user_id,
      profiles!schedules_user_id_fkey(full_name, role)
    `)
    .eq("schedule_date", dateStr)
    .neq("shift_type", "off");

  // Approved time-off overlapping today
  const { data: timeOff } = await supabase
    .from("time_off_requests")
    .select("user_id")
    .eq("status", "approved")
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);

  const timeOffUserIds = new Set(
    // deno-lint-ignore no-explicit-any
    (timeOff || []).map((t: any) => t.user_id),
  );

  const staffOnDuty: StaffOnDuty[] = ((schedules || []) as Array<{
    shift_start: string | null;
    shift_end: string | null;
    user_id: string;
    profiles: { full_name: string; role: string } | null;
  }>)
    .filter((s) => !timeOffUserIds.has(s.user_id))
    .map((s) => ({
      name: s.profiles?.full_name || "Unknown",
      shift: formatShiftTime(s.shift_start, s.shift_end),
      role: s.profiles?.role || "",
    }));

  // Priority tasks for today
  const { data: tasks } = await supabase
    .from("tasks")
    .select(`
      title,
      priority,
      assigned_to,
      profiles!tasks_assigned_to_fkey(full_name)
    `)
    .eq("due_date", dateStr)
    .in("priority", ["critical", "high"])
    .not("status", "in", '("completed","verified","cancelled")')
    .order("priority", { ascending: true });

  const priorityTasks: PriorityTask[] = ((tasks || []) as Array<{
    title: string;
    priority: string;
    profiles: { full_name: string } | null;
  }>).map((t) => ({
    title: t.title,
    assignee: t.profiles?.full_name || "Unassigned",
    priority: t.priority,
  }));

  // Alerts ─────────────────────────────────────────────────────────────────
  const alerts: Alert[] = [];

  // Overdue tasks
  const { count: overdueCount } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .lt("due_date", dateStr)
    .not("status", "in", '("completed","verified","cancelled")');

  if (overdueCount && overdueCount > 0) {
    alerts.push({
      type: "overdue",
      message: `${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""} need attention`,
    });
  }

  // Equipment needing service
  const { data: equipmentService } = await supabase
    .from("equipment")
    .select("name")
    .in("status", ["needs_service", "in_repair"]);

  if (equipmentService && equipmentService.length > 0) {
    alerts.push({
      type: "equipment",
      message: `${equipmentService.length} equipment item${
        equipmentService.length !== 1 ? "s" : ""
      } need service: ${
        // deno-lint-ignore no-explicit-any
        equipmentService.slice(0, 3).map((e: any) => e.name).join(", ")
      }${equipmentService.length > 3 ? "..." : ""}`,
    });
  }

  // Low chemical stock
  const { data: lowStock } = await supabase
    .from("chemical_products")
    .select("product_name, current_inventory, reorder_threshold")
    .eq("is_active", true)
    .not("current_inventory", "is", null)
    .not("reorder_threshold", "is", null);

  const lowStockItems = ((lowStock || []) as Array<{
    product_name: string;
    current_inventory: number | null;
    reorder_threshold: number | null;
  }>).filter((c) =>
    c.current_inventory !== null &&
    c.reorder_threshold !== null &&
    c.current_inventory <= c.reorder_threshold
  );

  if (lowStockItems.length > 0) {
    alerts.push({
      type: "inventory",
      message: `Low stock: ${lowStockItems.slice(0, 3).map((c) => c.product_name).join(", ")}${
        lowStockItems.length > 3 ? `... (+${lowStockItems.length - 3} more)` : ""
      }`,
    });
  }

  // Expiring certifications (within 30 days)
  const thirtyDaysFromNow = new Date(date);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const [{ data: activeProfiles }, { data: personnelWithCerts }] = await Promise.all([
    supabase
      .from("staff_directory")
      .select("id, full_name")
      .eq("is_active", true),
    supabase
      .from("staff_personnel_private")
      .select("employee_id, certifications"),
  ]);
  const activeNames = new Map(
    ((activeProfiles || []) as Array<{ id: string; full_name: string }>).map((p) => [p.id, p.full_name]),
  );

  const expiringCerts: string[] = [];
  ((personnelWithCerts || []) as Array<{
    employee_id: string;
    certifications: Array<{ name: string; expiry_date: string | null }> | null;
  }>).forEach((p) => {
    const fullName = activeNames.get(p.employee_id);
    if (!fullName) return;
    const certs = p.certifications || [];
    certs.forEach((cert) => {
      if (cert.expiry_date && cert.expiry_date <= thirtyDaysStr && cert.expiry_date >= dateStr) {
        expiringCerts.push(`${fullName}'s ${cert.name}`);
      }
    });
  });

  if (expiringCerts.length > 0) {
    alerts.push({
      type: "certification",
      message: `Expiring certifications: ${expiringCerts.slice(0, 2).join(", ")}${
        expiringCerts.length > 2 ? `... (+${expiringCerts.length - 2} more)` : ""
      }`,
    });
  }

  // Yesterday's recap
  const { data: yesterdayTasks, count: yesterdayTotal } = await supabase
    .from("tasks")
    .select("title, status", { count: "exact" })
    .eq("due_date", yesterdayStr);

  const yesterdayCompleted = ((yesterdayTasks || []) as Array<{
    title: string;
    status: string;
  }>).filter((t) => t.status === "completed" || t.status === "verified");

  const notableCompletions = yesterdayCompleted.slice(0, 3).map((t) => t.title);

  // Upcoming plan_goals in next 7 days
  const sevenDaysFromNow = new Date(date);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

  const { data: upcomingGoals } = await supabase
    .from("plan_goals")
    .select("title, week_start")
    .in("status", ["planned", "in_progress"])
    .gte("week_start", dateStr)
    .lte("week_start", sevenDaysStr)
    .order("week_start", { ascending: true })
    .limit(5);

  const upcomingEvents = ((upcomingGoals || []) as Array<{
    title: string;
    week_start: string;
  }>).map((g) => {
    const goalDate = new Date(g.week_start + "T00:00:00");
    const dayName = goalDate.toLocaleDateString("en-US", { weekday: "short" });
    return `${dayName}: ${g.title}`;
  });

  return {
    date,
    weather: weatherData ?? null,
    staffOnDuty,
    priorityTasks,
    alerts,
    yesterdayStats: {
      completed: yesterdayCompleted.length,
      total: yesterdayTotal || 0,
      notableCompletions,
    },
    upcomingEvents,
  };
}

function formatBriefing(data: BriefingData, settings: BriefingSettings): string {
  const lines: string[] = [];

  lines.push(`DAILY BRIEFING - ${formatBriefingDate(data.date)}`);
  lines.push("");

  if (settings.includeWeather) {
    lines.push("WEATHER");
    if (data.weather) {
      const high = data.weather.high_temp_f ?? "?";
      const low = data.weather.low_temp_f ?? "?";
      const conditions = data.weather.conditions || "No data";
      const wind = data.weather.wind_max_mph ?? 0;

      lines.push(`${high}F / ${low}F - ${conditions}`);
      lines.push(`Wind: ${wind} mph`);

      if (data.weather.precipitation_inches && data.weather.precipitation_inches > 0) {
        lines.push(`Precipitation: ${data.weather.precipitation_inches}" expected`);
      }
      if (data.weather.low_temp_f !== null && data.weather.low_temp_f < 36) {
        lines.push("FROST ALERT - Low temps may cause frost");
      }
      if (wind > 10) {
        lines.push("HIGH WIND - No spray operations recommended");
      }
    } else {
      lines.push("No weather data available");
    }
    lines.push("");
  }

  if (settings.includeStaffRoster) {
    lines.push(`STAFF ON DUTY: ${data.staffOnDuty.length}`);
    if (data.staffOnDuty.length > 0) {
      data.staffOnDuty.forEach((s) => lines.push(`  - ${s.name} (${s.shift})`));
    } else {
      lines.push("  No staff scheduled");
    }
    lines.push("");
  }

  if (settings.includePriorities) {
    lines.push("TODAY'S PRIORITIES");
    if (data.priorityTasks.length > 0) {
      data.priorityTasks.forEach((t) => {
        const priorityIcon = t.priority === "critical" ? "[CRITICAL]" : "[HIGH]";
        lines.push(`  ${priorityIcon} ${t.title}`);
        lines.push(`    Assigned: ${t.assignee}`);
      });
    } else {
      lines.push("  No critical or high priority tasks today");
    }
    lines.push("");
  }

  if (settings.includeAlerts && data.alerts.length > 0) {
    lines.push("ALERTS");
    data.alerts.forEach((a) => lines.push(`  - ${a.message}`));
    lines.push("");
  }

  if (settings.includeYesterdayRecap) {
    lines.push("YESTERDAY'S RECAP");
    if (data.yesterdayStats.total > 0) {
      lines.push(
        `  ${data.yesterdayStats.completed} of ${data.yesterdayStats.total} tasks completed`,
      );
      if (data.yesterdayStats.notableCompletions.length > 0) {
        lines.push("  Notable completions:");
        data.yesterdayStats.notableCompletions.forEach((t) => lines.push(`    - ${t}`));
      }
    } else {
      lines.push("  No tasks were scheduled yesterday");
    }
    lines.push("");
  }

  if (settings.includeUpcoming && data.upcomingEvents.length > 0) {
    lines.push("UPCOMING (Next 7 Days)");
    data.upcomingEvents.forEach((e) => lines.push(`  - ${e}`));
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function postDailyBriefing(
  supabase: SupabaseClient,
  briefingContent: string,
): Promise<boolean> {
  // Find the All Staff announcement channel
  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("name", "All Staff")
    .eq("channel_type", "announcement")
    .single();

  if (!channel) {
    console.error("All Staff channel not found");
    return false;
  }

  // Pick any super/superintendent to post as (system message)
  const { data: superUser } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["super", "superintendent"])
    .limit(1)
    .single();

  if (!superUser) {
    console.error("No superintendent found to post briefing");
    return false;
  }

  const { error } = await supabase.from("messages").insert({
    channel_id: (channel as { id: string }).id,
    sender_id: (superUser as { id: string }).id,
    content: briefingContent,
    message_type: "system",
    attachments: [],
    is_pinned: false,
  });

  if (error) {
    console.error("Error posting daily briefing:", error);
    return false;
  }
  return true;
}

// ── Handler ─────────────────────────────────────────────────────────────────

async function authorize(req: Request): Promise<boolean> {
  const secret = Deno.env.get("DAILY_BRIEFING_SECRET");
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return token === secret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (!(await authorize(req))) {
    return jsonError("Unauthorized", 401);
  }

  const supabase = getAdminClient();

  try {
    if (req.method === "GET") {
      const settings = await getBriefingSettings(supabase);
      const data = await fetchBriefingData(supabase, new Date());
      const preview = formatBriefing(data, settings);
      return jsonResponse({
        settings,
        preview,
        date: new Date().toISOString().split("T")[0],
      });
    }

    if (req.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const url = new URL(req.url);
    const isPreview = url.searchParams.get("preview") === "true";
    const dateParam = url.searchParams.get("date");

    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam + "T00:00:00");
      if (isNaN(targetDate.getTime())) {
        return jsonError("Invalid date format. Use YYYY-MM-DD", 400);
      }
    } else {
      targetDate = new Date();
    }

    const settings = await getBriefingSettings(supabase);

    if (!isPreview && !settings.enabled) {
      return jsonResponse({
        success: false,
        message: "Daily briefing is disabled in settings",
      });
    }

    await ensureWeatherLogExists(supabase, targetDate);
    const data = await fetchBriefingData(supabase, targetDate);
    const briefingContent = formatBriefing(data, settings);

    if (isPreview) {
      return jsonResponse({
        success: true,
        preview: true,
        date: targetDate.toISOString().split("T")[0],
        content: briefingContent,
      });
    }

    const posted = await postDailyBriefing(supabase, briefingContent);
    if (!posted) {
      return jsonError(
        "Failed to post briefing. Check that the All Staff channel exists.",
        500,
      );
    }

    return jsonResponse({
      success: true,
      date: targetDate.toISOString().split("T")[0],
      message: "Daily briefing posted successfully",
    });
  } catch (err) {
    console.error("Error generating daily briefing:", err);
    return jsonError(err instanceof Error ? err.message : "Unknown error", 500);
  }
});
