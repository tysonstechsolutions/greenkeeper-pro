import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service role client for server-side operations
function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface BriefingSettings {
  enabled: boolean;
  time: string; // "05:00" format
  includeWeather: boolean;
  includeStaffRoster: boolean;
  includePriorities: boolean;
  includeAlerts: boolean;
  includeYesterdayRecap: boolean;
  includeUpcoming: boolean;
}

export const DEFAULT_BRIEFING_SETTINGS: BriefingSettings = {
  enabled: true,
  time: "05:00",
  includeWeather: true,
  includeStaffRoster: true,
  includePriorities: true,
  includeAlerts: true,
  includeYesterdayRecap: true,
  includeUpcoming: true,
};

interface WeatherData {
  high_temp_f: number | null;
  low_temp_f: number | null;
  conditions: string | null;
  wind_max_mph: number | null;
  precipitation_inches: number | null;
  humidity_avg: number | null;
}

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
  weather: WeatherData | null;
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

/**
 * Formats a date for display in the briefing header
 */
function formatBriefingDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Formats shift times for display
 */
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

/**
 * Get briefing settings from app_settings table
 */
export async function getBriefingSettings(): Promise<BriefingSettings> {
  const supabase = createServiceClient();

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

/**
 * Save briefing settings to app_settings table
 */
export async function saveBriefingSettings(settings: BriefingSettings): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key: "daily_briefing",
      value: settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

  return !error;
}

/**
 * Fetches all data needed for the daily briefing
 */
