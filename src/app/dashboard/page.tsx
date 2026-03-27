"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
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
  Stethoscope,
  Plus,
  Camera,
  Wrench,
  FlaskConical,
  MessageSquare,
  Clock,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { WeatherWidget } from "@/components/features/weather/weather-widget";
import { CourseStatusBanner } from "@/components/features/course-status";
import { useWeather } from "@/lib/hooks/useWeather";
import type { WeatherAlert } from "@/lib/hooks/useWeather";
import {
  usePlanGoals,
  goalCategoryColors,
  type GoalWithStats,
  type PlanOverview,
} from "@/lib/hooks/usePlanGoals";
import { Badge } from "@/components/ui/badge";
import { useDiagnostics } from "@/lib/hooks/useDiagnostics";
import { useTasks, type TaskWithRelations } from "@/lib/hooks/useTasks";
import { useAuth } from "@/lib/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useRecentActivity, type ActivityWithUser } from "@/lib/hooks/useRecentActivity";

// Dynamically import MiniMapWidget to avoid SSR issues with Leaflet
const MiniMapWidget = dynamic(
  () => import("@/components/features/map/mini-map-widget").then((mod) => mod.MiniMapWidget),
  {
    ssr: false,
    loading: () => (
      <div className="bg-card rounded-lg border border-border h-[280px] animate-pulse" />
    ),
  }
);

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
      return "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400";
    case "caution":
      return "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400";
    case "info":
      return "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400";
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

