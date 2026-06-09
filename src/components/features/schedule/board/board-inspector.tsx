"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Schedule, ShiftType, TaskStatus } from "@/types/database";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";
import { BoardShiftEditor } from "./board-shift-editor";
import { BoardTaskEditor } from "./board-task-editor";

/**
 * Selection stores identifiers only — the inspector looks up live data
 * at render time so a board refresh after a save automatically shows
 * the latest state without an effect-driven sync.
 */
export type InspectorSelection =
  | { kind: "shift"; userId: string; date: string }
  | { kind: "task"; taskId: string };

interface ShiftLookup {
  userName: string;
  shift: Schedule | null;
  isTimeOff: boolean;
}

interface BoardInspectorProps {
  selection: InspectorSelection | null;
  onClose: () => void;
  // Live lookup callbacks. Return null if the entity disappeared (e.g.,
  // task deleted) — inspector closes itself in that case.
  resolveShift: (userId: string, date: string) => ShiftLookup | null;
  resolveTask: (taskId: string) => TaskWithRelations | null;
  onSaveShift: (
    userId: string,
    date: string,
    patch: {
      shift_type: ShiftType | null;
      shift_start: string | null;
      shift_end: string | null;
      notes: string | null;
    },
  ) => Promise<boolean>;
  onClearShift: (userId: string, date: string) => Promise<boolean>;
  onSetTaskStatus: (taskId: string, status: TaskStatus) => Promise<boolean>;
  onUnassignTask: (taskId: string) => Promise<boolean>;
  onDeleteSeries: (taskId: string) => Promise<boolean>;
  onRescheduleTask: (
    taskId: string,
    userId: string,
    date: string,
  ) => Promise<boolean>;
}

export function BoardInspector({
  selection,
  onClose,
  resolveShift,
  resolveTask,
  onSaveShift,
  onClearShift,
  onSetTaskStatus,
  onUnassignTask,
  onDeleteSeries,
  onRescheduleTask,
}: BoardInspectorProps) {
  // Live lookup at render — board refreshes automatically reflect.
  let shiftLookup: ShiftLookup | null = null;
  let taskLookup: TaskWithRelations | null = null;
  if (selection?.kind === "shift") {
    shiftLookup = resolveShift(selection.userId, selection.date);
  } else if (selection?.kind === "task") {
    taskLookup = resolveTask(selection.taskId);
  }
  const open = !!selection && (shiftLookup !== null || taskLookup !== null);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        {/* Sheet a11y requires a Title; visually-hidden via sr-only,
            with our own headers rendered inside each editor body. */}
        <SheetTitle className="sr-only">
          {selection?.kind === "shift" ? "Edit shift" : "Edit task"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {selection?.kind === "shift"
            ? "Set or clear a shift for this crew member and day."
            : "Update task status, reschedule, or move to backlog."}
        </SheetDescription>

        {selection?.kind === "shift" && shiftLookup && (
          <BoardShiftEditor
            key={`shift|${selection.userId}|${selection.date}`}
            userName={shiftLookup.userName}
            date={selection.date}
            shift={shiftLookup.shift}
            isTimeOff={shiftLookup.isTimeOff}
            onSave={(patch) =>
              onSaveShift(selection.userId, selection.date, patch)
            }
            onClear={() => onClearShift(selection.userId, selection.date)}
            onClose={onClose}
          />
        )}
        {selection?.kind === "task" && taskLookup && (
          <BoardTaskEditor
            key={`task|${taskLookup.id}`}
            task={taskLookup}
            onSetStatus={onSetTaskStatus}
            onUnassign={onUnassignTask}
            onDeleteSeries={onDeleteSeries}
            onReschedule={onRescheduleTask}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
