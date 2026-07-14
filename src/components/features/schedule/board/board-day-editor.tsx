"use client";

import { useMemo, useState } from "react";
import { Inbox, User, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ScheduleBoard, BoardCell } from "@/lib/hooks/useScheduleBoard";
import { getBoardCell } from "@/lib/hooks/useScheduleBoard";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { TaskPriority, TaskStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const BACKLOG_VALUE = "__backlog__";

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  normal: "border-l-green-500",
  low: "border-l-gray-400",
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
];

interface BoardDayEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: ScheduleBoard | null;
  date: string;
  // Same mutators that power the desktop board.
  onAssign: (taskId: string, userId: string, date: string) => Promise<boolean>;
  onUnassign: (taskId: string) => Promise<boolean>;
  onSetStatus: (taskId: string, status: TaskStatus) => Promise<boolean>;
}

function formatLongDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function isWorkingCell(cell: BoardCell): boolean {
  if (cell.isTimeOff) return false;
  if (!cell.shift?.shift_type) return false;
  return cell.shift.shift_type !== "off";
}

export function BoardDayEditor({
  open,
  onOpenChange,
  board,
  date,
  onAssign,
  onUnassign,
  onSetStatus,
}: BoardDayEditorProps) {
  // All tasks scheduled to this date, grouped with their current assignee.
  // The mobile super day-editor doesn't show the templates rail — they're
  // dragged from the schedule grid; here we only re-assign or change the
  // status of tasks that already exist for the day.
  const tasksForDay = useMemo(() => {
    if (!board) return [];
    const out: { task: TaskWithRelations; assigneeId: string | null }[] = [];
    for (const c of board.crew) {
      const cell = getBoardCell(board, c.id, date);
      for (const t of cell.tasks) {
        out.push({ task: t, assigneeId: c.id });
      }
    }
    return out;
  }, [board, date]);

  // Crew members eligible as assignees: those scheduled to work that day,
  // plus any crew member who already has a task on it (so we don't drop
  // them from the dropdown if they got a task before getting a shift).
  const eligibleCrew = useMemo(() => {
    if (!board) return [];
    const set = new Set<string>();
    for (const c of board.crew) {
      const cell = getBoardCell(board, c.id, date);
      if (isWorkingCell(cell) || cell.tasks.length > 0) set.add(c.id);
    }
    return board.crew.filter((c) => !c.isExternal && set.has(c.id));
  }, [board, date]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[90vh] sm:max-w-none p-0 flex flex-col rounded-t-xl"
      >
        <SheetTitle className="sr-only">
          Edit assignments for {formatLongDate(date)}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Reassign tasks across crew members or change status.
        </SheetDescription>

        <div className="px-4 py-3 border-b border-border">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Edit day
          </div>
          <div className="text-base font-semibold">{formatLongDate(date)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {tasksForDay.length} task
            {tasksForDay.length === 1 ? "" : "s"} ·{" "}
            {eligibleCrew.length} crew working
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {tasksForDay.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              No tasks on this day and the backlog is empty.
            </div>
          ) : (
            <ul className="space-y-2">
              {tasksForDay.map(({ task, assigneeId }) => (
                <li key={task.id}>
                  <DayEditorTaskRow
                    task={task}
                    assigneeId={assigneeId}
                    eligibleCrew={eligibleCrew}
                    date={date}
                    onAssign={onAssign}
                    onUnassign={onUnassign}
                    onSetStatus={onSetStatus}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

interface DayEditorTaskRowProps {
  task: TaskWithRelations;
  assigneeId: string | null;
  eligibleCrew: ScheduleBoard["crew"];
  date: string;
  onAssign: (taskId: string, userId: string, date: string) => Promise<boolean>;
  onUnassign: (taskId: string) => Promise<boolean>;
  onSetStatus: (taskId: string, status: TaskStatus) => Promise<boolean>;
}

function DayEditorTaskRow({
  task,
  assigneeId,
  eligibleCrew,
  date,
  onAssign,
  onUnassign,
  onSetStatus,
}: DayEditorTaskRowProps) {
  const [busy, setBusy] = useState(false);

  const handleAssigneeChange = async (value: string) => {
    setBusy(true);
    if (value === BACKLOG_VALUE) {
      await onUnassign(task.id);
    } else {
      await onAssign(task.id, value, date);
    }
    setBusy(false);
  };

  const handleStatusChange = async (value: string) => {
    setBusy(true);
    await onSetStatus(task.id, value as TaskStatus);
    setBusy(false);
  };

  return (
    <div
      className={cn(
        "border border-border border-l-[3px] rounded-md bg-card p-3 space-y-2",
        PRIORITY_BORDER[task.priority],
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm font-medium leading-tight flex-1 min-w-0 break-words">
          {task.title}
        </span>
        {busy && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {task.zone?.name && (
        <div className="text-xs text-muted-foreground">{task.zone.name}</div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Assignee
          </label>
          <Select
            value={assigneeId ?? BACKLOG_VALUE}
            onValueChange={handleAssigneeChange}
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BACKLOG_VALUE}>
                <span className="flex items-center gap-1.5 text-destructive">
                  <Inbox className="w-3 h-3" />
                  Remove from schedule
                </span>
              </SelectItem>
              {eligibleCrew.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    {c.display_name || c.full_name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Status
          </label>
          <Select
            value={task.status}
            onValueChange={handleStatusChange}
            disabled={busy}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