const quickActions = [
  { href: "/tasks/new", label: "New Task", icon: Plus, color: "bg-blue-500" },
  { href: "/photos", label: "Take Photo", icon: Camera, color: "bg-green-500" },
  { href: "/diagnostics", label: "Diagnose", icon: Stethoscope, color: "bg-purple-500" },
  { href: "/chemicals/apply", label: "Log Application", icon: FlaskConical, color: "bg-orange-500" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { profile, isMember, loading: authLoading } = useAuth();
  const { getAlerts } = useWeather();
  const alerts = getAlerts();
  const { goals, fetchGoals, fetchPlanOverview } = usePlanGoals();
  const { getActiveDiagnosesCount } = useDiagnostics();
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
  const [focusGoals, setFocusGoals] = useState<GoalWithStats[]>([]);
  const [activeDiagnosesCount, setActiveDiagnosesCount] = useState(0);
  const [secondaryLoaded, setSecondaryLoaded] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const hasFetchedRef = useRef(false);

  // Get greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  // Get first name
  const firstName = profile?.full_name?.split(" ")[0] || "Superintendent";

  // Today's tasks stats - computed from fetched tasks
  const todaysTasks = useMemo(() => {
    const completed = todayTasks.filter((t) => t.status === "completed").length;
    const total = todayTasks.length;
    const highPriority = todayTasks.filter(
      (t) => (t.priority === "high" || t.priority === "critical") && t.status !== "completed"
    );
    return { completed, total, highPriority };
  }, [todayTasks]);

  // Progressive loading: Load critical data first, then secondary data after a delay
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const today = new Date().toISOString().split("T")[0];

    // Phase 1: Load critical data immediately (tasks for today only - limited to 10 for dashboard)
    async function loadCriticalData() {
      const tasks = await fetchMyTasks(today);
      // Only show first 10 for dashboard performance
      setTodayTasks(tasks.slice(0, 10));
    }
    loadCriticalData();

    // Phase 2: Load secondary data after a short delay (plan progress, diagnostics)
    const secondaryTimer = setTimeout(async () => {
      const [overview, diagnosesCount] = await Promise.all([
        fetchPlanOverview(currentYear),
        getActiveDiagnosesCount(),
      ]);
      setPlanOverview(overview);
      setActiveDiagnosesCount(diagnosesCount);

      // Fetch goals with limit
      await fetchGoals({
        planLevel: "monthly",
        year: currentYear,
        month: currentMonth,
      });

      setSecondaryLoaded(true);
    }, 300);

    return () => clearTimeout(secondaryTimer);
  }, [fetchMyTasks, fetchGoals, fetchPlanOverview, getActiveDiagnosesCount, currentYear, currentMonth]);

  // Update focus goals when goals change
  useEffect(() => {
    const inProgress = goals
      .filter((g) => g.status === "in_progress" || g.status === "planned")
      .slice(0, 3);
    setFocusGoals(inProgress);
  }, [goals]);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Welcome Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {greeting}, {firstName}
        </h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Course Status Banner */}
      <CourseStatusBanner className="mb-6" showUpdateButton />

      {/* Weather Alerts Banner */}
      {alerts && alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.slice(0, 2).map((alert, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg border ${getAlertStyles(alert.severity)}`}
            >
              <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{alert.message}</p>
                <p className="text-xs opacity-80 mt-0.5">{alert.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Weather Widget */}
        <WeatherWidget className="col-span-2 lg:col-span-1" />

        {/* Tasks Today */}
        <Link
          href="/tasks"
          className="bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <ClipboardCheck className="w-4 h-4" />
            <span className="text-sm">Tasks Today</span>
          </div>
          <p className="text-2xl font-semibold">{todaysTasks.total}</p>
          <p className="text-sm text-muted-foreground">
            {todaysTasks.completed} completed
          </p>
        </Link>

        {/* Staff On Duty - placeholder */}
        <Link
          href="/staff"
          className="bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Staff On Duty</span>
          </div>
          <p className="text-2xl font-semibold">8</p>
          <p className="text-sm text-muted-foreground">Morning crew</p>
        </Link>

        {/* Alerts Count */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Alerts</span>
          </div>
          <p className="text-2xl font-semibold">{alerts?.length ?? 0}</p>
          <p className="text-sm text-muted-foreground">
            {alerts && alerts.length > 0
              ? `${alerts.filter((a) => a.severity === "warning").length} warnings`
              : "No active alerts"}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
            >
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white", action.color)}>
                <action.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Course Doctor Widget */}
        <Link
          href="/diagnostics"
          className="bg-card rounded-lg border border-border p-6 hover:border-[#1B4332]/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#1B4332]/10 rounded-lg">
                <Stethoscope className="w-5 h-5 text-[#1B4332]" />
              </div>
              <h2 className="font-semibold">Course Doctor</h2>
            </div>
            {activeDiagnosesCount > 0 && (
              <Badge className="bg-[#1B4332] text-white">
                {activeDiagnosesCount} active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            AI-powered turf diagnostics and treatment planning
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary group-hover:underline flex items-center gap-1">
              Diagnose an issue
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </Link>

        {/* Plan Progress Widget */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Plan Progress</h2>
            </div>
            <Link
              href="/plan"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Year Progress */}
          {planOverview ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {currentYear} Goals
                </span>
                <span className="text-sm font-medium">
                  {planOverview.completion_percent}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${planOverview.completion_percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>
                  {planOverview.by_status.find((s) => s.status === "completed")?.count || 0}{" "}
                  completed
                </span>
                <span>{planOverview.total_goals} total</span>
              </div>
            </div>
          ) : (
            <div className="h-16 bg-muted/50 rounded animate-pulse mb-4" />
          )}

          {/* This Month's Focus */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">This Month&apos;s Focus</span>
            </div>
            {focusGoals.length > 0 ? (
              <div className="space-y-2">
                {focusGoals.map((goal) => (
                  <Link
                    key={goal.id}
                    href={`/plan/${goal.id}`}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: goalCategoryColors[goal.category] }}
                      />
                      <span className="text-sm truncate">{goal.title}</span>
                    </div>
                    {goal.progress_percent !== undefined && (
                      <Badge variant="secondary" className="text-xs ml-2">
                        {goal.progress_percent}%
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No goals for this month</p>
                <Link
                  href="/plan/new?level=monthly"
                  className="text-xs text-primary hover:underline"
                >
                  Create a monthly goal
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Today's Priority Tasks */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Priority Tasks</h2>
            <Link
              href="/tasks"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {todaysTasks.highPriority.length > 0 ? (
            <div className="space-y-3">
              {todaysTasks.highPriority.slice(0, 4).map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                >
                  <Circle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {task.zone?.name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {task.zone.name}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-50 text-green-500" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs">No high priority tasks remaining</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Activity</h2>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          {activitiesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-3">
              {activities.slice(0, 4).map((activity) => {
                const IconComponent = getActivityIcon(activity.action_type);
                return (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-2 rounded-md"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <IconComponent className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.user?.full_name || "System"} • {formatActivityTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </div>

        {/* Course Map Widget */}
        <div className="md:col-span-2 lg:col-span-2">
          <MiniMapWidget />
        </div>
      </div>
    </div>
  );
}
