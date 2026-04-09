"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Target,
  ArrowLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Copy,
  Plus,
  ListTodo,
  Link as LinkIcon,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  MoreVertical,
  TrendingUp,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  usePlanGoals,
  planLevelLabels,
  goalCategoryLabels,
  goalCategoryColors,
  goalStatusLabels,
  goalStatusColors,
  getChildLevel,
  seasonLabels,
  monthLabels,
  type GoalWithStats,
} from "@/lib/hooks/usePlanGoals";
import { useAuth } from "@/lib/hooks/useAuth";
import type { PlanStatus, Task } from "@/types/database";

// Status icon component
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
    case "verified":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "in_progress":
      return <Clock className="w-4 h-4 text-blue-500" />;
    case "deferred":
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case "cancelled":
      return <Circle className="w-4 h-4 text-red-500" />;
    default:
      return <Circle className="w-4 h-4 text-gray-400" />;
  }
}

// Task status labels
const taskStatusLabels: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  verified: "Verified",
  deferred: "Deferred",
};

export default function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { user, isSuper, isAsstSuper } = useAuth();
  const {
    fetchGoal,
    updateGoalStatus,
    deleteGoal,
    generateTasksFromGoal,
    createGoal,
    loading,
  } = usePlanGoals();

  const [goal, setGoal] = useState<GoalWithStats | null>(null);
  const [loadingGoal, setLoadingGoal] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const showToast = (type: 'error' | 'success', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Permission check — use profile-based role checks
  const canEdit = isSuper || isAsstSuper;

  // Load goal data
  useEffect(() => {
    async function loadGoal() {
      setLoadingGoal(true);
      const data = await fetchGoal(resolvedParams.id);
      setGoal(data);
      setLoadingGoal(false);
    }
    loadGoal();
  }, [resolvedParams.id, fetchGoal]);

  // Handle status change
  const handleStatusChange = async (newStatus: PlanStatus) => {
    if (!goal) return;
    const success = await updateGoalStatus(goal.id, newStatus);
    if (success) {
      setGoal((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!goal) return;
    setDeleting(true);
    const result = await deleteGoal(goal.id);
    setDeleting(false);

    if (result.hasChildren) {
      showToast('error', 'Cannot delete a goal that has sub-goals. Delete sub-goals first.');
      setShowDeleteDialog(false);
      return;
    }

    if (result.success) {
      router.push("/plan");
    }
  };

  // Handle generate tasks
  const handleGenerateTasks = async () => {
    if (!goal) return;
    setGenerating(true);
    const tasks = await generateTasksFromGoal(goal.id);
    if (tasks.length > 0) {
      // Refresh goal data
      const updatedGoal = await fetchGoal(goal.id);
      setGoal(updatedGoal);
    }
    setGenerating(false);
  };

  // Handle duplicate
  const handleDuplicate = async () => {
    if (!goal) return;
    setDuplicating(true);

    const duplicated = await createGoal({
      plan_level: goal.plan_level,
      title: `${goal.title} (Copy)`,
      description: goal.description || undefined,
      year: goal.year || undefined,
      season: goal.season as "spring" | "summer" | "fall" | "winter" | undefined,
      month: goal.month || undefined,
      week_start: goal.week_start || undefined,
      category: goal.category,
      status: "planned",
      budget_allocated: goal.budget_allocated || undefined,
      target_metric: goal.target_metric || undefined,
      target_value: goal.target_value || undefined,
      parent_goal_id: goal.parent_goal_id || undefined,
    });

    setDuplicating(false);

    if (duplicated) {
      router.push(`/plan/${duplicated.id}`);
    }
  };

  // Format timeline string
  const getTimelineString = () => {
    if (!goal) return "";
    const parts: string[] = [];
    if (goal.year) parts.push(goal.year.toString());
    if (goal.season) parts.push(seasonLabels[goal.season] || goal.season);
    if (goal.month) parts.push(monthLabels[goal.month] || `Month ${goal.month}`);
    if (goal.week_start) {
      const weekDate = new Date(goal.week_start);
      parts.push(`Week of ${weekDate.toLocaleDateString()}`);
    }
    return parts.join(" • ");
  };

  // Loading state
  if (loadingGoal) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found
  if (!goal) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Goal Not Found</h1>
        <p className="text-muted-foreground mb-4">
          This goal may have been deleted or doesn&apos;t exist.
        </p>
        <Button variant="outline" onClick={() => router.push("/plan")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Plan
        </Button>
      </div>
    );
  }

  const childLevel = getChildLevel(goal.plan_level);
  const budgetRemaining =
    (goal.budget_allocated || 0) - (goal.budget_spent || 0);
  const budgetPercent =
    goal.budget_allocated && goal.budget_allocated > 0
      ? Math.round((goal.budget_spent || 0) / goal.budget_allocated * 100)
      : 0;

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Toast Message */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg ${
          toastMessage.type === 'error'
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-gray-500 hover:text-gray-700">×</button>
        </div>
      )}
      {/* Header */}
      <DetailPageHeader
        backHref={goal.parent ? `/plan/${goal.parent.id}` : "/plan"}
        backLabel={goal.parent ? goal.parent.title : "Annual Plan"}
        title={
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span>{goal.title}</span>
            <Badge
              variant="outline"
              style={{
                borderColor: goalCategoryColors[goal.category],
                color: goalCategoryColors[goal.category],
              }}
            >
              {goalCategoryLabels[goal.category]}
            </Badge>
            <Badge variant="secondary">
              {planLevelLabels[goal.plan_level]}
            </Badge>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{getTimelineString() || "No timeline set"}</span>
          </div>
        }
        className="mb-6"
        actions={
          canEdit && (
            <div className="flex items-center gap-2">
              {/* Status dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    style={{
                      borderColor: goalStatusColors[goal.status],
                      color: goalStatusColors[goal.status],
                    }}
                  >
                    <StatusIcon status={goal.status} />
                    <span className="ml-2">{goalStatusLabels[goal.status]}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(
                    Object.keys(goalStatusLabels) as PlanStatus[]
                  ).map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className="flex items-center gap-2"
                    >
                      <StatusIcon status={status} />
                      {goalStatusLabels[status]}
                      {status === goal.status && (
                        <CheckCircle2 className="w-4 h-4 ml-auto text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Actions dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => router.push(`/plan/${goal.id}/edit`)}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Goal
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDuplicate}
                    disabled={duplicating}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {duplicating ? "Duplicating..." : "Duplicate"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Goal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />

      {/* Progress Section */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Overall Progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  Overall Progress
                </span>
                <span className="text-lg font-bold">
                  {goal.progress_percent || 0}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${goal.progress_percent || 0}%` }}
                />
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {goal.children?.filter((c) => c.status === "completed")
                    .length || 0}
                  /{goal.child_count || 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Sub-Goals Completed
                </div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {goal.tasks_completed || 0}/{goal.task_count || 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Tasks Completed
                </div>
              </div>
            </div>

            {/* Target Metric */}
            {goal.target_metric && (
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  Target: {goal.target_metric}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">
                    {goal.actual_value ?? "—"} / {goal.target_value ?? "—"}
                  </span>
                  {goal.target_value && goal.actual_value !== null && (
                    <Badge
                      variant={
                        (goal.actual_value || 0) >= goal.target_value
                          ? "default"
                          : "secondary"
                      }
                    >
                      {Math.round(
                        ((goal.actual_value || 0) / goal.target_value) * 100
                      )}
                      %
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {goal.description && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{goal.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Budget Section */}
      {(goal.budget_allocated || goal.budget_spent) && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Budget Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Spent: ${(goal.budget_spent || 0).toLocaleString()}
                  </span>
                  <span className="text-sm font-medium">
                    of ${(goal.budget_allocated || 0).toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetPercent > 90
                        ? "bg-red-500"
                        : budgetPercent > 75
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Budget Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">
                    ${(goal.budget_allocated || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Allocated</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">
                    ${(goal.budget_spent || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Spent</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-lg font-bold ${
                      budgetRemaining >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    ${Math.abs(budgetRemaining).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {budgetRemaining >= 0 ? "Remaining" : "Over Budget"}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Child Goals Section */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Sub-Goals
              {goal.child_count && goal.child_count > 0 && (
                <Badge variant="secondary">{goal.child_count}</Badge>
              )}
            </CardTitle>
            {canEdit && childLevel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  router.push(`/plan/new?parent=${goal.id}&level=${childLevel}`)
                }
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Sub-Goal
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {goal.children && goal.children.length > 0 ? (
            <div className="space-y-2">
              {goal.children.map((child) => (
                <Link
                  key={child.id}
                  href={`/plan/${child.id}`}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon status={child.status} />
                    <div>
                      <div className="font-medium">{child.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {planLevelLabels[child.plan_level]}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No sub-goals yet</p>
              {canEdit && childLevel && (
                <Button
                  size="sm"
                  variant="link"
                  className="mt-2"
                  onClick={() =>
                    router.push(
                      `/plan/new?parent=${goal.id}&level=${childLevel}`
                    )
                  }
                >
                  Create the first sub-goal
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked Tasks Section */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              Linked Tasks
              {goal.task_count && goal.task_count > 0 && (
                <Badge variant="secondary">{goal.task_count}</Badge>
              )}
            </CardTitle>
            {canEdit && (
              <div className="flex items-center gap-2">
                {(goal.plan_level === "monthly" ||
                  goal.plan_level === "weekly") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateTasks}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1" />
                    )}
                    Generate Tasks
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    router.push(`/tasks/new?goal=${goal.id}`)
                  }
                >
                  <LinkIcon className="w-4 h-4 mr-1" />
                  Link Task
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {goal.linked_tasks && goal.linked_tasks.length > 0 ? (
            <div className="space-y-2">
              {goal.linked_tasks.map((task: Task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon status={task.status} />
                    <div>
                      <div className="font-medium">{task.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {taskStatusLabels[task.status] || task.status}
                        {task.due_date && (
                          <>
                            {" • "}
                            Due {new Date(task.due_date).toLocaleDateString()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No tasks linked to this goal</p>
              {canEdit &&
                (goal.plan_level === "monthly" ||
                  goal.plan_level === "weekly") && (
                  <Button
                    size="sm"
                    variant="link"
                    className="mt-2"
                    onClick={handleGenerateTasks}
                    disabled={generating}
                  >
                    {generating
                      ? "Generating..."
                      : "Generate tasks from description"}
                  </Button>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Goal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{goal.title}&quot;? This
              action cannot be undone.
              {goal.child_count && goal.child_count > 0 && (
                <span className="block mt-2 text-yellow-600">
                  Note: This goal has {goal.child_count} sub-goals that must be
                  deleted first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || (goal.child_count || 0) > 0}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
