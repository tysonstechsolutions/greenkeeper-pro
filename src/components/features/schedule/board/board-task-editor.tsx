"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Inbox,
  Trash2,
  ExternalLink,
  Calendar,
  CalendarX,
  Repeat,
  MapPin,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { TaskCategory, TaskPriority, TaskStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  normal: "bg-green-500/10 text-green-700 dark:text-green-400",
  low: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  verified: "Verified",
  blocked: "Blocked",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

const CATEGORY_LABEL: Record<TaskCategory, string> = {
  mowing: "Mowing",
  irrigation: "Irrigation",
  chemical: "Chemical",
  mechanical: "Mechanical",
  landscaping: "Landscaping",
  construction: "Construction",
  bunker: "Bunker",
  greens: "Greens",
  tees: "Tees",
  grounds: "Grounds",
  admin: "Admin",
  safety: "Safety",
  other: "Other",
  pro_shop: "Pro Shop",
  events: "Events",
  customer_service: "Customer Service",
};

interface BoardTaskEditorProps {
  task: TaskWithRelations;
  onSetStatus: (taskId: string, status: TaskStatus) => Promise<boolean>;
  onUnassign: (taskId: string) => Promise<boolean>;
  /** Delete this occurrence + all future ones in its series. */
  onDeleteSeries: (taskId: string) => Promise<boolean>;
  // Reschedule == change due_date but keep assignee. We reuse assignTask
  // since that mutator already updates due_date.
  onReschedule: (taskId: string, userId: string, date: string) => Promise<boolean>;
  onClose: () => void;
}

export function BoardTaskEditor({
  task,
  onSetStatus,
  onUnassign,
  onDeleteSeries,
  onReschedule,
  onClose,
}: BoardTaskEditorProps) {
  // State initializes once from props — the inspector remounts this
  // component (via `key={task.id}`) when switching tasks, which resets
  // the rescheduling input cleanly.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string>(task.due_date ?? "");

  const handleStatus = async (status: TaskStatus) => {
    if (task.status === status) return;
    setBusyAction(`status:${status}`);
    const ok = await onSetStatus(task.id, status);
    setBusyAction(null);
    // Don't auto-close on status change — user might want to do more.
    if (!ok) return;
  };

  const handleUnassign = async () => {
    setBusyAction("unassign");
    const ok = await onUnassign(task.id);
    setBusyAction(null);
    if (ok) onClose();
  };

  const handleDeleteSeries = async () => {
    setBusyAction("series");
    const ok = await onDeleteSeries(task.id);
    setBusyAction(null);
    if (ok) onClose();
  };

  const handleReschedule = async () => {
    if (!task.assigned_to || !newDate || newDate === task.due_date) return;
    setBusyAction("reschedule");
    const ok = await onReschedule(task.id, task.assigned_to, newDate);
    setBusyAction(null);
    if (ok) onClose();
  };

  const zoneLabel = task.zone?.name;
  const holes =
    Array.isArray(task.hole_numbers) && task.hole_numbers.length > 0
      ? task.hole_numbers.join(", ")
      : null;
  const assignedName = task.assigned_user?.full_name ?? "Unassigned";

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "shrink-0 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
              PRIORITY_COLOR[task.priority],
            )}
          >
            {PRIORITY_LABEL[task.priority]}
          </span>
          <h3 className="text-sm font-semibold leading-tight flex-1 min-w-0 break-words">
            {task.title}
          </h3>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>{CATEGORY_LABEL[task.category]}</span>
          <span>·</span>
          <span>{STATUS_LABEL[task.status]}</span>
          <span>·</span>
          <span>Assigned: {assignedName}</span>
        </div>
      </div>

      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-4">
        {/* Quick status actions */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <StatusButton
              status="pending"
              icon={Inbox}
              current={task.status}
              busy={busyAction === "status:pending"}
              onClick={handleStatus}
            />
            <StatusButton
              status="in_progress"
              icon={Clock}
              current={task.status}
              busy={busyAction === "status:in_progress"}
              onClick={handleStatus}
            />
            <StatusButton
              status="completed"
              icon={CheckCircle2}
              current={task.status}
              busy={busyAction === "status:completed"}
              onClick={handleStatus}
            />
            <StatusButton
              status="blocked"
              icon={AlertTriangle}
              current={task.status}
              busy={busyAction === "status:blocked"}
              onClick={handleStatus}
            />
          </div>
        </div>

        {/* Reschedule */}
        {task.assigned_to && (
          <div className="space-y-1.5">
            <Label htmlFor="board-task-reschedule">Reschedule</Label>
            <div className="flex gap-1.5">
              <Input
                id="board-task-reschedule"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleReschedule}
                disabled={
                  !newDate ||
                  newDate === task.due_date ||
                  busyAction === "reschedule"
                }
              >
                {busyAction === "reschedule" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                Move
              </Button>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-2 text-xs text-muted-foreground">
          {task.description && (
            <div>
              <div className="text-foreground font-medium mb-0.5">Description</div>
              <div className="whitespace-pre-line">{task.description}</div>
            </div>
          )}
          {(zoneLabel || holes) && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                {zoneLabel && <div>{zoneLabel}</div>}
                {holes && <div>Holes: {holes}</div>}
              </div>
            </div>
          )}
          {task.estimated_minutes != null && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Est. {task.estimated_minutes} min
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
        {task.assigned_to && task.series_id && (
          <>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Repeat className="w-3 h-3" />
              Repeating task — choose what to remove
            </div>
            <Button
              variant="outline"
              onClick={handleUnassign}
              disabled={!!busyAction}
              className="w-full text-destructive hover:bg-destructive/10"
            >
              {busyAction === "unassign" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Remove just this day
            </Button>
            <Button
              variant="outline"
              onClick={handleDeleteSeries}
              disabled={!!busyAction}
              className="w-full text-destructive hover:bg-destructive/10"
            >
              {busyAction === "series" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CalendarX className="w-4 h-4" />
              )}
              Remove this &amp; all future
            </Button>
          </>
        )}
        {task.assigned_to && !task.series_id && (
          <Button
            variant="outline"
            onClick={handleUnassign}
            disabled={!!busyAction}
            className="w-full text-destructive hover:bg-destructive/10"
          >
            {busyAction === "unassign" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Remove from schedule
          </Button>
        )}
        <Link
          href={`/tasks/edit?id=${task.id}`}
          onClick={onClose}
          className="w-full"
        >
          <Button variant="ghost" className="w-full">
            <ExternalLink className="w-4 h-4" />
            Edit full task
          </Button>
        </Link>
      </div>
    </div>
  );
}

interface StatusButtonProps {
  status: TaskStatus;
  icon: typeof Inbox;
  current: TaskStatus;
  busy: boolean;
  onClick: (status: TaskStatus) => void;
}

function StatusButton({ status, icon: Icon, current, busy, onClick }: StatusButtonProps) {
  const isActive = current === status;
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={() => onClick(status)}
      disabled={busy}
      className="text-xs justify-start"
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" />
      )}
      {STATUS_LABEL[status]}
    </Button>
  );
}
