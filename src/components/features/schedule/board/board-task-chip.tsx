"use client";

import { CheckCircle2, Clock, AlertTriangle, MapPin } from "lucide-react";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { TaskPriority, TaskStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  normal: "border-l-green-500",
  low: "border-l-gray-400",
};

const STATUS_TINT: Record<TaskStatus, string> = {
  pending: "bg-card",
  in_progress: "bg-blue-500/5",
  completed: "bg-green-500/5",
  verified: "bg-primary/5",
  blocked: "bg-red-500/5",
  deferred: "bg-amber-500/5",
  cancelled: "bg-gray-400/5",
};

const STATUS_ICON: Partial<Record<TaskStatus, typeof CheckCircle2>> = {
  in_progress: Clock,
  completed: CheckCircle2,
  verified: CheckCircle2,
  blocked: AlertTriangle,
};

interface BoardTaskChipProps {
  task: TaskWithRelations;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  // Visually indicates this chip is being dragged.
  isDragging?: boolean;
  compact?: boolean;
}

export function BoardTaskChip({
  task,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  isDragging,
  compact,
}: BoardTaskChipProps) {
  const StatusIcon = STATUS_ICON[task.status];
  const zoneLabel = task.zone?.name;
  const isDone = task.status === "completed" || task.status === "verified";

  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "border border-border border-l-[3px] rounded px-2 py-1",
        "text-[11px] leading-tight",
        "flex flex-col gap-0.5 min-w-0",
        "select-none",
        PRIORITY_BORDER[task.priority],
        STATUS_TINT[task.status],
        interactive && "cursor-pointer hover:bg-accent/40",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        isDone && "line-through opacity-70",
        compact && "py-0.5",
      )}
      title={task.title + (zoneLabel ? ` · ${zoneLabel}` : "")}
    >
      <div className="flex items-center gap-1 min-w-0">
        {StatusIcon && (
          <StatusIcon className="w-3 h-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium truncate">{task.title}</span>
      </div>
      {!compact && zoneLabel && (
        <div className="flex items-center gap-0.5 text-muted-foreground truncate">
          <MapPin className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{zoneLabel}</span>
        </div>
      )}
    </div>
  );
}
