"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ClipboardCheck,
  AlertTriangle,
  Snowflake,
  Wind,
  CloudRain,
  Thermometer,
  Sun,
  Target,
  ChevronRight,
  Calendar,
  Map,
  Plus,
  Camera,
  Wrench,
  FlaskConical,
  Clock,
  CheckCircle2,
  Circle,
  Users,
  Leaf,
  TrendingUp,
  MapPin,
  ArrowRight,
  Zap,
  FileText,
  CalendarOff,
  Coffee,
  Flag,
  Printer,
} from "lucide-react";
import { WeatherWidget } from "@/components/features/weather/weather-widget";
import { CourseStatusBanner } from "@/components/features/course-status";
import { PushOptInCard } from "@/components/features/notifications/push-opt-in-card";
import { QuickActionsCustomizeSheet } from "@/components/features/quick-actions/customize-sheet";
import { useQuickActions } from "@/lib/hooks/useQuickActions";
import { Settings2 } from "lucide-react";
import { parseAppDate } from "@/lib/utils/date-format";
import { useWeather } from "@/lib/hooks/useWeather";
import type { WeatherAlert } from "@/lib/hooks/useWeather";
import { Badge } from "@/components/ui/badge";
import { useTasks, type TaskWithRelations } from "@/lib/hooks/useTasks";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePhotos } from "@/lib/hooks/usePhotos";
import { cn } from "@/lib/utils";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Task, Equipment } from "@/types/database";
import { downloadDailyAssignmentsReport } from "@/lib/reports/daily-assignments-report";
import { formatLocalDate, todayLocal } from "@/lib/utils/date";

// Dynamically import MiniMapWidget to avoid SSR issues with Leaflet
const MiniMapWidget = dynamic(
  () =>
    import("@/components/features/map/mini-map-widget").then(
      (mod) => mod.MiniMapWidget
    ),
  {
    ssr: false,
    loading: () => (
      <div className="gk-card h-[300px] animate-pulse flex items-center justify-center">
        <MapPin className="w-8 h-8 text-muted-foreground/20" />
      </div>
    ),
  }
);

// ────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────

function getAlertIcon(type: WeatherAlert["type"]) {
  switch (type) {
    case "frost":
      return <Snowflake className="w-4 h-4" />;
    case "wind":
      return <Wind className="w-4 h-4" />;
    case "rain":
      return <CloudRain className="w-4 h-4" />;
    case "heat":
      return <Thermometer className="w-4 h-4" />;
    case "uv":
      return <Sun className="w-4 h-4" />;
    default:
      return <AlertTriangle className="w-4 h-4" />;
  }
}

function getAlertStyles(severity: WeatherAlert["severity"]) {
  switch (severity) {
    case "warning":
      return "bg-red-500/8 border-red-500/15 text-red-700 dark:text-red-400";
    case "caution":
      return "bg-amber-500/8 border-amber-500/15 text-amber-700 dark:text-amber-400";
    case "info":
      return "bg-sky-500/8 border-sky-500/15 text-sky-700 dark:text-sky-400";
    default:
      return "bg-muted border-border text-muted-foreground";
  }
}

function getActivityIcon(actionType: string) {
  switch (actionType) {
    case "task_created":
    case "task_assigned":
      return Plus;
    case "task_completed":
      return CheckCircle2;
    case "equipment_updated":
      return Wrench;
    case "chemical_applied":
      return FlaskConical;
    case "photo_uploaded":
      return Camera;
    case "schedule_changed":
      return Calendar;
    default:
      return Clock;
  }
}

function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Early morning";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Task category icons for pro view
const categoryIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  mowing: Wrench,
  chemical: FlaskConical,
  irrigation: CloudRain,
  greens: Flag,
  bunker: MapPin,
};

// ────────────────────────────────────────────
// Quick actions — user-customizable, persisted via useQuickActions hook
// (defaults live in lib/hooks/useQuickActions.ts)
// ────────────────────────────────────────────

