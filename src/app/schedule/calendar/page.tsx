"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Wrench,
  Droplets,
} from "lucide-react";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { TaskCategory, TaskStatus } from "@/types/database";

// ── Types ──

interface CalendarTask {
  id: string;
  title: string;
  category: TaskCategory;
  priority: string;
  status: TaskStatus;
  due_date: string;
  assigned_user: { full_name: string } | null;
}

interface CalendarEquipment {
  id: string;
  name: string;
  next_service_due_date: string;
}

interface IrrigationEvent {
  id: string;
  zone_name: string;
  day_of_week: number[];
  start_time: string;
  run_minutes: number;
}

type CalendarEvent =
  | { type: "task"; data: CalendarTask }
  | { type: "equipment"; data: CalendarEquipment }
  | { type: "irrigation"; data: IrrigationEvent & { date: string } };

type ViewMode = "week" | "month";

// ── Category colors ──

const categoryColors: Record<string, { bg: string; text: string; dot: string }> = {
  mowing:           { bg: "bg-green-100 dark:bg-green-900/30",    text: "text-green-700 dark:text-green-400",    dot: "bg-green-500" },
  irrigation:       { bg: "bg-blue-100 dark:bg-blue-900/30",      text: "text-blue-700 dark:text-blue-400",      dot: "bg-blue-500" },
  chemical:         { bg: "bg-purple-100 dark:bg-purple-900/30",  text: "text-purple-700 dark:text-purple-400",  dot: "bg-purple-500" },
  mechanical:       { bg: "bg-orange-100 dark:bg-orange-900/30",  text: "text-orange-700 dark:text-orange-400",  dot: "bg-orange-500" },
  landscaping:      { bg: "bg-emerald-100 dark:bg-emerald-900/30",text: "text-emerald-700 dark:text-emerald-400",dot: "bg-emerald-500" },
  construction:     { bg: "bg-slate-100 dark:bg-slate-900/30",    text: "text-slate-700 dark:text-slate-400",    dot: "bg-slate-500" },
  bunker:           { bg: "bg-amber-100 dark:bg-amber-900/30",    text: "text-amber-700 dark:text-amber-400",    dot: "bg-amber-500" },
  greens:           { bg: "bg-lime-100 dark:bg-lime-900/30",      text: "text-lime-700 dark:text-lime-400",      dot: "bg-lime-500" },
  admin:            { bg: "bg-gray-100 dark:bg-gray-900/30",      text: "text-gray-700 dark:text-gray-400",      dot: "bg-gray-500" },
  safety:           { bg: "bg-red-100 dark:bg-red-900/30",        text: "text-red-700 dark:text-red-400",        dot: "bg-red-500" },
  events:           { bg: "bg-pink-100 dark:bg-pink-900/30",      text: "text-pink-700 dark:text-pink-400",      dot: "bg-pink-500" },
  pro_shop:         { bg: "bg-indigo-100 dark:bg-indigo-900/30",  text: "text-indigo-700 dark:text-indigo-400",  dot: "bg-indigo-500" },
  customer_service: { bg: "bg-cyan-100 dark:bg-cyan-900/30",      text: "text-cyan-700 dark:text-cyan-400",      dot: "bg-cyan-500" },
  other:            { bg: "bg-zinc-100 dark:bg-zinc-900/30",      text: "text-zinc-700 dark:text-zinc-400",      dot: "bg-zinc-500" },
};

