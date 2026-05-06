"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Inbox,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sunrise,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwipeableRow } from "@/components/ui/swipeable-row";
import {
  formatShiftTime,
  shiftTypeLabels,
} from "@/lib/hooks/useSchedule";
import type { ScheduleBoard, BoardCell } from "@/lib/hooks/useScheduleBoard";
import { getBoardCell } from "@/lib/hooks/useScheduleBoard";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { ShiftType, TaskPriority, TaskStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  normal: "border-l-green-500",
  low: "border-l-gray-400",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const SHIFT_BG: Record<ShiftType, string> = {
  morning: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  afternoon: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  split: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  full: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  on_call: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  off: "bg-gray-400/15 text-gray-600 dark:text-gray-400 border-gray-400/30",
};

interface BoardTodayViewProps {
  board: ScheduleBoard;
  userId: string;
  // Currently-displayed date (a member of board.dates).
  date: string;
  onPrevDay: () => void;
  onNextDay: () => void;
  onTaskClick: (task: TaskWithRelations) => void;
  onSetTaskStatus: (taskId: string, status: TaskStatus) => Promise<boolean>;
  // Manager users get a button to switch to the full-edit view (step 10).
  isManager?: boolean;
  onOpenDayEditor?: () => void;
}

function formatLongDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function BoardTodayView({
  board,
  userId,
  date,
  onPrevDay,
  onNextDay,
  onTaskClick,
  onSetTaskStatus,
  isManager,
  onOpenDayEditor,
}: BoardTodayViewProps) {
  const cell: BoardCell = useMemo(
    () => getBoardCell(board, userId, date),
    [board, userId, date],
  );
  const tasks = useMemo(() => {
    return [...cell.tasks].sort((a, b) => {
      const r: Record<TaskPriority, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      return r[a.priority] - r[b.priority];
    });
  }, [cell.tasks]);

  const remaining = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "verified",
  ).length;

  return (
    <div className="space-y-3">
      {/* Day navigator — always enabled; the page handles cross-week rollover. */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrevDay}
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <div className="text-base font-semibold">{formatLongDate(date)}</div>
          <div className="text-xs text-muted-foreground">
            {tasks.length === 0
              ? "No tasks"
              : `${remaining} remaining of ${tasks.length}`}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNextDay}
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Shift / time-off banner */}
      <ShiftBanner cell={cell} />

      {/* Manager affordance */}
      {isManager && onOpenDayEditor && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onOpenDayEditor}
        >
          Edit assignments for this day
        </Button>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-sm text-muted-foreground">
          {cell.isTimeOff
            ? "Enjoy your time off."
            : "No tasks assigned for this day."}
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <TodayTaskRow
                task={t}
                onClick={() => onTaskClick(t)}
                onComplete={async () => {
                  const next: TaskStatus =
                    t.status === "completed" ? "in_progress" : "completed";
                  await onSetTaskStatus(t.id, next);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function ShiftBanner({ cell }: { cell: BoardCell }) {
  if (cell.isTimeOff) {
    return (
      <div className="rounded-md border border-gray-400/30 bg-gray-400/10 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Inbox className="w-4 h-4" />
        Approved time off
      </div>
    );
  }
  if (!cell.shift?.shift_type) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        No shift set for this day
      </div>
    );
  }
  const t = cell.shift.shift_type;
  const time = formatShiftTime(cell.shift.shift_start, cell.shift.shift_end);
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm flex items-center gap-2",
        SHIFT_BG[t],
      )}
    >
      <Sunrise className="w-4 h-4" />
      <span className="font-medium">{shiftTypeLabels[t]}</span>
      {time && <span className="text-xs opacity-80">· {time}</span>}
    </div>
  );
}

interface TodayTaskRowProps {
  task: TaskWithRelations;
  onClick: () => void;
  onComplete: () => Promise<void> | void;
}

function TodayTaskRow({ task, onClick, onComplete }: TodayTaskRowProps) {
  const isDone = task.status === "completed" || task.status === "verified";
  const isInProgress = task.status === "in_progress";
  const isBlocked = task.status === "blocked";
  const zoneLabel = task.zone?.name;
  const holes =
    Array.isArray(task.hole_numbers) && task.hole_numbers.length > 0
      ? task.hole_numbers.join(", ")
      : null;

  return (
    <SwipeableRow
      leftAction={{
        icon: <CheckCircle2 className="w-5 h-5" />,
        label: isDone ? "Reopen" : "Complete",
        color: isDone ? "bg-amber-500" : "bg-green-500",
        onAction: () => void onComplete(),
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={cn(
          "border border-border border-l-[3px] rounded-md bg-card px-3 py-2.5",
          "flex gap-3 items-start cursor-pointer hover:bg-accent/30 transition-colors",
          PRIORITY_BORDER[task.priority],
          isDone && "opacity-60",
        )}
      >
        {/* Toggle checkbox — separate touch target so users can complete
            without navigating into the task. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onComplete();
          }}
          aria-label={isDone ? "Mark incomplete" : "Mark complete"}
          className={cn(
            "shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            isDone
              ? "bg-green-600 border-green-600 text-white"
              : "border-border hover:border-primary",
          )}
        >
          {isDone && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-sm font-medium leading-tight",
              isDone && "line-through",
            )}
          >
            {task.title}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              {isInProgress && <Clock className="w-3 h-3 text-blue-500" />}
              {isBlocked && <AlertTriangle className="w-3 h-3 text-red-500" />}
              {PRIORITY_LABEL[task.priority]}
            </span>
            {zoneLabel && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />
                {zoneLabel}
              </span>
            )}
            {holes && <span>Holes {holes}</span>}
            {task.estimated_minutes != null && (
              <span>{task.estimated_minutes}m</span>
            )}
          </div>
        </div>
      </div>
    </SwipeableRow>
  );
}
