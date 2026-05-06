"use client";

import { Plus } from "lucide-react";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { Schedule } from "@/types/database";
import { BoardShiftBand } from "./board-shift-band";
import { BoardTaskChip } from "./board-task-chip";
import { cn } from "@/lib/utils";

interface BoardCellProps {
  userId: string;
  date: string;
  shift: Schedule | null;
  tasks: TaskWithRelations[];
  isTimeOff: boolean;
  isToday?: boolean;
  // Step-3 hooks (drag-drop). Wired in step 3; provided as optional now so
  // the cell renders identically in the read-only preview.
  onShiftClick?: () => void;
  onTaskClick?: (taskId: string) => void;
  onAddTaskClick?: () => void;
  onTaskDragStart?: (taskId: string, e: React.DragEvent) => void;
  onTaskDragEnd?: (taskId: string, e: React.DragEvent) => void;
  onCellDragOver?: (e: React.DragEvent) => void;
  onCellDrop?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
  draggingTaskId?: string | null;
}

export function BoardCell({
  userId,
  date,
  shift,
  tasks,
  isTimeOff,
  isToday,
  onShiftClick,
  onTaskClick,
  onAddTaskClick,
  onTaskDragStart,
  onTaskDragEnd,
  onCellDragOver,
  onCellDrop,
  isDropTarget,
  draggingTaskId,
}: BoardCellProps) {
  const dimmed = isTimeOff;

  return (
    <div
      data-cell-key={`${userId}|${date}`}
      onDragOver={onCellDragOver}
      onDrop={onCellDrop}
      className={cn(
        "flex flex-col min-h-[100px] border-r border-b border-border",
        "transition-colors",
        isToday && "bg-primary/[0.02]",
        isDropTarget && "bg-primary/10 outline outline-2 outline-primary/40 outline-offset-[-2px]",
        dimmed && !isDropTarget && "bg-muted/30",
      )}
    >
      <BoardShiftBand
        shift={shift}
        isTimeOff={isTimeOff}
        onClick={onShiftClick}
      />

      <div className="flex-1 p-1.5 flex flex-col gap-1 overflow-hidden">
        {tasks.length === 0 ? (
          onAddTaskClick ? (
            <button
              type="button"
              onClick={onAddTaskClick}
              className={cn(
                "flex-1 flex items-center justify-center",
                "text-muted-foreground/40 text-xs",
                "rounded hover:bg-accent/30 transition-colors",
              )}
              aria-label="Add task"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex-1" aria-hidden="true" />
          )
        ) : (
          <>
            {tasks.map((t) => (
              <BoardTaskChip
                key={t.id}
                task={t}
                onClick={onTaskClick ? () => onTaskClick(t.id) : undefined}
                draggable={!!onTaskDragStart}
                onDragStart={
                  onTaskDragStart ? (e) => onTaskDragStart(t.id, e) : undefined
                }
                onDragEnd={
                  onTaskDragEnd ? (e) => onTaskDragEnd(t.id, e) : undefined
                }
                isDragging={draggingTaskId === t.id}
              />
            ))}
            {onAddTaskClick && (
              <button
                type="button"
                onClick={onAddTaskClick}
                className="text-muted-foreground/40 hover:text-muted-foreground text-[11px] py-0.5 flex items-center justify-center gap-1 rounded hover:bg-accent/30"
                aria-label="Add task"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