async function fetchBriefingData(date: Date): Promise<BriefingData> {
  const supabase = createServiceClient();
  const dateStr = date.toISOString().split("T")[0];
  const yesterdayDate = new Date(date);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

  // Get weather for today
  const { data: weatherData } = await supabase
    .from("weather_logs")
    .select("high_temp_f, low_temp_f, conditions, wind_max_mph, precipitation_inches, humidity_avg")
    .eq("log_date", dateStr)
    .single();

  // Get staff scheduled for today
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

  // Get time-off requests that overlap with today
  const { data: timeOff } = await supabase
    .from("time_off_requests")
    .select("user_id")
    .eq("status", "approved")
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);

  const timeOffUserIds = new Set((timeOff || []).map(t => t.user_id));

  // Filter out staff on time-off
  const staffOnDuty: StaffOnDuty[] = (schedules || [])
    .filter(s => !timeOffUserIds.has(s.user_id))
    .map(s => {
      const profile = s.profiles as { full_name: string; role: string } | null;
      return {
        name: profile?.full_name || "Unknown",
        shift: formatShiftTime(s.shift_start, s.shift_end),
        role: profile?.role || "",
      };
    });

  // Get critical and high priority tasks for today
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

  const priorityTasks: PriorityTask[] = (tasks || []).map(t => ({
    title: t.title,
    assignee: (t.profiles as { full_name: string } | null)?.full_name || "Unassigned",
    priority: t.priority,
  }));

  // Gather alerts
  const alerts: Alert[] = [];

  // Check for overdue tasks
  const { data: overdueTasks, count: overdueCount } = await supabase
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

  // Check for equipment needing service
  const { data: equipmentService } = await supabase
    .from("equipment")
    .select("name")
    .in("status", ["needs_service", "in_repair"]);

  if (equipmentService && equipmentService.length > 0) {
    alerts.push({
      type: "equipment",
      message: `${equipmentService.length} equipment item${equipmentService.length !== 1 ? "s" : ""} need service: ${equipmentService.slice(0, 3).map(e => e.name).join(", ")}${equipmentService.length > 3 ? "..." : ""}`,
    });
  }

  // Check for low chemical stock
  const { data: lowStock } = await supabase
    .from("chemical_products")
    .select("product_name, current_inventory, reorder_threshold")
    .eq("is_active", true)
    .not("current_inventory", "is", null)
    .not("reorder_threshold", "is", null);

  const lowStockItems = (lowStock || []).filter(
    c => c.current_inventory !== null &&
         c.reorder_threshold !== null &&
         c.current_inventory <= c.reorder_threshold
  );

  if (lowStockItems.length > 0) {
    alerts.push({
      type: "inventory",
      message: `Low stock: ${lowStockItems.slice(0, 3).map(c => c.product_name).join(", ")}${lowStockItems.length > 3 ? `... (+${lowStockItems.length - 3} more)` : ""}`,
    });
  }

  // Check for expiring certifications (within 30 days)
  const thirtyDaysFromNow = new Date(date);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const { data: profilesWithCerts } = await supabase
    .from("profiles")
    .select("full_name, certifications")
    .eq("is_active", true);

  const expiringCerts: string[] = [];
  (profilesWithCerts || []).forEach(p => {
    const certs = p.certifications as Array<{ name: string; expiry_date: string | null }> || [];
    certs.forEach(cert => {
      if (cert.expiry_date && cert.expiry_date <= thirtyDaysStr && cert.expiry_date >= dateStr) {
        expiringCerts.push(`${p.full_name}'s ${cert.name}`);
      }
    });
  });

  if (expiringCerts.length > 0) {
    alerts.push({
      type: "certification",
      message: `Expiring certifications: ${expiringCerts.slice(0, 2).join(", ")}${expiringCerts.length > 2 ? `... (+${expiringCerts.length - 2} more)` : ""}`,
    });
  }

  // Yesterday's recap
  const { data: yesterdayTasks, count: yesterdayTotal } = await supabase
    .from("tasks")
    .select("title, status", { count: "exact" })
    .eq("due_date", yesterdayStr);

  const yesterdayCompleted = (yesterdayTasks || []).filter(
    t => t.status === "completed" || t.status === "verified"
  );

  const notableCompletions = yesterdayCompleted
    .slice(0, 3)
    .map(t => t.title);

  // Upcoming events (plan_goals in next 7 days)
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

  const upcomingEvents = (upcomingGoals || []).map(g => {
    const goalDate = new Date(g.week_start + "T00:00:00");
    const dayName = goalDate.toLocaleDateString("en-US", { weekday: "short" });
    return `${dayName}: ${g.title}`;
  });

  return {
    date,
    weather: weatherData,
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

/**
 * Generates the formatted daily briefing message
 */
export async function generateDailyBriefing(
  date: Date,
  settings?: Partial<BriefingSettings>
): Promise<string> {
  const fullSettings = { ...DEFAULT_BRIEFING_SETTINGS, ...settings };
  const data = await fetchBriefingData(date);

  const lines: string[] = [];

  // Header
  lines.push(`DAILY BRIEFING - ${formatBriefingDate(data.date)}`);
  lines.push("");

  // Weather section
  if (fullSettings.includeWeather) {
    lines.push("WEATHER");
    if (data.weather) {
      const high = data.weather.high_temp_f ?? "?";
      const low = data.weather.low_temp_f ?? "?";
      const conditions = data.weather.conditions || "No data";
      const wind = data.weather.wind_max_mph ?? 0;

      lines.push(`${high}F / ${low}F - ${conditions}`);
      lines.push(`Wind: ${wind} mph`);

      // Rain probability (if we have precipitation data)
      if (data.weather.precipitation_inches && data.weather.precipitation_inches > 0) {
        lines.push(`Precipitation: ${data.weather.precipitation_inches}" expected`);
      }

      // Frost alert
      if (data.weather.low_temp_f !== null && data.weather.low_temp_f < 36) {
        lines.push("FROST ALERT - Low temps may cause frost");
      }

      // High wind alert
      if (wind > 10) {
        lines.push("HIGH WIND - No spray operations recommended");
      }
    } else {
      lines.push("No weather data available");
    }
    lines.push("");
  }

  // Staff roster
  if (fullSettings.includeStaffRoster) {
    lines.push(`STAFF ON DUTY: ${data.staffOnDuty.length}`);
    if (data.staffOnDuty.length > 0) {
      data.staffOnDuty.forEach(staff => {
        lines.push(`  - ${staff.name} (${staff.shift})`);
      });
    } else {
      lines.push("  No staff scheduled");
    }
    lines.push("");
  }

  // Priority tasks
  if (fullSettings.includePriorities) {
    lines.push("TODAY'S PRIORITIES");
    if (data.priorityTasks.length > 0) {
      data.priorityTasks.forEach(task => {
        const priorityIcon = task.priority === "critical" ? "[CRITICAL]" : "[HIGH]";
        lines.push(`  ${priorityIcon} ${task.title}`);
        lines.push(`    Assigned: ${task.assignee}`);
      });
    } else {
      lines.push("  No critical or high priority tasks today");
    }
    lines.push("");
  }

  // Alerts
  if (fullSettings.includeAlerts && data.alerts.length > 0) {
    lines.push("ALERTS");
    data.alerts.forEach(alert => {
      lines.push(`  - ${alert.message}`);
    });
    lines.push("");
  }

  // Yesterday's recap
  if (fullSettings.includeYesterdayRecap) {
    lines.push("YESTERDAY'S RECAP");
    if (data.yesterdayStats.total > 0) {
      lines.push(`  ${data.yesterdayStats.completed} of ${data.yesterdayStats.total} tasks completed`);
      if (data.yesterdayStats.notableCompletions.length > 0) {
        lines.push("  Notable completions:");
        data.yesterdayStats.notableCompletions.forEach(title => {
          lines.push(`    - ${title}`);
        });
      }
    } else {
      lines.push("  No tasks were scheduled yesterday");
    }
    lines.push("");
  }

  // Upcoming events
  if (fullSettings.includeUpcoming && data.upcomingEvents.length > 0) {
    lines.push("UPCOMING (Next 7 Days)");
    data.upcomingEvents.forEach(event => {
      lines.push(`  - ${event}`);
    });
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Generates a preview of the briefing for the settings page
 */
export async function generateBriefingPreview(settings: BriefingSettings): Promise<string> {
  return generateDailyBriefing(new Date(), settings);
}

/**
 * Gets the "All Staff" channel ID for posting the briefing
 */
export async function getAllStaffChannelId(): Promise<string | null> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("channels")
    .select("id")
    .eq("name", "All Staff")
    .eq("channel_type", "announcement")
    .single();

  return data?.id || null;
}

/**
 * Posts the daily briefing to the All Staff channel
 */
export async function postDailyBriefing(briefingContent: string): Promise<boolean> {
  const supabase = createServiceClient();

  const channelId = await getAllStaffChannelId();
  if (!channelId) {
    console.error("All Staff channel not found");
    return false;
  }

  // Get the super user to post as (system message)
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

  const { error } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      sender_id: superUser.id,
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

/**
 * Creates or updates today's weather log entry
 * This can be called by the API route to ensure we have weather data
 */
export async function ensureWeatherLogExists(date: Date): Promise<boolean> {
  const supabase = createServiceClient();
  const dateStr = date.toISOString().split("T")[0];

  // Check if weather log exists for today
  const { data: existing } = await supabase
    .from("weather_logs")
    .select("id")
    .eq("log_date", dateStr)
    .single();

  if (existing) {
    return true; // Already exists
  }

  // Create a placeholder entry (can be updated with real weather data later)
  // In production, this would call a weather API
  const { error } = await supabase
    .from("weather_logs")
    .insert({
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

/**
 * Fetches weather from an external API and updates the weather_log
 * This is a placeholder - implement with actual weather API (OpenWeatherMap, etc.)
 */
export async function fetchAndStoreWeather(date: Date, lat: number, lng: number): Promise<boolean> {
  const supabase = createServiceClient();
  const dateStr = date.toISOString().split("T")[0];

  try {
    // TODO: Implement actual weather API call
    // Example with OpenWeatherMap:
    // const response = await fetch(
    //   `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`
    // );
    // const weatherData = await response.json();

    // For now, just ensure the placeholder exists
    return ensureWeatherLogExists(date);
  } catch (error) {
    console.error("Error fetching weather:", error);
    return false;
  }
}
