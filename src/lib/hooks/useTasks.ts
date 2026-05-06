"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  Task,
  Profile,
  CourseZone,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { sendNotification } from "./useNotifications";
import { translateSafe } from "@/lib/utils/translate";
import { formatLocalDate, todayLocal } from "@/lib/utils/date";
import {
  directSelectList,
  directSelectRow,
  directInsertRow,
  directPatchRow,
  directPatchRowReturning,
  directDeleteRow,
} from "@/lib/supabase/rest";

// Extended task type with joined data
export interface TaskWithRelations extends Task {
  assigned_user?: Pick<Profile, "id" | "full_name" | "avatar_url" | "role"> | null;
  zone?: Pick<CourseZone, "id" | "name" | "zone_type" | "hole_number"> | null;
  assigned_by_user?: Pick<Profile, "id" | "full_name"> | null;
  completed_by_user?: Pick<Profile, "id" | "full_name"> | null;
  verified_by_user?: Pick<Profile, "id" | "full_name"> | null;
}

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  category?: TaskCategory | TaskCategory[];
  priority?: TaskPriority | TaskPriority[];
  assignedTo?: string | null;
  zoneId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
  includeCompleted?: boolean;
}

export interface CreateTaskData {
  title: string;
  description?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  assigned_to?: string | null;
  assigned_crew?: string | null;
  due_date: string;
  due_time?: string | null;
  estimated_minutes?: number | null;
  zone_id?: string | null;
  hole_numbers?: number[];
  equipment_needed?: string[];
  materials_needed?: Task["materials_needed"];
  checklist?: Task["checklist"];
  requires_photo_before?: boolean;
  requires_photo_after?: boolean;
  weather_dependent?: boolean;
  weather_conditions?: Task["weather_conditions"];
  recurring_rule?: Task["recurring_rule"];
  template_id?: string | null;
  plan_goal_id?: string | null;
  parent_task_id?: string | null;
  notes?: string | null;
}

export interface UpdateTaskData extends Partial<CreateTaskData> {
  status?: TaskStatus;
  actual_minutes?: number | null;
}

interface UseTasksReturn {
  tasks: TaskWithRelations[];
  loading: boolean;
  error: string | null;
  fetchTasks: (filters?: TaskFilters) => Promise<void>;
  fetchMyTasks: (date: string) => Promise<TaskWithRelations[]>;
  fetchTeamTasks: (date: string) => Promise<TaskWithRelations[]>;
  createTask: (data: CreateTaskData) => Promise<Task | null>;
  updateTask: (id: string, data: UpdateTaskData) => Promise<Task | null>;
  updateTaskStatus: (id: string, newStatus: TaskStatus) => Promise<boolean>;
  completeTask: (id: string) => Promise<boolean>;
  verifyTask: (id: string) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  getTask: (id: string) => Promise<TaskWithRelations | null>;
  refreshTasks: () => Promise<void>;
}

// Joined-column projection for task queries. Mirrors the original
// buildTaskQuery's .select(...) string.
const TASK_COLUMNS = `*, assigned_user:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, role), zone:course_zones!tasks_zone_id_fkey(id, name, zone_type, hole_number), assigned_by_user:profiles!tasks_assigned_by_fkey(id, full_name), completed_by_user:profiles!tasks_completed_by_fkey(id, full_name), verified_by_user:profiles!tasks_verified_by_fkey(id, full_name)`;

