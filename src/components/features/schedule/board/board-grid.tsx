"use client";

import { useMemo } from "react";
import { User } from "lucide-react";
import type { ScheduleBoard, BoardCell as BoardCellData } from "@/lib/hooks/useScheduleBoard";
import { getBoardCell, SUN_DAY_LABELS } from "@/lib/hooks/useScheduleBoard";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import type { UserRole } from "@/types/database";
import { roleLabels } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils";
import { BoardCell } from "./board-cell";

// Role grouping order. Same as ROLE_SORT in the hook — duplicated here so
// we can iterate group-by-group for the section headers.
const ROLE_GROUP_ORDER: UserRole[] = [
  "super",
  "gm",
  "director",
  "asst_super",
  "pro",
  "foreman",
  "mechanic",
  "crew",
  "seasonal",
];

function isToday(dateString: string): boolean {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return dateString === todayStr;
}

function formatDateHeader(dateString: string): { dayName: string; dateLabel: string } {
  const d = new Date(dateString + "T00:00:00");
  const dayName = SUN_DAY_LABELS[d.getDay()];
  const dateLabel = `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
  return { dayName, dateLabel };
}

interface BoardGridProps {
  board: ScheduleBoard;
  // Step 3+: cell interaction handlers. Optional so step 2's read-only
  // preview compiles without them.
  onShiftClick?: (userId: string, date: string) => void;
  onTaskClick?: (task: TaskWithRelations) => void;
  onAddTaskClick?: (userId: string, date: string) => void;
  onTaskDragStart?: (taskId: string, e: React.DragEvent) => void;
  onTaskDragEnd?: (taskId: string, e: React.DragEvent) => void;
  onCellDragOver?: (userId: string, date: string, e: React.DragEvent) => void;
  onCellDrop?: (userId: string, date: string, e: React.DragEvent) => void;
  draggingTaskId?: string | null;
  dropTargetKey?: string | null; // `${userId}|${date}` of the current hover target
}

export function BoardGrid({
  board,
  onShiftClick,
  onTaskClick,
  onAddTaskClick,
  onTaskDragStart,
  onTaskDragEnd,
  onCellDragOver,
  onCellDrop,
  draggingTaskId,
  dropTargetKey,
}: BoardGridProps) {
  // Group crew by role for the section headers.
  const groupedCrew = useMemo(() => {
    const byRole = new Map<UserRole, ScheduleBoard["crew"]>();
    for (const p of board.crew) {
      const arr = byRole.get(p.role) ?? [];
      arr.push(p);
      byRole.set(p.role, arr);
    }
    return ROLE_GROUP_ORDER.flatMap((role) => {
      const members = byRole.get(role);
      if (!members || members.length === 0) return [];
      return [{ role, members }];
    });
  }, [board.crew]);

  const dateHeaders = useMemo(
    () => board.dates.map((d) => ({ date: d, ...formatDateHeader(d) })),
    [board.dates],
  );

  // CSS-grid template: 1 row-header column + 7 day columns.
  // Tailwind-arbitrary syntax for the template since we generate it once.
  const gridTemplate = "grid-cols-[200px_repeat(7,minmax(140px,1fr))]";

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      {/* Header row: empty corner + 7 day labels. Sticky to top of scroll area. */}
      <div
        className={cn(
          "grid sticky top-0 z-20 bg-background border-b border-border",
          gridTemplate,
        )}
      >
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-r border-border">
          Crew
        </div>
        {dateHeaders.map(({ date, dayName, dateLabel }) => (
          <div
            key={date}
            className={cn(
              "px-3 py-2 text-xs border-r border-border last:border-r-0",
              "flex flex-col items-center",
              isToday(date) && "bg-primary/5",
            )}
          >
            <span className={cn(
              "font-semibold uppercase tracking-wider",
              isToday(date) ? "text-primary" : "text-muted-foreground",
            )}>
              {dayName}
            </span>
            <span className={cn(
              "text-[11px]",
              isToday(date) ? "text-primary font-medium" : "text-muted-foreground/80",
            )}>
              {dateLabel}
            </span>
          </div>
        ))}
      </div>

      {board.crew.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          No active crew members yet.
        </div>
      ) : (
        groupedCrew.map(({ role, members }) => (
          <div key={role}>
            {/* Role section header */}
            <div className={cn("grid border-b border-border bg-muted/40", gridTemplate)}>
              <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider col-span-8">
                {roleLabels[role]}
              </div>
            </div>

            {members.map((member) => (
              <div key={member.id} className={cn("grid", gridTemplate)}>
                {/* Row header: crew member */}
                <div className="px-3 py-2 border-r border-b border-border flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {member.display_name || member.full_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 truncate">
                      {roleLabels[member.role]}
                    </div>
                  </div>
                </div>

                {/* 7 day cells */}
                {board.dates.map((date) => {
                  const cell: BoardCellData = getBoardCell(board, member.id, date);
                  const cellKey = `${member.id}|${date}`;
                  return (
                    <BoardCell
                      key={date}
                      userId={member.id}
                      date={date}
                      shift={cell.shift}
                      tasks={cell.tasks}
                      isTimeOff={cell.isTimeOff}
                      isToday={isToday(date)}
                      onShiftClick={
                        onShiftClick ? () => onShiftClick(member.id, date) : undefined
                      }
                      onTaskClick={
                        onTaskClick
                          ? (taskId) => {
                              const t = cell.tasks.find((x) => x.id === taskId);
                              if (t) onTaskClick(t);
                            }
                          : undefined
                      }
                      onAddTaskClick={
                        onAddTaskClick
                          ? () => onAddTaskClick(member.id, date)
                          : undefined
                      }
                      onTaskDragStart={onTaskDragStart}
                      onTaskDragEnd={onTaskDragEnd}
                      onCellDragOver={
                        onCellDragOver
                          ? (e) => onCellDragOver(member.id, date, e)
                          : undefined
                      }
                      onCellDrop={
                        onCellDrop ? (e) => onCellDrop(member.id, date, e) : undefined
                      }
                      isDropTarget={dropTargetKey === cellKey}
                      draggingTaskId={draggingTaskId ?? null}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
