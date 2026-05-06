import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDate } from "@/lib/utils/date";

// ── Types ──

export interface MonthlyBoardData {
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

// ── Helpers ──

export function getMonthDateRange(month: number, year: number) {
  const startDate = formatLocalDate(new Date(year, month - 1, 1));
  const endDate = formatLocalDate(new Date(year, month, 0));
  return { startDate, endDate };
}

// ── Main query ──

export async function fetchMonthlyBoardData(
  supabase: SupabaseClient,
  { month, year }: { month: number; year: number }
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
    labor,
    chemical,
    equipment,
    observations,
    tasks,
    weather,
    budget,
  };
}

// ── Section queries (each independently try/caught) ──

async function fetchLabor(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  try {
    const { data, error } = await supabase
      .from("schedule")
      .select("id, user_id")
      .gte("schedule_date", startDate)
      .lte("schedule_date", endDate);

    if (error) throw error;
    const rows = data || [];
    const uniqueUsers = new Set(rows.map((r: { user_id: string }) => r.user_id));
    return { totalScheduledShifts: rows.length, totalCrewMembers: uniqueUsers.size };
  } catch {
    return { totalScheduledShifts: 0, totalCrewMembers: 0 };
  }
}

async function fetchChemical(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  try {
    const { data, error } = await supabase
      .from("chemical_applications")
      .select("id, product_id, chemical_products(product_name)")
      .gte("application_date", startDate)
      .lte("application_date", endDate);

    if (error) throw error;
    const rows = data || [];

    // Count by product name
    const productCounts: Record<string, number> = {};
    for (const row of rows) {
      const name =
        (row as Record<string, unknown>).chemical_products &&
        typeof (row as Record<string, unknown>).chemical_products === "object"
          ? ((row as Record<string, unknown>).chemical_products as { product_name: string })
              .product_name
          : "Unknown";
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

async function fetchEquipment(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  try {
    // Service records
    const { data: svcData, error: svcErr } = await supabase
      .from("equipment_logs")
      .select("id, equipment_id, log_type, description, downtime_hours, equipment(name)")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59");

    if (svcErr) throw svcErr;
    const rows = svcData || [];

    const serviceRows = rows.filter(
      (r: Record<string, unknown>) =>
        r.log_type === "service" || r.log_type === "repair"
    );

    const totalDowntime = rows.reduce(
      (sum: number, r: Record<string, unknown>) =>
        sum + (typeof r.downtime_hours === "number" ? r.downtime_hours : 0),
      0
    );

    // Top issues by equipment
    const issueCounts: Record<string, number> = {};
    for (const row of serviceRows) {
      const r = row as Record<string, unknown>;
      const eqName =
        r.equipment && typeof r.equipment === "object"
          ? ((r.equipment as { name: string }).name || "Unknown")
          : "Unknown";
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

async function fetchObservations(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
  try {
    // Hole observations have proper status fields
    const { data: holeObs, error: holeErr } = await supabase
      .from("hole_observations")
      .select("id, status, priority")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59");

    if (holeErr) throw holeErr;
    const rows = holeObs || [];

    const resolvedCount = rows.filter(
      (r: { status: string }) => r.status === "resolved"
    ).length;
    const openCount = rows.filter(
      (r: { status: string }) => r.status === "open" || r.status === "monitoring"
    ).length;

    // Use priority as severity proxy
    const bySeverity: Record<string, number> = {};
    for (const r of rows) {
      const prio = (r as { priority: string }).priority || "normal";
      bySeverity[prio] = (bySeverity[prio] || 0) + 1;
    }

    // Also count course_observations
    let courseCount = 0;
    try {
      const { count, error: coErr } = await supabase
        .from("course_observations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59");
      if (!coErr && count !== null) courseCount = count;
    } catch {
      // ignore
    }

    // Also count green_observations
    let greenCount = 0;
    try {
      const { count, error: goErr } = await supabase
        .from("green_observations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59");
      if (!goErr && count !== null) greenCount = count;
    } catch {
      // ignore
    }

    const totalCount = rows.length + courseCount + greenCount;

    return { totalCount, resolvedCount, openCount, bySeverity };
  } catch {
    return { totalCount: 0, resolvedCount: 0, openCount: 0, bySeverity: {} };
  }
}

async function fetchTasks(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
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
      (r: { status: string }) =>
        r.status === "completed" || r.status === "verified"
    ).length;
    const completionRate =
      totalCreated > 0
        ? Math.round((totalCompleted / totalCreated) * 100)
        : 0;

    const overdueCount = rows.filter((r: { status: string; due_date: string }) => {
      const isOpen =
        r.status !== "completed" &&
        r.status !== "verified" &&
        r.status !== "cancelled";
      return isOpen && r.due_date < endDate;
    }).length;

    return { totalCreated, totalCompleted, completionRate, overdueCount };
  } catch {
    return { totalCreated: 0, totalCompleted: 0, completionRate: 0, overdueCount: 0 };
  }
}

async function fetchWeather(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
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

    const highs = rows
      .map((r: { high_temp_f: number | null }) => r.high_temp_f)
      .filter((v): v is number => v !== null);
    const lows = rows
      .map((r: { low_temp_f: number | null }) => r.low_temp_f)
      .filter((v): v is number => v !== null);

    const avgHighF =
      highs.length > 0
        ? Math.round((highs.reduce((a, b) => a + b, 0) / highs.length) * 10) / 10
        : null;
    const avgLowF =
      lows.length > 0
        ? Math.round((lows.reduce((a, b) => a + b, 0) / lows.length) * 10) / 10
        : null;

    const totalRainInches = rows.reduce(
      (sum: number, r: { precipitation_inches: number | null }) =>
        sum + (r.precipitation_inches || 0),
      0
    );

    const frostDays = rows.filter(
      (r: { frost_observed: boolean }) => r.frost_observed
    ).length;

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

async function fetchBudget(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
) {
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

    const totalExpenses = rows.reduce(
      (sum: number, r: { amount: number }) => sum + r.amount,
      0
    );

    // Group by rough category from description (best effort)
    const cats: Record<string, number> = {};
    for (const row of rows) {
      const r = row as { amount: number; description: string };
      // Use first word of description as rough category
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
