"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  PlanGoal,
  PlanLevel,
  PlanCategory,
  PlanStatus,
  Task,
  TaskCategory,
} from "@/types/database";

// Plan level labels
export const planLevelLabels: Record<PlanLevel, string> = {
  five_year: "5-Year",
  annual: "Annual",
  seasonal: "Seasonal",
  monthly: "Monthly",
  weekly: "Weekly",
};

// Plan level order for hierarchy
export const planLevelOrder: PlanLevel[] = [
  "five_year",
  "annual",
  "seasonal",
  "monthly",
  "weekly",
];

// Get child level for a given plan level
export function getChildLevel(level: PlanLevel): PlanLevel | null {
  const index = planLevelOrder.indexOf(level);
  if (index < planLevelOrder.length - 1) {
    return planLevelOrder[index + 1];
  }
  return null;
}

// Get parent level for a given plan level
export function getParentLevel(level: PlanLevel): PlanLevel | null {
  const index = planLevelOrder.indexOf(level);
  if (index > 0) {
    return planLevelOrder[index - 1];
  }
  return null;
}

// Goal category labels
export const goalCategoryLabels: Record<PlanCategory, string> = {
  turf: "Turf Management",
  irrigation: "Irrigation",
  equipment: "Equipment",
  infrastructure: "Infrastructure",
  staffing: "Staffing",
  budget: "Budget",
  environmental: "Environmental",
  safety: "Safety",
  tournament: "Tournament Prep",
  other: "Other",
};

// Goal category colors
export const goalCategoryColors: Record<PlanCategory, string> = {
  turf: "#22c55e", // green
  irrigation: "#3b82f6", // blue
  equipment: "#f97316", // orange
  infrastructure: "#8b5cf6", // purple
  staffing: "#ec4899", // pink
  budget: "#eab308", // yellow
  environmental: "#14b8a6", // teal
  safety: "#ef4444", // red
  tournament: "#06b6d4", // cyan
  other: "#6b7280", // gray
};

// Goal status labels
export const goalStatusLabels: Record<PlanStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

// Goal status colors
export const goalStatusColors: Record<PlanStatus, string> = {
  planned: "#6b7280", // gray
  in_progress: "#3b82f6", // blue
  completed: "#22c55e", // green
  deferred: "#eab308", // yellow
  cancelled: "#ef4444", // red
};

// Season labels
export const seasonLabels: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

// Month labels
export const monthLabels: Record<number, string> = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

// Types
export interface GoalFilters {
  planLevel?: PlanLevel;
  year?: number;
  season?: "spring" | "summer" | "fall" | "winter";
  month?: number;
  category?: PlanCategory;
  status?: PlanStatus;
  parentGoalId?: string;
}

export interface GoalWithStats extends PlanGoal {
  child_count?: number;
  task_count?: number;
  tasks_completed?: number;
  progress_percent?: number;
  children?: GoalWithStats[];
  linked_tasks?: Task[];
  parent?: PlanGoal;
}

export interface GoalTreeNode extends GoalWithStats {
  children: GoalTreeNode[];
}

export interface CreateGoalData {
  plan_level: PlanLevel;
  title: string;
  description?: string;
  year?: number;
  season?: "spring" | "summer" | "fall" | "winter";
  month?: number;
  week_start?: string;
  category: PlanCategory;
  status?: PlanStatus;
  budget_allocated?: number;
  target_metric?: string;
  target_value?: number;
  parent_goal_id?: string;
  sort_order?: number;
}

export interface UpdateGoalData extends Partial<CreateGoalData> {
  actual_value?: number;
  budget_spent?: number;
}

export interface PlanOverview {
  total_goals: number;
  by_status: { status: PlanStatus; count: number }[];
  budget_allocated: number;
  budget_spent: number;
  on_track: number;
  at_risk: number;
  behind: number;
  completion_percent: number;
}

export interface GoalProgress {
  goal_id: string;
  child_goals_total: number;
  child_goals_completed: number;
  tasks_total: number;
  tasks_completed: number;
  overall_percent: number;
}

// Map plan category to task category
function mapPlanCategoryToTaskCategory(planCategory: PlanCategory): TaskCategory {
  const mapping: Record<PlanCategory, TaskCategory> = {
    turf: "greens",
    irrigation: "irrigation",
    equipment: "mechanical",
    infrastructure: "construction",
    staffing: "admin",
    budget: "admin",
    environmental: "landscaping",
    safety: "safety",
    tournament: "admin",
    other: "other",
  };
  return mapping[planCategory];
}

