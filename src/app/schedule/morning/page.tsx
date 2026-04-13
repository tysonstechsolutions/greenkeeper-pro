"use client";

import { useState, useCallback } from "react";
import {
  Calendar,
  Loader2,
  RefreshCw,
  Thermometer,
  Droplets,
  Clock,
  Sunrise,
  Wind,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { MorningTimeline } from "@/components/features/schedule/morning-timeline";
import type { MorningRoute, RoutedTask } from "@/lib/ai/morning-router";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function MorningRoutePage() {
  const [date, setDate] = useState(getTomorrow());
  const [route, setRoute] = useState<MorningRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCrew, setExpandedCrew] = useState<Set<string>>(new Set());

  const generateRoute = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/morning-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data: MorningRoute = await res.json();
      setRoute(data);

      // Expand all crew by default
      const crewIds = new Set(data.routes.map((r) => r.crewMemberId));
      setExpandedCrew(crewIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate route");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const toggleCrew = (id: string) => {
    setExpandedCrew((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group routes by crew member for the breakdown
  const crewBreakdown = route
    ? Array.from(
        route.routes.reduce((map, r) => {
          const existing = map.get(r.crewMemberId);
          if (existing) {
            existing.tasks.push(r);
          } else {
            map.set(r.crewMemberId, {
              id: r.crewMemberId,
              name: r.crewMemberName,
              tasks: [r],
            });
          }
          return map;
        }, new Map<string, { id: string; name: string; tasks: RoutedTask[] }>())
      ).map(([, v]) => v)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24 md:pb-6">
      <PageHeader
        title="Morning Crew Routing"
        description="AI-planned crew schedule with frost, dew, and tee-time awareness"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Controls */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setRoute(null);
              }}
              className="border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <Button
            onClick={generateRoute}
            disabled={loading}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : route ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate Route
              </>
            ) : (
              "Generate Route"
            )}
          </Button>

          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(date)}
          </span>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Route generation failed
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI is planning the optimal morning route...
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Analyzing tasks, weather, frost/dew conditions, and tee times
            </p>
          </div>
        )}

        {/* Results */}
        {route && !loading && (
          <>
            {/* Conditions summary */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Morning Conditions
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div className="flex items-center gap-2">
                  <Sunrise className="h-4 w-4 text-amber-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Sunrise
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatTime(route.conditions.sunrise)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Thermometer
                    className={`h-4 w-4 ${route.conditions.frostDelayUntil ? "text-blue-500" : "text-gray-400"}`}
                  />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Frost Delay
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {route.conditions.frostDelayUntil
                        ? `Until ${formatTime(route.conditions.frostDelayUntil)}`
                        : "None"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-emerald-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Dew Burnoff
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatTime(route.conditions.dewBurnoffTime)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      First Tee
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatTime(route.conditions.firstTeeTime)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Wind className="h-4 w-4 text-gray-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Weather
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {Math.round(route.conditions.temperature_f)}&deg;F,{" "}
                      {Math.round(route.conditions.wind_mph)} mph
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Claude's summary */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                AI Route Summary
              </h2>
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                {route.summary}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                Generated at {new Date(route.generatedAt).toLocaleTimeString()} &mdash;{" "}
                {route.routes.length} tasks across {crewBreakdown.length} crew members
              </p>
            </div>

            {/* Timeline */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Crew Timeline
              </h2>
              <MorningTimeline
                routes={route.routes}
                conditions={route.conditions}
              />
            </div>

            {/* Per-crew breakdown */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Crew Breakdown
              </h2>
              {crewBreakdown.map((group) => {
                const isExpanded = expandedCrew.has(group.id);
                const totalMinutes = group.tasks.reduce((sum, t) => {
                  const start = new Date(t.startTime).getTime();
                  const end = new Date(t.endTime).getTime();
                  return sum + (end - start) / 60_000;
                }, 0);

                return (
                  <div
                    key={group.id}
                    className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCrew(group.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                          {group.name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {group.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {group.tasks.length} tasks &middot;{" "}
                            {Math.round(totalMinutes)} min total
                          </div>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-800">
                        {group.tasks
                          .sort(
                            (a, b) =>
                              new Date(a.startTime).getTime() -
                              new Date(b.startTime).getTime()
                          )
                          .map((task, i) => (
                            <div
                              key={task.taskId}
                              className={`px-4 py-3 flex items-start gap-3 ${
                                i > 0
                                  ? "border-t border-gray-100 dark:border-gray-800"
                                  : ""
                              }`}
                            >
                              <div className="text-xs text-gray-400 dark:text-gray-500 w-20 shrink-0 pt-0.5">
                                {formatTime(task.startTime)}
                                <br />
                                {formatTime(task.endTime)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {task.taskTitle}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {task.zone}
                                </div>
                                {task.notes && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">
                                    {task.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!route && !loading && !error && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-12 text-center">
            <Calendar className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select a date and click &quot;Generate Route&quot; to create an AI-optimized morning crew plan.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              The AI considers frost delays, dew burnoff, tee times, crew skills,
              and geographic grouping to optimize the schedule.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
