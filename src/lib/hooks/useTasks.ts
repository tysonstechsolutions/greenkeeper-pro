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
  Database,
} from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { sendNotification } from "./useNotifications";

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

export function useTasks(initialFilters?: TaskFilters): UseTasksReturn {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useAuth();

  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentFiltersRef = useRef<TaskFilters | undefined>(initialFilters);

  // Build the base query with joins
  const buildTaskQuery = useCallback(() => {
    return supabase
      .from("tasks")
      .select(`
        *,
        assigned_user:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, role),
        zone:course_zones!tasks_zone_id_fkey(id, name, zone_type, hole_number),
        assigned_by_user:profiles!tasks_assigned_by_fkey(id, full_name),
        completed_by_user:profiles!tasks_completed_by_fkey(id, full_name),
        verified_by_user:profiles!tasks_verified_by_fkey(id, full_name)
      `);
  }, [supabase]);

  // Apply filters to a query
  const applyFilters = useCallback(
    (
      query: ReturnType<typeof buildTaskQuery>,
      filters?: TaskFilters
    ) => {
      let q = query;

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          q = q.in("status", filters.status);
        } else {
          q = q.eq("status", filters.status);
        }
      }

      if (filters?.category) {
        if (Array.isArray(filters.category)) {
          q = q.in("category", filters.category);
        } else {
          q = q.eq("category", filters.category);
        }
      }

      if (filters?.priority) {
        if (Array.isArray(filters.priority)) {
          q = q.in("priority", filters.priority);
        } else {
          q = q.eq("priority", filters.priority);
        }
      }

      if (filters?.assignedTo !== undefined) {
        if (filters.assignedTo === null) {
          q = q.is("assigned_to", null);
        } else {
          q = q.eq("assigned_to", filters.assignedTo);
        }
      }

      if (filters?.zoneId) {
        q = q.eq("zone_id", filters.zoneId);
      }

      if (filters?.dateRange) {
        q = q
          .gte("due_date", filters.dateRange.start)
          .lte("due_date", filters.dateRange.end);
      }

      if (filters?.search) {
        q = q.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      if (!filters?.includeCompleted) {
        q = q.not("status", "in", '("completed","verified","cancelled")');
      }

      return q;
    },
    []
  );

  // Fetch tasks with filters
  const fetchTasks = useCallback(
    async (filters?: TaskFilters) => {
      setLoading(true);
      setError(null);
      currentFiltersRef.current = filters;

      try {
        let query = buildTaskQuery();
        query = applyFilters(query, filters);
        query = query.order("due_date", { ascending: true })
          .order("priority", { ascending: true }) // critical=0, high=1, etc.
          .limit(100); // Limit to prevent loading too many tasks

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching tasks:", fetchError);
          setError(fetchError.message);
          return;
        }

        setTasks((data as TaskWithRelations[]) || []);
      } catch (err) {
        console.error("Unexpected error fetching tasks:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    [buildTaskQuery, applyFilters]
  );

  // Fetch tasks assigned to current user for a specific date
  const fetchMyTasks = useCallback(
    async (date: string): Promise<TaskWithRelations[]> => {
      if (!user) return [];

      try {
        const { data, error: fetchError } = await buildTaskQuery()
          .eq("assigned_to", user.id)
          .eq("due_date", date)
          .not("status", "in", '("cancelled")')
          .order("priority", { ascending: true })
          .order("due_time", { ascending: true, nullsFirst: false })
          .limit(50); // Limit to prevent loading too many tasks

        if (fetchError) {
          console.error("Error fetching my tasks:", fetchError);
          return [];
        }

        return (data as TaskWithRelations[]) || [];
      } catch (err) {
        console.error("Unexpected error fetching my tasks:", err);
        return [];
      }
    },
    [user, buildTaskQuery]
  );

  // Fetch all team tasks for a specific date (super/foreman view)
  const fetchTeamTasks = useCallback(
    async (date: string): Promise<TaskWithRelations[]> => {
      try {
        const { data, error: fetchError } = await buildTaskQuery()
          .eq("due_date", date)
          .not("status", "in", '("cancelled")')
          .order("priority", { ascending: true })
          .order("assigned_to", { ascending: true, nullsFirst: false })
          .order("due_time", { ascending: true, nullsFirst: false })
          .limit(100); // Limit to prevent loading too many tasks

        if (fetchError) {
          console.error("Error fetching team tasks:", fetchError);
          return [];
        }

        return (data as TaskWithRelations[]) || [];
      } catch (err) {
        console.error("Unexpected error fetching team tasks:", err);
        return [];
      }
    },
    [buildTaskQuery]
  );

  // Create a new task
  const createTask = useCallback(
    async (data: CreateTaskData): Promise<Task | null> => {
      if (!profile) {
        setError("You must be logged in to create tasks");
        return null;
      }

      try {
        const insertData = {
          title: data.title,
          description: data.description ?? null,
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newTask, error: insertError } = await (supabase as any)
          .from("tasks")
          .insert(insertData)
          .select()
          .single() as { data: Task | null; error: Error | null };

        if (insertError || !newTask) {
          console.error("Error creating task:", insertError);
          setError(insertError?.message || "Failed to create task");
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
        setError("Failed to create task");
        return null;
      }
    },
    [profile, supabase]
  );

  // Update a task
  const updateTask = useCallback(
    async (id: string, data: UpdateTaskData): Promise<Task | null> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase as any)
          .from("tasks")
          .update(data)
          .eq("id", id)
          .select()
          .single() as { data: Task | null; error: Error | null };

        if (updateError) {
          console.error("Error updating task:", updateError);
          setError(updateError.message);
          return null;
        }

        return updated;
      } catch (err) {
        console.error("Unexpected error updating task:", err);
        setError("Failed to update task");
        return null;
      }
    },
    [supabase]
  );

  // Quick status change
  const updateTaskStatus = useCallback(
    async (id: string, newStatus: TaskStatus): Promise<boolean> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("tasks")
          .update({ status: newStatus })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          console.error("Error updating task status:", updateError);
          setError(updateError.message);
          return false;
        }

        return true;
      } catch (err) {
        console.error("Unexpected error updating task status:", err);
        setError("Failed to update task status");
        return false;
      }
    },
    [supabase]
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
        const { data: taskData } = await supabase
          .from("tasks")
          .select("title, assigned_by")
          .eq("id", id)
          .single() as { data: { title: string; assigned_by: string } | null };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("tasks")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            completed_by: user.id,
          })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          console.error("Error completing task:", updateError);
          setError(updateError.message);
          return false;
        }

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
        setError("Failed to complete task");
        return false;
      }
    },
    [user, profile, supabase]
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
        const { data: taskData } = await supabase
          .from("tasks")
          .select("title, completed_by, assigned_to")
          .eq("id", id)
          .single() as { data: { title: string; completed_by: string | null; assigned_to: string | null } | null };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("tasks")
          .update({
            status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: user.id,
          })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          console.error("Error verifying task:", updateError);
          setError(updateError.message);
          return false;
        }

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
        setError("Failed to verify task");
        return false;
      }
    },
    [user, profile, supabase]
  );

  // Delete task (hard delete - RLS controls who can delete)
  const deleteTask = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from("tasks")
          .delete()
          .eq("id", id);

        if (deleteError) {
          console.error("Error deleting task:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Remove from local state
        setTasks((prev) => prev.filter((t) => t.id !== id));
        return true;
      } catch (err) {
        console.error("Unexpected error deleting task:", err);
        setError("Failed to delete task");
        return false;
      }
    },
    [supabase]
  );

  // Get a single task by ID
  const getTask = useCallback(
    async (id: string): Promise<TaskWithRelations | null> => {
      try {
        const { data, error: fetchError } = await buildTaskQuery()
          .eq("id", id)
          .single();

        if (fetchError) {
          console.error("Error fetching task:", fetchError);
          return null;
        }

        return data as TaskWithRelations;
      } catch (err) {
        console.error("Unexpected error fetching task:", err);
        return null;
      }
    },
    [buildTaskQuery]
  );

  // Refresh tasks using current filters
  const refreshTasks = useCallback(async () => {
    await fetchTasks(currentFiltersRef.current);
  }, [fetchTasks]);

  // Set up realtime subscription
  useEffect(() => {
    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to changes on the tasks table
    const channel = supabase
      .channel("tasks-realtime")
      .on<Task>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        async (payload) => {
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
    const today = new Date().toISOString().split("T")[0];
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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