const equipmentStyle = { bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-400" };
const irrigationStyle = { bg: "bg-sky-50 dark:bg-sky-900/20", text: "text-sky-700 dark:text-sky-400", dot: "bg-sky-400" };

const categoryLabels: Record<string, string> = {
  mowing: "Mowing",
  irrigation: "Irrigation",
  chemical: "Chemical",
  mechanical: "Mechanical",
  landscaping: "Landscaping",
  construction: "Construction",
  bunker: "Bunker",
  greens: "Greens",
  admin: "Admin",
  safety: "Safety",
  events: "Events",
  pro_shop: "Pro Shop",
  customer_service: "Customer Service",
  other: "Other",
};

// ── Date helpers ──

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Component ──

export default function MaintenanceCalendarPage() {
  const router = useRouter();
  const supabase = createClient();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => getMonday(new Date()));
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [equipment, setEquipment] = useState<CalendarEquipment[]>([]);
  const [irrigationEvents, setIrrigationEvents] = useState<IrrigationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  // Compute visible date range
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const start = getMonday(anchorDate);
      const end = addDays(start, 6);
      return { start, end };
    }
    // Month view: get full calendar grid (Mon start)
    const monthStart = getMonthStart(anchorDate);
    const monthEnd = getMonthEnd(anchorDate);
    const calStart = getMonday(monthStart);
    // End on the Sunday after the month ends
    const endDay = monthEnd.getDay();
    const calEnd = endDay === 0 ? monthEnd : addDays(monthEnd, 7 - endDay);
    return { start: calStart, end: calEnd };
  }, [viewMode, anchorDate]);

  // Fetch data when date range changes
  const startStr = formatDate(dateRange.start);
  const endStr = formatDate(dateRange.end);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [tasksRes, equipRes, irrRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, category, priority, status, due_date, assigned_user:profiles!tasks_assigned_to_fkey(full_name)")
          .gte("due_date", startStr)
          .lte("due_date", endStr)
          .order("due_date"),
        supabase
          .from("equipment")
          .select("id, name, next_service_due_date")
          .not("next_service_due_date", "is", null)
          .gte("next_service_due_date", startStr)
          .lte("next_service_due_date", endStr),
        supabase
          .from("irrigation_schedules")
          .select("id, zone:irrigation_zones(name), day_of_week, start_time, run_minutes")
          .eq("enabled", true),
      ]);
      if (cancelled) return;
      setTasks((tasksRes.data as CalendarTask[] | null) ?? []);
      setEquipment((equipRes.data as CalendarEquipment[] | null) ?? []);

      const irrData = (irrRes.data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        zone_name: (row.zone as { name: string } | null)?.name ?? "Unknown Zone",
        day_of_week: row.day_of_week as number[],
        start_time: row.start_time as string,
        run_minutes: row.run_minutes as number,
      }));
      setIrrigationEvents(irrData);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr]);

  // Build events grouped by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    const addEvent = (dateStr: string, evt: CalendarEvent) => {
      const arr = map.get(dateStr) ?? [];
      arr.push(evt);
      map.set(dateStr, arr);
    };

    for (const t of tasks) {
      if (!showCompleted && (t.status === "completed" || t.status === "verified" || t.status === "cancelled")) continue;
      if (hiddenCategories.has(t.category)) continue;
      addEvent(t.due_date, { type: "task", data: t });
    }

    for (const eq of equipment) {
      if (hiddenCategories.has("_equipment")) continue;
      addEvent(eq.next_service_due_date, { type: "equipment", data: eq });
    }

    // Irrigation: map day_of_week to actual dates in range
    if (!hiddenCategories.has("_irrigation")) {
      let cur = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      while (cur <= endDate) {
        const jsDay = cur.getDay(); // 0=Sun
        for (const irr of irrigationEvents) {
          if (irr.day_of_week.includes(jsDay)) {
            addEvent(formatDate(cur), {
              type: "irrigation",
              data: { ...irr, date: formatDate(cur) },
            });
          }
        }
        cur = addDays(cur, 1);
      }
    }

    return map;
  }, [tasks, equipment, irrigationEvents, showCompleted, hiddenCategories, dateRange]);

  // Navigation
  const goToday = () => setAnchorDate(viewMode === "week" ? getMonday(new Date()) : getMonthStart(new Date()));

  const goPrev = () => {
    if (viewMode === "week") {
      setAnchorDate(addDays(anchorDate, -7));
    } else {
      const d = new Date(anchorDate);
      d.setMonth(d.getMonth() - 1);
      setAnchorDate(d);
    }
  };

  const goNext = () => {
    if (viewMode === "week") {
      setAnchorDate(addDays(anchorDate, 7));
    } else {
      const d = new Date(anchorDate);
      d.setMonth(d.getMonth() + 1);
      setAnchorDate(d);
    }
  };

  const headerLabel =
    viewMode === "week"
      ? `${dateRange.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${dateRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;

  // Toggle category filter
  const toggleCategory = (cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Click event pill
  const handleEventClick = (evt: CalendarEvent) => {
    if (evt.type === "task") router.push(`/tasks/${evt.data.id}`);
    else if (evt.type === "equipment") router.push(`/equipment/${evt.data.id}`);
    else if (evt.type === "irrigation") router.push("/irrigation");
  };

  // Week dates
  const weekDates = useMemo(() => {
    const dates: Date[] = [];
    const start = getMonday(anchorDate);
    for (let i = 0; i < 7; i++) dates.push(addDays(start, i));
    return dates;
  }, [anchorDate]);

  // Month grid dates
  const monthDates = useMemo(() => {
    if (viewMode !== "month") return [];
    const dates: Date[] = [];
    let cur = new Date(dateRange.start);
    while (cur <= dateRange.end) {
      dates.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    return dates;
  }, [viewMode, dateRange]);

  const today = new Date();

  // Click day in month view -> switch to week view
  const handleDayClick = (d: Date) => {
    if (viewMode === "month") {
      setAnchorDate(getMonday(d));
      setViewMode("week");
    }
  };

  // Active categories for legend
  const allCategories = Object.keys(categoryLabels);

  // ── Render ──

  return (
    <div className="pb-20 md:pb-6">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <DetailPageHeader
          backHref="/schedule"
          title="Maintenance Calendar"
          subtitle="All scheduled work across the course"
        />

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* View toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => { setViewMode("week"); setAnchorDate(getMonday(anchorDate)); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => { setViewMode("month"); setAnchorDate(getMonthStart(anchorDate)); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goPrev} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[180px] text-center">{headerLabel}</span>
            <Button variant="ghost" size="icon" onClick={goNext} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={goToday} className="h-8">
            Today
          </Button>

          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 ml-auto"
          >
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            Filters
          </Button>
        </div>

        {/* Filters */}
        {showFilters && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCompleted}
                    onChange={() => setShowCompleted(!showCompleted)}
                    className="rounded border-border"
                  />
                  Show completed
                </label>
                <div className="w-px h-5 bg-border" />
                <span className="text-xs font-medium text-muted-foreground uppercase">Categories:</span>
                {allCategories.map((cat) => {
                  const colors = categoryColors[cat] ?? categoryColors.other;
                  const hidden = hiddenCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-opacity ${
                        hidden ? "opacity-30" : ""
                      } ${colors.bg} ${colors.text}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      {categoryLabels[cat]}
                    </button>
                  );
                })}
                <div className="w-px h-5 bg-border" />
                <button
                  onClick={() => toggleCategory("_equipment")}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-opacity ${
                    hiddenCategories.has("_equipment") ? "opacity-30" : ""
                  } ${equipmentStyle.bg} ${equipmentStyle.text}`}
                >
                  <Wrench className="w-3 h-3" />
                  Equipment Service
                </button>
                <button
                  onClick={() => toggleCategory("_irrigation")}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-opacity ${
                    hiddenCategories.has("_irrigation") ? "opacity-30" : ""
                  } ${irrigationStyle.bg} ${irrigationStyle.text}`}
                >
                  <Droplets className="w-3 h-3" />
                  Irrigation
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading calendar...
            </CardContent>
          </Card>
        ) : viewMode === "week" ? (
          /* ──── WEEK VIEW ──── */
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
                {/* Header row */}
                {weekDates.map((d, i) => {
                  const isToday = isSameDay(d, today);
                  return (
                    <div
                      key={i}
                      className={`p-2 text-center ${isToday ? "bg-primary/10" : "bg-muted/50"}`}
                    >
                      <p className="text-xs font-medium text-muted-foreground">{DAY_NAMES[i]}</p>
                      <p className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
                        {d.getDate()}
                      </p>
                    </div>
                  );
                })}

                {/* Content row */}
                {weekDates.map((d, i) => {
                  const dateStr = formatDate(d);
                  const events = eventsByDate.get(dateStr) ?? [];
                  const isToday = isSameDay(d, today);
                  return (
                    <div
                      key={`c-${i}`}
                      className={`min-h-[200px] p-1.5 space-y-1 ${isToday ? "bg-primary/5" : "bg-card"}`}
                    >
                      {events.map((evt, idx) => (
                        <EventPill key={idx} event={evt} onClick={() => handleEventClick(evt)} />
                      ))}
                      {events.length === 0 && (
                        <p className="text-xs text-muted-foreground/50 text-center pt-6">No events</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile: stacked days */}
            <div className="md:hidden space-y-3">
              {weekDates.map((d, i) => {
                const dateStr = formatDate(d);
                const events = eventsByDate.get(dateStr) ?? [];
                const isToday = isSameDay(d, today);
                return (
                  <Card key={i} className={isToday ? "border-primary/40" : ""}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                          {DAY_NAMES[i]}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        {isToday && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Today
                          </Badge>
                        )}
                        {events.length > 0 && (
                          <Badge variant="outline" className="ml-auto text-[10px]">
                            {events.length}
                          </Badge>
                        )}
                      </div>
                      {events.length > 0 ? (
                        <div className="space-y-1">
                          {events.map((evt, idx) => (
                            <EventPill key={idx} event={evt} onClick={() => handleEventClick(evt)} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No events</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          /* ──── MONTH VIEW ──── */
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            {/* Header */}
            <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
              {DAY_NAMES.map((name) => (
                <div key={name} className="p-2 text-center text-xs font-medium text-muted-foreground">
                  {name}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-border">
              {monthDates.map((d, i) => {
                const dateStr = formatDate(d);
                const events = eventsByDate.get(dateStr) ?? [];
                const isToday = isSameDay(d, today);
                const isCurrentMonth = d.getMonth() === anchorDate.getMonth();

                // Count by type
                const taskCount = events.filter((e) => e.type === "task").length;
                const eqCount = events.filter((e) => e.type === "equipment").length;
                const irrCount = events.filter((e) => e.type === "irrigation").length;

                // Unique category dots
                const dots = new Set<string>();
                for (const e of events) {
                  if (e.type === "task") dots.add(e.data.category);
                  else if (e.type === "equipment") dots.add("_equipment");
                  else dots.add("_irrigation");
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleDayClick(d)}
                    className={`min-h-[80px] md:min-h-[100px] p-1.5 text-left transition-colors hover:bg-muted/50 ${
                      isToday ? "bg-primary/5" : "bg-card"
                    } ${!isCurrentMonth ? "opacity-40" : ""}`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : ""
                      }`}
                    >
                      {d.getDate()}
                    </span>

                    {events.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {taskCount > 0 && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {taskCount} task{taskCount !== 1 ? "s" : ""}
                          </p>
                        )}
                        {eqCount > 0 && (
                          <p className="text-[10px] text-orange-600 dark:text-orange-400 truncate">
                            {eqCount} service
                          </p>
                        )}
                        {irrCount > 0 && (
                          <p className="text-[10px] text-sky-600 dark:text-sky-400 truncate hidden md:block">
                            {irrCount} irrigation
                          </p>
                        )}
                        {/* Category dots */}
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {Array.from(dots)
                            .slice(0, 5)
                            .map((cat) => {
                              const style =
                                cat === "_equipment"
                                  ? equipmentStyle
                                  : cat === "_irrigation"
                                  ? irrigationStyle
                                  : categoryColors[cat] ?? categoryColors.other;
                              return (
                                <span key={cat} className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium mr-1">Legend:</span>
          {allCategories.map((cat) => {
            const c = categoryColors[cat] ?? categoryColors.other;
            return (
              <span key={cat} className="inline-flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                <span className="text-muted-foreground">{categoryLabels[cat]}</span>
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${equipmentStyle.dot}`} />
            <span className="text-muted-foreground">Equipment Service</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${irrigationStyle.dot}`} />
            <span className="text-muted-foreground">Irrigation</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Event pill ──

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  if (event.type === "task") {
    const t = event.data;
    const colors = categoryColors[t.category] ?? categoryColors.other;
    return (
      <button
        onClick={onClick}
        className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium truncate flex items-center gap-1 transition-opacity hover:opacity-80 ${colors.bg} ${colors.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
        <span className="truncate">{t.title}</span>
        {t.assigned_user && (
          <span className="ml-auto text-[10px] opacity-70 shrink-0">
            {getInitials(t.assigned_user.full_name)}
          </span>
        )}
      </button>
    );
  }

  if (event.type === "equipment") {
    const eq = event.data;
    return (
      <button
        onClick={onClick}
        className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium truncate flex items-center gap-1 border border-orange-300 dark:border-orange-700 transition-opacity hover:opacity-80 ${equipmentStyle.bg} ${equipmentStyle.text}`}
      >
        <Wrench className="w-3 h-3 shrink-0" />
        <span className="truncate">{eq.name}</span>
      </button>
    );
  }

  // irrigation
  const irr = event.data;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium truncate flex items-center gap-1 transition-opacity hover:opacity-80 ${irrigationStyle.bg} ${irrigationStyle.text}`}
    >
      <Droplets className="w-3 h-3 shrink-0" />
      <span className="truncate">{irr.zone_name}</span>
      <span className="ml-auto text-[10px] opacity-70 shrink-0">
        {irr.start_time?.slice(0, 5)}
      </span>
    </button>
  );
}