// Build PostgREST filter strings + optional or=(...) clause from a TaskFilters.
// Replaces the old applyFilters() that mutated a supabase-js builder.
function buildTaskFilters(filters?: TaskFilters): {
  filters: string[];
  or?: string;
} {
  const f: string[] = [];
  let or: string | undefined;

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      const vals = filters.status.map((s) => encodeURIComponent(s)).join(",");
      f.push(`status=in.(${vals})`);
    } else {
      f.push(`status=eq.${encodeURIComponent(filters.status)}`);
    }
  }

  if (filters?.category) {
    if (Array.isArray(filters.category)) {
      const vals = filters.category.map((c) => encodeURIComponent(c)).join(",");
      f.push(`category=in.(${vals})`);
    } else {
      f.push(`category=eq.${encodeURIComponent(filters.category)}`);
    }
  }

  if (filters?.priority) {
    if (Array.isArray(filters.priority)) {
      const vals = filters.priority.map((p) => encodeURIComponent(p)).join(",");
      f.push(`priority=in.(${vals})`);
    } else {
      f.push(`priority=eq.${encodeURIComponent(filters.priority)}`);
    }
  }

  if (filters?.assignedTo !== undefined) {
    if (filters.assignedTo === null) {
      f.push(`assigned_to=is.null`);
    } else {
      f.push(`assigned_to=eq.${encodeURIComponent(filters.assignedTo)}`);
    }
  }

  if (filters?.zoneId) {
    f.push(`zone_id=eq.${encodeURIComponent(filters.zoneId)}`);
  }

  if (filters?.dateRange) {
    f.push(`due_date=gte.${encodeURIComponent(filters.dateRange.start)}`);
    f.push(`due_date=lte.${encodeURIComponent(filters.dateRange.end)}`);
  }

  if (filters?.search) {
    const encTerm = encodeURIComponent(`%${filters.search}%`);
    or = `title.ilike.${encTerm},description.ilike.${encTerm}`;
  }

  if (!filters?.includeCompleted) {
    // Exclude completed/verified/cancelled from default views.
    f.push(`status=not.in.(completed,verified,cancelled)`);
  }

  return { filters: f, or };
}

