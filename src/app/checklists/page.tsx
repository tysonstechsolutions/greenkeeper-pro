"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck,
  Check,
  Circle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import type { Task, ChecklistItem } from "@/types/database";

interface DailyTask extends Task {
  checklistProgress: { done: number; total: number };
}

export default function ChecklistsPage() {
  const { profile, user, isSuper, isAsstSuper } = useAuth();
  const isManager = isSuper || isAsstSuper;
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [allCrewTasks, setAllCrewTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"mine" | "crew">("mine");
  const supabase = createClient();

  const today = new Date().toISOString().split("T")[0];

  const enrichTask = (task: Task): DailyTask => {
    const checklist = (task.checklist || []) as ChecklistItem[];
    const done = checklist.filter((c) => c.checked).length;
    return { ...task, checklistProgress: { done, total: checklist.length } };
  };

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const queries = [
        // My tasks for today
        withTimeout(
           
          supabase.from("tasks")
            .select("*")
            .eq("assigned_to", user.id)
            .eq("due_date", today)
            .in("status", ["pending", "in_progress"])
            .order("priority", { ascending: true }),
          8000,
          { data: null, error: null }
        ),
      ];

      // If manager, also fetch all crew tasks
      if (isManager) {
        queries.push(
          withTimeout(
             
            supabase.from("tasks")
              .select("*, profiles:assigned_to(full_name, role)")
              .eq("due_date", today)
              .in("status", ["pending", "in_progress"])
              .not("assigned_to", "is", null)
              .order("priority", { ascending: true }),
            8000,
            { data: null, error: null }
          )
        );
      }

      const results = await Promise.all(queries);
      const myTasks = ((results[0].data || []) as Task[]).map(enrichTask);
      setTasks(myTasks);

      if (isManager && results[1]) {
        const crew = ((results[1].data || []) as Task[]).map(enrichTask);
        setAllCrewTasks(crew);
      }

      // Auto-expand first task with checklist items
      const firstWithChecklist = myTasks.find((t) => t.checklistProgress.total > 0);
      if (firstWithChecklist && !expandedTaskId) {
        setExpandedTaskId(firstWithChecklist.id);
      }
    } catch (err) {
      console.error("Error fetching checklists:", err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, today, isManager, expandedTaskId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleChecklistItem = async (taskId: string, itemId: string) => {
    setSaving(itemId);

    // Optimistic update
    const updateTasks = (prev: DailyTask[]) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const updated = (t.checklist || []).map((c: ChecklistItem) =>
          c.id === itemId ? { ...c, checked: !c.checked } : c
        );
        const done = updated.filter((c: ChecklistItem) => c.checked).length;
        return { ...t, checklist: updated, checklistProgress: { done, total: updated.length } };
      });

    setTasks(updateTasks);
    setAllCrewTasks(updateTasks);

    try {
      const task = tasks.find((t) => t.id === taskId) || allCrewTasks.find((t) => t.id === taskId);
      if (!task) return;

      const updated = ((task.checklist || []) as ChecklistItem[]).map((c) =>
        c.id === itemId ? { ...c, checked: !c.checked } : c
      );

      // Check if all items are now done
      const allDone = updated.every((c) => c.checked);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { checklist: updated };
      if (allDone && updated.length > 0) {
        updateData.status = "completed";
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = user?.id;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("tasks")
        .update(updateData)
        .eq("id", taskId);
    } catch (err) {
      console.error("Error updating checklist:", err);
      // Revert on error
      fetchTasks();
    } finally {
      setSaving(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "border-l-purple-500 bg-purple-500/5";
      case "high": return "border-l-red-500 bg-red-500/5";
      case "normal": return "border-l-amber-500";
      default: return "border-l-gray-300";
    }
  };

  const renderTaskCard = (task: DailyTask, showAssignee = false) => {
    const isExpanded = expandedTaskId === task.id;
    const checklist = (task.checklist || []) as ChecklistItem[];
    const pct = task.checklistProgress.total > 0
      ? Math.round((task.checklistProgress.done / task.checklistProgress.total) * 100)
      : 0;
    const allDone = task.checklistProgress.total > 0 && task.checklistProgress.done === task.checklistProgress.total;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assigneeName = (task as any).profiles?.full_name;

    return (
      <div
        key={task.id}
        className={`rounded-xl border-l-4 border border-border overflow-hidden transition-colors ${
          allDone ? "opacity-60 bg-green-500/5 border-l-green-500" : getPriorityColor(task.priority)
        }`}
      >
        {/* Header */}
        <button
          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
          className="w-full text-left p-4 flex items-center gap-3"
        >
          {allDone ? (
            <Check className="w-5 h-5 text-green-500 shrink-0" />
          ) : task.checklistProgress.total > 0 ? (
            <div className="relative w-5 h-5 shrink-0">
              <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
                <circle
                  cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-primary"
                  strokeDasharray={`${pct * 0.502} 100`}
                />
              </svg>
            </div>
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium text-sm ${allDone ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                task.priority === "critical" ? "bg-purple-500/10 text-purple-600"
                : task.priority === "high" ? "bg-red-500/10 text-red-600"
                : "bg-muted text-muted-foreground"
              }`}>
                {task.priority}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {task.checklistProgress.total > 0 && (
                <span>{task.checklistProgress.done}/{task.checklistProgress.total} items</span>
              )}
              {showAssignee && assigneeName && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {assigneeName}
                </span>
              )}
              {task.category && (
                <span className="capitalize">{task.category.replace("_", " ")}</span>
              )}
            </div>
          </div>

          {checklist.length > 0 && (
            isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Checklist items */}
        {isExpanded && checklist.length > 0 && (
          <div className="px-4 pb-4 space-y-1">
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            {checklist.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleChecklistItem(task.id, item.id)}
                disabled={saving === item.id}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                {saving === item.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                ) : item.checked ? (
                  <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-md border-2 border-muted-foreground/30 shrink-0" />
                )}
                <span className={`text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                  {item.text}
                </span>
              </button>
            ))}

            {task.notes && (
              <div className="mt-2 p-2.5 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                {task.notes}
              </div>
            )}
          </div>
        )}

        {/* No checklist items — just show description */}
        {isExpanded && checklist.length === 0 && task.description && (
          <div className="px-4 pb-4">
            <p className="text-sm text-muted-foreground">{task.description}</p>
          </div>
        )}
      </div>
    );
  };

  // Stats
  const myStats = {
    total: tasks.length,
    done: tasks.filter((t) => t.checklistProgress.total > 0 && t.checklistProgress.done === t.checklistProgress.total).length,
    itemsDone: tasks.reduce((sum, t) => sum + t.checklistProgress.done, 0),
    itemsTotal: tasks.reduce((sum, t) => sum + t.checklistProgress.total, 0),
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            Daily Checklists
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchTasks} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Manager toggle */}
      {isManager && (
        <div className="flex gap-1 mb-6 p-1 bg-muted/60 rounded-lg w-fit">
          <button
            onClick={() => setViewMode("mine")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            My Tasks
          </button>
          <button
            onClick={() => setViewMode("crew")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "crew" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            All Crew
          </button>
        </div>
      )}

      {/* Progress summary */}
      {viewMode === "mine" && myStats.itemsTotal > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Today&apos;s Progress</span>
            <span className="text-sm font-bold text-primary">
              {myStats.itemsTotal > 0 ? Math.round((myStats.itemsDone / myStats.itemsTotal) * 100) : 0}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${myStats.itemsTotal > 0 ? (myStats.itemsDone / myStats.itemsTotal) * 100 : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{myStats.itemsDone} of {myStats.itemsTotal} items</span>
            <span>{myStats.done} of {myStats.total} tasks complete</span>
          </div>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/60 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : viewMode === "mine" ? (
        tasks.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <h2 className="font-semibold text-lg">No tasks for today</h2>
            <p className="text-sm text-muted-foreground mt-1">You&apos;re all clear. Check the task board for upcoming work.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => renderTaskCard(task))}
          </div>
        )
      ) : (
        allCrewTasks.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No crew tasks assigned for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allCrewTasks.map((task) => renderTaskCard(task, true))}
          </div>
        )
      )}
    </div>
  );
}
