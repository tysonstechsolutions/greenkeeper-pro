"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Users,
  Wrench,
  FlaskConical,
  ClipboardList,
  CalendarOff,
  Loader2,
  RefreshCw,
  Sunrise,
  Coffee,
  Leaf,
  Shield,
  MessageSquare,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeatherIcon } from "@/components/ui/weather-icon";
import { useAuth } from "@/lib/hooks/useAuth";
import { useWeather } from "@/lib/hooks/useWeather";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import type { Task, Schedule, Equipment, TimeOffRequest } from "@/types/database";

interface BriefingData {
  tasks: {
    critical: Task[];
    high: Task[];
    normal: Task[];
    overdue: Task[];
    totalDueToday: number;
  };
  staff: {
    onToday: { id: string; name: string; role: string; shift: string; crew: string | null }[];
    offToday: { id: string; name: string; type: string }[];
    totalActive: number;
  };
  equipment: {
    needsService: { id: string; name: string; status: string; notes: string | null }[];
    totalOperational: number;
    totalCount: number;
  };
  chemicals: {
    activeREI: { id: string; product: string; zones: string[]; expires: string }[];
    lowStock: { id: string; name: string; current: number; threshold: number; unit: string }[];
  };
  feedback: {
    recent: { id: string; type: string; area: string; notes: string; date: string }[];
    unresolved: number;
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Early bird";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Weather icon is now shared — see @/components/ui/weather-icon

export default function BriefingPage() {
  const { profile } = useAuth();
  const { currentWeather, forecast, getAlerts, loading: weatherLoading } = useWeather();
  const weatherAlerts = getAlerts();
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const fetchBriefing = useCallback(async () => {
    setLoading(true);

    try {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      // All queries in parallel
      const [
        tasksResult,
        overdueResult,
        schedulesResult,
        timeOffResult,
        equipmentResult,
        chemAppsResult,
        chemProductsResult,
        feedbackResult,
        profileCountResult,
      ] = await Promise.all([
        // Today's tasks
        withTimeout(
           
          supabase.from("tasks")
            .select("*")
            .eq("due_date", todayStr)
            .in("status", ["pending", "in_progress"])
            .order("priority", { ascending: true }),
          8000,
          { data: null, error: null }
        ),
        // Overdue tasks
        withTimeout(
           
          supabase.from("tasks")
            .select("*")
            .lt("due_date", todayStr)
            .in("status", ["pending", "in_progress"])
            .order("due_date", { ascending: true })
            .limit(10),
          8000,
          { data: null, error: null }
        ),
        // Today's schedules
        withTimeout(
           
          supabase.from("schedules")
            .select("*, profiles:user_id(id, full_name, role)")
            .eq("schedule_date", todayStr)
            .neq("shift_type", "off"),
          8000,
          { data: null, error: null }
        ),
        // Active time-off
        withTimeout(
           
          supabase.from("time_off_requests")
            .select("*, profiles:user_id(id, full_name)")
            .eq("status", "approved")
            .lte("start_date", todayStr)
            .gte("end_date", todayStr),
          8000,
          { data: null, error: null }
        ),
        // Equipment needing attention
        withTimeout(
           
          supabase.from("equipment")
            .select("*")
            .in("status", ["needs_service", "in_repair", "out_of_service"]),
          8000,
          { data: null, error: null }
        ),
        // Recent chemical applications with active REI
        withTimeout(
           
          supabase.from("chemical_applications")
            .select("*, chemical_products:product_id(product_name)")
            .gte("rei_expires_at", now.toISOString())
            .order("rei_expires_at", { ascending: true }),
          8000,
          { data: null, error: null }
        ),
        // Low stock chemicals
        withTimeout(
           
          supabase.from("chemical_products")
            .select("*")
            .eq("is_active", true)
            .not("reorder_threshold", "is", null),
          8000,
          { data: null, error: null }
        ),
        // Recent unresolved feedback
        withTimeout(
           
          supabase.from("golfer_feedback")
            .select("*")
            .in("status", ["new", "acknowledged", "in_progress"])
            .order("created_at", { ascending: false })
            .limit(5),
          8000,
          { data: null, error: null }
        ),
        // Active profile count
        withTimeout(
           
          supabase.from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true),
          8000,
          { count: 0, error: null }
        ),
      ]);

      const tasks = (tasksResult.data || []) as Task[];
      const overdue = (overdueResult.data || []) as Task[];

      // Process staff schedules
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onToday = (schedulesResult.data || []).map((s: any) => ({
        id: s.profiles?.id || s.user_id,
        name: s.profiles?.full_name || "Unknown",
        role: s.profiles?.role || "crew",
        shift: s.shift_start && s.shift_end
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

      // Equipment
      const needsServiceEquip = (equipmentResult.data || []) as Equipment[];

      // Chemicals — filter low stock client-side
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
        zones: a.hole_numbers?.map((h: number) => `Hole ${h}`) || a.zone_ids || [],
        expires: a.rei_expires_at,
      }));

      // Feedback
      const feedbackItems = (feedbackResult.data || []) as Array<{
        id: string;
        feedback_type: string;
        area: string;
        notes: string;
        feedback_date: string;
      }>;

      setData({
        tasks: {
          critical: tasks.filter((t) => t.priority === "critical"),
          high: tasks.filter((t) => t.priority === "high"),
          normal: tasks.filter((t) => t.priority === "normal" || t.priority === "low"),
          overdue,
          totalDueToday: tasks.length,
        },
        staff: {
          onToday,
          offToday,
          totalActive: profileCountResult.count ?? 0,
        },
        equipment: {
          needsService: needsServiceEquip.map((e) => ({
            id: e.id,
            name: e.name,
            status: e.status,
            notes: e.notes,
          })),
          totalOperational: 0, // We'd need another query for this
          totalCount: 0,
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
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Coffee className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold">Preparing your briefing...</h2>
          <p className="text-sm text-muted-foreground mt-1">Gathering today&apos;s data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-5xl mx-auto">
      {/* Hero header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {getGreeting()}, {profile?.full_name?.split(" ")[0] || "Boss"}.
            </h1>
            <p className="text-muted-foreground mt-1">{dayName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchBriefing} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Weather card */}
      {currentWeather && (
        <div className="mb-6 p-5 rounded-xl bg-gradient-to-br from-sky-500/10 to-blue-500/5 border border-sky-200/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sky-600">
                <WeatherIcon condition={currentWeather.conditions} className="w-12 h-12" />
              </div>
              <div>
                <div className="text-4xl font-bold">{currentWeather.temp_f}°F</div>
                <div className="text-sm text-muted-foreground">{currentWeather.conditions}</div>
              </div>
            </div>
            <div className="hidden sm:grid grid-cols-3 gap-6 text-sm">
              <div className="text-center">
                <Wind className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <div className="font-medium">{currentWeather.wind_mph} mph</div>
                <div className="text-xs text-muted-foreground">{currentWeather.wind_direction}</div>
              </div>
              <div className="text-center">
                <Droplets className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <div className="font-medium">{currentWeather.humidity}%</div>
                <div className="text-xs text-muted-foreground">Humidity</div>
              </div>
              <div className="text-center">
                <CloudRain className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <div className="font-medium">{currentWeather.precipitation_chance}%</div>
                <div className="text-xs text-muted-foreground">Rain chance</div>
              </div>
            </div>
          </div>

          {/* Weather alerts */}
          {weatherAlerts && weatherAlerts.length > 0 && (
            <div className="mt-4 space-y-2">
              {weatherAlerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                    alert.severity === "warning"
                      ? "bg-red-500/10 text-red-700"
                      : alert.severity === "caution"
                      ? "bg-amber-500/10 text-amber-700"
                      : "bg-blue-500/10 text-blue-700"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{alert.title}:</span>{" "}
                    {alert.recommendation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OVERDUE TASKS — always first if any */}
        {data && data.tasks.overdue.length > 0 && (
          <div className="lg:col-span-2 p-5 rounded-xl bg-red-500/5 border border-red-200/50">
            <h2 className="font-semibold text-red-700 flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" />
              Overdue Tasks ({data.tasks.overdue.length})
            </h2>
            <div className="space-y-2">
              {data.tasks.overdue.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/60 hover:bg-white/80 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">{task.title}</div>
                    <div className="text-xs text-red-600">
                      Due {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    task.priority === "critical" ? "bg-purple-500/10 text-purple-600" : "bg-red-500/10 text-red-600"
                  }`}>
                    {task.priority}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* TODAY'S TASKS */}
        <div className="p-5 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Today&apos;s Tasks
            </h2>
            <Link href="/tasks" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>

          {data && data.tasks.totalDueToday === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks scheduled for today.</p>
          ) : data && (
            <div className="space-y-3">
              {data.tasks.critical.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-purple-600 uppercase tracking-wider mb-1.5">
                    Critical ({data.tasks.critical.length})
                  </div>
                  {data.tasks.critical.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block p-2 rounded bg-purple-500/5 hover:bg-purple-500/10 mb-1 text-sm">
                      {t.title}
                    </Link>
                  ))}
                </div>
              )}
              {data.tasks.high.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-600 uppercase tracking-wider mb-1.5">
                    High Priority ({data.tasks.high.length})
                  </div>
                  {data.tasks.high.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block p-2 rounded bg-red-500/5 hover:bg-red-500/10 mb-1 text-sm">
                      {t.title}
                    </Link>
                  ))}
                </div>
              )}
              {data.tasks.normal.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Normal ({data.tasks.normal.length})
                  </div>
                  {data.tasks.normal.slice(0, 5).map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block p-2 rounded bg-muted/50 hover:bg-muted mb-1 text-sm">
                      {t.title}
                    </Link>
                  ))}
                  {data.tasks.normal.length > 5 && (
                    <p className="text-xs text-muted-foreground mt-1">+{data.tasks.normal.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CREW ON TODAY */}
        <div className="p-5 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Crew Today
            </h2>
            <Link href="/schedule" className="text-xs text-primary hover:underline">
              Schedule
            </Link>
          </div>

          {data && data.staff.onToday.length === 0 && data.staff.offToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedule data for today.</p>
          ) : data && (
            <>
              {data.staff.onToday.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {data.staff.onToday.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-green-500/5">
                      <div>
                        <span className="font-medium">{s.name}</span>
                        {s.crew && <span className="text-xs text-muted-foreground ml-2">{s.crew}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{s.shift}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.staff.offToday.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <CalendarOff className="w-3 h-3" />
                    Off Today
                  </div>
                  {data.staff.offToday.map((s, i) => (
                    <div key={i} className="text-sm text-muted-foreground p-1.5">
                      {s.name} <span className="text-xs capitalize">({s.type})</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* EQUIPMENT ALERTS */}
        {data && data.equipment.needsService.length > 0 && (
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" />
                Equipment Alerts ({data.equipment.needsService.length})
              </h2>
              <Link href="/equipment" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {data.equipment.needsService.map((e) => (
                <Link
                  key={e.id}
                  href={`/equipment/${e.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                >
                  <span className="font-medium text-sm">{e.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    e.status === "out_of_service" ? "bg-red-500/10 text-red-600"
                    : e.status === "in_repair" ? "bg-orange-500/10 text-orange-600"
                    : "bg-amber-500/10 text-amber-600"
                  }`}>
                    {e.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CHEMICAL SAFETY */}
        {data && (data.chemicals.activeREI.length > 0 || data.chemicals.lowStock.length > 0) && (
          <div className="p-5 rounded-xl bg-card border border-border">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <FlaskConical className="w-5 h-5 text-blue-600" />
              Chemical Status
            </h2>

            {data.chemicals.activeREI.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Active REI Windows
                </div>
                {data.chemicals.activeREI.map((c, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-red-500/5 mb-1.5 text-sm">
                    <div className="font-medium">{c.product}</div>
                    <div className="text-xs text-red-600 mt-0.5">
                      REI expires: {new Date(c.expires).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                      })}
                    </div>
                    {c.zones.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.zones.slice(0, 4).join(", ")}
                        {c.zones.length > 4 && ` +${c.zones.length - 4} more`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.chemicals.lowStock.length > 0 && (
              <div>
                <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-2">
                  Low Stock
                </div>
                {data.chemicals.lowStock.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 mb-1 text-sm">
                    <span>{c.name}</span>
                    <span className="text-xs text-amber-600 font-medium">
                      {c.current} / {c.threshold} {c.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GOLFER FEEDBACK */}
        {data && data.feedback.recent.length > 0 && (
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                Recent Feedback ({data.feedback.unresolved})
              </h2>
              <Link href="/feedback" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {data.feedback.recent.map((f) => (
                <div key={f.id} className="p-2.5 rounded-lg bg-muted/50 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${
                      f.type === "complaint" ? "bg-red-500/10 text-red-600"
                      : f.type === "suggestion" ? "bg-blue-500/10 text-blue-600"
                      : "bg-green-500/10 text-green-600"
                    }`}>
                      {f.type}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{f.area.replace("_", " ")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{f.notes}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
