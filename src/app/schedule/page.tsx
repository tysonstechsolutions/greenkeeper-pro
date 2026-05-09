"use client";

/**
 * /schedule — unified weekly board.
 *
 * Replaces the previous shift-only scheduler. This page combines:
 *   - Staff shifts (the previous /schedule responsibility)
 *   - Task assignments (formerly the primary surface on /tasks)
 *   - Approved time-off (rendered in cells; requests still happen at
 *     /schedule/time-off)
 *
 * Desktop (≥1024px): three-pane layout — templates sidebar, week grid,
 * inspector sheet on click. Drag a TEMPLATE onto a cell to create a new
 * task instance (template stays for reuse). Drag a TASK between cells to
 * reassign.
 *
 * Mobile (<1024px): today-view (single column, swipe-complete) for crew.
 * Managers get a "Edit assignments for this day" sheet that lists all
 * tasks for the date with an assignee dropdown per task.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useScheduleBoard,
  getSunWeekStart,
  formatSunWeekRange,
  formatLocalDate,
  getBoardCell,
} from "@/lib/hooks/useScheduleBoard";
import { BoardGrid } from "@/components/features/schedule/board/board-grid";
import { BoardBacklog } from "@/components/features/schedule/board/board-backlog";
import {
  BoardInspector,
  type InspectorSelection,
} from "@/components/features/schedule/board/board-inspector";
import { BoardPrintMenu } from "@/components/features/schedule/board/board-print-menu";
import { BoardTodayView } from "@/components/features/schedule/board/board-today-view";
import { BoardDayEditor } from "@/components/features/schedule/board/board-day-editor";
import {
  BoardNewTaskSheet,
  type NewTaskSubmission,
} from "@/components/features/schedule/board/board-new-task-sheet";
import { directInsertRow } from "@/lib/supabase/rest";
import type { TaskWithRelations } from "@/lib/hooks/useTasks";

// Custom MIME types for the HTML5 DnD payload. Distinct strings so we
// can route the drop based on what's being dragged (template vs task)
// without parsing prefixes out of `text/plain`.
const DRAG_MIME_TASK = "application/x-greenkeeper-task";
const DRAG_MIME_TEMPLATE = "application/x-greenkeeper-template";

function todayString(): string {
  return formatLocalDate(new Date());
}

function addDays(dateString: string, days: number): string {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  // Use local components, not toISOString — see formatLocalDate's docblock.
  return formatLocalDate(d);
}

export default function SchedulePage() {
  const router = useRouter();
  const { user, profile, isManager, loading: authLoading } = useAuth();

  // Default to the Sun-week containing today.
  const [weekStart, setWeekStart] = useState<string>(() =>
    getSunWeekStart(new Date()),
  );

  const {
    board,
    loading,
    error,
    refresh,
    assignTask,
    unassignTask,
    createTaskFromTemplate,
    setShift,
    clearShift,
    setTaskStatus,
  } = useScheduleBoard(weekStart);

  // ── Inspector state ────────────────────────────────────────────────────
  // Selection is identifiers only. Live data is looked up at render time
  // by the inspector via resolveShift/resolveTask callbacks below — that
  // way a board refresh after a save automatically shows the latest state.
  const [selection, setSelection] = useState<InspectorSelection | null>(null);

  // Quick lookup of crew member by id (for shift inspector header).
  const crewById = useMemo(() => {
    const m = new Map<string, string>();
    if (board) {
      for (const c of board.crew) {
        m.set(c.id, c.display_name || c.full_name);
      }
    }
    return m;
  }, [board]);

  const resolveShift = useCallback(
    (userId: string, date: string) => {
      if (!board) return null;
      const cell = getBoardCell(board, userId, date);
      return {
        userName: crewById.get(userId) ?? "Crew member",
        shift: cell.shift,
        isTimeOff: cell.isTimeOff,
      };
    },
    [board, crewById],
  );

  const resolveTask = useCallback(
    (taskId: string): TaskWithRelations | null => {
      if (!board) return null;
      for (const cell of board.cells.values()) {
        const t = cell.tasks.find((x) => x.id === taskId);
        if (t) return t;
      }
      return null;
    },
    [board],
  );

  const onShiftClick = useCallback((userId: string, date: string) => {
    setSelection({ kind: "shift", userId, date });
  }, []);

  const onTaskClick = useCallback((task: TaskWithRelations) => {
    setSelection({ kind: "task", taskId: task.id });
  }, []);

  const closeInspector = useCallback(() => setSelection(null), []);

  // ── New-task quick-add ────────────────────────────────────────────────
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskPrefill, setNewTaskPrefill] = useState<{
    userId: string | null;
    date: string | null;
  }>({ userId: null, date: null });

  const onAddTaskClick = useCallback(
    (userId: string, date: string) => {
      // Empty-cell "+" — prefill the sheet with this crew/date.
      setNewTaskPrefill({ userId, date });
      setNewTaskOpen(true);
    },
    [],
  );

  const onNewTaskClick = useCallback(() => {
    // Header "+ New Task" — open the sheet with no prefill, defaults from the
    // current week + first crew member.
    setNewTaskPrefill({ userId: null, date: null });
    setNewTaskOpen(true);
  }, []);

  const handleNewTaskSubmit = useCallback(
    async (data: NewTaskSubmission): Promise<boolean> => {
      if (!profile) return false;
      try {
        await directInsertRow(
          "tasks",
          {
            title: data.title,
            description: data.description,
            category: data.category,
            priority: data.priority,
            status: "pending",
            assigned_to: data.assigned_to,
            assigned_by: profile.id,
            due_date: data.due_date,
            estimated_minutes: data.estimated_minutes,
            equipment_needed: [],
            materials_needed: [],
            checklist: [],
            requires_photo_before: false,
            requires_photo_after: false,
            weather_dependent: false,
          },
          "schedule.newTask",
        );
        await refresh();
        return true;
      } catch (err) {
        console.error("[schedule.newTask]", err);
        return false;
      }
    },
    [profile, refresh],
  );

  // ── Mobile backlog sheet ───────────────────────────────────────────────
  const [mobileBacklogOpen, setMobileBacklogOpen] = useState(false);

  // ── Mobile today-view date ─────────────────────────────────────────────
  // Stored as the user's intent. Clamped to board.dates at render via
  // effectiveDate so a board fetch with a different week stays consistent.
  const today = todayString();
  const [todayDate, setTodayDate] = useState<string>(today);
  const effectiveDate = useMemo(() => {
    if (!board) return todayDate;
    if (board.dates.includes(todayDate)) return todayDate;
    if (board.dates.includes(today)) return today;
    return board.dates[0];
  }, [board, todayDate, today]);

  const goToDay = useCallback(
    (offset: -1 | 1) => {
      if (!board) return;
      const idx = board.dates.indexOf(effectiveDate);
      const targetIdx = idx + offset;
      if (targetIdx >= 0 && targetIdx < board.dates.length) {
        setTodayDate(board.dates[targetIdx]);
        return;
      }
      // Roll over to adjacent week.
      const newWeek = addDays(weekStart, offset === -1 ? -7 : 7);
      setWeekStart(newWeek);
      setTodayDate(addDays(effectiveDate, offset));
    },
    [board, effectiveDate, weekStart],
  );

  const onPrevDay = useCallback(() => goToDay(-1), [goToDay]);
  const onNextDay = useCallback(() => goToDay(1), [goToDay]);

  // ── Mobile super day-editor ────────────────────────────────────────────
  const [dayEditorOpen, setDayEditorOpen] = useState(false);

  // ── Drag-drop state ────────────────────────────────────────────────────
  // We track two separate drag identities — a task id (already on the
  // grid; drop = reassign) or a template id (in the sidebar; drop =
  // create a new task instance). The grid renders different feedback for
  // each (highlight only on cell-during-active-drag).
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  // Mirror in refs so handlers don't capture stale state mid-drag.
  const draggingTaskIdRef = useRef<string | null>(null);
  const draggingTemplateIdRef = useRef<string | null>(null);

  // Drag a TASK already on the grid. Drop = reassign (move).
  const onTaskDragStart = useCallback(
    (taskId: string, e: React.DragEvent) => {
      draggingTaskIdRef.current = taskId;
      draggingTemplateIdRef.current = null;
      setDraggingTaskId(taskId);
      setDraggingTemplateId(null);
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData(DRAG_MIME_TASK, taskId);
        e.dataTransfer.setData("text/plain", `task:${taskId}`);
      } catch {
        // setData throws outside dragstart on some browsers — defensive.
      }
    },
    [],
  );

  const onTaskDragEnd = useCallback(() => {
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDropTargetKey(null);
  }, []);

  // Drag a TEMPLATE from the backlog. Drop = create a new task instance
  // (template stays put for next time).
  const onTemplateDragStart = useCallback(
    (templateId: string, e: React.DragEvent) => {
      draggingTemplateIdRef.current = templateId;
      draggingTaskIdRef.current = null;
      setDraggingTemplateId(templateId);
      setDraggingTaskId(null);
      e.dataTransfer.effectAllowed = "copy";
      try {
        e.dataTransfer.setData(DRAG_MIME_TEMPLATE, templateId);
        e.dataTransfer.setData("text/plain", `tpl:${templateId}`);
      } catch {
        // setData throws outside dragstart on some browsers — defensive.
      }
    },
    [],
  );

  const onTemplateDragEnd = useCallback(() => {
    draggingTemplateIdRef.current = null;
    setDraggingTemplateId(null);
    setDropTargetKey(null);
  }, []);

  const onCellDragOver = useCallback(
    (userId: string, date: string, e: React.DragEvent) => {
      // Without preventDefault, drop is not allowed.
      const isTask = !!draggingTaskIdRef.current;
      const isTemplate = !!draggingTemplateIdRef.current;
      if (!isTask && !isTemplate) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = isTemplate ? "copy" : "move";
      const key = `${userId}|${date}`;
      setDropTargetKey((prev) => (prev === key ? prev : key));
    },
    [],
  );

  const onCellDrop = useCallback(
    (userId: string, date: string, e: React.DragEvent) => {
      e.preventDefault();

      // Identify what's being dropped: template (drop = create) or task
      // (drop = reassign). Prefer the typed MIME; fall back to the
      // text/plain `tpl:`/`task:` prefix; finally, fall back to the
      // mid-drag ref. If both refs are set we trust template last (it
      // would have just been assigned by a fresh dragstart).
      const tplId =
        e.dataTransfer.getData(DRAG_MIME_TEMPLATE) ||
        (e.dataTransfer.getData("text/plain").startsWith("tpl:")
          ? e.dataTransfer.getData("text/plain").slice(4)
          : "") ||
        draggingTemplateIdRef.current;
      const taskId =
        e.dataTransfer.getData(DRAG_MIME_TASK) ||
        (e.dataTransfer.getData("text/plain").startsWith("task:")
          ? e.dataTransfer.getData("text/plain").slice(5)
          : "") ||
        draggingTaskIdRef.current;

      draggingTaskIdRef.current = null;
      draggingTemplateIdRef.current = null;
      setDraggingTaskId(null);
      setDraggingTemplateId(null);
      setDropTargetKey(null);

      if (!board) return;

      if (tplId) {
        void createTaskFromTemplate(tplId, userId, date);
        return;
      }

      if (taskId) {
        // No-op if the task is already in this cell.
        const existing = board.cells.get(`${userId}|${date}`)?.tasks ?? [];
        if (existing.some((t) => t.id === taskId)) return;
        void assignTask(taskId, userId, date);
      }
    },
    [board, assignTask, createTaskFromTemplate],
  );

  // Auth gate — bounce to /login if no session.
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-screen-2xl">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-screen-2xl">
      <PageHeader
        title="Schedule"
        description="Drag a template onto a cell to schedule · click to edit"
        icon={CalendarDays}
      >
        {/* Mobile: templates as a sheet trigger. Hidden on lg+ where the
            templates rail is rendered inline. */}
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          onClick={() => setMobileBacklogOpen(true)}
        >
          <Layers className="w-4 h-4" />
          Templates
          {board && board.templates.length > 0 && (
            <span className="ml-0.5 text-[10px] font-semibold tabular-nums">
              {board.templates.length}
            </span>
          )}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onNewTaskClick}
          disabled={!board}
        >
          <Plus className="w-4 h-4" />
          New Task
        </Button>
        <BoardPrintMenu
          board={board}
          preparedBy={profile?.full_name ?? undefined}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart(getSunWeekStart(new Date()))}
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => refresh()}
          aria-label="Refresh"
          disabled={loading}
        >
          <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
        </Button>
      </PageHeader>

      <div className="mb-3 text-sm font-medium">
        {formatSunWeekRange(weekStart)}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading && !board ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : board ? (
        <>
          {/* Mobile: today-view (single column, swipe-complete). */}
          <div className="lg:hidden">
            <BoardTodayView
              board={board}
              userId={user.id}
              date={effectiveDate}
              onPrevDay={onPrevDay}
              onNextDay={onNextDay}
              onTaskClick={onTaskClick}
              onSetTaskStatus={setTaskStatus}
              isManager={isManager}
              onOpenDayEditor={() => setDayEditorOpen(true)}
            />
          </div>

          {/* Desktop: full grid + templates sidebar. */}
          <div className="hidden lg:flex gap-4 items-start">
            {/* Definite `h-` (not `max-h-`) — max-height doesn't establish
                a definite parent height for `h-full` to resolve against, so
                the templates list inside loses its scrollbar. */}
            <aside className="w-[280px] shrink-0 sticky top-2 h-[calc(100dvh-3rem)]">
              <BoardBacklog
                templates={board.templates}
                onTemplateDragStart={onTemplateDragStart}
                onTemplateDragEnd={onTemplateDragEnd}
                draggingTemplateId={draggingTemplateId}
              />
            </aside>

            <main className="flex-1 min-w-0 overflow-x-auto">
              <BoardGrid
                board={board}
                onShiftClick={onShiftClick}
                onTaskClick={onTaskClick}
                onAddTaskClick={onAddTaskClick}
                onTaskDragStart={onTaskDragStart}
                onTaskDragEnd={onTaskDragEnd}
                onCellDragOver={onCellDragOver}
                onCellDrop={onCellDrop}
                draggingTaskId={draggingTaskId}
                dropTargetKey={dropTargetKey}
              />
            </main>
          </div>
        </>
      ) : null}

      {/* Mobile backlog sheet */}
      <Sheet open={mobileBacklogOpen} onOpenChange={setMobileBacklogOpen}>
        <SheetContent side="left" className="w-[320px] sm:w-[360px] p-0 flex flex-col">
          <SheetTitle className="sr-only">Templates</SheetTitle>
          <SheetDescription className="sr-only">
            Reusable task templates. Drag one onto a cell to schedule it.
          </SheetDescription>
          {board && (
            <BoardBacklog
              templates={board.templates}
              onTemplateDragStart={onTemplateDragStart}
              onTemplateDragEnd={onTemplateDragEnd}
              draggingTemplateId={draggingTemplateId}
            />
          )}
        </SheetContent>
      </Sheet>

      <BoardInspector
        selection={selection}
        onClose={closeInspector}
        resolveShift={resolveShift}
        resolveTask={resolveTask}
        onSaveShift={(userId, date, patch) => setShift(userId, date, patch)}
        onClearShift={clearShift}
        onSetTaskStatus={setTaskStatus}
        onUnassignTask={unassignTask}
        onRescheduleTask={assignTask}
      />

      {/* New-task quick-add sheet (header + cell) */}
      <BoardNewTaskSheet
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        board={board}
        defaultUserId={newTaskPrefill.userId}
        defaultDate={newTaskPrefill.date}
        onSubmit={handleNewTaskSubmit}
      />

      {/* Mobile super day-editor sheet */}
      <BoardDayEditor
        open={dayEditorOpen}
        onOpenChange={setDayEditorOpen}
        board={board}
        date={effectiveDate}
        onAssign={assignTask}
        onUnassign={unassignTask}
        onSetStatus={setTaskStatus}
      />
    </div>
  );
}