interface UsePlanGoalsReturn {
  goals: GoalWithStats[];
  loading: boolean;
  error: string | null;
  fetchGoals: (filters?: GoalFilters) => Promise<void>;
  fetchGoal: (id: string) => Promise<GoalWithStats | null>;
  fetchGoalTree: (planLevel?: PlanLevel) => Promise<GoalTreeNode[]>;
  createGoal: (data: CreateGoalData) => Promise<PlanGoal | null>;
  updateGoal: (id: string, data: UpdateGoalData) => Promise<PlanGoal | null>;
  updateGoalStatus: (id: string, status: PlanStatus) => Promise<boolean>;
  deleteGoal: (id: string) => Promise<{ success: boolean; hasChildren: boolean }>;
  generateTasksFromGoal: (goalId: string) => Promise<Task[]>;
  fetchGoalProgress: (goalId: string) => Promise<GoalProgress | null>;
  fetchPlanOverview: (year?: number) => Promise<PlanOverview>;
}

export function usePlanGoals(): UsePlanGoalsReturn {
  const [goals, setGoals] = useState<GoalWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  /**
   * Fetch goals with optional filters
   */
  const fetchGoals = useCallback(
    async (filters?: GoalFilters) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase.from("plan_goals").select("*");

        // Apply filters
        if (filters?.planLevel) {
          query = query.eq("plan_level", filters.planLevel);
        }
        if (filters?.year) {
          query = query.eq("year", filters.year);
        }
        if (filters?.season) {
          query = query.eq("season", filters.season);
        }
        if (filters?.month) {
          query = query.eq("month", filters.month);
        }
        if (filters?.category) {
          query = query.eq("category", filters.category);
        }
        if (filters?.status) {
          query = query.eq("status", filters.status);
        }
        if (filters?.parentGoalId) {
          query = query.eq("parent_goal_id", filters.parentGoalId);
        }

        query = query.order("sort_order", { ascending: true });
        query = query.order("created_at", { ascending: true });
        query = query.limit(50); // Limit goals to prevent loading too many

        const { data, error: fetchError } = await query as { data: PlanGoal[] | null; error: Error | null };

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        // Get child counts and task stats for each goal
        const goalsWithStats: GoalWithStats[] = await Promise.all(
          (data || []).map(async (goal: PlanGoal) => {
            // Count children
            const { count: childCount } = await supabase
              .from("plan_goals")
              .select("*", { count: "exact", head: true })
              .eq("parent_goal_id", goal.id) as { count: number | null };

            // Count linked tasks
            const { data: tasks } = await supabase
              .from("tasks")
              .select("id, status")
              .eq("plan_goal_id", goal.id) as { data: Pick<Task, "id" | "status">[] | null };

            const taskCount = tasks?.length || 0;
            const tasksCompleted =
              tasks?.filter(
                (t) => t.status === "completed" || t.status === "verified"
              ).length || 0;

            // Calculate progress
            let progressPercent = 0;
            if (taskCount > 0) {
              progressPercent = Math.round((tasksCompleted / taskCount) * 100);
            } else if (childCount && childCount > 0) {
              // If no tasks, calculate based on children status
              const { data: children } = await supabase
                .from("plan_goals")
                .select("status")
                .eq("parent_goal_id", goal.id) as { data: { status: PlanStatus }[] | null };

              const completedChildren =
                children?.filter((c) => c.status === "completed").length || 0;
              progressPercent = Math.round(
                (completedChildren / (childCount || 1)) * 100
              );
            }

            return {
              ...goal,
              child_count: childCount || 0,
              task_count: taskCount,
              tasks_completed: tasksCompleted,
              progress_percent: progressPercent,
            };
          })
        );

        setGoals(goalsWithStats);
      } catch (err) {
        console.error("Error fetching goals:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch goals");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Fetch a single goal with full details
   */
  const fetchGoal = useCallback(
    async (id: string): Promise<GoalWithStats | null> => {
      try {
        // Fetch the goal
        const { data: goal, error: goalError } = await supabase
          .from("plan_goals")
          .select("*")
          .eq("id", id)
          .single() as { data: PlanGoal | null; error: Error | null };

        if (goalError || !goal) {
          console.error("Error fetching goal:", goalError);
          return null;
        }

        // Fetch parent if exists
        let parent: PlanGoal | undefined;
        if (goal.parent_goal_id) {
          const { data: parentData } = await supabase
            .from("plan_goals")
            .select("*")
            .eq("id", goal.parent_goal_id)
            .single() as { data: PlanGoal | null };
          parent = parentData || undefined;
        }

        // Fetch children
        const { data: children } = await supabase
          .from("plan_goals")
          .select("*")
          .eq("parent_goal_id", id)
          .order("sort_order", { ascending: true }) as { data: PlanGoal[] | null };

        // Fetch linked tasks
        const { data: linkedTasks } = await supabase
          .from("tasks")
          .select("*")
          .eq("plan_goal_id", id)
          .order("due_date", { ascending: true }) as { data: Task[] | null };

        // Calculate stats
        const childCount = children?.length || 0;
        const completedChildren =
          children?.filter((c) => c.status === "completed").length || 0;
        const taskCount = linkedTasks?.length || 0;
        const tasksCompleted =
          linkedTasks?.filter(
            (t) => t.status === "completed" || t.status === "verified"
          ).length || 0;

        // Overall progress - weight children and tasks equally if both exist
        let progressPercent = 0;
        if (childCount > 0 && taskCount > 0) {
          const childProgress = (completedChildren / childCount) * 50;
          const taskProgress = (tasksCompleted / taskCount) * 50;
          progressPercent = Math.round(childProgress + taskProgress);
        } else if (childCount > 0) {
          progressPercent = Math.round((completedChildren / childCount) * 100);
        } else if (taskCount > 0) {
          progressPercent = Math.round((tasksCompleted / taskCount) * 100);
        }

        // Add stats to children
        const childrenWithStats: GoalWithStats[] = (children || []).map((child) => ({
          ...child,
          child_count: 0,
          task_count: 0,
          tasks_completed: 0,
          progress_percent: child.status === "completed" ? 100 : 0,
        }));

        return {
          ...goal,
          parent,
          children: childrenWithStats,
          linked_tasks: linkedTasks || [],
          child_count: childCount,
          task_count: taskCount,
          tasks_completed: tasksCompleted,
          progress_percent: progressPercent,
        };
      } catch (err) {
        console.error("Error fetching goal:", err);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Fetch hierarchical goal tree
   */
  const fetchGoalTree = useCallback(
    async (planLevel?: PlanLevel): Promise<GoalTreeNode[]> => {
      try {
        // Fetch all goals (or filter by starting level)
        let query = supabase.from("plan_goals").select("*");

        if (planLevel) {
          // Get goals at this level and all children below
          const levelIndex = planLevelOrder.indexOf(planLevel);
          const levelsToInclude = planLevelOrder.slice(levelIndex);
          query = query.in("plan_level", levelsToInclude);
        }

        query = query.order("sort_order", { ascending: true });

        const { data, error: fetchError } = await query as { data: PlanGoal[] | null; error: Error | null };

        if (fetchError) {
          console.error("Error fetching goal tree:", fetchError);
          return [];
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Build tree structure
        const goalMap = new Map<string, GoalTreeNode>();
        const roots: GoalTreeNode[] = [];

        // First pass: create all nodes
        data.forEach((goal: PlanGoal) => {
          goalMap.set(goal.id, {
            ...goal,
            children: [],
            child_count: 0,
            task_count: 0,
            tasks_completed: 0,
            progress_percent: goal.status === "completed" ? 100 : 0,
          });
        });

        // Second pass: link children to parents
        data.forEach((goal: PlanGoal) => {
          const node = goalMap.get(goal.id)!;
          if (goal.parent_goal_id && goalMap.has(goal.parent_goal_id)) {
            const parent = goalMap.get(goal.parent_goal_id)!;
            parent.children.push(node);
            parent.child_count = parent.children.length;
          } else {
            // No parent or parent not in result set - this is a root
            roots.push(node);
          }
        });

        return roots;
      } catch (err) {
        console.error("Error fetching goal tree:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Create a new goal
   */
  const createGoal = useCallback(
    async (data: CreateGoalData): Promise<PlanGoal | null> => {
      setLoading(true);
      setError(null);

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const goalData = {
          ...data,
          status: data.status || "planned",
          budget_spent: 0,
          created_by: user?.id || null,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newGoal, error: createError } = await (supabase as any)
          .from("plan_goals")
          .insert(goalData)
          .select()
          .single() as { data: PlanGoal | null; error: Error | null };

        if (createError) {
          throw new Error(createError.message);
        }

        return newGoal;
      } catch (err) {
        console.error("Error creating goal:", err);
        setError(err instanceof Error ? err.message : "Failed to create goal");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Update a goal
   */
  const updateGoal = useCallback(
    async (id: string, data: UpdateGoalData): Promise<PlanGoal | null> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updatedGoal, error: updateError } = await (supabase as any)
          .from("plan_goals")
          .update(data)
          .eq("id", id)
          .select()
          .single() as { data: PlanGoal | null; error: Error | null };

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setGoals((prev) =>
          prev.map((g) => (g.id === id ? { ...g, ...updatedGoal } : g))
        );

        return updatedGoal;
      } catch (err) {
        console.error("Error updating goal:", err);
        setError(err instanceof Error ? err.message : "Failed to update goal");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Quick status update
   */
  const updateGoalStatus = useCallback(
    async (id: string, status: PlanStatus): Promise<boolean> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("plan_goals")
          .update({ status })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Update local state
        setGoals((prev) =>
          prev.map((g) => (g.id === id ? { ...g, status } : g))
        );

        return true;
      } catch (err) {
        console.error("Error updating goal status:", err);
        setError(err instanceof Error ? err.message : "Failed to update status");
        return false;
      }
    },
    [supabase]
  );

  /**
   * Delete a goal
   */
  const deleteGoal = useCallback(
    async (id: string): Promise<{ success: boolean; hasChildren: boolean }> => {
      try {
        // Check for children
        const { count } = await supabase
          .from("plan_goals")
          .select("*", { count: "exact", head: true })
          .eq("parent_goal_id", id) as { count: number | null };

        if (count && count > 0) {
          return { success: false, hasChildren: true };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase as any)
          .from("plan_goals")
          .delete()
          .eq("id", id) as { error: Error | null };

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        // Update local state
        setGoals((prev) => prev.filter((g) => g.id !== id));

        return { success: true, hasChildren: false };
      } catch (err) {
        console.error("Error deleting goal:", err);
        setError(err instanceof Error ? err.message : "Failed to delete goal");
        return { success: false, hasChildren: false };
      }
    },
    [supabase]
  );

  /**
   * Generate tasks from a goal's description
   */
  const generateTasksFromGoal = useCallback(
    async (goalId: string): Promise<Task[]> => {
      try {
        // Fetch the goal
        const { data: goal, error: goalError } = await supabase
          .from("plan_goals")
          .select("*")
          .eq("id", goalId)
          .single() as { data: PlanGoal | null; error: Error | null };

        if (goalError || !goal) {
          console.error("Goal not found");
          return [];
        }

        // Only generate from monthly or weekly goals
        if (goal.plan_level !== "monthly" && goal.plan_level !== "weekly") {
          console.error("Can only generate tasks from monthly or weekly goals");
          return [];
        }

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Parse description for action items (lines starting with - or *)
        const description = goal.description || goal.title;
        const lines = description.split("\n");
        const actionItems = lines.filter(
          (line: string) =>
            line.trim().startsWith("-") ||
            line.trim().startsWith("*") ||
            line.trim().startsWith("•")
        );

        // If no action items found, create one task from the title
        const taskTitles =
          actionItems.length > 0
            ? actionItems.map((item: string) =>
                item.replace(/^[\-\*\•]\s*/, "").trim()
              )
            : [goal.title];

        // Calculate due dates based on goal timeline
        let baseDueDate: string;
        if (goal.week_start) {
          baseDueDate = goal.week_start;
        } else if (goal.month && goal.year) {
          // First day of the month
          baseDueDate = `${goal.year}-${String(goal.month).padStart(2, "0")}-01`;
        } else if (goal.year) {
          baseDueDate = `${goal.year}-01-01`;
        } else {
          baseDueDate = new Date().toISOString().split("T")[0];
        }

        // Create tasks
        const tasksToCreate = taskTitles.map((title: string, index: number) => ({
          title,
          description: `Generated from goal: ${goal.title}`,
          category: mapPlanCategoryToTaskCategory(goal.category),
          priority: "normal" as const,
          status: "pending" as const,
          due_date: baseDueDate,
          plan_goal_id: goalId,
          assigned_by: user?.id || null,
          hole_numbers: [],
          equipment_needed: [],
          materials_needed: [],
          checklist: [],
          requires_photo_before: false,
          requires_photo_after: false,
          weather_dependent: false,
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: createdTasks, error: createError } = await (supabase as any)
          .from("tasks")
          .insert(tasksToCreate)
          .select() as { data: Task[] | null; error: Error | null };

        if (createError) {
          console.error("Error creating tasks:", createError);
          return [];
        }

        // Update goal status to in_progress if it was planned
        if (goal.status === "planned") {
          await updateGoalStatus(goalId, "in_progress");
        }

        return createdTasks || [];
      } catch (err) {
        console.error("Error generating tasks:", err);
        return [];
      }
    },
    [supabase, updateGoalStatus]
  );

  /**
   * Calculate goal progress
   */
  const fetchGoalProgress = useCallback(
    async (goalId: string): Promise<GoalProgress | null> => {
      try {
        // Count child goals
        const { data: children } = await supabase
          .from("plan_goals")
          .select("status")
          .eq("parent_goal_id", goalId) as { data: { status: PlanStatus }[] | null };

        const childGoalsTotal = children?.length || 0;
        const childGoalsCompleted =
          children?.filter((c) => c.status === "completed").length || 0;

        // Count linked tasks
        const { data: tasks } = await supabase
          .from("tasks")
          .select("status")
          .eq("plan_goal_id", goalId) as { data: Pick<Task, "status">[] | null };

        const tasksTotal = tasks?.length || 0;
        const tasksCompleted =
          tasks?.filter(
            (t) => t.status === "completed" || t.status === "verified"
          ).length || 0;

        // Calculate overall progress
        let overallPercent = 0;
        const totalItems = childGoalsTotal + tasksTotal;
        const completedItems = childGoalsCompleted + tasksCompleted;

        if (totalItems > 0) {
          overallPercent = Math.round((completedItems / totalItems) * 100);
        }

        return {
          goal_id: goalId,
          child_goals_total: childGoalsTotal,
          child_goals_completed: childGoalsCompleted,
          tasks_total: tasksTotal,
          tasks_completed: tasksCompleted,
          overall_percent: overallPercent,
        };
      } catch (err) {
        console.error("Error fetching goal progress:", err);
        return null;
      }
    },
    [supabase]
  );

  /**
   * Fetch plan overview stats
   */
  const fetchPlanOverview = useCallback(
    async (year?: number): Promise<PlanOverview> => {
      const defaultOverview: PlanOverview = {
        total_goals: 0,
        by_status: [],
        budget_allocated: 0,
        budget_spent: 0,
        on_track: 0,
        at_risk: 0,
        behind: 0,
        completion_percent: 0,
      };

      try {
        let query = supabase.from("plan_goals").select("*");

        if (year) {
          query = query.eq("year", year);
        }

        const { data, error: fetchError } = await query as { data: PlanGoal[] | null; error: Error | null };

        if (fetchError) {
          console.error("Error fetching plan overview:", fetchError);
          return defaultOverview;
        }

        if (!data || data.length === 0) {
          return defaultOverview;
        }

        // Calculate stats
        let budgetAllocated = 0;
        let budgetSpent = 0;
        let onTrack = 0;
        let atRisk = 0;
        let behind = 0;
        let completed = 0;

        const statusCounts: Record<PlanStatus, number> = {
          planned: 0,
          in_progress: 0,
          completed: 0,
          deferred: 0,
          cancelled: 0,
        };

        data.forEach((goal: PlanGoal) => {
          budgetAllocated += goal.budget_allocated || 0;
          budgetSpent += goal.budget_spent || 0;
          statusCounts[goal.status as PlanStatus]++;

          if (goal.status === "completed") {
            completed++;
            onTrack++;
          } else if (goal.status === "in_progress") {
            // Check if on track based on timeline
            // For now, assume in_progress = on track
            onTrack++;
          } else if (goal.status === "deferred") {
            atRisk++;
          } else if (goal.status === "cancelled") {
            behind++;
          }
        });

        const byStatus = Object.entries(statusCounts)
          .filter(([_, count]) => count > 0)
          .map(([status, count]) => ({
            status: status as PlanStatus,
            count,
          }));

        const completionPercent =
          data.length > 0 ? Math.round((completed / data.length) * 100) : 0;

        return {
          total_goals: data.length,
          by_status: byStatus,
          budget_allocated: budgetAllocated,
          budget_spent: budgetSpent,
          on_track: onTrack,
          at_risk: atRisk,
          behind: behind,
          completion_percent: completionPercent,
        };
      } catch (err) {
        console.error("Error fetching plan overview:", err);
        return defaultOverview;
      }
    },
    [supabase]
  );

  return {
    goals,
    loading,
    error,
    fetchGoals,
    fetchGoal,
    fetchGoalTree,
    createGoal,
    updateGoal,
    updateGoalStatus,
    deleteGoal,
    generateTasksFromGoal,
    fetchGoalProgress,
    fetchPlanOverview,
  };
}
