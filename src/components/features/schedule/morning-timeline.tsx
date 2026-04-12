"use client";

import { useMemo } from "react";
import type { RoutedTask, MorningConditions } from "@/lib/ai/morning-router";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface MorningTimelineProps {
  routes: RoutedTask[];
  conditions: MorningConditions;
  startHour?: number; // default 4 (4 AM)
  endHour?: number; // default 12 (noon)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHourFromISO(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const priorityColors: Record<string, { bg: string; border: string; text: string }> = {
  critical: {
    bg: "bg-red-100 dark:bg-red-900/30",
    border: "border-red-400 dark:border-red-600",
    text: "text-red-800 dark:text-red-200",
  },
  high: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-400 dark:border-amber-600",
    text: "text-amber-800 dark:text-amber-200",
  },
  normal: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    border: "border-emerald-400 dark:border-emerald-600",
    text: "text-emerald-800 dark:text-emerald-200",
  },
};

function getPriorityFromNotes(task: RoutedTask): string {
  // Infer priority from task title patterns or default to normal
  // The RoutedTask doesn't carry priority directly, so we check for keywords
  if (task.notes?.includes("critical") || task.taskTitle.toLowerCase().includes("urgent")) {
    return "critical";
  }
  if (task.notes?.includes("high")) {
    return "high";
  }
  return "normal";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MorningTimeline({
  routes,
  conditions,
  startHour = 4,
  endHour = 12,
}: MorningTimelineProps) {
  // Group routes by crew member
  const crewGroups = useMemo(() => {
    const map = new Map<string, { name: string; tasks: RoutedTask[] }>();
    for (const r of routes) {
      const existing = map.get(r.crewMemberId);
      if (existing) {
        existing.tasks.push(r);
      } else {
        map.set(r.crewMemberId, { name: r.crewMemberName, tasks: [r] });
      }
    }
    // Sort tasks within each crew member by start time
    for (const group of map.values()) {
      group.tasks.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    }
    return Array.from(map.values());
  }, [routes]);

  const totalHours = endHour - startHour;
  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => {
    const h = startHour + i;
    const ampm = h >= 12 ? "PM" : "AM";
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${display} ${ampm}`;
  });

  // Marker positions (as percentage)
  function hourToPercent(isoTime: string | null): number | null {
    if (!isoTime) return null;
    const h = getHourFromISO(isoTime);
    if (h < startHour || h > endHour) return null;
    return ((h - startHour) / totalHours) * 100;
  }

  const frostMarker = hourToPercent(conditions.frostDelayUntil);
  const dewMarker = hourToPercent(conditions.dewBurnoffTime);
  const teeMarker = hourToPercent(conditions.firstTeeTime);

  if (routes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No routes to display. Generate a morning route to see the timeline.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4 text-xs">
          {frostMarker !== null && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-blue-500 inline-block border-dashed border-t-2 border-blue-500" />
              Frost Delay End
            </span>
          )}
          {dewMarker !== null && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-green-500 inline-block border-dashed border-t-2 border-green-500" />
              Dew Burnoff
            </span>
          )}
          {teeMarker !== null && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-red-500 inline-block border-dashed border-t-2 border-red-500" />
              First Tee Time
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-100 border border-red-400 rounded-sm inline-block" />
            Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-amber-100 border border-amber-400 rounded-sm inline-block" />
            High
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-emerald-100 border border-emerald-400 rounded-sm inline-block" />
            Normal
          </span>
        </div>

        {/* Hour header */}
        <div className="flex">
          <div className="w-32 shrink-0" />
          <div className="flex-1 relative">
            <div className="flex">
              {hourLabels.map((label, i) => (
                <div
                  key={i}
                  className="text-xs text-gray-500 dark:text-gray-400"
                  style={{
                    position: "absolute",
                    left: `${(i / totalHours) * 100}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline rows */}
        <div className="mt-6 space-y-2">
          {crewGroups.map((group) => (
            <div key={group.name} className="flex items-stretch">
              {/* Crew member name */}
              <div className="w-32 shrink-0 pr-2 flex items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {group.name}
                </span>
              </div>

              {/* Timeline bar */}
              <div className="flex-1 relative h-10 bg-gray-100 dark:bg-gray-800 rounded-md overflow-visible">
                {/* Grid lines */}
                {hourLabels.map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"
                    style={{ left: `${(i / totalHours) * 100}%` }}
                  />
                ))}

                {/* Vertical markers */}
                {frostMarker !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10"
                    style={{
                      left: `${frostMarker}%`,
                      borderLeft: "2px dashed rgb(59, 130, 246)",
                      width: 0,
                    }}
                  />
                )}
                {dewMarker !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-10"
                    style={{
                      left: `${dewMarker}%`,
                      borderLeft: "2px dashed rgb(34, 197, 94)",
                      width: 0,
                    }}
                  />
                )}
                {teeMarker !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                    style={{
                      left: `${teeMarker}%`,
                      borderLeft: "2px dashed rgb(239, 68, 68)",
                      width: 0,
                    }}
                  />
                )}

                {/* Task blocks */}
                {group.tasks.map((task) => {
                  const taskStart = getHourFromISO(task.startTime);
                  const taskEnd = getHourFromISO(task.endTime);
                  const leftPct =
                    ((Math.max(taskStart, startHour) - startHour) / totalHours) * 100;
                  const widthPct =
                    ((Math.min(taskEnd, endHour) - Math.max(taskStart, startHour)) /
                      totalHours) *
                    100;

                  const priority = getPriorityFromNotes(task);
                  const colors = priorityColors[priority] || priorityColors.normal;

                  return (
                    <div
                      key={task.taskId}
                      className={`absolute top-1 bottom-1 rounded border ${colors.bg} ${colors.border} ${colors.text} flex items-center px-1 overflow-hidden cursor-pointer z-20 group`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 1)}%`,
                      }}
                      title={`${task.taskTitle}\n${task.zone}\n${formatTime(task.startTime)} - ${formatTime(task.endTime)}${task.notes ? `\n${task.notes}` : ""}`}
                    >
                      <span className="text-[10px] leading-tight truncate font-medium">
                        {task.taskTitle}
                      </span>

                      {/* Tooltip on hover */}
                      <div className="hidden group-hover:block absolute bottom-full left-0 mb-1 w-52 p-2 bg-white dark:bg-gray-900 rounded shadow-lg border border-gray-200 dark:border-gray-700 text-xs z-50">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {task.taskTitle}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          {task.zone}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          {formatTime(task.startTime)} - {formatTime(task.endTime)}
                        </div>
                        {task.notes && (
                          <div className="mt-1 text-gray-500 dark:text-gray-500 italic">
                            {task.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
