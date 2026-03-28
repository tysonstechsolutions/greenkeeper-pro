"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Zap,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Eye,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useObservations,
  observationCategoryConfig,
  phaseConfig,
} from "@/lib/hooks/useObservations";
import type {
  ImprovementPlanItem,
  PlanItemStatus,
  PlanPhase,
} from "@/types/database";

const STATUS_OPTIONS: { value: PlanItemStatus; label: string; icon: React.ReactNode }[] = [
  { value: "not_started", label: "Not Started", icon: <Circle className="w-4 h-4 text-gray-400" /> },
  { value: "in_progress", label: "In Progress", icon: <Clock className="w-4 h-4 text-blue-500" /> },
  { value: "completed", label: "Completed", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
  { value: "deferred", label: "Deferred", icon: <Minus className="w-4 h-4 text-amber-500" /> },
  { value: "cancelled", label: "Cancelled", icon: <AlertTriangle className="w-4 h-4 text-red-400" /> },
];

const PHASE_ORDER: PlanPhase[] = ["immediate", "week_1_2", "month_1", "month_2_3", "ongoing"];

function ImpactEffortBadge({ impact, effort }: { impact: string; effort: string }) {
  const impactColor = impact === "high" ? "text-green-600" : impact === "medium" ? "text-amber-600" : "text-gray-500";
  const effortColor = effort === "low" ? "text-green-600" : effort === "medium" ? "text-amber-600" : "text-red-500";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex items-center gap-0.5 ${impactColor}`}>
        <TrendingUp className="w-3 h-3" />
        {impact} impact
      </span>
      <span className="text-muted-foreground">|</span>
      <span className={`flex items-center gap-0.5 ${effortColor}`}>
        <Zap className="w-3 h-3" />
        {effort} effort
      </span>
    </div>
  );
}

function PlanItemCard({
  item,
  onStatusChange,
}: {
  item: ImprovementPlanItem;
  onStatusChange: (id: string, status: PlanItemStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catConfig = observationCategoryConfig[item.category] || observationCategoryConfig.other;

  return (
    <div
      className={`p-4 rounded-lg border transition-colors ${
        item.status === "completed"
          ? "bg-green-500/5 border-green-200/50"
          : item.status === "in_progress"
          ? "bg-blue-500/5 border-blue-200/50"
          : item.status === "deferred" || item.status === "cancelled"
          ? "bg-muted/30 border-border/50 opacity-70"
          : "bg-card border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status toggle */}
        <select
          value={item.status}
          onChange={(e) => onStatusChange(item.id, e.target.value as PlanItemStatus)}
          className="mt-0.5 shrink-0 text-sm bg-transparent border border-input rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                item.priority === "critical"
                  ? "bg-purple-500/10 text-purple-600"
                  : item.priority === "high"
                  ? "bg-red-500/10 text-red-600"
                  : item.priority === "medium"
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-gray-500/10 text-gray-600"
              }`}
            >
              {item.priority}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${catConfig.bg} ${catConfig.color}`}>
              {catConfig.label}
            </span>
            {item.estimated_cost !== null && item.estimated_cost > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <DollarSign className="w-3 h-3" />
                {item.estimated_cost.toLocaleString()}
              </span>
            )}
            {item.target_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {new Date(item.target_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          <h3
            className={`font-medium ${
              item.status === "completed" ? "line-through text-muted-foreground" : ""
            }`}
          >
            {item.title}
          </h3>

          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {item.description}
          </p>

          <div className="mt-2">
            <ImpactEffortBadge impact={item.impact_level} effort={item.effort_level} />
          </div>

          {/* Expandable AI reasoning */}
          {item.ai_reasoning && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-2"
            >
              <Sparkles className="w-3 h-3" />
              AI reasoning
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
          {expanded && item.ai_reasoning && (
            <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted/50 rounded italic">
              {item.ai_reasoning}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImprovementPlanPage() {
  const { profile: currentUser } = useAuth();
  const {
    observations,
    planItems,
    currentPlan,
    planLoading,
    loading: obsLoading,
    updatePlanItem,
    stats,
  } = useObservations();

  const [viewMode, setViewMode] = useState<"phases" | "priority" | "category">("phases");

  const handleStatusChange = async (id: string, status: PlanItemStatus) => {
    await updatePlanItem(id, {
      status,
      completed_date: status === "completed" ? new Date().toISOString() : null,
    });
  };

  // Group items by phase
  const byPhase = useMemo(() => {
    const groups: Record<string, ImprovementPlanItem[]> = {};
    for (const phase of PHASE_ORDER) {
      groups[phase] = planItems.filter((item) => item.phase === phase);
    }
    return groups;
  }, [planItems]);

  // Group by priority
  const byPriority = useMemo(() => {
    const order = ["critical", "high", "medium", "low"] as const;
    const groups: Record<string, ImprovementPlanItem[]> = {};
    for (const p of order) {
      const items = planItems.filter((item) => item.priority === p);
      if (items.length > 0) groups[p] = items;
    }
    return groups;
  }, [planItems]);

  // Group by category
  const byCategory = useMemo(() => {
    const groups: Record<string, ImprovementPlanItem[]> = {};
    for (const item of planItems) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [planItems]);

  // Progress stats
  const totalItems = planItems.length;
  const completedItems = planItems.filter((i) => i.status === "completed").length;
  const inProgressItems = planItems.filter((i) => i.status === "in_progress").length;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const isLoading = planLoading || obsLoading;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link
            href="/observations"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Observations
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Improvement Plan
          </h1>
          {currentPlan && (
            <p className="text-muted-foreground text-sm mt-1">
              {currentPlan.title} &middot; v{currentPlan.version}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/observations">
            <Button variant="outline" className="gap-2">
              <Eye className="w-4 h-4" />
              Observations ({stats.total})
            </Button>
          </Link>
        </div>
      </div>

      {/* Progress overview */}
      {totalItems > 0 && (
        <div className="mb-6 p-5 bg-card rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Progress</h2>
            <span className="text-2xl font-bold text-primary">{progressPct}%</span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-lg font-bold text-foreground">{completedItems}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div>
              <div className="text-lg font-bold text-blue-600">{inProgressItems}</div>
              <div className="text-xs text-muted-foreground">In Progress</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-500">
                {totalItems - completedItems - inProgressItems}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>

          {/* AI Summary */}
          {currentPlan?.ai_summary && (
            <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                AI Summary
              </div>
              <p className="text-sm text-muted-foreground">{currentPlan.ai_summary}</p>
            </div>
          )}
        </div>
      )}

      {/* View mode tabs */}
      {totalItems > 0 && (
        <div className="flex gap-1 mb-6 p-1 bg-muted/60 rounded-lg w-fit">
          {(["phases", "priority", "category"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "phases" ? "By Phase" : mode === "priority" ? "By Priority" : "By Category"}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-5 w-32 bg-muted rounded animate-pulse mb-3" />
              <div className="space-y-2">
                <div className="h-24 bg-muted/60 rounded-lg animate-pulse" />
                <div className="h-24 bg-muted/60 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : totalItems === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No improvement plan yet"
          description={
            stats.total === 0
              ? "Start by adding observations from the course. Once you have some notes, the AI will generate a prioritized improvement plan."
              : `You have ${stats.total} observation${stats.total !== 1 ? "s" : ""}. Ask the AI to generate an improvement plan from your notes, and it will appear here as a phased action list with priorities and impact ratings.`
          }
          action={
            stats.total === 0
              ? { label: "Add Observations", href: "/observations" }
              : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {viewMode === "phases" &&
            PHASE_ORDER.map((phase) => {
              const items = byPhase[phase];
              if (!items || items.length === 0) return null;
              const pc = phaseConfig[phase];
              return (
                <div key={phase}>
                  <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${pc.color}`}>
                    {pc.label}
                    <span className="text-muted-foreground font-normal ml-2">
                      ({items.length} item{items.length !== 1 ? "s" : ""})
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <PlanItemCard
                        key={item.id}
                        item={item}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

          {viewMode === "priority" &&
            Object.entries(byPriority).map(([priority, items]) => (
              <div key={priority}>
                <h2
                  className={`text-sm font-semibold uppercase tracking-wider mb-3 ${
                    priority === "critical"
                      ? "text-purple-600"
                      : priority === "high"
                      ? "text-red-600"
                      : priority === "medium"
                      ? "text-amber-600"
                      : "text-gray-500"
                  }`}
                >
                  {priority} priority
                  <span className="text-muted-foreground font-normal ml-2">
                    ({items.length})
                  </span>
                </h2>
                <div className="space-y-2">
                  {items.map((item) => (
                    <PlanItemCard
                      key={item.id}
                      item={item}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              </div>
            ))}

          {viewMode === "category" &&
            Object.entries(byCategory).map(([cat, items]) => {
              const cc = observationCategoryConfig[cat as keyof typeof observationCategoryConfig] || observationCategoryConfig.other;
              return (
                <div key={cat}>
                  <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${cc.color}`}>
                    {cc.label}
                    <span className="text-muted-foreground font-normal ml-2">
                      ({items.length})
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <PlanItemCard
                        key={item.id}
                        item={item}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
