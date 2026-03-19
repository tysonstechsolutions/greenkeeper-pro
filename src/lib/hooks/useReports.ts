"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCourse } from "./useCourse";

// Report data types
export interface DailyReportData {
  date: string;
  weather: {
    high_f: number;
    low_f: number;
    condition: string;
    precip_in: number;
    wind_mph: number;
    humidity: number;
  } | null;
  tasks: {
    total: number;
    completed: number;
    in_progress: number;
    blocked: number;
    overdue: number;
    by_category: { category: string; count: number; completed: number }[];
    by_crew: { crew_name: string; assigned: number; completed: number }[];
    list: {
      id: string;
      title: string;
      status: string;
      assignee: string | null;
      category: string;
      completion_time: number | null;
      estimated_time: number | null;
    }[];
  };
  photos: {
    count: number;
    thumbnails: { id: string; thumbnail_url: string; caption: string | null }[];
  };
  equipment_issues: {
    id: string;
    name: string;
    issue: string;
    status: string;
  }[];
  chemical_applications: {
    id: string;
    product_name: string;
    zones: string[];
    amount: number;
    unit: string;
    applicator: string | null;
  }[];
  active_diagnostics: {
    id: string;
    condition: string;
    zone: string | null;
    severity: number;
    status: string;
  }[];
  staff_attendance: {
    scheduled: string[];
    with_tasks: string[];
  };
  notes: string[];
}

export interface WeeklyReportData {
  week_start: string;
  week_end: string;
  task_completion_rate: number;
  total_tasks: number;
  completed_tasks: number;
  completion_by_staff: {
    user_id: string;
    name: string;
    assigned: number;
    completed: number;
    rate: number;
  }[];
  completion_by_category: {
    category: string;
    assigned: number;
    completed: number;
    rate: number;
  }[];
  weather_summary: {
    high_max: number;
    low_min: number;
    total_precip: number;
    gdd_gained: number;
    days: { date: string; high: number; low: number; condition: string }[];
  };
  budget: {
    week_spend: number;
    week_budget: number;
    ytd_spend: number;
    ytd_budget: number;
  };
  equipment: {
    services_performed: number;
    issues_reported: number;
    downtime_hours: number;
  };
  chemicals: {
    applications_count: number;
    products_used: { name: string; count: number }[];
  };
  photos: {
    count: number;
    notable: { id: string; url: string; caption: string | null }[];
  };
  highlights: string[];
  concerns: string[];
}

export interface MonthlyReportData {
  year: number;
  month: number;
  month_name: string;
  weekly_summaries: {
    week: number;
    start: string;
    end: string;
    completion_rate: number;
    tasks_completed: number;
    spend: number;
  }[];
  zone_conditions: {
    zone_id: string;
    zone_name: string;
    zone_type: string;
    current_score: number | null;
    start_score: number | null;
    trend: "improved" | "declined" | "stable";
    photos: { id: string; url: string; date: string }[];
  }[];
  budget: {
    monthly_spend: number;
    monthly_allocation: number;
    percent_used: number;
    by_category: {
      category: string;
      budgeted: number;
      spent: number;
      percent: number;
    }[];
  };
  staff_rankings: {
    user_id: string;
    name: string;
    tasks_completed: number;
    completion_rate: number;
    on_time_rate: number;
    photos_uploaded: number;
  }[];
  chemical_usage: {
    product_name: string;
    product_type: string;
    applications: number;
    total_amount: number;
    unit: string;
    zones_applied: string[];
  }[];
  equipment: {
    utilization_hours: number;
    maintenance_cost: number;
    issues_count: number;
  };
  plan_goal_progress: {
    goal_id: string;
    title: string;
    status: string;
    progress: number;
    target_date: string | null;
  }[];
  photo_condition_report: {
    zone_name: string;
    photos: {
      id: string;
      url: string;
      date: string;
      type: string;
      caption: string | null;
    }[];
  }[];
}

export interface StaffReportData {
  user_id: string;
  user_name: string;
  date_range: { start: string; end: string };
  tasks: {
    assigned: number;
    completed: number;
    on_time: number;
    late: number;
    completion_rate: number;
    on_time_rate: number;
  };
  avg_completion_time_minutes: number;
  avg_estimated_time_minutes: number;
  efficiency_ratio: number;
  photos_uploaded: number;
  certifications: {
    name: string;
    expiry: string | null;
    status: "valid" | "expiring" | "expired";
  }[];
  schedule_adherence: {
    scheduled_days: number;
    days_with_tasks: number;
    adherence_rate: number;
  };
  task_history: {
    id: string;
    title: string;
    date: string;
    status: string;
    completion_time: number | null;
    estimated_time: number | null;
  }[];
  weekly_trend: {
    week: string;
    completion_rate: number;
  }[];
}

export interface ChemicalReportData {
  date_range: { start: string; end: string };
  applications: {
    id: string;
    date: string;
    product_name: string;
    epa_registration: string | null;
    active_ingredient: string | null;
    applicator_name: string | null;
    applicator_license: string | null;
    zones: string[];
    area_sqft: number | null;
    application_rate: string | null;
    total_amount: number | null;
    unit: string | null;
    weather_temp_f: number | null;
    weather_wind_mph: number | null;
    weather_humidity: number | null;
    weather_conditions: string | null;
    method: string | null;
    target_pest: string | null;
    notes: string | null;
  }[];
  products_summary: {
    product_name: string;
    product_type: string;
    applications: number;
    total_amount: number;
    unit: string;
  }[];
  applicator_log: {
    applicator_name: string;
    license: string | null;
    applications: number;
    products: string[];
  }[];
  rei_compliance: {
    total_applications: number;
    with_rei: number;
    compliance_rate: number;
  };
  inventory_changes: {
    product_name: string;
    starting: number;
    used: number;
    added: number;
    ending: number;
    unit: string;
  }[];
}

