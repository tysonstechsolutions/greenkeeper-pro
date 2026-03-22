"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Sun,
  Cloud,
  MessageSquare,
  AlertTriangle,
  Camera,
  ChevronRight,
  Calendar,
  Clock,
  MapPin,
  Wrench,
  FlaskConical,
  Users,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Flag,
  DollarSign,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WeatherWidget } from "@/components/features/weather/weather-widget";
import { CourseStatusBanner } from "@/components/features/course-status";
import { useAuth } from "@/lib/hooks/useAuth";
import { useWeather } from "@/lib/hooks/useWeather";
import { useTasks, type TaskWithRelations } from "@/lib/hooks/useTasks";
import { usePhotos } from "@/lib/hooks/usePhotos";
import { useGolferFeedback } from "@/lib/hooks/useGolferFeedback";
import { useDiagnostics } from "@/lib/hooks/useDiagnostics";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// Task category icons
const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  mowing: Wrench,
  chemical: FlaskConical,
  irrigation: Cloud,
  greens: Flag,
  bunker: MapPin,
};

// Dynamically import map widget
const MiniMapWidget = dynamic(
  () => import("@/components/features/map/mini-map-widget").then((mod) => mod.MiniMapWidget),
  {
    ssr: false,
    loading: () => (
      <div className="bg-card rounded-lg border border-border h-[200px] animate-pulse" />
    ),
  }
);

export default function ProDashboardPage() {
  const { profile } = useAuth();
  const { getAlerts } = useWeather();
  const { fetchTeamTasks } = useTasks();
  const { photos: recentPhotosData, fetchPhotos } = usePhotos();
  const { feedback, fetchFeedback, getNewFeedbackCount } = useGolferFeedback();
  const { getActiveDiagnosesCount } = useDiagnostics();

  const [todaysTasks, setTodaysTasks] = useState<TaskWithRelations[]>([]);
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);
  const [activeDiagnoses, setActiveDiagnoses] = useState(0);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  const alerts = getAlerts();
  const firstName = profile?.full_name?.split(" ")[0] || "Pro";

  // Greeting based on time of day
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  // Load data
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const loadData = async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];

      // Load today's maintenance tasks that affect play
      const tasks = await fetchTeamTasks(today);
      // Filter to categories that affect play and pending/in_progress
      const playImpactCategories = ["mowing", "chemical", "greens", "bunker", "irrigation", "construction"];
      const relevantTasks = tasks.filter((t) =>
        playImpactCategories.includes(t.category) &&
        (t.status === "pending" || t.status === "in_progress")
      );
      setTodaysTasks(relevantTasks.slice(0, 5));

      // Load recent photos
      await fetchPhotos({}, 0);

      // Load feedback count and active diagnoses
      const [feedbackCount, diagnosesCount] = await Promise.all([
        getNewFeedbackCount(),
        getActiveDiagnosesCount(),
      ]);
      setNewFeedbackCount(feedbackCount);
      setActiveDiagnoses(diagnosesCount);

      setLoading(false);
    };

    loadData();
  }, [fetchTeamTasks, fetchPhotos, getNewFeedbackCount, getActiveDiagnosesCount]);

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

      {/* Course Status Banner */}
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
                <p className="text-xs opacity-80 mt-0.5">{alert.recommendation}</p>
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
          href="/messages"
          className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-blue-500" />
          </div>
          <span className="text-xs font-medium text-center">Messages</span>
        </Link>

        <Link
          href="/feedback"
          className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors relative"
        >
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-purple-500" />
          </div>
          <span className="text-xs font-medium text-center">Log Feedback</span>
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
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      <p className="font-medium text-sm truncate">{task.title}</p>
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
                          {task.status === "in_progress" ? "In Progress" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* REI Warning if there are chemical applications */}
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
              href="/diagnostics"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Details
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-4">
            {/* Active Diagnoses Alert */}
            {activeDiagnoses > 0 && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    Active Issues
                  </span>
                  <Badge className="bg-yellow-500">{activeDiagnoses}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Course Doctor has {activeDiagnoses} active diagnosis{activeDiagnoses !== 1 ? "es" : ""}
                </p>
              </div>
            )}

            {/* Condition Summary */}
            <div className="grid grid-cols-2 gap-3">
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
        </div>

        {/* Recent Photos from Maintenance */}
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
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-square bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : recentPhotosData.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
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

        {/* Communication Card */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Quick Contact
          </h2>

          <div className="space-y-3">
            <Link
              href="/messages/superintendent"
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <span className="font-medium text-sm">Message Superintendent</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>

            <Link
              href="/report-issue"
              className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <Flag className="w-4 h-4 text-red-500" />
                </div>
                <span className="font-medium text-sm text-red-700 dark:text-red-400">
                  Report an Issue
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-red-500" />
            </Link>
          </div>
        </div>

        {/* Course Map Mini View */}
        <div className="md:col-span-2 lg:col-span-3">
          <MiniMapWidget />
        </div>
      </div>
    </div>
  );
}