function DashboardQuickActions() {
  const { actions } = useQuickActions();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="w-4 h-4 text-[#B68D40] shrink-0" />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
            Quick Actions
          </h2>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground rounded-lg border border-border active:bg-muted/70 transition-colors shrink-0"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Customize
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {actions.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className="gk-action-btn flex flex-col items-center gap-2 p-3 bg-card rounded-xl border border-border hover:border-primary/20 active:scale-95 active:bg-muted/30"
          >
            <div
              className={cn(
                "w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-sm shrink-0",
                action.color
              )}
            >
              <action.icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-center text-muted-foreground leading-tight line-clamp-2">
              {action.label}
            </span>
          </Link>
        ))}
      </div>
      {sheetOpen && (
        <QuickActionsCustomizeSheet open onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Briefing data types
// ────────────────────────────────────────────

interface BriefingData {
  tasks: {
    critical: Task[];
    high: Task[];
    normal: Task[];
    overdue: Task[];
    totalDueToday: number;
  };
  staff: {
    onToday: {
      id: string;
      name: string;
      role: string;
      shift: string;
      crew: string | null;
    }[];
    offToday: { id: string; name: string; type: string }[];
    totalActive: number;
  };
  equipment: {
    needsService: {
      id: string;
      name: string;
      status: string;
      notes: string | null;
    }[];
  };
  chemicals: {
    activeREI: {
      id: string;
      product: string;
      zones: string[];
      expires: string;
    }[];
    lowStock: {
      id: string;
      name: string;
      current: number;
      threshold: number;
      unit: string;
    }[];
  };
  feedback: {
    recent: {
      id: string;
      type: string;
      area: string;
      notes: string;
      date: string;
    }[];
    unresolved: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRO DASHBOARD VIEW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ProDashboardView() {
  const { profile } = useAuth();
  const { getAlerts } = useWeather();
  const { fetchTeamTasks } = useTasks();
  const { photos: recentPhotosData, fetchPhotos } = usePhotos();

  const [todaysTasks, setTodaysTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  const alerts = getAlerts();
  const firstName = profile?.full_name?.split(" ")[0] || "Pro";
  const greeting = getGreeting();

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const loadData = async () => {
      setLoading(true);
      const today = todayLocal();
      const tasks = await fetchTeamTasks(today);
      const playImpactCategories = [
        "mowing",
        "chemical",
        "greens",
        "bunker",
        "irrigation",
        "construction",
      ];
      const relevantTasks = tasks.filter(
        (t) =>
          playImpactCategories.includes(t.category) &&
          (t.status === "pending" || t.status === "in_progress")
      );
      setTodaysTasks(relevantTasks.slice(0, 5));
      await fetchPhotos({}, 0);
      setLoading(false);
    };

    loadData();
  }, [fetchTeamTasks, fetchPhotos]);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Welcome Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {greeting}, {firstName}
        </h1>
        <p className="text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      <CourseStatusBanner className="mb-6" />

      {/* Weather Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.slice(0, 2).map((alert, index) => (
            <div
              key={index}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                alert.severity === "warning"
                  ? "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                  : alert.severity === "caution"
                    ? "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400"
                    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400"
              )}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm">{alert.message}</p>
                <p className="text-xs opacity-80 mt-0.5">
                  {alert.recommendation}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Link
          href="/report-issue"
          className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
            <Flag className="w-5 h-5 text-red-500" />
          </div>
          <span className="text-xs font-medium text-center">Report Issue</span>
        </Link>
        <Link
          href="/course-map"
          className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-green-500" />
          </div>
          <span className="text-xs font-medium text-center">Course Map</span>
        </Link>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Today's Maintenance Impact */}
        <div className="bg-card rounded-lg border border-border p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              Maintenance Today
            </h2>
            <Badge variant="secondary">{todaysTasks.length} active</Badge>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : todaysTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active maintenance affecting play</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysTasks.map((task) => {
                const Icon = categoryIcons[task.category] || Wrench;
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-2 break-words" title={task.title}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {task.zone?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {task.zone.name}
                          </span>
                        )}
                        {task.hole_numbers && task.hole_numbers.length > 0 && (
                          <span>Holes {task.hole_numbers.join(", ")}</span>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {task.status === "in_progress"
                            ? "In Progress"
                            : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* REI Warning */}
          {todaysTasks.some((t) => t.category === "chemical") && (
            <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <FlaskConical className="w-4 h-4" />
                <span className="text-sm font-medium">REI Restrictions</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Check with maintenance before allowing play in treated areas.
              </p>
            </div>
          )}
        </div>

        {/* Weather Widget */}
        <div className="lg:col-span-1">
          <WeatherWidget className="h-full" />
        </div>

        {/* Course Conditions */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Sun className="w-4 h-4 text-primary" />
              Course Conditions
            </h2>
            <Link
              href="/course-map"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Details
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Green Speed</p>
              <p className="text-lg font-semibold">10.5</p>
              <p className="text-xs text-muted-foreground">Stimpmeter</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Overall</p>
              <p className="text-lg font-semibold text-green-600">Good</p>
              <p className="text-xs text-muted-foreground">Condition</p>
            </div>
          </div>
        </div>

        {/* Recent Photos */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              Recent Photos
            </h2>
            <Link
              href="/photos"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-square bg-muted rounded animate-pulse"
                />
              ))}
            </div>
          ) : recentPhotosData.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recentPhotosData.slice(0, 6).map((photo) => (
                <Link
                  key={photo.id}
                  href={`/photos/${photo.id}`}
                  className="aspect-square bg-muted rounded-lg overflow-hidden hover:ring-2 ring-primary transition-all"
                >
                  <img
                    src={photo.thumbnail_path || photo.storage_path}
                    alt={photo.caption || "Course photo"}
                    className="w-full h-full object-cover"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Course Map */}
        <div className="md:col-span-2 lg:col-span-3">
          <MiniMapWidget />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEADERSHIP DASHBOARD VIEW (super, asst_super, director)
// Combines dashboard + briefing into one view
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LeadershipDashboardView() {
  const { profile } = useAuth();
  const { getAlerts } = useWeather();
  const alerts = getAlerts();
  const { fetchMyTasks } = useTasks();
  const { activities, loading: activitiesLoading } = useRecentActivity();

  const [todayTasks, setTodayTasks] = useState<TaskWithRelations[]>([]);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = profile?.full_name?.split(" ")[0] || "Superintendent";

  // Today's tasks stats
  const todaysTasks = useMemo(() => {
    const completed = todayTasks.filter(
      (t) => t.status === "completed"
    ).length;
    const total = todayTasks.length;
    const highPriority = todayTasks.filter(
      (t) =>
        (t.priority === "high" || t.priority === "critical") &&
        t.status !== "completed"
    );
    const completionPct =
      total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, highPriority, completionPct };
  }, [todayTasks]);

  // Fetch briefing data (crew, equipment, chemicals, feedback)
  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const supabase = createClient();
      const now = new Date();
      const todayStr = formatLocalDate(now);

      const [
        tasksResult,
        overdueResult,
        schedulesResult,
        timeOffResult,
        equipmentResult,
        chemAppsResult,
        chemProductsResult,
        feedbackResult,
      ] = await Promise.all([
        withTimeout(
          supabase
            .from("tasks")
            .select("*")
            .eq("due_date", todayStr)
            .in("status", ["pending", "in_progress"])
            .order("priority", { ascending: true }),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("tasks")
            .select("*")
            .lt("due_date", todayStr)
            .in("status", ["pending", "in_progress"])
            .order("due_date", { ascending: true })
            .limit(10),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("schedules")
            .select("*, profiles:user_id(id, full_name, role)")
            .eq("is_active", true)
            .eq("schedule_date", todayStr)
            .neq("shift_type", "off"),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("time_off_requests")
            .select("*, profiles:user_id(id, full_name)")
            .eq("status", "approved")
            .lte("start_date", todayStr)
            .gte("end_date", todayStr),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("equipment")
            .select("*")
            .in("status", ["needs_service", "in_repair", "out_of_service"]),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("chemical_applications")
            .select("*, chemical_products:product_id(product_name)")
            .gte("rei_expires_at", now.toISOString())
            .order("rei_expires_at", { ascending: true }),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("chemical_products")
            .select("*")
            .eq("is_active", true)
            .not("reorder_threshold", "is", null),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          supabase
            .from("golfer_feedback")
            .select("*")
            .in("status", ["new", "acknowledged", "in_progress"])
            .order("created_at", { ascending: false })
            .limit(5),
          8000,
          { data: null, error: null }
        ),
      ]);

      const tasks = (tasksResult.data || []) as Task[];
      const overdue = (overdueResult.data || []) as Task[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onToday = (schedulesResult.data || []).map((s: any) => ({
        id: s.profiles?.id || s.user_id,
        name: s.profiles?.full_name || "Unknown",
        role: s.profiles?.role || "crew",
        shift:
          s.shift_start && s.shift_end
            ? `${s.shift_start.slice(0, 5)} - ${s.shift_end.slice(0, 5)}`
            : s.shift_type || "Scheduled",
        crew: s.crew_assignment || null,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offToday = (timeOffResult.data || []).map((t: any) => ({
        id: t.profiles?.id || t.user_id,
        name: t.profiles?.full_name || "Unknown",
        type: (t.request_type || "time off").replace("_", " "),
      }));

      const needsServiceEquip = (equipmentResult.data || []) as Equipment[];

      const allProducts = (chemProductsResult.data || []) as Array<{
        id: string;
        product_name: string;
        current_inventory: number | null;
        reorder_threshold: number | null;
        unit_of_measure: string | null;
      }>;
      const lowStock = allProducts.filter(
        (p) =>
          p.current_inventory !== null &&
          p.reorder_threshold !== null &&
          p.current_inventory <= p.reorder_threshold
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeREI = (chemAppsResult.data || []).map((a: any) => ({
        id: a.id,
        product: a.chemical_products?.product_name || "Unknown product",
        zones:
          a.hole_numbers?.map((h: number) => `Hole ${h}`) || a.zone_ids || [],
        expires: a.rei_expires_at,
      }));

      const feedbackItems = (feedbackResult.data || []) as Array<{
        id: string;
        feedback_type: string;
        area: string;
        notes: string;
        feedback_date: string;
      }>;

      setBriefingData({
        tasks: {
          critical: tasks.filter((t) => t.priority === "critical"),
          high: tasks.filter((t) => t.priority === "high"),
          normal: tasks.filter(
            (t) => t.priority === "normal" || t.priority === "low"
          ),
          overdue,
          totalDueToday: tasks.length,
        },
        staff: {
          onToday,
          offToday,
          totalActive: 0,
        },
        equipment: {
          needsService: needsServiceEquip.map((e) => ({
            id: e.id,
            name: e.name,
            status: e.status,
            notes: e.notes,
          })),
        },
        chemicals: {
          activeREI,
          lowStock: lowStock.map((p) => ({
            id: p.id,
            name: p.product_name,
            current: p.current_inventory ?? 0,
            threshold: p.reorder_threshold ?? 0,
            unit: p.unit_of_measure || "units",
          })),
        },
        feedback: {
          recent: feedbackItems.map((f) => ({
            id: f.id,
            type: f.feedback_type,
            area: f.area,
            notes: f.notes,
            date: f.feedback_date,
          })),
          unresolved: feedbackItems.length,
        },
      });
    } catch (err) {
      console.error("Error loading briefing:", err);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  // Progressive loading
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const today = todayLocal();

    async function loadCriticalData() {
      try {
        const tasks = await fetchMyTasks(today);
        setTodayTasks(tasks.slice(0, 10));
      } catch (err) {
        console.error("Failed to load tasks:", err);
      }
    }
    void loadCriticalData();
    void fetchBriefing();

    const secondaryTimer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const staffResult = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        if (staffResult.count !== null) setStaffCount(staffResult.count);
      } catch (err) {
        console.error("Failed to load secondary data:", err);
      }
    }, 300);

    return () => clearTimeout(secondaryTimer);
  }, [fetchMyTasks, fetchBriefing]);

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1400px] mx-auto overflow-x-hidden">
      {/* ===== Hero Welcome Section ===== */}
      <div className="gk-animate-in gk-animate-in-1 mb-6">
        <div className="gk-gradient-hero gk-texture-overlay rounded-2xl p-5 md:p-6 text-white relative overflow-clip">
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white/60 text-sm font-medium mb-1 truncate">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
                  {greeting}, {firstName}
                </h1>
                {todaysTasks.total > 0 && (
                  <p className="text-sm text-white/50 mt-1.5">
                    {todaysTasks.completed === todaysTasks.total
                      ? "All tasks complete for today"
                      : `${todaysTasks.total - todaysTasks.completed} task${todaysTasks.total - todaysTasks.completed !== 1 ? "s" : ""} remaining today`}
                  </p>
                )}
              </div>
              <div className="hidden md:flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 shrink-0">
                <Leaf className="w-4 h-4 text-[#D4A853]" />
                <span className="text-sm font-medium text-white/80 whitespace-nowrap">
                  Veterans Memorial GC
                </span>
              </div>
            </div>

            {/* Inline course status */}
            <div className="mt-4">
              <CourseStatusBanner
                className="!bg-white/10 !border-white/10 !text-white [&_*]:!text-white/80 !rounded-xl"
                showUpdateButton
              />
            </div>
          </div>

          <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-[#B68D40]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute right-12 top-4 w-20 h-20 bg-[#B68D40]/5 rounded-full blur-xl pointer-events-none" />
        </div>
      </div>

      {/* ===== Weather Alerts ===== */}
      {alerts && alerts.length > 0 && (
        <div className="gk-animate-in gk-animate-in-2 mb-6 space-y-2">
          {alerts.slice(0, 2).map((alert, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-xl border ${getAlertStyles(alert.severity)}`}
            >
              <div className="mt-0.5 shrink-0">{getAlertIcon(alert.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{alert.message}</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {alert.recommendation}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Push notification opt-in ===== */}
      <div className="mb-4">
        <PushOptInCard />
      </div>

      {/* ===== Overdue Tasks (from briefing) ===== */}
      {briefingData && briefingData.tasks.overdue.length > 0 && (
        <div className="gk-animate-in gk-animate-in-2 mb-6 p-5 rounded-xl bg-red-500/5 border border-red-200/50">
          <h2 className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5" />
            Overdue Tasks ({briefingData.tasks.overdue.length})
          </h2>
          <div className="space-y-2">
            {briefingData.tasks.overdue.slice(0, 5).map((task) => (
              <Link
                key={task.id}
                href={`/tasks/view?id=${task.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm line-clamp-2 break-words" title={task.title}>{task.title}</div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    Due{" "}
                    {parseAppDate(task.due_date)?.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    task.priority === "critical"
                      ? "bg-purple-500/10 text-purple-600"
                      : "bg-red-500/10 text-red-600"
                  }`}
                >
                  {task.priority}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== Quick Stats Row ===== */}
      <div className="gk-animate-in gk-animate-in-3 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <WeatherWidget className="col-span-2 lg:col-span-1" />

        {/* Tasks Today */}
        <Link
          href="/tasks"
          className="gk-stat-card group hover:border-primary/20 active:bg-muted/20 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardCheck className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Tasks Today
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-all" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight text-foreground gk-count">
                {todaysTasks.total}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todaysTasks.completed} of {todaysTasks.total} done
              </p>
            </div>
            {todaysTasks.total > 0 && (
              <div className="w-12 h-12 relative">
                <svg
                  className="w-12 h-12 -rotate-90"
                  viewBox="0 0 36 36"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted/60"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${todaysTasks.completionPct * 0.94} 100`}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-1000"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                  {todaysTasks.completionPct}%
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Staff */}
        <Link
          href="/staff"
          className="gk-stat-card group hover:border-primary/20 active:bg-muted/20 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Staff
              </span>
            </div>
            <span className="gk-live-dot" title="Live" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground gk-count">
            {staffCount ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Team members</p>
        </Link>

        {/* Active Alerts */}
        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Alerts
            </span>
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground gk-count">
            {alerts?.length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {alerts && alerts.length > 0
              ? `${alerts.filter((a) => a.severity === "warning").length} warnings`
              : "All clear"}
          </p>
        </div>
      </div>

      {/* ===== Quick Actions ===== */}
      <div className="gk-animate-in gk-animate-in-4 mb-6">
        <DashboardQuickActions />
        <button
          type="button"
          onClick={async () => {
            try {
              await downloadDailyAssignmentsReport();
            } catch (err) {
              console.error("Error downloading daily assignments:", err);
            }
          }}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-card border border-border hover:border-primary/20 active:scale-95 active:bg-muted/30 transition-all text-muted-foreground"
        >
          <Printer className="w-4 h-4" />
          Print Daily Assignments
        </button>
      </div>

      {/* ===== Main Content Grid ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Course Map Widget */}
        <Link
          href="/course-map"
          className="gk-animate-in gk-animate-in-5 gk-card group p-5 relative overflow-hidden"
        >
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#1B4332]/5 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center shadow-sm">
                  <Map className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Course Map</h2>
                  <p className="text-[11px] text-muted-foreground">
                    AI-powered diagnostics
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Pin issues on holes and greens, snap a photo, and get instant AI
              diagnosis with treatment plans.
            </p>
            <div className="flex items-center gap-1.5 text-sm text-primary font-medium group-hover:gap-2.5 transition-all">
              Open map
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>

        {/* Priority Tasks */}
        <div className="gk-animate-in gk-animate-in-7 gk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="font-semibold text-sm">Priority Tasks</h2>
            </div>
            <Link
              href="/tasks"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              View all
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {todaysTasks.highPriority.length > 0 ? (
            <div className="space-y-1.5">
              {todaysTasks.highPriority.slice(0, 4).map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/view?id=${task.id}`}
                  className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors group"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-red-400/60 flex items-center justify-center shrink-0 group-hover:border-red-500 transition-colors">
                    <Circle className="w-2.5 h-2.5 text-red-500/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2 break-words" title={task.title}>{task.title}</p>
                    {task.zone?.name && (
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {task.zone.name}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground">
                All caught up!
              </p>
              <p className="text-xs mt-0.5">
                No high priority tasks remaining
              </p>
            </div>
          )}
        </div>

        {/* Crew Today (from briefing) */}
        <div className="gk-animate-in gk-animate-in-7 gk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <h2 className="font-semibold text-sm">Crew Today</h2>
            </div>
            <Link
              href="/schedule"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              Schedule
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {briefingLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-muted/50 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : briefingData &&
            briefingData.staff.onToday.length === 0 &&
            briefingData.staff.offToday.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No schedule data for today.
            </p>
          ) : briefingData ? (
            <>
              {briefingData.staff.onToday.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {briefingData.staff.onToday.slice(0, 6).map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm p-2 rounded bg-green-500/5"
                    >
                      <div>
                        <span className="font-medium">{s.name}</span>
                        {s.crew && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {s.crew}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {s.shift}
                      </span>
                    </div>
                  ))}
                  {briefingData.staff.onToday.length > 6 && (
                    <p className="text-xs text-muted-foreground text-center mt-1">
                      +{briefingData.staff.onToday.length - 6} more
                    </p>
                  )}
                </div>
              )}
              {briefingData.staff.offToday.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <CalendarOff className="w-3 h-3" />
                    Off Today
                  </div>
                  {briefingData.staff.offToday.map((s, i) => (
                    <div
                      key={i}
                      className="text-sm text-muted-foreground p-1.5"
                    >
                      {s.name}{" "}
                      <span className="text-xs capitalize">({s.type})</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Equipment Alerts (from briefing) */}
        {briefingData && briefingData.equipment.needsService.length > 0 && (
          <div className="gk-animate-in gk-animate-in-8 gk-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-amber-600" />
                </div>
                <h2 className="font-semibold text-sm">
                  Asset Alerts (
                  {briefingData.equipment.needsService.length})
                </h2>
              </div>
              <Link
                href="/assets"
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                View all
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-2">
              {briefingData.equipment.needsService.map((e) => (
                <Link
                  key={e.id}
                  href={`/equipment/view?id=${e.id}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                >
                  <span className="font-medium text-sm truncate min-w-0 flex-1" title={e.name}>{e.name}</span>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                      e.status === "out_of_service"
                        ? "bg-red-500/10 text-red-600"
                        : e.status === "in_repair"
                          ? "bg-orange-500/10 text-orange-600"
                          : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {e.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="gk-animate-in gk-animate-in-8 gk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Recent Activity</h2>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="gk-live-dot inline-block" /> Live feed
                </p>
              </div>
            </div>
          </div>

          {activitiesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-muted/50 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-0.5">
              {activities.slice(0, 5).map((activity, idx) => {
                const IconComponent = getActivityIcon(activity.action_type);
                const isCompleted =
                  activity.action_type === "task_completed";
                return (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                    style={{ animationDelay: `${420 + idx * 60}ms` }}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        isCompleted ? "bg-green-500/10" : "bg-muted/60"
                      )}
                    >
                      <IconComponent
                        className={cn(
                          "w-3.5 h-3.5",
                          isCompleted
                            ? "text-green-600"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2 break-words" title={activity.description}>
                        {activity.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {activity.user?.full_name || "System"} &middot;{" "}
                        {formatActivityTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No recent activity</p>
            </div>
          )}
        </div>

        {/* Course Map Widget */}
        <div className="gk-animate-in gk-animate-in-8 md:col-span-2">
          <MiniMapWidget />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STAFF DASHBOARD VIEW (foreman, mechanic, crew, seasonal)
// Original dashboard content
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StaffDashboardView() {
  const { profile } = useAuth();
  const { getAlerts } = useWeather();
  const alerts = getAlerts();
  const { fetchMyTasks } = useTasks();
  const { activities, loading: activitiesLoading } = useRecentActivity();

  const [todayTasks, setTodayTasks] = useState<TaskWithRelations[]>([]);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const hasFetchedRef = useRef(false);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = profile?.full_name?.split(" ")[0] || "Team";

  const todaysTasks = useMemo(() => {
    const completed = todayTasks.filter(
      (t) => t.status === "completed"
    ).length;
    const total = todayTasks.length;
    const highPriority = todayTasks.filter(
      (t) =>
        (t.priority === "high" || t.priority === "critical") &&
        t.status !== "completed"
    );
    const completionPct =
      total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, highPriority, completionPct };
  }, [todayTasks]);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const today = todayLocal();
    async function loadData() {
      try {
        const tasks = await fetchMyTasks(today);
        setTodayTasks(tasks.slice(0, 10));
        const supabase = createClient();
        const staffResult = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        if (staffResult.count !== null) setStaffCount(staffResult.count);
      } catch (err) {
        console.error("Failed to load data:", err);
      }
    }
    void loadData();
  }, [fetchMyTasks]);

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1400px] mx-auto overflow-x-hidden">
      {/* ===== Hero Welcome Section ===== */}
      <div className="gk-animate-in gk-animate-in-1 mb-6">
        <div className="gk-gradient-hero gk-texture-overlay rounded-2xl p-5 md:p-6 text-white relative overflow-clip">
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-white/60 text-sm font-medium mb-1 truncate">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
                  {greeting}, {firstName}
                </h1>
                {todaysTasks.total > 0 && (
                  <p className="text-sm text-white/50 mt-1.5">
                    {todaysTasks.completed === todaysTasks.total
                      ? "All tasks complete for today"
                      : `${todaysTasks.total - todaysTasks.completed} task${todaysTasks.total - todaysTasks.completed !== 1 ? "s" : ""} remaining today`}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <CourseStatusBanner
                className="!bg-white/10 !border-white/10 !text-white [&_*]:!text-white/80 !rounded-xl"
                showUpdateButton
              />
            </div>
          </div>

          <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-[#B68D40]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute right-12 top-4 w-20 h-20 bg-[#B68D40]/5 rounded-full blur-xl pointer-events-none" />
        </div>
      </div>

      {/* ===== Weather Alerts ===== */}
      {alerts && alerts.length > 0 && (
        <div className="gk-animate-in gk-animate-in-2 mb-6 space-y-2">
          {alerts.slice(0, 2).map((alert, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-xl border ${getAlertStyles(alert.severity)}`}
            >
              <div className="mt-0.5 shrink-0">{getAlertIcon(alert.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{alert.message}</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {alert.recommendation}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Push notification opt-in ===== */}
      <div className="mb-4">
        <PushOptInCard />
      </div>

      {/* ===== Quick Stats Row ===== */}
      <div className="gk-animate-in gk-animate-in-3 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <WeatherWidget className="col-span-2 lg:col-span-1" />

        <Link
          href="/tasks"
          className="gk-stat-card group hover:border-primary/20 active:bg-muted/20 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardCheck className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Tasks Today
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-all" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight text-foreground gk-count">
                {todaysTasks.total}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todaysTasks.completed} of {todaysTasks.total} done
              </p>
            </div>
            {todaysTasks.total > 0 && (
              <div className="w-12 h-12 relative">
                <svg
                  className="w-12 h-12 -rotate-90"
                  viewBox="0 0 36 36"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted/60"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${todaysTasks.completionPct * 0.94} 100`}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-1000"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                  {todaysTasks.completionPct}%
                </span>
              </div>
            )}
          </div>
        </Link>

        <Link
          href="/staff"
          className="gk-stat-card group hover:border-primary/20 active:bg-muted/20 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Staff
              </span>
            </div>
            <span className="gk-live-dot" title="Live" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground gk-count">
            {staffCount ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Team members</p>
        </Link>

        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Alerts
            </span>
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground gk-count">
            {alerts?.length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {alerts && alerts.length > 0
              ? `${alerts.filter((a) => a.severity === "warning").length} warnings`
              : "All clear"}
          </p>
        </div>
      </div>

      {/* ===== Quick Actions (same customizable grid as leadership) ===== */}
      <div className="gk-animate-in gk-animate-in-4 mb-6">
        <DashboardQuickActions />
      </div>

      {/* ===== Main Content Grid ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Course Map Widget */}
        <Link
          href="/course-map"
          className="gk-animate-in gk-animate-in-5 gk-card group p-5 relative overflow-hidden"
        >
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#1B4332]/5 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center shadow-sm">
                  <Map className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Course Map</h2>
                  <p className="text-[11px] text-muted-foreground">
                    AI-powered diagnostics
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Pin issues on holes and greens, snap a photo, and get instant AI
              diagnosis with treatment plans.
            </p>
            <div className="flex items-center gap-1.5 text-sm text-primary font-medium group-hover:gap-2.5 transition-all">
              Open map
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>

        {/* Priority Tasks */}
        <div className="gk-animate-in gk-animate-in-7 gk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="font-semibold text-sm">Priority Tasks</h2>
            </div>
            <Link
              href="/tasks"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              View all
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {todaysTasks.highPriority.length > 0 ? (
            <div className="space-y-1.5">
              {todaysTasks.highPriority.slice(0, 4).map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/view?id=${task.id}`}
                  className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors group"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-red-400/60 flex items-center justify-center shrink-0 group-hover:border-red-500 transition-colors">
                    <Circle className="w-2.5 h-2.5 text-red-500/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2 break-words" title={task.title}>{task.title}</p>
                    {task.zone?.name && (
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {task.zone.name}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground">
                All caught up!
              </p>
              <p className="text-xs mt-0.5">
                No high priority tasks remaining
              </p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="gk-animate-in gk-animate-in-8 gk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Recent Activity</h2>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="gk-live-dot inline-block" /> Live feed
                </p>
              </div>
            </div>
          </div>

          {activitiesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-muted/50 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-0.5">
              {activities.slice(0, 5).map((activity, idx) => {
                const IconComponent = getActivityIcon(activity.action_type);
                const isCompleted =
                  activity.action_type === "task_completed";
                return (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                    style={{ animationDelay: `${420 + idx * 60}ms` }}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        isCompleted ? "bg-green-500/10" : "bg-muted/60"
                      )}
                    >
                      <IconComponent
                        className={cn(
                          "w-3.5 h-3.5",
                          isCompleted
                            ? "text-green-600"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2 break-words" title={activity.description}>
                        {activity.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {activity.user?.full_name || "System"} &middot;{" "}
                        {formatActivityTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No recent activity</p>
            </div>
          )}
        </div>

        {/* Course Map Widget */}
        <div className="gk-animate-in gk-animate-in-8 md:col-span-2">
          <MiniMapWidget />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GM DASHBOARD VIEW (General Manager)
// Financial oversight + operational KPIs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RevenueEntry {
  id: string;
  entry_date: string;
  category: string;
  amount: number;
  rounds_count: number | null;
  description: string | null;
}

interface CapitalProject {
  id: string;
  name: string;
  status: string;
  budget_amount: number | null;
  spent_amount: number | null;
  target_completion: string | null;
  category: string | null;
}

function BarChart3Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  );
}

function DollarSignIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function GMDashboardView() {
  const { profile } = useAuth();
  const { activities, loading: activitiesLoading } = useRecentActivity();

  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([]);
  const [capitalProjects, setCapitalProjects] = useState<CapitalProject[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [equipmentStats, setEquipmentStats] = useState({ operational: 0, total: 0 });
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [openIssuesCount, setOpenIssuesCount] = useState(0);
  const [miaAssetsCount, setMiaAssetsCount] = useState(0);
  const [gmLoading, setGmLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = profile?.full_name?.split(" ")[0] || "GM";

  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    [now]
  );
  const monthEnd = useMemo(
    () => formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    [now]
  );

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    async function loadGMData() {
      setGmLoading(true);
      try {
        const supabase = createClient();

        const [
          revenueResult,
          projectsResult,
          expensesResult,
          equipmentResult,
          tasksResult,
          issuesResult,
          assetsResult,
        ] = await Promise.all([
          supabase
            .from("revenue_entries")
            .select("id, entry_date, category, amount, rounds_count, description")
            .gte("entry_date", monthStart)
            .lte("entry_date", monthEnd)
            .order("entry_date", { ascending: false }),
          supabase
            .from("capital_projects")
            .select("id, name, status, budget_amount, spent_amount, target_completion, category")
            .in("status", ["approved", "in_progress"]),
          supabase
            .from("expenses")
            .select("amount")
            .gte("expense_date", monthStart)
            .lte("expense_date", monthEnd)
            .in("status", ["approved", "paid"]),
          supabase
            .from("equipment")
            .select("id, status")
            .neq("status", "retired"),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "in_progress"]),
          supabase
            .from("hole_observations")
            .select("id", { count: "exact", head: true })
            .in("status", ["open", "in_progress"]),
          supabase
            .from("fy26_assets")
            .select("id", { count: "exact", head: true })
            .eq("status", "mia"),
        ]);

        setRevenueEntries((revenueResult.data || []) as RevenueEntry[]);
        setCapitalProjects((projectsResult.data || []) as CapitalProject[]);

        const expTotal = (expensesResult.data || []).reduce(
          (sum: number, e: { amount: number }) => sum + (e.amount || 0),
          0
        );
        setTotalExpenses(expTotal);

        const eqData = (equipmentResult.data || []) as { id: string; status: string }[];
        setEquipmentStats({
          operational: eqData.filter((e) => e.status === "operational").length,
          total: eqData.length,
        });

        setOpenTasksCount(tasksResult.count ?? 0);
        setOpenIssuesCount(issuesResult.count ?? 0);
        setMiaAssetsCount(assetsResult.count ?? 0);
      } catch (err) {
        console.error("GM dashboard load error:", err);
      } finally {
        setGmLoading(false);
      }
    }

    void loadGMData();
  }, [monthStart, monthEnd]);

  // Computed values
  const totalRevenue = revenueEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalRounds = revenueEntries.reduce((sum, e) => sum + (e.rounds_count || 0), 0);
  const netPosition = totalRevenue - totalExpenses;
  const uptimePct = equipmentStats.total > 0
    ? Math.round((equipmentStats.operational / equipmentStats.total) * 100)
    : 0;

  // Revenue by category
  const revenueByCategory = useMemo(() => {
    const catMap: Record<string, number> = {};
    for (const entry of revenueEntries) {
      catMap[entry.category] = (catMap[entry.category] || 0) + entry.amount;
    }
    return Object.entries(catMap)
      .map(([category, amount]) => ({
        category,
        amount,
        pct: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [revenueEntries, totalRevenue]);

  const categoryLabel = (cat: string) =>
    cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1400px] mx-auto overflow-x-hidden">
      {/* Welcome Header */}
      <div className="gk-animate-in gk-animate-in-1 mb-6">
        <div className="gk-gradient-hero gk-texture-overlay rounded-2xl p-5 md:p-6 text-white relative overflow-clip">
          <div className="relative z-10">
            <p className="text-white/60 text-sm font-medium mb-1">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-white/50 mt-1.5">General Manager</p>
          </div>
          <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-[#B68D40]/10 rounded-full blur-2xl pointer-events-none" />
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="gk-animate-in gk-animate-in-2 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSignIcon className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Revenue (Month)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {gmLoading ? "..." : `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Rounds (Month)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {gmLoading ? "..." : totalRounds.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Expenses (Month)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {gmLoading ? "..." : `$${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSignIcon className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Net Position</span>
            </div>
            <p className={cn("text-2xl font-bold", netPosition >= 0 ? "text-green-600" : "text-red-600")}>
              {gmLoading ? "..." : `${netPosition >= 0 ? "+" : ""}$${Math.abs(netPosition).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Revenue by Category */}
        <Card className="gk-animate-in gk-animate-in-3">
          <CardContent className="p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <BarChart3Icon className="w-4 h-4 text-primary" />
              Revenue by Category
            </h2>
            {gmLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : revenueByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No revenue data this month</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground pb-1 border-b border-border">
                  <span>Category</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">% of Total</span>
                </div>
                {revenueByCategory.map((row) => (
                  <div key={row.category} className="grid grid-cols-3 text-sm py-1">
                    <span className="truncate">{categoryLabel(row.category)}</span>
                    <span className="text-right font-medium">${row.amount.toLocaleString()}</span>
                    <span className="text-right text-muted-foreground">{row.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Capital Projects */}
        <Card className="gk-animate-in gk-animate-in-4">
          <CardContent className="p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Active Capital Projects
            </h2>
            {gmLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : capitalProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active projects</p>
            ) : (
              <div className="space-y-3">
                {capitalProjects.map((proj) => {
                  const budget = proj.budget_amount || 0;
                  const spent = proj.spent_amount || 0;
                  const progressPct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
                  return (
                    <div key={proj.id} className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate" title={proj.name}>{proj.name}</span>
                        <Badge variant={proj.status === "in_progress" ? "default" : "secondary"} className="text-xs ml-2">
                          {proj.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>${spent.toLocaleString()} / ${budget.toLocaleString()}</span>
                        {proj.target_completion && (
                          <span>Target: {parseAppDate(proj.target_completion)?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        )}
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            progressPct > 90 ? "bg-red-500" : progressPct > 70 ? "bg-amber-500" : "bg-primary"
                          )}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Operational KPIs */}
        <Card className="gk-animate-in gk-animate-in-5">
          <CardContent className="p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Operational KPIs
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Equipment Uptime</span>
                </div>
                <span className={cn("font-bold text-sm", uptimePct >= 90 ? "text-green-600" : uptimePct >= 70 ? "text-amber-600" : "text-red-600")}>
                  {gmLoading ? "..." : `${uptimePct}%`}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Open Tasks</span>
                </div>
                <span className="font-bold text-sm">{gmLoading ? "..." : openTasksCount}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Open Course Issues</span>
                </div>
                <span className="font-bold text-sm">{gmLoading ? "..." : openIssuesCount}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">MIA Assets</span>
                </div>
                <span className={cn("font-bold text-sm", miaAssetsCount > 0 ? "text-red-600" : "text-green-600")}>
                  {gmLoading ? "..." : miaAssetsCount}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="gk-animate-in gk-animate-in-6">
          <CardContent className="p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#B68D40]" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/budget">
                <Button variant="outline" className="w-full justify-start gap-2 h-10">
                  <DollarSignIcon className="w-4 h-4" />
                  View Budget
                </Button>
              </Link>
              <Link href="/reports">
                <Button variant="outline" className="w-full justify-start gap-2 h-10">
                  <BarChart3Icon className="w-4 h-4" />
                  View Reports
                </Button>
              </Link>
              <Link href="/staff">
                <Button variant="outline" className="w-full justify-start gap-2 h-10">
                  <Users className="w-4 h-4" />
                  View Staff
                </Button>
              </Link>
              <Link href="/assets">
                <Button variant="outline" className="w-full justify-start gap-2 h-10">
                  <Wrench className="w-4 h-4" />
                  View Assets
                </Button>
              </Link>
              <Link href="/reports/monthly-board" className="col-span-2">
                <Button variant="outline" className="w-full justify-start gap-2 h-10">
                  <FileText className="w-4 h-4" />
                  Download Board Report
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="gk-animate-in gk-animate-in-7 lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Recent Activity
              </h2>
              <span className="gk-live-dot" title="Live" />
            </div>
            {activitiesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-0.5">
                {activities.slice(0, 10).map((activity, idx) => {
                  const IconComponent = getActivityIcon(activity.action_type);
                  const isCompleted = activity.action_type === "task_completed";
                  return (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                      style={{ animationDelay: `${420 + idx * 60}ms` }}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isCompleted ? "bg-green-500/10" : "bg-muted/60"
                        )}
                      >
                        <IconComponent
                          className={cn(
                            "w-3.5 h-3.5",
                            isCompleted ? "text-green-600" : "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-2 break-words" title={activity.description}>{activity.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {activity.user?.full_name || "System"} &middot;{" "}
                          {formatActivityTime(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="w-7 h-7 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE — role-driven dashboard router
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DashboardPage() {
  const { user, isPro, isSuper, isAsstSuper, isDirector, isGM, loading } = useAuth();

  const isLeadership = isSuper || isAsstSuper || isDirector;

  // Show the loading view BOTH while auth is resolving AND when we've
  // resolved but there's no user yet (AuthGate is about to redirect to
  // /pin-login). Without the `!user` check, child data-fetching components
  // mount for a frame with no JWT, fire requests that 401, and pollute
  // the debug log with fake errors before the redirect happens.
  if (loading || !user) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Coffee className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold">Loading your dashboard...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Getting everything ready
          </p>
        </div>
      </div>
    );
  }

  if (isGM) {
    return <GMDashboardView />;
  }

  if (isPro) {
    return <ProDashboardView />;
  }

  if (isLeadership) {
    return <LeadershipDashboardView />;
  }

  // foreman, mechanic, crew, seasonal
  return <StaffDashboardView />;
}