export interface EquipmentReportData {
  date_range: { start: string; end: string };
  fleet_summary: {
    total: number;
    operational: number;
    needs_service: number;
    in_repair: number;
    out_of_service: number;
  };
  maintenance_log: {
    id: string;
    equipment_name: string;
    log_type: string;
    date: string;
    description: string;
    cost: number | null;
    hours_at_service: number | null;
    vendor: string | null;
  }[];
  costs_by_equipment: {
    equipment_id: string;
    equipment_name: string;
    total_cost: number;
    service_count: number;
  }[];
  downtime_by_equipment: {
    equipment_id: string;
    equipment_name: string;
    downtime_hours: number;
    incidents: number;
  }[];
  upcoming_service: {
    equipment_id: string;
    equipment_name: string;
    service_type: string;
    due_hours: number | null;
    current_hours: number | null;
    due_date: string | null;
  }[];
  total_cost_of_ownership: {
    equipment_id: string;
    equipment_name: string;
    purchase_price: number | null;
    total_maintenance: number;
    age_years: number;
    cost_per_year: number;
  }[];
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function useReports() {
  const { activeCourse } = useCourse();
  const supabase = createClient();

  // Generate Daily Operations Report
  const generateDailyReport = useCallback(
    async (date: string): Promise<DailyReportData> => {
      const courseId = activeCourse?.id;

      // Initialize report
      const report: DailyReportData = {
        date,
        weather: null,
        tasks: {
          total: 0,
          completed: 0,
          in_progress: 0,
          blocked: 0,
          overdue: 0,
          by_category: [],
          by_crew: [],
          list: [],
        },
        photos: { count: 0, thumbnails: [] },
        equipment_issues: [],
        chemical_applications: [],
        active_diagnostics: [],
        staff_attendance: { scheduled: [], with_tasks: [] },
        notes: [],
      };

      try {
        // Fetch tasks for the day
        type TaskQueryResult = {
          id: string;
          title: string;
          status: string;
          category: string;
          actual_minutes: number | null;
          estimated_minutes: number | null;
          assigned_user: { id: string; full_name: string } | null;
          assigned_crew: string | null;
        };
        const { data: tasks } = await supabase
          .from("tasks")
          .select(`
            id, title, status, category, actual_minutes, estimated_minutes,
            assigned_user:profiles!tasks_assigned_to_fkey(id, full_name),
            assigned_crew
          `)
          .eq("due_date", date) as { data: TaskQueryResult[] | null };

        if (tasks) {
          report.tasks.total = tasks.length;
          report.tasks.completed = tasks.filter(t => t.status === "completed" || t.status === "verified").length;
          report.tasks.in_progress = tasks.filter(t => t.status === "in_progress").length;
          report.tasks.blocked = tasks.filter(t => t.status === "blocked").length;
          report.tasks.overdue = tasks.filter(t =>
            t.status !== "completed" && t.status !== "verified" && t.status !== "cancelled"
          ).length;

          // Group by category
          const categoryMap = new Map<string, { count: number; completed: number }>();
          tasks.forEach(task => {
            const cat = task.category || "other";
            const current = categoryMap.get(cat) || { count: 0, completed: 0 };
            current.count++;
            if (task.status === "completed" || task.status === "verified") {
              current.completed++;
            }
            categoryMap.set(cat, current);
          });
          report.tasks.by_category = Array.from(categoryMap.entries()).map(([category, data]) => ({
            category,
            count: data.count,
            completed: data.completed,
          }));

          // Group by crew
          const crewMap = new Map<string, { assigned: number; completed: number }>();
          tasks.forEach(task => {
            const crew = task.assigned_crew || "Unassigned";
            const current = crewMap.get(crew) || { assigned: 0, completed: 0 };
            current.assigned++;
            if (task.status === "completed" || task.status === "verified") {
              current.completed++;
            }
            crewMap.set(crew, current);
          });
          report.tasks.by_crew = Array.from(crewMap.entries()).map(([crew_name, data]) => ({
            crew_name,
            ...data,
          }));

          // Task list
          report.tasks.list = tasks.map(task => ({
            id: task.id,
            title: task.title,
            status: task.status,
            assignee: (task.assigned_user as { full_name: string } | null)?.full_name || null,
            category: task.category,
            completion_time: task.actual_minutes,
            estimated_time: task.estimated_minutes,
          }));

          // Staff with tasks
          const staffWithTasks = new Set<string>();
          tasks.forEach(task => {
            const user = task.assigned_user as { full_name: string } | null;
            if (user?.full_name) {
              staffWithTasks.add(user.full_name);
            }
          });
          report.staff_attendance.with_tasks = Array.from(staffWithTasks);
        }

        // Fetch photos for the day
        type PhotoQueryResult = { id: string; thumbnail_path: string | null; caption: string | null };
        const { data: photos } = await supabase
          .from("photos")
          .select("id, thumbnail_path, caption")
          .gte("created_at", `${date}T00:00:00`)
          .lte("created_at", `${date}T23:59:59`)
          .limit(10) as { data: PhotoQueryResult[] | null };

        if (photos) {
          report.photos.count = photos.length;
          report.photos.thumbnails = photos.map(p => ({
            id: p.id,
            thumbnail_url: p.thumbnail_path || "",
            caption: p.caption,
          }));
        }

        // Fetch equipment issues
        type EquipmentLogQueryResult = {
          id: string;
          description: string;
          log_type: string;
          equipment: { id: string; name: string; status: string } | null;
        };
        const { data: equipmentLogs } = await supabase
          .from("equipment_logs")
          .select(`
            id, description, log_type,
            equipment:equipment!equipment_logs_equipment_id_fkey(id, name, status)
          `)
          .in("log_type", ["incident", "repair"])
          .gte("created_at", `${date}T00:00:00`)
          .lte("created_at", `${date}T23:59:59`) as { data: EquipmentLogQueryResult[] | null };

        if (equipmentLogs) {
          report.equipment_issues = equipmentLogs.map(log => ({
            id: log.id,
            name: log.equipment?.name || "Unknown",
            issue: log.description,
            status: log.equipment?.status || "unknown",
          }));
        }

        // Fetch chemical applications
        type ChemAppQueryResult = {
          id: string;
          total_amount_used: number;
          zone_ids: string[];
          product: { product_name: string; unit_of_measure: string } | null;
          applicator: { full_name: string } | null;
        };
        const { data: chemApps } = await supabase
          .from("chemical_applications")
          .select(`
            id, total_amount_used, zone_ids,
            product:chemical_products!product_id(product_name, unit_of_measure),
            applicator:profiles!chemical_applications_applied_by_fkey(full_name)
          `)
          .eq("application_date", date) as { data: ChemAppQueryResult[] | null };

        if (chemApps) {
          // Get zone names
          const allZoneIds = [...new Set(chemApps.flatMap(a => a.zone_ids || []))];
          let zoneNames: Record<string, string> = {};
          if (allZoneIds.length > 0) {
            type ZoneQueryResult = { id: string; name: string };
            const { data: zones } = await supabase
              .from("course_zones")
              .select("id, name")
              .in("id", allZoneIds) as { data: ZoneQueryResult[] | null };
            zones?.forEach(z => { zoneNames[z.id] = z.name; });
          }

          report.chemical_applications = chemApps.map(app => ({
            id: app.id,
            product_name: app.product?.product_name || "Unknown",
            zones: (app.zone_ids || []).map((id: string) => zoneNames[id] || id),
            amount: app.total_amount_used || 0,
            unit: app.product?.unit_of_measure || "units",
            applicator: app.applicator?.full_name || null,
          }));
        }

        // Fetch active diagnostics
        type DiagnosticsQueryResult = {
          id: string;
          full_response: { diagnosis?: { condition: string; severity: number } } | null;
          status: string;
          zone: { name: string } | null;
        };
        const { data: diagnostics } = await supabase
          .from("diagnostics")
          .select(`
            id, full_response, status,
            zone:course_zones!diagnostics_zone_id_fkey(name)
          `)
          .in("status", ["diagnosed", "treating", "monitoring"]) as { data: DiagnosticsQueryResult[] | null };

        if (diagnostics) {
          report.active_diagnostics = diagnostics.map(d => {
            return {
              id: d.id,
              condition: d.full_response?.diagnosis?.condition || "Unknown",
              zone: d.zone?.name || null,
              severity: d.full_response?.diagnosis?.severity || 0,
              status: d.status,
            };
          });
        }
      } catch (err) {
        console.error("Error generating daily report:", err);
      }

      return report;
    },
    [activeCourse?.id, supabase]
  );

  // Generate Weekly Summary Report
  const generateWeeklyReport = useCallback(
    async (weekStart: string): Promise<WeeklyReportData> => {
      const startDate = new Date(weekStart);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const weekEnd = endDate.toISOString().split("T")[0];

      const report: WeeklyReportData = {
        week_start: weekStart,
        week_end: weekEnd,
        task_completion_rate: 0,
        total_tasks: 0,
        completed_tasks: 0,
        completion_by_staff: [],
        completion_by_category: [],
        weather_summary: {
          high_max: 0,
          low_min: 100,
          total_precip: 0,
          gdd_gained: 0,
          days: [],
        },
        budget: {
          week_spend: 0,
          week_budget: 0,
          ytd_spend: 0,
          ytd_budget: 0,
        },
        equipment: {
          services_performed: 0,
          issues_reported: 0,
          downtime_hours: 0,
        },
        chemicals: {
          applications_count: 0,
          products_used: [],
        },
        photos: {
          count: 0,
          notable: [],
        },
        highlights: [],
        concerns: [],
      };

      try {
        // Fetch tasks for the week
        type WeeklyTaskQueryResult = {
          id: string;
          status: string;
          category: string;
          assigned_user: { id: string; full_name: string } | null;
        };
        const { data: tasks } = await supabase
          .from("tasks")
          .select(`
            id, status, category,
            assigned_user:profiles!tasks_assigned_to_fkey(id, full_name)
          `)
          .gte("due_date", weekStart)
          .lte("due_date", weekEnd) as { data: WeeklyTaskQueryResult[] | null };

        if (tasks) {
          report.total_tasks = tasks.length;
          report.completed_tasks = tasks.filter(t =>
            t.status === "completed" || t.status === "verified"
          ).length;
          report.task_completion_rate = report.total_tasks > 0
            ? Math.round((report.completed_tasks / report.total_tasks) * 100)
            : 0;

          // By staff
          const staffMap = new Map<string, { name: string; assigned: number; completed: number }>();
          tasks.forEach(task => {
            const user = task.assigned_user;
            if (user) {
              const current = staffMap.get(user.id) || { name: user.full_name, assigned: 0, completed: 0 };
              current.assigned++;
              if (task.status === "completed" || task.status === "verified") {
                current.completed++;
              }
              staffMap.set(user.id, current);
            }
          });
          report.completion_by_staff = Array.from(staffMap.entries()).map(([user_id, data]) => ({
            user_id,
            name: data.name,
            assigned: data.assigned,
            completed: data.completed,
            rate: data.assigned > 0 ? Math.round((data.completed / data.assigned) * 100) : 0,
          })).sort((a, b) => b.rate - a.rate);

          // By category
          const catMap = new Map<string, { assigned: number; completed: number }>();
          tasks.forEach(task => {
            const cat = task.category || "other";
            const current = catMap.get(cat) || { assigned: 0, completed: 0 };
            current.assigned++;
            if (task.status === "completed" || task.status === "verified") {
              current.completed++;
            }
            catMap.set(cat, current);
          });
          report.completion_by_category = Array.from(catMap.entries()).map(([category, data]) => ({
            category,
            assigned: data.assigned,
            completed: data.completed,
            rate: data.assigned > 0 ? Math.round((data.completed / data.assigned) * 100) : 0,
          }));
        }

        // Fetch expenses for budget
        const currentYear = new Date(weekStart).getFullYear();
        type ExpenseQueryResult = { amount: number };
        const { data: weekExpenses } = await supabase
          .from("expenses")
          .select("amount")
          .gte("expense_date", weekStart)
          .lte("expense_date", weekEnd)
          .in("status", ["approved", "paid"]) as { data: ExpenseQueryResult[] | null };

        report.budget.week_spend = weekExpenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

        const { data: ytdExpenses } = await supabase
          .from("expenses")
          .select("amount")
          .gte("expense_date", `${currentYear}-01-01`)
          .lte("expense_date", weekEnd)
          .in("status", ["approved", "paid"]) as { data: ExpenseQueryResult[] | null };

        report.budget.ytd_spend = ytdExpenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

        // Equipment stats
        type EquipLogQueryResult = { log_type: string; downtime_hours: number | null };
        const { data: equipLogs } = await supabase
          .from("equipment_logs")
          .select("log_type, downtime_hours")
          .gte("created_at", `${weekStart}T00:00:00`)
          .lte("created_at", `${weekEnd}T23:59:59`) as { data: EquipLogQueryResult[] | null };

        if (equipLogs) {
          report.equipment.services_performed = equipLogs.filter(l => l.log_type === "service").length;
          report.equipment.issues_reported = equipLogs.filter(l =>
            l.log_type === "incident" || l.log_type === "repair"
          ).length;
          report.equipment.downtime_hours = equipLogs.reduce((sum, l) => sum + (l.downtime_hours || 0), 0);
        }

        // Chemical applications
        type WeeklyChemAppQueryResult = {
          id: string;
          product: { product_name: string } | null;
        };
        const { data: chemApps } = await supabase
          .from("chemical_applications")
          .select(`
            id,
            product:chemical_products!product_id(product_name)
          `)
          .gte("application_date", weekStart)
          .lte("application_date", weekEnd) as { data: WeeklyChemAppQueryResult[] | null };

        if (chemApps) {
          report.chemicals.applications_count = chemApps.length;
          const productCount = new Map<string, number>();
          chemApps.forEach(app => {
            const name = app.product?.product_name || "Unknown";
            productCount.set(name, (productCount.get(name) || 0) + 1);
          });
          report.chemicals.products_used = Array.from(productCount.entries()).map(([name, count]) => ({
            name,
            count,
          }));
        }

        // Photos
        type WeeklyPhotoQueryResult = { id: string; storage_path: string; caption: string | null };
        const { data: photos } = await supabase
          .from("photos")
          .select("id, storage_path, caption")
          .gte("created_at", `${weekStart}T00:00:00`)
          .lte("created_at", `${weekEnd}T23:59:59`) as { data: WeeklyPhotoQueryResult[] | null };

        if (photos) {
          report.photos.count = photos.length;
          report.photos.notable = photos.slice(0, 5).map(p => ({
            id: p.id,
            url: p.storage_path,
            caption: p.caption,
          }));
        }

        // Generate highlights and concerns
        if (report.task_completion_rate >= 90) {
          report.highlights.push(`Excellent task completion rate: ${report.task_completion_rate}%`);
        }
        if (report.equipment.issues_reported > 3) {
          report.concerns.push(`${report.equipment.issues_reported} equipment issues reported this week`);
        }
        if (report.task_completion_rate < 70) {
          report.concerns.push(`Task completion rate below target: ${report.task_completion_rate}%`);
        }
      } catch (err) {
        console.error("Error generating weekly report:", err);
      }

      return report;
    },
    [supabase]
  );

  // Generate Monthly Condition Report
  const generateMonthlyReport = useCallback(
    async (year: number, month: number): Promise<MonthlyReportData> => {
      const monthStr = String(month).padStart(2, "0");
      const startDate = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${monthStr}-${lastDay}`;

      const report: MonthlyReportData = {
        year,
        month,
        month_name: monthNames[month - 1],
        weekly_summaries: [],
        zone_conditions: [],
        budget: {
          monthly_spend: 0,
          monthly_allocation: 0,
          percent_used: 0,
          by_category: [],
        },
        staff_rankings: [],
        chemical_usage: [],
        equipment: {
          utilization_hours: 0,
          maintenance_cost: 0,
          issues_count: 0,
        },
        plan_goal_progress: [],
        photo_condition_report: [],
      };

      try {
        // Fetch monthly expenses
        type MonthlyExpenseQueryResult = { amount: number; budget_item_id: string | null };
        const { data: expenses } = await supabase
          .from("expenses")
          .select("amount, budget_item_id")
          .gte("expense_date", startDate)
          .lte("expense_date", endDate)
          .in("status", ["approved", "paid"]) as { data: MonthlyExpenseQueryResult[] | null };

        report.budget.monthly_spend = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

        // Fetch budget items for the month/year
        type BudgetItemQueryResult = {
          id: string;
          category: string;
          budgeted_amount: number;
        };
        const { data: budgetItems } = await supabase
          .from("budget_items")
          .select("*")
          .eq("fiscal_year", year)
          .or(`month.is.null,month.eq.${month}`) as { data: BudgetItemQueryResult[] | null };

        if (budgetItems) {
          report.budget.monthly_allocation = budgetItems.reduce((sum, b) => sum + b.budgeted_amount, 0);
          report.budget.percent_used = report.budget.monthly_allocation > 0
            ? Math.round((report.budget.monthly_spend / report.budget.monthly_allocation) * 100)
            : 0;

          // Group by category
          const catMap = new Map<string, { budgeted: number; spent: number }>();
          budgetItems.forEach(item => {
            const current = catMap.get(item.category) || { budgeted: 0, spent: 0 };
            current.budgeted += item.budgeted_amount;
            catMap.set(item.category, current);
          });

          // Add spent amounts
          const itemIds = budgetItems.map(b => b.id);
          if (itemIds.length > 0 && expenses) {
            expenses.forEach(exp => {
              if (exp.budget_item_id) {
                const item = budgetItems.find(b => b.id === exp.budget_item_id);
                if (item) {
                  const current = catMap.get(item.category)!;
                  current.spent += exp.amount;
                }
              }
            });
          }

          report.budget.by_category = Array.from(catMap.entries()).map(([category, data]) => ({
            category,
            budgeted: data.budgeted,
            spent: data.spent,
            percent: data.budgeted > 0 ? Math.round((data.spent / data.budgeted) * 100) : 0,
          }));
        }

        // Fetch staff rankings
        type MonthlyTaskQueryResult = {
          id: string;
          status: string;
          due_date: string;
          completed_at: string | null;
          assigned_user: { id: string; full_name: string } | null;
        };
        const { data: tasks } = await supabase
          .from("tasks")
          .select(`
            id, status, due_date, completed_at,
            assigned_user:profiles!tasks_assigned_to_fkey(id, full_name)
          `)
          .gte("due_date", startDate)
          .lte("due_date", endDate) as { data: MonthlyTaskQueryResult[] | null };

        if (tasks) {
          const staffMap = new Map<string, {
            name: string;
            completed: number;
            total: number;
            on_time: number;
          }>();

          tasks.forEach(task => {
            const user = task.assigned_user;
            if (user) {
              const current = staffMap.get(user.id) || {
                name: user.full_name,
                completed: 0,
                total: 0,
                on_time: 0
              };
              current.total++;
              if (task.status === "completed" || task.status === "verified") {
                current.completed++;
                if (task.completed_at && task.due_date) {
                  const completedDate = new Date(task.completed_at).toISOString().split("T")[0];
                  if (completedDate <= task.due_date) {
                    current.on_time++;
                  }
                }
              }
              staffMap.set(user.id, current);
            }
          });

          // Get photo counts
          const staffIds = Array.from(staffMap.keys());
          const photoCountMap = new Map<string, number>();
          if (staffIds.length > 0) {
            type PhotoUploadQueryResult = { uploaded_by: string };
            const { data: photos } = await supabase
              .from("photos")
              .select("uploaded_by")
              .in("uploaded_by", staffIds)
              .gte("created_at", `${startDate}T00:00:00`)
              .lte("created_at", `${endDate}T23:59:59`) as { data: PhotoUploadQueryResult[] | null };

            photos?.forEach(p => {
              photoCountMap.set(p.uploaded_by, (photoCountMap.get(p.uploaded_by) || 0) + 1);
            });
          }

          report.staff_rankings = Array.from(staffMap.entries()).map(([user_id, data]) => ({
            user_id,
            name: data.name,
            tasks_completed: data.completed,
            completion_rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
            on_time_rate: data.completed > 0 ? Math.round((data.on_time / data.completed) * 100) : 0,
            photos_uploaded: photoCountMap.get(user_id) || 0,
          })).sort((a, b) => b.completion_rate - a.completion_rate);
        }

        // Chemical usage
        type MonthlyChemAppQueryResult = {
          id: string;
          total_amount_used: number;
          zone_ids: string[];
          product: { product_name: string; product_type: string; unit_of_measure: string } | null;
        };
        const { data: chemApps } = await supabase
          .from("chemical_applications")
          .select(`
            id, total_amount_used, zone_ids,
            product:chemical_products!product_id(product_name, product_type, unit_of_measure)
          `)
          .gte("application_date", startDate)
          .lte("application_date", endDate) as { data: MonthlyChemAppQueryResult[] | null };

        if (chemApps) {
          // Get zone names
          const allZoneIds = [...new Set(chemApps.flatMap(a => a.zone_ids || []))];
          let zoneNames: Record<string, string> = {};
          if (allZoneIds.length > 0) {
            type MonthlyZoneQueryResult = { id: string; name: string };
            const { data: zones } = await supabase
              .from("course_zones")
              .select("id, name")
              .in("id", allZoneIds) as { data: MonthlyZoneQueryResult[] | null };
            zones?.forEach(z => { zoneNames[z.id] = z.name; });
          }

          const productMap = new Map<string, {
            product_type: string;
            applications: number;
            total_amount: number;
            unit: string;
            zones: Set<string>;
          }>();

          chemApps.forEach(app => {
            const product = app.product;
            if (product) {
              const current = productMap.get(product.product_name) || {
                product_type: product.product_type,
                applications: 0,
                total_amount: 0,
                unit: product.unit_of_measure,
                zones: new Set<string>(),
              };
              current.applications++;
              current.total_amount += app.total_amount_used || 0;
              (app.zone_ids || []).forEach((id: string) => {
                current.zones.add(zoneNames[id] || id);
              });
              productMap.set(product.product_name, current);
            }
          });

          report.chemical_usage = Array.from(productMap.entries()).map(([product_name, data]) => ({
            product_name,
            product_type: data.product_type,
            applications: data.applications,
            total_amount: data.total_amount,
            unit: data.unit,
            zones_applied: Array.from(data.zones),
          }));
        }

        // Equipment stats
        type MonthlyEquipLogQueryResult = { log_type: string; cost: number | null; downtime_hours: number | null };
        const { data: equipLogs } = await supabase
          .from("equipment_logs")
          .select("log_type, cost, downtime_hours")
          .gte("created_at", `${startDate}T00:00:00`)
          .lte("created_at", `${endDate}T23:59:59`) as { data: MonthlyEquipLogQueryResult[] | null };

        if (equipLogs) {
          report.equipment.maintenance_cost = equipLogs.reduce((sum, l) => sum + (l.cost || 0), 0);
          report.equipment.issues_count = equipLogs.filter(l =>
            l.log_type === "incident" || l.log_type === "repair"
          ).length;
        }

        // Plan goal progress
        type PlanGoalQueryResult = {
          id: string;
          title: string;
          status: string;
          progress_percent: number | null;
          target_date: string | null;
        };
        const { data: goals } = await supabase
          .from("plan_goals")
          .select("id, title, status, progress_percent, target_date")
          .eq("plan_level", "monthly")
          .eq("year", year)
          .eq("month", month) as { data: PlanGoalQueryResult[] | null };

        if (goals) {
          report.plan_goal_progress = goals.map(g => ({
            goal_id: g.id,
            title: g.title,
            status: g.status,
            progress: g.progress_percent || 0,
            target_date: g.target_date,
          }));
        }

        // Zone conditions with photos
        type CourseZoneQueryResult = { id: string; name: string; zone_type: string };
        const { data: zones } = await supabase
          .from("course_zones")
          .select("id, name, zone_type") as { data: CourseZoneQueryResult[] | null };

        type ZonePhotoQueryResult = {
          id: string;
          storage_path: string;
          created_at: string;
          photo_type: string;
          caption: string | null;
        };
        if (zones) {
          for (const zone of zones) {
            const { data: zonePhotos } = await supabase
              .from("photos")
              .select("id, storage_path, created_at, photo_type, caption")
              .eq("zone_id", zone.id)
              .gte("created_at", `${startDate}T00:00:00`)
              .lte("created_at", `${endDate}T23:59:59`)
              .order("created_at", { ascending: false })
              .limit(5) as { data: ZonePhotoQueryResult[] | null };

            if (zonePhotos && zonePhotos.length > 0) {
              report.photo_condition_report.push({
                zone_name: zone.name,
                photos: zonePhotos.map(p => ({
                  id: p.id,
                  url: p.storage_path,
                  date: p.created_at,
                  type: p.photo_type,
                  caption: p.caption,
                })),
              });
            }

            report.zone_conditions.push({
              zone_id: zone.id,
              zone_name: zone.name,
              zone_type: zone.zone_type,
              current_score: null, // Would need condition scoring system
              start_score: null,
              trend: "stable",
              photos: (zonePhotos || []).slice(0, 3).map(p => ({
                id: p.id,
                url: p.storage_path,
                date: p.created_at,
              })),
            });
          }
        }
      } catch (err) {
        console.error("Error generating monthly report:", err);
      }

      return report;
    },
    [supabase]
  );

  // Generate Staff Performance Report
  const generateStaffReport = useCallback(
    async (userId: string, dateRange: { start: string; end: string }): Promise<StaffReportData> => {
      const report: StaffReportData = {
        user_id: userId,
        user_name: "",
        date_range: dateRange,
        tasks: {
          assigned: 0,
          completed: 0,
          on_time: 0,
          late: 0,
          completion_rate: 0,
          on_time_rate: 0,
        },
        avg_completion_time_minutes: 0,
        avg_estimated_time_minutes: 0,
        efficiency_ratio: 0,
        photos_uploaded: 0,
        certifications: [],
        schedule_adherence: {
          scheduled_days: 0,
          days_with_tasks: 0,
          adherence_rate: 0,
        },
        task_history: [],
        weekly_trend: [],
      };

      try {
        // Get user profile
        type ProfileQueryResult = {
          full_name: string | null;
          certifications: { name: string; expiry_date?: string }[] | null;
        };
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, certifications")
          .eq("id", userId)
          .single() as { data: ProfileQueryResult | null };

        if (profile) {
          report.user_name = profile.full_name || "Unknown";

          // Parse certifications if they exist
          if (profile.certifications && Array.isArray(profile.certifications)) {
            report.certifications = profile.certifications.map((cert: { name: string; expiry_date?: string }) => {
              const expiry = cert.expiry_date;
              let status: "valid" | "expiring" | "expired" = "valid";
              if (expiry) {
                const expiryDate = new Date(expiry);
                const now = new Date();
                const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntilExpiry < 0) status = "expired";
                else if (daysUntilExpiry < 30) status = "expiring";
              }
              return {
                name: cert.name,
                expiry: expiry || null,
                status,
              };
            });
          }
        }

        // Fetch tasks
        type StaffTaskQueryResult = {
          id: string;
          title: string;
          status: string;
          due_date: string;
          completed_at: string | null;
          actual_minutes: number | null;
          estimated_minutes: number | null;
        };
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, status, due_date, completed_at, actual_minutes, estimated_minutes")
          .eq("assigned_to", userId)
          .gte("due_date", dateRange.start)
          .lte("due_date", dateRange.end)
          .order("due_date", { ascending: false }) as { data: StaffTaskQueryResult[] | null };

        if (tasks) {
          report.tasks.assigned = tasks.length;

          let totalActual = 0;
          let actualCount = 0;
          let totalEstimated = 0;
          let estimatedCount = 0;

          tasks.forEach(task => {
            if (task.status === "completed" || task.status === "verified") {
              report.tasks.completed++;

              if (task.completed_at && task.due_date) {
                const completedDate = new Date(task.completed_at).toISOString().split("T")[0];
                if (completedDate <= task.due_date) {
                  report.tasks.on_time++;
                } else {
                  report.tasks.late++;
                }
              }
            }

            if (task.actual_minutes) {
              totalActual += task.actual_minutes;
              actualCount++;
            }
            if (task.estimated_minutes) {
              totalEstimated += task.estimated_minutes;
              estimatedCount++;
            }
          });

          report.tasks.completion_rate = report.tasks.assigned > 0
            ? Math.round((report.tasks.completed / report.tasks.assigned) * 100)
            : 0;
          report.tasks.on_time_rate = report.tasks.completed > 0
            ? Math.round((report.tasks.on_time / report.tasks.completed) * 100)
            : 0;

          report.avg_completion_time_minutes = actualCount > 0 ? Math.round(totalActual / actualCount) : 0;
          report.avg_estimated_time_minutes = estimatedCount > 0 ? Math.round(totalEstimated / estimatedCount) : 0;
          report.efficiency_ratio = report.avg_estimated_time_minutes > 0
            ? Math.round((report.avg_estimated_time_minutes / report.avg_completion_time_minutes) * 100) / 100
            : 0;

          report.task_history = tasks.slice(0, 50).map(t => ({
            id: t.id,
            title: t.title,
            date: t.due_date,
            status: t.status,
            completion_time: t.actual_minutes,
            estimated_time: t.estimated_minutes,
          }));

          // Calculate weekly trend
          const weeklyMap = new Map<string, { total: number; completed: number }>();
          tasks.forEach(task => {
            const weekStart = getWeekStart(task.due_date);
            const current = weeklyMap.get(weekStart) || { total: 0, completed: 0 };
            current.total++;
            if (task.status === "completed" || task.status === "verified") {
              current.completed++;
            }
            weeklyMap.set(weekStart, current);
          });

          report.weekly_trend = Array.from(weeklyMap.entries())
            .map(([week, data]) => ({
              week,
              completion_rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
            }))
            .sort((a, b) => a.week.localeCompare(b.week));
        }

        // Photos uploaded
        const { count: photoCount } = await supabase
          .from("photos")
          .select("*", { count: "exact", head: true })
          .eq("uploaded_by", userId)
          .gte("created_at", `${dateRange.start}T00:00:00`)
          .lte("created_at", `${dateRange.end}T23:59:59`);

        report.photos_uploaded = photoCount || 0;
      } catch (err) {
        console.error("Error generating staff report:", err);
      }

      return report;
    },
    [supabase]
  );

  // Generate Chemical Compliance Report
  const generateChemicalReport = useCallback(
    async (dateRange: { start: string; end: string }): Promise<ChemicalReportData> => {
      const report: ChemicalReportData = {
        date_range: dateRange,
        applications: [],
        products_summary: [],
        applicator_log: [],
        rei_compliance: {
          total_applications: 0,
          with_rei: 0,
          compliance_rate: 0,
        },
        inventory_changes: [],
      };

      try {
        // Fetch all applications
        type ChemReportAppQueryResult = {
          id: string;
          application_date: string;
          application_time: string | null;
          total_amount_used: number;
          zone_ids: string[];
          area_treated_sqft: number | null;
          application_rate: string | null;
          method: string | null;
          target_pest: string | null;
          notes: string | null;
          weather_temp_f: number | null;
          weather_wind_mph: number | null;
          weather_humidity: number | null;
          weather_conditions: string | null;
          applicator_license: string | null;
          rei_expires_at: string | null;
          product: {
            product_name: string;
            epa_registration: string | null;
            active_ingredient: string | null;
            product_type: string;
            unit_of_measure: string;
          } | null;
          applicator: { full_name: string } | null;
        };
        const { data: apps } = await supabase
          .from("chemical_applications")
          .select(`
            id, application_date, application_time, total_amount_used, zone_ids,
            area_treated_sqft, application_rate, method, target_pest, notes,
            weather_temp_f, weather_wind_mph, weather_humidity, weather_conditions,
            applicator_license, rei_expires_at,
            product:chemical_products!product_id(
              product_name, epa_registration, active_ingredient, product_type, unit_of_measure
            ),
            applicator:profiles!chemical_applications_applied_by_fkey(full_name)
          `)
          .gte("application_date", dateRange.start)
          .lte("application_date", dateRange.end)
          .order("application_date", { ascending: false }) as { data: ChemReportAppQueryResult[] | null };

        if (apps) {
          // Get zone names
          const allZoneIds = [...new Set(apps.flatMap(a => a.zone_ids || []))];
          let zoneNames: Record<string, string> = {};
          if (allZoneIds.length > 0) {
            type ChemZoneQueryResult = { id: string; name: string };
            const { data: zones } = await supabase
              .from("course_zones")
              .select("id, name")
              .in("id", allZoneIds) as { data: ChemZoneQueryResult[] | null };
            zones?.forEach(z => { zoneNames[z.id] = z.name; });
          }

          report.applications = apps.map(app => {
            const product = app.product;

            return {
              id: app.id,
              date: app.application_date,
              product_name: product?.product_name || "Unknown",
              epa_registration: product?.epa_registration || null,
              active_ingredient: product?.active_ingredient || null,
              applicator_name: app.applicator?.full_name || null,
              applicator_license: app.applicator_license,
              zones: (app.zone_ids || []).map((id: string) => zoneNames[id] || id),
              area_sqft: app.area_treated_sqft,
              application_rate: app.application_rate,
              total_amount: app.total_amount_used,
              unit: product?.unit_of_measure || null,
              weather_temp_f: app.weather_temp_f,
              weather_wind_mph: app.weather_wind_mph,
              weather_humidity: app.weather_humidity,
              weather_conditions: app.weather_conditions,
              method: app.method,
              target_pest: app.target_pest,
              notes: app.notes,
            };
          });

          // Products summary
          const productMap = new Map<string, {
            product_type: string;
            applications: number;
            total_amount: number;
            unit: string;
          }>();

          apps.forEach(app => {
            const product = app.product;
            if (product) {
              const current = productMap.get(product.product_name) || {
                product_type: product.product_type,
                applications: 0,
                total_amount: 0,
                unit: product.unit_of_measure,
              };
              current.applications++;
              current.total_amount += app.total_amount_used || 0;
              productMap.set(product.product_name, current);
            }
          });

          report.products_summary = Array.from(productMap.entries()).map(([product_name, data]) => ({
            product_name,
            product_type: data.product_type,
            applications: data.applications,
            total_amount: data.total_amount,
            unit: data.unit,
          }));

          // Applicator log
          const applicatorMap = new Map<string, {
            license: string | null;
            applications: number;
            products: Set<string>;
          }>();

          apps.forEach(app => {
            const applicatorName = (app.applicator as { full_name: string })?.full_name || "Unknown";
            const productName = (app.product as { product_name: string })?.product_name || "Unknown";

            const current = applicatorMap.get(applicatorName) || {
              license: app.applicator_license,
              applications: 0,
              products: new Set<string>(),
            };
            current.applications++;
            current.products.add(productName);
            applicatorMap.set(applicatorName, current);
          });

          report.applicator_log = Array.from(applicatorMap.entries()).map(([applicator_name, data]) => ({
            applicator_name,
            license: data.license,
            applications: data.applications,
            products: Array.from(data.products),
          }));

          // REI compliance
          report.rei_compliance.total_applications = apps.length;
          report.rei_compliance.with_rei = apps.filter(a => a.rei_expires_at).length;
          report.rei_compliance.compliance_rate = apps.length > 0
            ? Math.round((report.rei_compliance.with_rei / apps.length) * 100)
            : 0;
        }
      } catch (err) {
        console.error("Error generating chemical report:", err);
      }

      return report;
    },
    [supabase]
  );

  // Generate Equipment Fleet Report
  const generateEquipmentReport = useCallback(
    async (dateRange: { start: string; end: string }): Promise<EquipmentReportData> => {
      const report: EquipmentReportData = {
        date_range: dateRange,
        fleet_summary: {
          total: 0,
          operational: 0,
          needs_service: 0,
          in_repair: 0,
          out_of_service: 0,
        },
        maintenance_log: [],
        costs_by_equipment: [],
        downtime_by_equipment: [],
        upcoming_service: [],
        total_cost_of_ownership: [],
      };

      try {
        // Fleet summary
        type EquipmentQueryResult = {
          id: string;
          name: string;
          status: string;
          next_service_due_hours: number | null;
          next_service_due_date: string | null;
          current_hours: number | null;
          purchase_date: string | null;
          purchase_price: number | null;
        };
        const { data: equipment } = await supabase
          .from("equipment")
          .select("*")
          .neq("status", "retired") as { data: EquipmentQueryResult[] | null };

        if (equipment) {
          report.fleet_summary.total = equipment.length;
          equipment.forEach(eq => {
            switch (eq.status) {
              case "operational":
                report.fleet_summary.operational++;
                break;
              case "needs_service":
                report.fleet_summary.needs_service++;
                break;
              case "in_repair":
                report.fleet_summary.in_repair++;
                break;
              case "out_of_service":
                report.fleet_summary.out_of_service++;
                break;
            }
          });

          // Upcoming service
          report.upcoming_service = equipment
            .filter(eq => eq.next_service_due_hours || eq.next_service_due_date)
            .map(eq => ({
              equipment_id: eq.id,
              equipment_name: eq.name,
              service_type: "Scheduled Service",
              due_hours: eq.next_service_due_hours,
              current_hours: eq.current_hours,
              due_date: eq.next_service_due_date,
            }));

          // Total cost of ownership
          const today = new Date();
          report.total_cost_of_ownership = equipment.map(eq => {
            const purchaseDate = eq.purchase_date ? new Date(eq.purchase_date) : null;
            const ageYears = purchaseDate
              ? Math.max(1, Math.round((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365)))
              : 1;

            return {
              equipment_id: eq.id,
              equipment_name: eq.name,
              purchase_price: eq.purchase_price,
              total_maintenance: 0, // Will be filled below
              age_years: ageYears,
              cost_per_year: 0,
            };
          });
        }

        // Maintenance logs
        type EquipLogQueryResult = {
          id: string;
          log_type: string;
          description: string | null;
          cost: number | null;
          hours_at_service: number | null;
          vendor: string | null;
          created_at: string;
          downtime_hours: number | null;
          equipment: { id: string; name: string } | null;
        };
        const { data: logs } = await supabase
          .from("equipment_logs")
          .select(`
            id, log_type, description, cost, hours_at_service, vendor, created_at, downtime_hours,
            equipment:equipment!equipment_logs_equipment_id_fkey(id, name)
          `)
          .gte("created_at", `${dateRange.start}T00:00:00`)
          .lte("created_at", `${dateRange.end}T23:59:59`)
          .order("created_at", { ascending: false }) as { data: EquipLogQueryResult[] | null };

        if (logs) {
          report.maintenance_log = logs.map(log => ({
            id: log.id,
            equipment_name: (log.equipment as { name: string })?.name || "Unknown",
            log_type: log.log_type,
            date: log.created_at,
            description: log.description || "",
            cost: log.cost,
            hours_at_service: log.hours_at_service,
            vendor: log.vendor,
          }));

          // Costs by equipment
          const costMap = new Map<string, { name: string; total_cost: number; service_count: number }>();
          logs.forEach(log => {
            const eqId = (log.equipment as { id: string })?.id;
            const eqName = (log.equipment as { name: string })?.name || "Unknown";
            if (eqId) {
              const current = costMap.get(eqId) || { name: eqName, total_cost: 0, service_count: 0 };
              current.total_cost += log.cost || 0;
              current.service_count++;
              costMap.set(eqId, current);
            }
          });

          report.costs_by_equipment = Array.from(costMap.entries()).map(([equipment_id, data]) => ({
            equipment_id,
            equipment_name: data.name,
            total_cost: data.total_cost,
            service_count: data.service_count,
          }));

          // Downtime by equipment
          const downtimeMap = new Map<string, { name: string; downtime_hours: number; incidents: number }>();
          logs.forEach(log => {
            if (log.downtime_hours && log.downtime_hours > 0) {
              const eqId = (log.equipment as { id: string })?.id;
              const eqName = (log.equipment as { name: string })?.name || "Unknown";
              if (eqId) {
                const current = downtimeMap.get(eqId) || { name: eqName, downtime_hours: 0, incidents: 0 };
                current.downtime_hours += log.downtime_hours;
                current.incidents++;
                downtimeMap.set(eqId, current);
              }
            }
          });

          report.downtime_by_equipment = Array.from(downtimeMap.entries()).map(([equipment_id, data]) => ({
            equipment_id,
            equipment_name: data.name,
            downtime_hours: data.downtime_hours,
            incidents: data.incidents,
          }));

          // Update total cost of ownership with maintenance costs
          report.total_cost_of_ownership = report.total_cost_of_ownership.map(eq => {
            const costData = costMap.get(eq.equipment_id);
            const totalMaintenance = costData?.total_cost || 0;
            const purchasePrice = eq.purchase_price || 0;
            const totalCost = purchasePrice + totalMaintenance;

            return {
              ...eq,
              total_maintenance: totalMaintenance,
              cost_per_year: Math.round(totalCost / eq.age_years),
            };
          });
        }
      } catch (err) {
        console.error("Error generating equipment report:", err);
      }

      return report;
    },
    [supabase]
  );

  return {
    generateDailyReport,
    generateWeeklyReport,
    generateMonthlyReport,
    generateStaffReport,
    generateChemicalReport,
    generateEquipmentReport,
  };
}

// Helper function to get week start date
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split("T")[0];
}
