"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Target,
  ArrowLeft,
  Save,
  Loader2,
  Calendar,
  DollarSign,
  Tag,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePlanGoals,
  planLevelLabels,
  planLevelOrder,
  goalCategoryLabels,
  goalCategoryColors,
  seasonLabels,
  monthLabels,
  getParentLevel,
  type CreateGoalData,
  type GoalWithStats,
} from "@/lib/hooks/usePlanGoals";
import { useAuth } from "@/lib/hooks/useAuth";
import type { PlanLevel, PlanCategory } from "@/types/database";

function NewGoalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { createGoal, fetchGoal, fetchGoals, goals, loading } = usePlanGoals();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [parentGoal, setParentGoal] = useState<GoalWithStats | null>(null);
  const [potentialParents, setPotentialParents] = useState<GoalWithStats[]>([]);

  // Get URL params
  const parentId = searchParams.get("parent");
  const levelParam = searchParams.get("level") as PlanLevel | null;

  // Current year for default
  const currentYear = new Date().getFullYear();

  // Form state
  const [formData, setFormData] = useState<CreateGoalData>({
    plan_level: levelParam || "annual",
    title: "",
    description: "",
    year: currentYear,
    season: undefined,
    month: undefined,
    week_start: undefined,
    category: "turf",
    status: "planned",
    budget_allocated: undefined,
    target_metric: "",
    target_value: undefined,
    parent_goal_id: parentId || undefined,
  });

  // Permission check
  const canCreate = user?.role === "super" || user?.role === "asst_super";

  // Load parent goal if specified
  useEffect(() => {
    async function loadParent() {
      if (parentId) {
        const parent = await fetchGoal(parentId);
        setParentGoal(parent);
        if (parent) {
          // Inherit category from parent
          setFormData((prev) => ({
            ...prev,
            category: parent.category,
            year: parent.year || currentYear,
            season: parent.season as "spring" | "summer" | "fall" | "winter" | undefined,
          }));
        }
      }
    }
    loadParent();
  }, [parentId, fetchGoal, currentYear]);

  // Load potential parent goals when level changes
  useEffect(() => {
    async function loadPotentialParents() {
      const parentLevel = getParentLevel(formData.plan_level);
      if (parentLevel && !parentId) {
        await fetchGoals({ planLevel: parentLevel });
        setPotentialParents(goals);
      }
    }
    loadPotentialParents();
  }, [formData.plan_level, parentId, fetchGoals, goals]);

  if (!canCreate) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          You don&apos;t have permission to create goals.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  // Form handlers
  const updateField = <K extends keyof CreateGoalData>(
    field: K,
    value: CreateGoalData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  // Handle level change
  const handleLevelChange = (level: PlanLevel) => {
    updateField("plan_level", level);
    // Reset level-specific fields
    if (level === "five_year" || level === "annual") {
      updateField("season", undefined);
      updateField("month", undefined);
      updateField("week_start", undefined);
    } else if (level === "seasonal") {
      updateField("month", undefined);
      updateField("week_start", undefined);
    } else if (level === "monthly") {
      updateField("season", undefined);
      updateField("week_start", undefined);
    } else if (level === "weekly") {
      updateField("season", undefined);
      updateField("month", undefined);
    }
    // Clear parent if incompatible
    if (!parentId) {
      updateField("parent_goal_id", undefined);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.title.trim()) {
      setFormError("Title is required");
      return;
    }

    // Level-specific validation
    if (formData.plan_level === "seasonal" && !formData.season) {
      setFormError("Please select a season");
      return;
    }
    if (formData.plan_level === "monthly" && !formData.month) {
      setFormError("Please select a month");
      return;
    }
    if (formData.plan_level === "weekly" && !formData.week_start) {
      setFormError("Please select a week start date");
      return;
    }

    setSubmitting(true);

    try {
      const cleanData: CreateGoalData = {
        ...formData,
        title: formData.title.trim(),
        description: formData.description?.trim() || undefined,
        target_metric: formData.target_metric?.trim() || undefined,
      };

      const newGoal = await createGoal(cleanData);

      if (newGoal) {
        router.push(`/plan/${newGoal.id}`);
      } else {
        setFormError("Failed to create goal. Please try again.");
      }
    } catch (err) {
      console.error("Error creating goal:", err);
      setFormError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // Get week dates for current/next few weeks
  const getWeekOptions = () => {
    const weeks: { value: string; label: string }[] = [];
    const today = new Date();
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

    for (let i = 0; i < 12; i++) {
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset + i * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      weeks.push({
        value: monday.toISOString().split("T")[0],
        label: `${monday.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} - ${sunday.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`,
      });
    }
    return weeks;
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Goal</h1>
          <p className="text-sm text-muted-foreground">
            {parentGoal
              ? `Sub-goal of "${parentGoal.title}"`
              : "Add a new planning goal"}
          </p>
        </div>
      </div>

      {/* Error message */}
      {formError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Plan Level */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Plan Level
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-2">
              {planLevelOrder.map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={formData.plan_level === level ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => handleLevelChange(level)}
                  disabled={parentId !== null && level !== levelParam}
                >
                  {planLevelLabels[level]}
                </Button>
              ))}
            </div>

            {parentGoal && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <span className="text-muted-foreground">Parent Goal: </span>
                <span className="font-medium">{parentGoal.title}</span>
              </div>
            )}

            {!parentId && getParentLevel(formData.plan_level) && (
              <div className="space-y-2">
                <Label>Parent Goal (Optional)</Label>
                <Select
                  value={formData.parent_goal_id || "none"}
                  onValueChange={(value) =>
                    updateField(
                      "parent_goal_id",
                      value === "none" ? undefined : value
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent</SelectItem>
                    {potentialParents.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="e.g., Improve putting green speed consistency"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Describe the goal, key milestones, and success criteria...&#10;&#10;For monthly/weekly goals, list action items starting with - or * to auto-generate tasks."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Category
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  updateField("category", value as PlanCategory)
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(goalCategoryLabels) as PlanCategory[]).map(
                    (cat) => (
                      <SelectItem key={cat} value={cat}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: goalCategoryColors[cat] }}
                          />
                          {goalCategoryLabels[cat]}
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Year - always shown */}
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select
                value={formData.year?.toString() || currentYear.toString()}
                onValueChange={(value) => updateField("year", parseInt(value))}
              >
                <SelectTrigger id="year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => currentYear + i).map(
                    (year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Season - shown for seasonal */}
            {formData.plan_level === "seasonal" && (
              <div className="space-y-2">
                <Label htmlFor="season">Season *</Label>
                <Select
                  value={formData.season || ""}
                  onValueChange={(value) =>
                    updateField(
                      "season",
                      value as "spring" | "summer" | "fall" | "winter"
                    )
                  }
                >
                  <SelectTrigger id="season">
                    <SelectValue placeholder="Select season" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(seasonLabels) as Array<keyof typeof seasonLabels>).map(
                      (season) => (
                        <SelectItem key={season} value={season}>
                          {seasonLabels[season]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Month - shown for monthly */}
            {formData.plan_level === "monthly" && (
              <div className="space-y-2">
                <Label htmlFor="month">Month *</Label>
                <Select
                  value={formData.month?.toString() || ""}
                  onValueChange={(value) =>
                    updateField("month", parseInt(value))
                  }
                >
                  <SelectTrigger id="month">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(monthLabels).map(([num, name]) => (
                      <SelectItem key={num} value={num}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Week - shown for weekly */}
            {formData.plan_level === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="week">Week *</Label>
                <Select
                  value={formData.week_start || ""}
                  onValueChange={(value) => updateField("week_start", value)}
                >
                  <SelectTrigger id="week">
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {getWeekOptions().map((week) => (
                      <SelectItem key={week.value} value={week.value}>
                        {week.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Budget & Metrics */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Budget & Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget Allocated</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="budget"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.budget_allocated ?? ""}
                  onChange={(e) =>
                    updateField(
                      "budget_allocated",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="metric">Target Metric</Label>
                <Input
                  id="metric"
                  value={formData.target_metric || ""}
                  onChange={(e) => updateField("target_metric", e.target.value)}
                  placeholder="e.g., Green Speed (ft)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">Target Value</Label>
                <Input
                  id="target"
                  type="number"
                  step="0.01"
                  value={formData.target_value ?? ""}
                  onChange={(e) =>
                    updateField(
                      "target_value",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="e.g., 11.5"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting || loading}>
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Create Goal
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewGoalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 md:p-6 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <NewGoalContent />
    </Suspense>
  );
}
