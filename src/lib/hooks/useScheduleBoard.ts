"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  directDeleteByFilter,
  directDeleteRow,
  directInsertRow,
  directInsertRows,
  directPatchByFilter,
  directPatchRow,
  directRpc,
  directSelectAll,
} from "@/lib/supabase/rest";
import {
  occurrencesFor,
  defaultHorizon,
  weekdayOf,
  weekOfMonthOf,
} from "@/lib/utils/season";
import { getTemplateFrequency } from "@/lib/utils/template-frequency";
import { useAuth } from "./useAuth";
import type {
  Profile,
  Schedule,
  ShiftType,
  Task,
  TaskTemplate,
  TimeOffRequest,
  UserRole,
} from "@/types/database";
import type { TaskWithRelations } from "./useTasks";
import { formatLocalDate } from "@/lib/utils/date";

// Re-export so existing call sites keep working — the canonical home is
// now @/lib/utils/date.
export { formatLocalDate };

// ─── Sun-Sat week helpers ────────────────────────────────────────────────

/**
 * Get the Sunday that starts the week containing `date`. Sun-Sat is the
 * unified board's week convention — distinct from `useSchedule.getWeekStart`
 * which returns Monday.
 */
export function getSunWeekStart(date: Date | string): string {
  const d =
    typeof date === "string" ? new Date(date + "T00:00:00") : new Date(date);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  d.setDate(d.getDate() - day);
  return formatLocalDate(d);
}

/**
 * 7-day array starting at the given Sunday, formatted as YYYY-MM-DD.
 */
export function getSunWeekDates(weekStart: string): string[] {
  const out: string[] = [];
  const start = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(formatLocalDate(d));
  }
  return out;
}

/**
 * "May 5 – May 11, 2026" style label for the week header.
 */
