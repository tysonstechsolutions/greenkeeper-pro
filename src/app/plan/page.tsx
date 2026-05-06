"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Loader2,
  ChevronDown,
  ListTree,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  usePlanGoals,
  planLevelLabels,
  goalCategoryLabels,
  goalCategoryColors,
  goalStatusLabels,
  goalStatusColors,
  seasonLabels,
  monthLabels,
  type GoalWithStats,
  type PlanOverview,
} from "@/lib/hooks/usePlanGoals";
import { useAuth } from "@/lib/hooks/useAuth";
import type { PlanLevel, PlanCategory, PlanStatus } from "@/types/database";
import { formatLocalDate } from "@/lib/utils/date";

// Get current year
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

// Get week start date
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatLocalDate(d);
}

// Format week range
function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// Goal Card Component
function GoalCard({
  goal,
  onClick,
  onGenerateTasks,
  showGenerateButton = false,
  compact = false,
}: {
  goal: GoalWithStats;
  onClick: () => void;
  onGenerateTasks?: () => void;
  showGenerateButton?: boolean;
  compact?: boolean;
}) {
  const categoryColor = goalCategoryColors[goal.category];
  const statusColor = goalStatusColors[goal.status];

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all"
      onClick={onClick}
    >
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={`font-semibold ${compact ? "text-sm" : ""} line-clamp-2`}>
            {goal.title}
          </h3>
          <Badge
            variant="outline"
            style={{
              backgroundColor: `${statusColor}15`,
              borderColor: statusColor,
              color: statusColor,
            }}
            className="text-xs shrink-0"
          >
            {goalStatusLabels[goal.status]}
          </Badge>
        </div>

        {goal.description && !compact && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {goal.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          <Badge
            variant="outline"
            style={{
              backgroundColor: `${categoryColor}15`,
              borderColor: categoryColor,
              color: categoryColor,
            }}
            className="text-xs"
          >
            {goalCategoryLabels[goal.category]}
          </Badge>
          {goal.season && (
            <Badge variant="secondary" className="text-xs">
              {seasonLabels[goal.season]}
            </Badge>
          )}
        </div>

        {/* Budget */}
        {(goal.budget_allocated || goal.budget_spent) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <DollarSign className="w-3 h-3" />
            <span>
              ${(goal.budget_spent || 0).toLocaleString()} /{" "}
              ${(goal.budget_allocated || 0).toLocaleString()}
            </span>
          </div>
        )}

        {/* Progress */}
        {(goal.progress_percent !== undefined && goal.progress_percent > 0) ||
        goal.child_count! > 0 ||
        goal.task_count! > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{goal.progress_percent || 0}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${goal.progress_percent || 0}%` }}
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {goal.child_count! > 0 && (
                <span>{goal.child_count} sub-goals</span>
              )}
              {goal.task_count! > 0 && (
                <span>
                  {goal.tasks_completed}/{goal.task_count} tasks
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* Target metric */}
        {goal.target_metric && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <TrendingUp className="w-3 h-3" />
            <span>
              {goal.target_metric}: {goal.actual_value ?? "—"} / {goal.target_value}
            </span>
          </div>
        )}

        {/* Generate Tasks Button */}
        {showGenerateButton && goal.task_count === 0 && onGenerateTasks && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateTasks();
            }}
          >
            <Zap className="w-4 h-4 mr-2" />
            Generate Tasks
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Five Year Overview Tab
function FiveYearOverview({
  goals,
  overview,
  onGoalClick,
  onAddGoal,
  canEdit,
}: {
  goals: GoalWithStats[];
  overview: PlanOverview;
  onGoalClick: (id: string) => void;
  onAddGoal: (year: number) => void;
  canEdit: boolean;
}) {
  const years = [
    CURRENT_YEAR,
    CURRENT_YEAR + 1,
    CURRENT_YEAR + 2,
    CURRENT_YEAR + 3,
    CURRENT_YEAR + 4,
  ];

  // Group goals by year
  const goalsByYear = years.reduce((acc, year) => {
    acc[year] = goals.filter(
      (g) => g.plan_level === "five_year" && g.year === year
    );
    return acc;
  }, {} as Record<number, GoalWithStats[]>);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs">Total Goals</span>
            </div>
            <p className="text-2xl font-bold">{overview.total_goals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs">On Track</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{overview.on_track}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Budget Allocated</span>
            </div>
            <p className="text-2xl font-bold">
              ${overview.budget_allocated.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Completion</span>
            </div>
            <p className="text-2xl font-bold">{overview.completion_percent}%</p>
          </CardContent>
        </Card>
      </div>

      {/* 5-Year Timeline */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {years.map((year, index) => {
            const yearGoals = goalsByYear[year] || [];
            const yearBudget = yearGoals.reduce(
              (sum, g) => sum + (g.budget_allocated || 0),
              0
            );

            return (
              <div
                key={year}
                className="w-64 flex-shrink-0 bg-card rounded-lg border border-border"
              >
                {/* Year Header */}
                <div className="p-3 border-b border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Year {index + 1}</p>
                      <p className="text-sm text-muted-foreground">{year}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      ${yearBudget.toLocaleString()}
                    </Badge>
                  </div>
                </div>

                {/* Goals */}
                <div className="p-3 space-y-2 min-h-[200px]">
                  {yearGoals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No goals set</p>
                    </div>
                  ) : (
                    yearGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        onClick={() => onGoalClick(goal.id)}
                        compact
                      />
                    ))
                  )}
                </div>

                {/* Add Button */}
                {canEdit && (
                  <div className="p-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => onAddGoal(year)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Goal
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Annual Tab
function AnnualTab({
  goals,
  year,
  onYearChange,
  onGoalClick,
  onAddGoal,
  canEdit,
}: {
  goals: GoalWithStats[];
  year: number;
  onYearChange: (year: number) => void;
  onGoalClick: (id: string) => void;
  onAddGoal: () => void;
  canEdit: boolean;
}) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const annualGoals = goals.filter(
    (g) => g.plan_level === "annual" && g.year === year
  );

  // Group by category
  const byCategory = annualGoals.reduce((acc, goal) => {
    if (!acc[goal.category]) {
      acc[goal.category] = [];
    }
    acc[goal.category].push(goal);
    return acc;
  }, {} as Record<PlanCategory, GoalWithStats[]>);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Year Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onYearChange(year - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[100px] text-center">
            {year}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onYearChange(year + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {canEdit && (
          <Button size="sm" onClick={onAddGoal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Annual Goal
          </Button>
        )}
      </div>

      {/* Goals by Category */}
      {Object.keys(byCategory).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No annual goals for {year}</p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={onAddGoal}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Goal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(byCategory).map(([category, categoryGoals]) => {
            const isOpen = openCategories.has(category);
            const categoryColor = goalCategoryColors[category as PlanCategory];

            return (
              <Collapsible
                key={category}
                open={isOpen}
                onOpenChange={() => toggleCategory(category)}
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: categoryColor }}
                          />
                          <CardTitle className="text-base">
                            {goalCategoryLabels[category as PlanCategory]}
                          </CardTitle>
                          <Badge variant="secondary" className="text-xs">
                            {categoryGoals.length}
                          </Badge>
                        </div>
                        <ChevronDown
                          className={`w-5 h-5 text-muted-foreground transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-3">
                      {categoryGoals.map((goal) => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          onClick={() => onGoalClick(goal.id)}
                        />
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Seasonal Tab
function SeasonalTab({
  goals,
  year,
  season,
  onYearChange,
  onSeasonChange,
  onGoalClick,
  onAddGoal,
  canEdit,
}: {
  goals: GoalWithStats[];
  year: number;
  season: "spring" | "summer" | "fall" | "winter";
  onYearChange: (year: number) => void;
  onSeasonChange: (season: "spring" | "summer" | "fall" | "winter") => void;
  onGoalClick: (id: string) => void;
  onAddGoal: () => void;
  canEdit: boolean;
}) {
  const seasonalGoals = goals.filter(
    (g) => g.plan_level === "seasonal" && g.year === year && g.season === season
  );

  const seasons: Array<"spring" | "summer" | "fall" | "winter"> = [
    "spring",
    "summer",
    "fall",
    "winter",
  ];

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Year */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onYearChange(year - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold min-w-[60px] text-center">{year}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onYearChange(year + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Season */}
          <div className="flex gap-1">
            {seasons.map((s) => (
              <Button
                key={s}
                variant={season === s ? "default" : "outline"}
                size="sm"
                onClick={() => onSeasonChange(s)}
              >
                {seasonLabels[s]}
              </Button>
            ))}
          </div>
        </div>

        {canEdit && (
          <Button size="sm" onClick={onAddGoal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Seasonal Goal
          </Button>
        )}
      </div>

      {/* Goals */}
      {seasonalGoals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              No goals for {seasonLabels[season]} {year}
            </p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={onAddGoal}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Goal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {seasonalGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => onGoalClick(goal.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Monthly Tab
function MonthlyTab({
  goals,
  year,
  month,
  onYearChange,
  onMonthChange,
  onGoalClick,
  onAddGoal,
  onGenerateTasks,
  canEdit,
}: {
  goals: GoalWithStats[];
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onGoalClick: (id: string) => void;
  onAddGoal: () => void;
  onGenerateTasks: (goalId: string) => void;
  canEdit: boolean;
}) {
  const monthlyGoals = goals.filter(
    (g) => g.plan_level === "monthly" && g.year === year && g.month === month
  );

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Year */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onYearChange(year - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold min-w-[60px] text-center">{year}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onYearChange(year + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Month */}
          <Select
            value={String(month)}
            onValueChange={(v) => onMonthChange(parseInt(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(monthLabels).map(([m, label]) => (
                <SelectItem key={m} value={m}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canEdit && (
          <Button size="sm" onClick={onAddGoal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Monthly Goal
          </Button>
        )}
      </div>

      {/* Goals */}
      {monthlyGoals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              No goals for {monthLabels[month]} {year}
            </p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={onAddGoal}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Goal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {monthlyGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => onGoalClick(goal.id)}
              showGenerateButton={canEdit}
              onGenerateTasks={() => onGenerateTasks(goal.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Weekly Tab
function WeeklyTab({
  goals,
  weekStart,
  onWeekChange,
  onGoalClick,
  onAddGoal,
  onGenerateTasks,
  canEdit,
}: {
  goals: GoalWithStats[];
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  onGoalClick: (id: string) => void;
  onAddGoal: () => void;
  onGenerateTasks: (goalId: string) => void;
  canEdit: boolean;
}) {
  const weeklyGoals = goals.filter(
    (g) => g.plan_level === "weekly" && g.week_start === weekStart
  );

  const navigateWeek = (direction: -1 | 1) => {
    const current = new Date(weekStart + "T12:00:00");
    current.setDate(current.getDate() + direction * 7);
    onWeekChange(formatLocalDate(current));
  };

  const goToThisWeek = () => {
    onWeekChange(getWeekStart(new Date()));
  };

  const isCurrentWeek = weekStart === getWeekStart(new Date());

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-[180px] text-center">
            <span className="font-semibold">{formatWeekRange(weekStart)}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateWeek(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="outline" size="sm" onClick={goToThisWeek}>
              This Week
            </Button>
          )}
        </div>

        {canEdit && (
          <Button size="sm" onClick={onAddGoal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Weekly Goal
          </Button>
        )}
      </div>

      {/* Goals */}
      {weeklyGoals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListTree className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              No goals for week of {formatWeekRange(weekStart)}
            </p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={onAddGoal}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Goal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {weeklyGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => onGoalClick(goal.id)}
              showGenerateButton={canEdit}
              onGenerateTasks={() => onGenerateTasks(goal.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const { user, isSuper, isAsstSuper } = useAuth();
  const {
    goals,
    loading,
    error,
    fetchGoals,
    fetchPlanOverview,
    generateTasksFromGoal,
  } = usePlanGoals();

  const [activeTab, setActiveTab] = useState<PlanLevel>("five_year");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedSeason, setSelectedSeason] = useState<
    "spring" | "summer" | "fall" | "winter"
  >("spring");
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart(new Date()));
  const [overview, setOverview] = useState<PlanOverview>({
    total_goals: 0,
    by_status: [],
    budget_allocated: 0,
    budget_spent: 0,
    on_track: 0,
    at_risk: 0,
    behind: 0,
    completion_percent: 0,
  });
  const [generating, setGenerating] = useState<string | null>(null);

  // Permissions — use profile-based role checks
  const canEdit = isSuper || isAsstSuper;

  // Load data based on active tab
  useEffect(() => {
    const loadData = async () => {
      // Always fetch overview
      const overviewData = await fetchPlanOverview(selectedYear);
      setOverview(overviewData);

      // Fetch goals based on current filters
      fetchGoals();
    };

    loadData();
  }, [fetchGoals, fetchPlanOverview, selectedYear]);

  // Handle goal click
  const handleGoalClick = (id: string) => {
    router.push(`/plan/view?id=${id}`);
  };

  // Handle add goal
  const handleAddGoal = (preset?: {
    level?: PlanLevel;
    year?: number;
    season?: string;
    month?: number;
    weekStart?: string;
  }) => {
    const params = new URLSearchParams();
    if (preset?.level) params.set("level", preset.level);
    if (preset?.year) params.set("year", String(preset.year));
    if (preset?.season) params.set("season", preset.season);
    if (preset?.month) params.set("month", String(preset.month));
    if (preset?.weekStart) params.set("week", preset.weekStart);
    router.push(`/plan/new?${params.toString()}`);
  };

  // Handle generate tasks
  const handleGenerateTasks = async (goalId: string) => {
    setGenerating(goalId);
    try {
      const tasks = await generateTasksFromGoal(goalId);
      if (tasks.length > 0) {
        // Refresh goals to update task counts
        fetchGoals();
        // Navigate to goal detail to see generated tasks
        router.push(`/plan/view?id=${goalId}`);
      }
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Master Plan"
          description="5-year strategic planning"
          icon={Target}
        />
        {canEdit && (
          <Button onClick={() => handleAddGoal()}>
            <Plus className="w-4 h-4 mr-2" />
            New Goal
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PlanLevel)}
        className="space-y-4"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="five_year">5-Year Overview</TabsTrigger>
          <TabsTrigger value="annual">Annual</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
        </TabsList>

        {loading && goals.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <TabsContent value="five_year" className="mt-4">
              <FiveYearOverview
                goals={goals}
                overview={overview}
                onGoalClick={handleGoalClick}
                onAddGoal={(year) =>
                  handleAddGoal({ level: "five_year", year })
                }
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value="annual" className="mt-4">
              <AnnualTab
                goals={goals}
                year={selectedYear}
                onYearChange={setSelectedYear}
                onGoalClick={handleGoalClick}
                onAddGoal={() =>
                  handleAddGoal({ level: "annual", year: selectedYear })
                }
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value="seasonal" className="mt-4">
              <SeasonalTab
                goals={goals}
                year={selectedYear}
                season={selectedSeason}
                onYearChange={setSelectedYear}
                onSeasonChange={setSelectedSeason}
                onGoalClick={handleGoalClick}
                onAddGoal={() =>
                  handleAddGoal({
                    level: "seasonal",
                    year: selectedYear,
                    season: selectedSeason,
                  })
                }
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value="monthly" className="mt-4">
              <MonthlyTab
                goals={goals}
                year={selectedYear}
                month={selectedMonth}
                onYearChange={setSelectedYear}
                onMonthChange={setSelectedMonth}
                onGoalClick={handleGoalClick}
                onAddGoal={() =>
                  handleAddGoal({
                    level: "monthly",
                    year: selectedYear,
                    month: selectedMonth,
                  })
                }
                onGenerateTasks={handleGenerateTasks}
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value="weekly" className="mt-4">
              <WeeklyTab
                goals={goals}
                weekStart={selectedWeek}
                onWeekChange={setSelectedWeek}
                onGoalClick={handleGoalClick}
                onAddGoal={() =>
                  handleAddGoal({ level: "weekly", weekStart: selectedWeek })
                }
                onGenerateTasks={handleGenerateTasks}
                canEdit={canEdit}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
