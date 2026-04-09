"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { WeatherWidget } from "@/components/features/weather/weather-widget";
import { CourseStatusBanner } from "@/components/features/course-status";
import { useWeather } from "@/lib/hooks/useWeather";
import type { WeatherAlert } from "@/lib/hooks/useWeather";
import {
  usePlanGoals,
  goalCategoryColors,
  type PlanOverview,
} from "@/lib/hooks/usePlanGoals";
import { Badge } from "@/components/ui/badge";
import { useTasks, type TaskWithRelations } from "@/lib/hooks/useTasks";
import { useAuth } from "@/lib/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useRecentActivity } from "@/lib/hooks/useRecentActivity";
import { createClient } from "@/lib/supabase/client";

// Dynamically import MiniMapWidget to avoid SSR issues with Leaflet
const MiniMapWidget = dynamic(
  () => import("@/components/features/map/mini-map-widget").then((mod) => mod.MiniMapWidget),
  {
    ssr: false,
    loading: () => (
      <div className="gk-card h-[300px] animate-pulse flex items-center justify-center">
        <MapPin className="w-8 h-8 text-muted-foreground/20" />
      </div>
    ),
  }
);

function getAlertIcon(type: WeatherAlert["type"]) {
  switch (type) {
    case "frost": return <Snowflake className="w-4 h-4" />;
    case "wind": return <Wind className="w-4 h-4" />;
    case "rain": return <CloudRain className="w-4 h-4" />;
    case "heat": return <Thermometer className="w-4 h-4" />;
    case "uv": return <Sun className="w-4 h-4" />;
    default: return <AlertTriangle className="w-4 h-4" />;
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
    case "task_assigned": return Plus;
    case "task_completed": return CheckCircle2;
    case "equipment_updated": return Wrench;
    case "chemical_applied": return FlaskConical;
    case "photo_uploaded": return Camera;
    case "schedule_changed": return Calendar;
    default: return Clock;
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

const quickActions = [
  { href: "/tasks/new", label: "New Task", icon: Plus, color: "from-blue-500 to-blue-600" },
  { href: "/photos", label: "Take Photo", icon: Camera, color: "from-emerald-500 to-emerald-600" },
  { href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-teal-600" },
  { href: "/chemicals/apply", label: "Log Chemical", icon: FlaskConical, color: "from-amber-500 to-amber-600" },
  { href: "/reports", label: "Reports", icon: FileText, color: "from-[#1B4332] to-[#2D6A4F]" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { profile, isMember, loading: authLoading } = useAuth();
  const { getAlerts } = useWeather();
  const alerts = getAlerts();
  const { goals, fetchGoals, fetchPlanOverview } = usePlanGoals();
  const { fetchMyTasks } = useTasks();
  const { activities, loading: activitiesLoading } = useRecentActivity();

  // Redirect members to member home
  useEffect(() => {
    if (!authLoading && isMember) {
      router.replace("/member/home");
    }
  }, [authLoading, isMember, router]);

  const [todayTasks, setTodayTasks] = useState<TaskWithRelations[]>([]);
  const [planOverview, setPlanOverview] = useState<PlanOverview | null>(null);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [, setSecondaryLoaded] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const hasFetchedRef = useRef(false);

  // Get greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Early morning";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] || "Superintendent";

  // Today's tasks stats
  const todaysTasks = useMemo(() => {
    const completed = todayTasks.filter((t) => t.status === "completed").length;
    const total = todayTasks.length;
    const highPriority = todayTasks.filter(
      (t) => (t.priority === "high" || t.priority === "critical") && t.status !== "completed"
    );
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, highPriority, completionPct };
  }, [todayTasks]);

  // Progressive loading
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const today = new Date().toISOString().split("T")[0];

    async function loadCriticalData() {
      const tasks = await fetchMyTasks(today);
      setTodayTasks(tasks.slice(0, 10));
    }
    void loadCriticalData();

    const secondaryTimer = setTimeout(async () => {
      const supabase = createClient();
      const [overview, staffResult] = await Promise.all([
        fetchPlanOverview(currentYear),
        supabase.from("profiles").select("id", { count: "exact", head: true }).neq("role", "member"),
      ]);
      setPlanOverview(overview);
      if (staffResult.count !== null) setStaffCount(staffResult.count);

      await fetchGoals({
        planLevel: "monthly",
        year: currentYear,
        month: currentMonth,
      });

      setSecondaryLoaded(true);
    }, 300);

    return () => clearTimeout(secondaryTimer);
  }, [fetchMyTasks, fetchGoals, fetchPlanOverview, currentYear, currentMonth]);

  const focusGoals = useMemo(
    () =>
      goals
        .filter((g) => g.status === "in_progress" || g.status === "planned")
        .slice(0, 3),
    [goals]
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1400px] mx-auto">
      {/* ===== Hero Welcome Section ===== */}
      <div className="gk-animate-in gk-animate-in-1 mb-6">
        <div className="gk-gradient-hero gk-texture-overlay rounded-2xl p-5 md:p-6 text-white relative overflow-clip">
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
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
                <span className="text-sm font-medium text-white/80 whitespace-nowrap">Veterans Memorial GC</span>
              </div>
            </div>

            {/* Inline course status */}
            <div className="mt-4">
              <CourseStatusBanner className="!bg-white/10 !border-white/10 !text-white [&_*]:!text-white/80 !rounded-xl" showUpdateButton />
            </div>
          </div>

          {/* Decorative elements */}
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
                <p className="text-xs opacity-70 mt-0.5">{alert.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Quick Stats Row ===== */}
      <div className="gk-animate-in gk-animate-in-3 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {/* Weather Widget */}
        <WeatherWidget className="col-span-2 lg:col-span-1" />

        {/* Tasks Today */}
        <Link href="/tasks" className="gk-stat-card group hover:border-primary/20 active:bg-muted/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardCheck className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Tasks Today</span>
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
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted/60"
                  />
                  <circle
                    cx="18" cy="18" r="15"
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

        {/* Staff On Duty */}
        <Link href="/staff" className="gk-stat-card group hover:border-primary/20 active:bg-muted/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Staff</span>
            </div>
            <span className="gk-live-dot" title="Live" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground gk-count">{staffCount ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Team members</p>
        </Link>

        {/* Active Alerts */}
        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Alerts</span>
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
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[#B68D40]" />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="gk-action-btn flex flex-col items-center gap-2.5 p-4 bg-card rounded-xl border border-border hover:border-primary/20 active:scale-95 active:bg-muted/30"
            >
              <div className={cn(
                "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                action.color
              )}>
                <action.icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-center text-muted-foreground leading-tight">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ===== Main Content Grid ===== */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">

        {/* Course Map Widget */}
        <Link
          href="/course-map"
          className="gk-animate-in gk-animate-in-5 gk-card group p-5 relative overflow-hidden"
        >
          {/* Decorative background */}
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#1B4332]/5 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center shadow-sm">
                  <Map className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Course Map</h2>
                  <p className="text-[11px] text-muted-foreground">AI-powered diagnostics</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Pin issues on holes and greens, snap a photo, and get instant AI diagnosis with treatment plans.
            </p>

            <div className="flex items-center gap-1.5 text-sm text-primary font-medium group-hover:gap-2.5 transition-all">
              Open map
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>

        {/* Plan Progress Widget */}
        <div className="gk-animate-in gk-animate-in-6 gk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-semibold text-sm">Plan Progress</h2>
            </div>
            <Link
              href="/plan"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              View all
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Year Progress */}
          {planOverview ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{currentYear} Goals</span>
                <span className="text-xs font-bold text-foreground">
                  {planOverview.completion_percent}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full gk-progress-animated"
                  style={{ width: `${planOverview.completion_percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {planOverview.by_status.find((s) => s.status === "completed")?.count || 0} completed
                </span>
                <span>{planOverview.total_goals} total</span>
              </div>
            </div>
          ) : (
            <div className="h-16 bg-muted/50 rounded-lg animate-pulse mb-4" />
          )}

          {/* This Month's Focus */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">This Month&apos;s Focus</span>
            </div>
            {focusGoals.length > 0 ? (
              <div className="space-y-1.5">
                {focusGoals.map((goal) => (
                  <Link
                    key={goal.id}
                    href={`/plan/${goal.id}`}
                    className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: goalCategoryColors[goal.category] }}
                      />
                      <span className="text-sm truncate">{goal.title}</span>
                    </div>
                    {goal.progress_percent !== undefined && (
                      <Badge variant="secondary" className="text-[10px] ml-2 font-bold">
                        {goal.progress_percent}%
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Target className="w-7 h-7 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No goals for this month</p>
                <Link
                  href="/plan/new?level=monthly"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Create a monthly goal
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Today's Priority Tasks */}
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
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors group"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-red-400/60 flex items-center justify-center shrink-0 group-hover:border-red-500 transition-colors">
                    <Circle className="w-2.5 h-2.5 text-red-500/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
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
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs mt-0.5">No high priority tasks remaining</p>
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
                <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-0.5">
              {activities.slice(0, 5).map((activity, idx) => {
                const IconComponent = getActivityIcon(activity.action_type);
                const isCompleted = activity.action_type === "task_completed";
                return (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                    style={{ animationDelay: `${420 + idx * 60}ms` }}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isCompleted ? "bg-green-500/10" : "bg-muted/60"
                    )}>
                      <IconComponent className={cn(
                        "w-3.5 h-3.5",
                        isCompleted ? "text-green-600" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{activity.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {activity.user?.full_name || "System"} &middot; {formatActivityTime(activity.created_at)}
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

        {/* Course Map Widget - spans 2 columns */}
        <div className="gk-animate-in gk-animate-in-8 md:col-span-2">
          <MiniMapWidget />
        </div>
      </div>
    </div>
  );
}