export function formatSunWeekRange(weekStart: string): string {
  const dates = getSunWeekDates(weekStart);
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[6] + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

/**
 * Day-of-week labels for the grid header, Sun-first.
 */
export const SUN_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ─── Types ───────────────────────────────────────────────────────────────

export interface CrewProfile extends Pick<
  Profile,
  "id" | "full_name" | "display_name" | "role" | "avatar_url" | "phone"
> {
  /** Read-only virtual row for contractor-owned duty occurrences. */
  isExternal?: boolean;
}

export interface BoardCell {
  shift: Schedule | null;
  tasks: TaskWithRelations[];
  isTimeOff: boolean;
}

export interface ScheduleBoard {
  weekStart: string;
  dates: string[]; // 7 dates, Sun..Sat
  crew: CrewProfile[]; // sorted by role then name
  // The backlog now shows REUSABLE TEMPLATES — dragging one onto a cell
  // creates a new task instance (the template stays). This is what kept
  // the user from drowning in 1,300+ duplicate "Mow Greens" rows.
  templates: TaskTemplate[];
  // O(1) cell lookup. Indexed by `${userId}|${date}`.
  cells: Map<string, BoardCell>;
}

interface UseScheduleBoardReturn {
  board: ScheduleBoard | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  // Mutators — all optimistic with server-side rollback on failure.
  assignTask: (taskId: string, userId: string, date: string) => Promise<boolean>;
  unassignTask: (taskId: string) => Promise<boolean>;
  /** Delete this occurrence + all future ones in its series, stopping it. */
  deleteTaskSeriesFromDate: (taskId: string) => Promise<boolean>;
  /**
   * Create a new task from a template, assigned to the given crew member
   * and date. The template stays put for reuse. Returns the new task id
   * on success.
   */
  createTaskFromTemplate: (
    templateId: string,
    userId: string,
    date: string,
  ) => Promise<string | null>;
  setShift: (
    userId: string,
    date: string,
    shift: {
      shift_type: ShiftType | null;
      shift_start?: string | null;
      shift_end?: string | null;
      crew_assignment?: string | null;
      notes?: string | null;
    },
  ) => Promise<boolean>;
  clearShift: (userId: string, date: string) => Promise<boolean>;
  setTaskStatus: (
    taskId: string,
    status: TaskWithRelations["status"],
  ) => Promise<boolean>;
}

// ─── Constants ───────────────────────────────────────────────────────────

// Role sort order — same as /schedule for consistency.
const ROLE_SORT: Record<UserRole, number> = {
  super: 0,
  gm: 1,
  director: 2,
  asst_super: 3,
  pro: 4,
  foreman: 5,
  mechanic: 6,
  crew: 7,
  seasonal: 8,
};

// Joined-column projection for tasks. Mirrors useTasks' TASK_COLUMNS but
// declared locally so the board hook is self-contained.
const TASK_COLUMNS =
  `*, assigned_user:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, role),` +
  ` zone:course_zones!tasks_zone_id_fkey(id, name, zone_type, hole_number),` +
  ` assigned_by_user:profiles!tasks_assigned_by_fkey(id, full_name),` +
  ` completed_by_user:profiles!tasks_completed_by_fkey(id, full_name),` +
  ` verified_by_user:profiles!tasks_verified_by_fkey(id, full_name)`;

const PROFILE_COLUMNS = "id,full_name,display_name,role,avatar_url,phone";

const cellKey = (userId: string, date: string) => `${userId}|${date}`;

// ─── Hook ────────────────────────────────────────────────────────────────

/**
 * Unified data hook for the weekly schedule board. Joins active staff,
 * shifts, scheduled tasks, unassigned-task backlog, and approved time-off
 * for a Sun-Sat week into a single addressable structure.
 *
 * Mutators are optimistic — they update the in-memory board immediately
 * for snappy drag-drop UX, then write to the server. On failure, the
 * board re-fetches to discard the optimistic state.
 */
export function useScheduleBoard(weekStart: string): UseScheduleBoardReturn {
  const { profile } = useAuth();

  const [board, setBoard] = useState<ScheduleBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the latest fetch so a stale response doesn't clobber a fresh one
  // (e.g. user navigates Mon week → Tue week before the first one returns).
  const fetchSeqRef = useRef(0);

  const fetchBoard = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const dates = getSunWeekDates(weekStart);
      const weekEnd = dates[6];

      // Profiles via raw REST (matches useProfiles' wedge-resistant pattern).
      const fetchProfilesPromise = directSelectAll<CrewProfile>("profiles", {
        columns: PROFILE_COLUMNS,
        filters: ["is_active=eq.true"],
        orderBy: [{ column: "role" }, { column: "full_name" }, { column: "id" }],
        label: "scheduleBoard.fetchProfiles",
      });

      // Shifts for the week. Use direct REST instead of supabase.from() —
      // the supabase-js auth wrapper has been observed to wedge after
      // post-save navigations, leaving the page stuck at "Loading…" until
      // a manual refresh. The `directSelectList` helper goes straight to
      // PostgREST with the cached JWT and sidesteps that path.
      const fetchShiftsPromise = directSelectAll<Schedule>("schedules", {
        columns: "*",
        filters: [
          `schedule_date=gte.${encodeURIComponent(dates[0])}`,
          `schedule_date=lte.${encodeURIComponent(weekEnd)}`,
          "is_active=eq.true",
        ],
        orderBy: [{ column: "schedule_date" }, { column: "id" }],
        label: "scheduleBoard.fetchShifts",
      });

      // Tasks: anything scheduled in the week + everything in the backlog.
      // We pull these in two parallel queries and merge — combining them
      // into one filter expression with directSelectList's `or` clause is
      // possible but harder to read.
      const fetchScheduledTasksPromise = directSelectAll<TaskWithRelations>(
        "tasks",
        {
          columns: TASK_COLUMNS,
          filters: [
            `due_date=gte.${encodeURIComponent(dates[0])}`,
            `due_date=lte.${encodeURIComponent(weekEnd)}`,
            `status=not.in.(cancelled)`,
          ],
          orderBy: [
            { column: "due_date", ascending: true },
            { column: "priority", ascending: true },
            { column: "due_time", ascending: true, nullsFirst: false },
            { column: "id" },
          ],
          label: "scheduleBoard.fetchScheduledTasks",
        },
      );

      // Backlog = task templates (reusable). Drag a template onto a cell
      // to create a fresh task; the template stays for next time.
      const fetchTemplatesPromise = directSelectAll<TaskTemplate>(
        "task_templates",
        {
          columns: "*",
          filters: [`is_active=eq.true`],
          orderBy: [
            { column: "default_priority", ascending: true },
            { column: "name", ascending: true },
            { column: "id" },
          ],
          label: "scheduleBoard.fetchTemplates",
        },
      );

      // Approved time-off overlapping the week:
      //   start_date <= weekEnd AND end_date >= weekStart
      // Same wedge-resistant pattern as shifts above.
      const fetchTimeOffPromise = directSelectAll<TimeOffRequest>(
        "time_off_requests",
        {
          columns: "*",
          filters: [
            `status=eq.approved`,
            `start_date=lte.${encodeURIComponent(weekEnd)}`,
            `end_date=gte.${encodeURIComponent(dates[0])}`,
          ],
          orderBy: [{ column: "start_date" }, { column: "id" }],
          label: "scheduleBoard.fetchTimeOff",
        },
      );

      const [
        profilesData,
        shifts,
        scheduledTasks,
        templates,
        timeOffRequests,
      ] = await Promise.all([
        fetchProfilesPromise,
        fetchShiftsPromise,
        fetchScheduledTasksPromise,
        fetchTemplatesPromise,
        fetchTimeOffPromise,
      ]);

      // A newer request superseded us — discard.
      if (seq !== fetchSeqRef.current) return;

      // Build the cell map.
      const cells = new Map<string, BoardCell>();
      const ensureCell = (userId: string, date: string): BoardCell => {
        const key = cellKey(userId, date);
        let cell = cells.get(key);
        if (!cell) {
          cell = { shift: null, tasks: [], isTimeOff: false };
          cells.set(key, cell);
        }
        return cell;
      };

      for (const s of shifts) {
        ensureCell(s.user_id, s.schedule_date).shift = s;
      }

      for (const t of scheduledTasks) {
        if (!t.due_date) continue;
        // Skip tasks whose due_date isn't in this week (defensive — query
        // already filtered, but assigned_to may have been stripped server-side).
        if (!dates.includes(t.due_date)) continue;
        const rowId = t.assigned_to ?? (
          t.duty_owner_type === "contractor"
            ? `contractor:${t.duty_contractor_vendor_id ?? t.duty_contractor_name ?? t.id}`
            : null
        );
        if (rowId) ensureCell(rowId, t.due_date).tasks.push(t);
      }

      // Time-off: explode each request into per-day flags.
      for (const req of timeOffRequests) {
        const start = req.start_date > dates[0] ? req.start_date : dates[0];
        const end = req.end_date < weekEnd ? req.end_date : weekEnd;
        const cur = new Date(start + "T00:00:00");
        const last = new Date(end + "T00:00:00");
        while (cur <= last) {
          const d = formatLocalDate(cur);
          ensureCell(req.user_id, d).isTimeOff = true;
          cur.setDate(cur.getDate() + 1);
        }
      }

      // Crew sorting: role rank then name (Spanish-aware compare).
      const contractorRows: CrewProfile[] = [];
      const seenContractors = new Set<string>();
      for (const task of scheduledTasks) {
        if (task.duty_owner_type !== "contractor") continue;
        const id = `contractor:${task.duty_contractor_vendor_id ?? task.duty_contractor_name ?? task.id}`;
        if (seenContractors.has(id)) continue;
        seenContractors.add(id);
        contractorRows.push({
          id,
          full_name: task.duty_contractor_name || "Contractor not recorded",
          display_name: task.duty_contractor_name || "Contractor not recorded",
          role: "seasonal",
          avatar_url: null,
          phone: null,
          isExternal: true,
        });
      }

      const crew = [...profilesData, ...contractorRows].sort((a, b) => {
        if (!!a.isExternal !== !!b.isExternal) return a.isExternal ? 1 : -1;
        const r = (ROLE_SORT[a.role] ?? 99) - (ROLE_SORT[b.role] ?? 99);
        if (r !== 0) return r;
        const an = a.display_name || a.full_name || "";
        const bn = b.display_name || b.full_name || "";
        return an.localeCompare(bn);
      });

      setBoard({
        weekStart,
        dates,
        crew,
        templates,
        cells,
      });
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      console.error("[useScheduleBoard] fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);

  // ── Mutators ──────────────────────────────────────────────────────────

  /**
   * Apply an optimistic patch to the in-memory board, returning a rollback
   * function. We rebuild the cells map entries we touch rather than mutating
   * shared references — React state updates need fresh object identities.
   */
  const applyOptimistic = useCallback(
    (mutate: (next: ScheduleBoard) => void): (() => void) => {
      let prev: ScheduleBoard | null = null;
      setBoard((current) => {
        if (!current) return current;
        prev = current;
        // Shallow clone of the board, plus a fresh cells map. Templates
        // are read-only from this hook's perspective (created/edited via
        // /tasks/templates UI), so no defensive copy needed.
        const next: ScheduleBoard = {
          ...current,
          cells: new Map(current.cells),
        };
        mutate(next);
        return next;
      });
      return () => {
        if (prev) setBoard(prev);
      };
    },
    [],
  );

  const assignTask = useCallback(
    async (taskId: string, userId: string, date: string): Promise<boolean> => {
      if (!profile) {
        setError("You must be logged in");
        return false;
      }

      const rollback = applyOptimistic((next) => {
        // Pull from any existing cell. (The backlog now holds templates,
        // not tasks, so re-assignment only happens between grid cells.)
        let task: TaskWithRelations | null = null;
        for (const [key, cell] of next.cells) {
          const idx = cell.tasks.findIndex((t) => t.id === taskId);
          if (idx !== -1) {
            task = cell.tasks[idx];
            const newCell: BoardCell = {
              ...cell,
              tasks: cell.tasks.filter((t) => t.id !== taskId),
            };
            next.cells.set(key, newCell);
            break;
          }
        }
        if (!task) return;
        const updated: TaskWithRelations = {
          ...task,
          assigned_to: userId,
          due_date: date,
        };
        const key = cellKey(userId, date);
        const cell = next.cells.get(key) ?? {
          shift: null,
          tasks: [],
          isTimeOff: false,
        };
        next.cells.set(key, { ...cell, tasks: [...cell.tasks, updated] });
      });

      try {
        await directPatchRow(
          "tasks",
          "id",
          taskId,
          { assigned_to: userId, due_date: date, assigned_by: profile.id },
          "scheduleBoard.assignTask",
        );
        return true;
      } catch (err) {
        rollback();
        setError(err instanceof Error ? err.message : "Failed to assign task");
        return false;
      }
    },
    [profile, applyOptimistic],
  );

  const unassignTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      // Templates are the source of truth for "things to do later." If the
      // user wants to remove a task from the schedule, we delete it — the
      // template stays available to recreate later. Tasks with completion
      // data (photos, completed_at) should not be unassigned through this
      // path; the inspector hides the button when status indicates work
      // has started.
      const rollback = applyOptimistic((next) => {
        for (const [key, cell] of next.cells) {
          const idx = cell.tasks.findIndex((t) => t.id === taskId);
          if (idx === -1) continue;
          const newCell: BoardCell = {
            ...cell,
            tasks: cell.tasks.filter((t) => t.id !== taskId),
          };
          next.cells.set(key, newCell);
          break;
        }
      });

      try {
        await directDeleteRow(
          "tasks",
          "id",
          taskId,
          "scheduleBoard.unassignTask",
        );
        return true;
      } catch (err) {
        rollback();
        setError(
          err instanceof Error ? err.message : "Failed to remove task",
        );
        return false;
      }
    },
    [applyOptimistic],
  );

  /**
   * Create a new task instance from a template, assigned to a crew member
   * on a given date. Returns the new task id, or null on failure.
   *
   * Optimistic: a temporary task chip appears in the cell immediately.
   * On success the next refresh fetches the real row with its real id.
   */
  const createTaskFromTemplate = useCallback(
    async (
      templateId: string,
      userId: string,
      date: string,
    ): Promise<string | null> => {
      if (!profile) {
        setError("You must be logged in");
        return null;
      }
      // Look up the template from the in-memory board so we can build the
      // optimistic chip without an extra round-trip.
      const tpl = board?.templates.find((t) => t.id === templateId);
      if (!tpl) {
        setError("Template not found");
        return null;
      }

      const tempId = `__pending_${templateId}_${Date.now()}__`;
      const rollback = applyOptimistic((next) => {
        const optimistic: TaskWithRelations = {
          id: tempId,
          title: tpl.name,
          title_es: null,
          description: tpl.description,
          description_es: null,
          category: tpl.category,
          priority: tpl.default_priority,
          status: "pending",
          assigned_to: userId,
          assigned_crew: null,
          assigned_by: profile.id,
          due_date: date,
          due_time: null,
          estimated_minutes: tpl.estimated_minutes,
          actual_minutes: null,
          zone_id: null,
          hole_numbers: [],
          equipment_needed: tpl.equipment_needed,
          materials_needed: tpl.materials_needed,
          checklist: tpl.checklist,
          requires_photo_before: tpl.requires_photo_before,
          requires_photo_after: tpl.requires_photo_after,
          weather_dependent: tpl.weather_dependent,
          weather_conditions: tpl.weather_conditions,
          recurring_rule: null,
          template_id: tpl.id,
          parent_task_id: null,
          plan_goal_id: null,
          series_id: null,
          completed_by: null,
          completed_at: null,
          verified_by: null,
          verified_at: null,
          notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const key = cellKey(userId, date);
        const cell = next.cells.get(key) ?? {
          shift: null,
          tasks: [],
          isTimeOff: false,
        };
        next.cells.set(key, { ...cell, tasks: [...cell.tasks, optimistic] });
      });

      // Decide the recurrence tier from the template's explicit frequency,
      // falling back to the name heuristic for templates created before the
      // `frequency` column existed.
      const tier = getTemplateFrequency(tpl);

      // Task fields copied off the template — written verbatim on each
      // occurrence and snapshotted onto the series for the nightly top-up.
      const taskPayload = {
        title: tpl.name,
        description: tpl.description ?? null,
        category: tpl.category,
        priority: tpl.default_priority,
        estimated_minutes: tpl.estimated_minutes ?? null,
        equipment_needed: tpl.equipment_needed ?? [],
        materials_needed: tpl.materials_needed ?? [],
        checklist: tpl.checklist ?? [],
        requires_photo_before: !!tpl.requires_photo_before,
        requires_photo_after: !!tpl.requires_photo_after,
        weather_dependent: !!tpl.weather_dependent,
        weather_conditions: tpl.weather_conditions ?? null,
        template_id: tpl.id,
        notes: tpl.instructions ?? null,
      };

      const insertSingleTask = async (): Promise<string | null> => {
        const inserted = await directInsertRow<Task>(
          "tasks",
          {
            ...taskPayload,
            status: "pending",
            assigned_to: userId,
            assigned_by: profile.id,
            due_date: date,
          },
          "scheduleBoard.createTaskFromTemplate",
        );
        await fetchBoard();
        return inserted?.id ?? null;
      };

      try {
        // One-off tiers (seasonal / projects) never recur — a single task.
        if (tier === "seasonal" || tier === "projects") {
          return await insertSingleTask();
        }

        // Repeating tiers — create a series, then materialize every in-season
        // occurrence through the horizon. The nightly job extends it each
        // following season.
        let seriesId: string;
        try {
          const series = await directInsertRow<{ id: string }>(
            "task_series",
            {
              assigned_to: userId,
              template_id: tpl.id,
              tier,
              weekday: weekdayOf(date),
              week_of_month: tier === "monthly" ? weekOfMonthOf(date) : null,
              task_payload: taskPayload,
              created_by: profile.id,
            },
            "scheduleBoard.createSeries",
          );
          seriesId = series.id;
        } catch (seriesErr) {
          // Recurrence schema not applied yet (task_series missing) — degrade
          // to a single task so dropping still works pre-migration.
          const msg = seriesErr instanceof Error ? seriesErr.message : "";
          if (/task_series|could not find|does not exist|PGRST205|schema cache/i.test(msg)) {
            console.warn(
              "[useScheduleBoard] task_series unavailable — creating a single task",
              seriesErr,
            );
            return await insertSingleTask();
          }
          throw seriesErr;
        }

        const dates = occurrencesFor(date, tier, defaultHorizon(date));
        const rows = dates.map((d) => ({
          ...taskPayload,
          status: "pending",
          assigned_to: userId,
          assigned_by: profile.id,
          due_date: d,
          series_id: seriesId,
        }));
        await directInsertRows("tasks", rows, "scheduleBoard.createSeriesTasks");
        await fetchBoard();
        return seriesId;
      } catch (err) {
        rollback();
        setError(err instanceof Error ? err.message : "Failed to create task");
        return null;
      }
    },
    [profile, board, applyOptimistic, fetchBoard],
  );

  /**
   * Delete a recurring task and every future occurrence in its series, and
   * stop the series so the nightly top-up won't refill it. Completed and past
   * occurrences are left untouched. Falls back to a single delete when the
   * task isn't part of a series.
   */
  const deleteTaskSeriesFromDate = useCallback(
    async (taskId: string): Promise<boolean> => {
      // Find the task in the current board to read its series + date.
      let target: TaskWithRelations | null = null;
      if (board) {
        for (const cell of board.cells.values()) {
          const t = cell.tasks.find((x) => x.id === taskId);
          if (t) {
            target = t;
            break;
          }
        }
      }
      if (!target || !target.series_id || !target.due_date) {
        // Not a series occurrence — just remove this one.
        return unassignTask(taskId);
      }
      const seriesId = target.series_id;
      const fromDate = target.due_date;

      const rollback = applyOptimistic((next) => {
        for (const [key, cell] of next.cells) {
          const remaining = cell.tasks.filter(
            (t) => !(t.series_id === seriesId && (t.due_date ?? "") >= fromDate),
          );
          if (remaining.length !== cell.tasks.length) {
            next.cells.set(key, { ...cell, tasks: remaining });
          }
        }
      });

      try {
        // Stop the series so the nightly job won't regenerate it.
        await directPatchByFilter(
          "task_series",
          [`id=eq.${encodeURIComponent(seriesId)}`],
          { active: false },
          "scheduleBoard.stopSeries",
        );
        // Delete this and every future not-yet-started occurrence.
        await directDeleteByFilter(
          "tasks",
          [
            `series_id=eq.${encodeURIComponent(seriesId)}`,
            `due_date=gte.${encodeURIComponent(fromDate)}`,
            `status=eq.pending`,
          ],
          "scheduleBoard.deleteSeriesFuture",
        );
        await fetchBoard();
        return true;
      } catch (err) {
        rollback();
        setError(err instanceof Error ? err.message : "Failed to delete series");
        return false;
      }
    },
    [board, applyOptimistic, unassignTask, fetchBoard],
  );

  const setShift: UseScheduleBoardReturn["setShift"] = useCallback(
    async (userId, date, shiftPatch) => {
      if (!profile) {
        setError("You must be logged in");
        return false;
      }

      // Optimistic local update. We don't know the final schedule.id yet
      // for fresh inserts — store a placeholder; the next refresh fixes it.
      const rollback = applyOptimistic((next) => {
        const key = cellKey(userId, date);
        const cell = next.cells.get(key) ?? {
          shift: null,
          tasks: [],
          isTimeOff: false,
        };
        const placeholder: Schedule = {
          id: cell.shift?.id ?? "__pending__",
          user_id: userId,
          schedule_date: date,
          shift_start: shiftPatch.shift_start ?? null,
          shift_end: shiftPatch.shift_end ?? null,
          shift_type: shiftPatch.shift_type ?? null,
          crew_assignment: shiftPatch.crew_assignment ?? null,
          notes: shiftPatch.notes ?? null,
          created_by: cell.shift?.created_by ?? profile.id,
          created_at: cell.shift?.created_at ?? new Date().toISOString(),
        };
        next.cells.set(key, { ...cell, shift: placeholder });
      });

      try {
        // Upsert via direct REST. Same wedge-resistance reasoning as the
        // initial fetches above — supabase.from() can hang post-navigation.
        const patch = {
          shift_start: shiftPatch.shift_start ?? null,
          shift_end: shiftPatch.shift_end ?? null,
          shift_type: shiftPatch.shift_type ?? null,
          crew_assignment: shiftPatch.crew_assignment ?? null,
          notes: shiftPatch.notes ?? null,
        };

        await directRpc("upsert_staff_schedule", {
          p_user_id: userId,
          p_schedule_date: date,
          p_values: patch,
          p_reason: "Schedule board shift saved",
        }, "scheduleBoard.setShift");

        // Refresh the cell with the real row so id is correct for later edits.
        await fetchBoard();
        return true;
      } catch (err) {
        rollback();
        setError(err instanceof Error ? err.message : "Failed to save shift");
        return false;
      }
    },
    [profile, applyOptimistic, fetchBoard],
  );

  const clearShift = useCallback(
    async (userId: string, date: string): Promise<boolean> => {
      const rollback = applyOptimistic((next) => {
        const key = cellKey(userId, date);
        const cell = next.cells.get(key);
        if (!cell) return;
        next.cells.set(key, { ...cell, shift: null });
      });

      try {
        // Look up the row id then delete via direct REST. directDeleteRow
        // takes a single id; it's wedge-resistant where supabase.from() isn't.
        await directRpc("void_staff_schedule", {
          p_user_id: userId,
          p_schedule_date: date,
          p_reason: "Schedule board shift cleared",
        }, "scheduleBoard.clearShift");
        return true;
      } catch (err) {
        rollback();
        setError(err instanceof Error ? err.message : "Failed to clear shift");
        return false;
      }
    },
    [applyOptimistic],
  );

  const setTaskStatus = useCallback(
    async (
      taskId: string,
      status: TaskWithRelations["status"],
    ): Promise<boolean> => {
      if (!profile) {
        setError("You must be logged in");
        return false;
      }

      const rollback = applyOptimistic((next) => {
        for (const [key, cell] of next.cells) {
          const idx = cell.tasks.findIndex((t) => t.id === taskId);
          if (idx === -1) continue;
          const updated = { ...cell.tasks[idx], status };
          const tasks = [...cell.tasks];
          tasks[idx] = updated;
          next.cells.set(key, { ...cell, tasks });
          return;
        }
        // Tasks no longer live in the backlog (which holds templates now);
        // every task is in some cell. If we don't find it here, it's gone.
      });

      // Build the patch — completed/verified set the actor + timestamp,
      // matching what useTasks.completeTask / verifyTask do.
      let blockedReason: string | null = null;
      if (status === "blocked") {
        blockedReason = window.prompt("Why is this task blocked?")?.trim() || null;
        if (!blockedReason) {
          rollback();
          return false;
        }
      }
      try {
        await directRpc("transition_task_status", {
          p_task_id: taskId,
          p_status: status,
          p_blocked_reason: blockedReason,
        }, "scheduleBoard.setTaskStatus");
        return true;
      } catch (err) {
        rollback();
        setError(
          err instanceof Error ? err.message : "Failed to update status",
        );
        return false;
      }
    },
    [profile, applyOptimistic],
  );

  return {
    board,
    loading,
    error,
    refresh: fetchBoard,
    assignTask,
    unassignTask,
    deleteTaskSeriesFromDate,
    createTaskFromTemplate,
    setShift,
    clearShift,
    setTaskStatus,
  };
}

// ─── Cell lookup helpers (pure) ──────────────────────────────────────────

/**
 * Look up a cell. Returns an empty cell if the user/date pair has no data
 * — saves the caller from null checks at every render site.
 */
export function getBoardCell(
  board: ScheduleBoard,
  userId: string,
  date: string,
): BoardCell {
  return (
    board.cells.get(cellKey(userId, date)) ?? {
      shift: null,
      tasks: [],
      isTimeOff: false,
    }
  );
}