export function useTasks(initialFilters?: TaskFilters): UseTasksReturn {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useAuth();

  // supabase is ONLY used for realtime channels / removeChannel — the
  // query-builder hangs we're working around don't affect the realtime
  // subsystem. Every .from().* call has been migrated to direct-fetch
  // helpers in @/lib/supabase/rest.
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentFiltersRef = useRef<TaskFilters | undefined>(initialFilters);

  // Fetch tasks with filters
  const fetchTasks = useCallback(
    async (filters?: TaskFilters) => {
      setLoading(true);
      setError(null);
      currentFiltersRef.current = filters;

      try {
        const { filters: rawFilters, or } = buildTaskFilters(filters);
        const data = await directSelectList<TaskWithRelations>("tasks", {
          columns: TASK_COLUMNS,
          filters: rawFilters,
          or,
          orderBy: [
            { column: "due_date", ascending: true },
            { column: "priority", ascending: true }, // critical=0, high=1, etc.
          ],
          limit: 100, // Limit to prevent loading too many tasks
          label: "fetchTasks",
        });

        setTasks(data);
      } catch (err) {
        console.error("Unexpected error fetching tasks:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Fetch tasks assigned to current user for a specific date
  const fetchMyTasks = useCallback(
    async (date: string): Promise<TaskWithRelations[]> => {
      if (!user) return [];

      try {
        const data = await directSelectList<TaskWithRelations>("tasks", {
          columns: TASK_COLUMNS,
          filters: [
            `assigned_to=eq.${encodeURIComponent(user.id)}`,
            `due_date=eq.${encodeURIComponent(date)}`,
            `status=not.in.(cancelled)`,
          ],
          orderBy: [
            { column: "priority", ascending: true },
            { column: "due_time", ascending: true, nullsFirst: false },
          ],
          limit: 50, // Limit to prevent loading too many tasks
          label: "fetchMyTasks",
        });

        return data;
      } catch (err) {
        console.error("Unexpected error fetching my tasks:", err);
        return [];
      }
    },
    [user]
  );

  // Fetch all team tasks for a specific date (super/foreman view)
  const fetchTeamTasks = useCallback(
    async (date: string): Promise<TaskWithRelations[]> => {
      try {
        const data = await directSelectList<TaskWithRelations>("tasks", {
          columns: TASK_COLUMNS,
          filters: [
            `due_date=eq.${encodeURIComponent(date)}`,
            `status=not.in.(cancelled)`,
          ],
          orderBy: [
            { column: "priority", ascending: true },
            { column: "assigned_to", ascending: true, nullsFirst: false },
            { column: "due_time", ascending: true, nullsFirst: false },
          ],
          limit: 100, // Limit to prevent loading too many tasks
          label: "fetchTeamTasks",
        });

        return data;
      } catch (err) {
        console.error("Unexpected error fetching team tasks:", err);
        return [];
      }
    },
    []
  );

  // Create a new task
  const createTask = useCallback(
    async (data: CreateTaskData): Promise<Task | null> => {
      if (!profile) {
        setError("You must be logged in to create tasks");
        return null;
      }

      try {
        // Fire translation in parallel before insert — failure is non-blocking.
        // We await the result so both columns get populated in a single insert,
        // but `translateSafe` returns null on any error so the write still
        // proceeds (just without a translation).
        const [titleEs, descriptionEs] = await Promise.all([
          data.title && data.title.trim()
            ? translateSafe({ text: data.title, from: "en", to: "es" })
            : Promise.resolve(null),
          data.description && data.description.trim()
            ? translateSafe({ text: data.description, from: "en", to: "es" })
            : Promise.resolve(null),
        ]);

        const insertData = {
          title: data.title,
          title_es: titleEs,
          description: data.description ?? null,
          description_es: descriptionEs,
          category: data.category,
          priority: data.priority,
          status: "pending",
          assigned_to: data.assigned_to ?? null,
          assigned_crew: data.assigned_crew ?? null,
          assigned_by: profile.id,
          due_date: data.due_date,
          due_time: data.due_time ?? null,
          estimated_minutes: data.estimated_minutes ?? null,
          zone_id: data.zone_id ?? null,
          hole_numbers: data.hole_numbers ?? [],
          equipment_needed: data.equipment_needed ?? [],
          materials_needed: data.materials_needed ?? [],
          checklist: data.checklist ?? [],
          requires_photo_before: data.requires_photo_before ?? false,
          requires_photo_after: data.requires_photo_after ?? false,
          weather_dependent: data.weather_dependent ?? false,
          weather_conditions: data.weather_conditions ?? null,
          recurring_rule: data.recurring_rule ?? null,
          template_id: data.template_id ?? null,
          plan_goal_id: data.plan_goal_id ?? null,
          parent_task_id: data.parent_task_id ?? null,
          notes: data.notes ?? null,
        };

        const newTask = await directInsertRow<Task>("tasks", insertData, "createTask");

        if (!newTask) {
          setError("Failed to create task");
          return null;
        }

        // Send notification to assigned user
        if (data.assigned_to && data.assigned_to !== profile.id) {
          const assignerName = profile.full_name || "Someone";
          await sendNotification(
            data.assigned_to,
            "task_assigned",
            "New task assigned to you",
            `${assignerName} assigned you: ${data.title}`,
            "task",
            newTask.id
          );
        }

        return newTask;
      } catch (err) {
        console.error("Unexpected error creating task:", err);
        setError(err instanceof Error ? err.message : "Failed to create task");
        return null;
      }
    },
    [profile]
  );

  // Update a task
  const updateTask = useCallback(
    async (id: string, data: UpdateTaskData): Promise<Task | null> => {
      try {
        const updated = await directPatchRowReturning<Task>(
          "tasks",
          "id",
          id,
          data as Record<string, unknown>,
          "updateTask",
        );
        return updated;
      } catch (err) {
        console.error("Unexpected error updating task:", err);
        setError(err instanceof Error ? err.message : "Failed to update task");
        return null;
      }
    },
    []
  );

  // Quick status change
  const updateTaskStatus = useCallback(
    async (id: string, newStatus: TaskStatus): Promise<boolean> => {
      try {
        await directPatchRow(
          "tasks",
          "id",
          id,
          { status: newStatus },
          "updateTaskStatus",
        );
        return true;
      } catch (err) {
        console.error("Unexpected error updating task status:", err);
        setError(err instanceof Error ? err.message : "Failed to update task status");
        return false;
      }
    },
    []
  );

  // Mark task as complete
  const completeTask = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user || !profile) {
        setError("You must be logged in to complete tasks");
        return false;
      }

      try {
        // Get task details first for notification
        const taskData = await directSelectRow<{ title: string; assigned_by: string }>(
          "tasks",
          "id",
          id,
          "title, assigned_by",
          "completeTask:fetch",
        );

        await directPatchRow(
          "tasks",
          "id",
          id,
          {
            status: "completed",
            completed_at: new Date().toISOString(),
            completed_by: user.id,
          },
          "completeTask:update",
        );

        // Notify the person who assigned the task
        if (taskData?.assigned_by && taskData.assigned_by !== user.id) {
          const completerName = profile.full_name || "Someone";
          await sendNotification(
            taskData.assigned_by,
            "task_completed",
            "Task completed",
            `${completerName} completed: ${taskData.title}`,
            "task",
            id
          );
        }

        return true;
      } catch (err) {
        console.error("Unexpected error completing task:", err);
        setError(err instanceof Error ? err.message : "Failed to complete task");
        return false;
      }
    },
    [user, profile]
  );

  // Superintendent verification/sign-off
  const verifyTask = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user || !profile) {
        setError("You must be logged in to verify tasks");
        return false;
      }

      try {
        // Get task details first for notification
        const taskData = await directSelectRow<{
          title: string;
          completed_by: string | null;
          assigned_to: string | null;
        }>(
          "tasks",
          "id",
          id,
          "title, completed_by, assigned_to",
          "verifyTask:fetch",
        );

        await directPatchRow(
          "tasks",
          "id",
          id,
          {
            status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: user.id,
          },
          "verifyTask:update",
        );

        // Notify the person who completed the task (or was assigned if different)
        const notifyUserId = taskData?.completed_by || taskData?.assigned_to;
        if (notifyUserId && notifyUserId !== user.id) {
          const verifierName = profile.full_name || "Superintendent";
          await sendNotification(
            notifyUserId,
            "task_completed",
            "Task verified",
            `${verifierName} verified your work: ${taskData?.title}`,
            "task",
            id
          );
        }

        return true;
      } catch (err) {
        console.error("Unexpected error verifying task:", err);
        setError(err instanceof Error ? err.message : "Failed to verify task");
        return false;
      }
    },
    [user, profile]
  );

  // Delete task (hard delete - RLS controls who can delete)
  const deleteTask = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await directDeleteRow("tasks", "id", id, "deleteTask");

        // Remove from local state
        setTasks((prev) => prev.filter((t) => t.id !== id));
        return true;
      } catch (err) {
        console.error("Unexpected error deleting task:", err);
        setError(err instanceof Error ? err.message : "Failed to delete task");
        return false;
      }
    },
    []
  );

  // Get a single task by ID (with joined relations)
  const getTask = useCallback(
    async (id: string): Promise<TaskWithRelations | null> => {
      try {
        const data = await directSelectRow<TaskWithRelations>(
          "tasks",
          "id",
          id,
          TASK_COLUMNS,
          "getTask",
        );
        return data;
      } catch (err) {
        console.error("Unexpected error fetching task:", err);
        return null;
      }
    },
    []
  );

  // Refresh tasks using current filters
  const refreshTasks = useCallback(async () => {
    await fetchTasks(currentFiltersRef.current);
  }, [fetchTasks]);

  // Set up realtime subscription. Channels are intentionally NOT migrated —
  // they use a websocket path that's not subject to the query-builder hang.
  useEffect(() => {
    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to changes on the tasks table
    const channel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        async (payload: RealtimePostgresChangesPayload<Task>) => {
          if (payload.eventType === "INSERT") {
            // Fetch the full task with relations
            const fullTask = await getTask(payload.new.id);
            if (fullTask) {
              setTasks((prev) => {
                // Insert in correct position based on due_date and priority
                const newTasks = [...prev, fullTask];
                return newTasks.sort((a, b) => {
                  const dateCompare = a.due_date.localeCompare(b.due_date);
                  if (dateCompare !== 0) return dateCompare;
                  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
                  return priorityOrder[a.priority] - priorityOrder[b.priority];
                });
              });
            }
          } else if (payload.eventType === "UPDATE") {
            // Fetch the updated task with relations
            const fullTask = await getTask(payload.new.id);
            if (fullTask) {
              setTasks((prev) =>
                prev.map((t) => (t.id === payload.new.id ? fullTask : t))
              );
            }
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Initial fetch - use default filters to load only relevant tasks
    // This prevents loading entire task history on page load
    const today = todayLocal();
    const weekFromNow = formatLocalDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const defaultFilters: TaskFilters = initialFilters || {
      // By default, only load tasks for the next 7 days and exclude completed
      dateRange: { start: today, end: weekFromNow },
      includeCompleted: false,
    };
    fetchTasks(defaultFilters);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase, fetchTasks, getTask, initialFilters]);

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    fetchMyTasks,
    fetchTeamTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    completeTask,
    verifyTask,
    deleteTask,
    getTask,
    refreshTasks,
  };
}
