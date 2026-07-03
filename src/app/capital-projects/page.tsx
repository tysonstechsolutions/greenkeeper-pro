"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building,
  Plus,
  Loader2,
  ChevronRight,
  Calendar,
  ArrowRight,
  DollarSign,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import { RoleGuard, GM_ROLES } from "@/components/auth/role-guard";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
} from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";

// ── Types ──
interface CapitalProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  budget_amount: number | null;
  spent_amount: number | null;
  start_date: string | null;
  target_completion: string | null;
  actual_completion: string | null;
  category: string | null;
  approval_notes: string | null;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Constants ──
const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "proposed", label: "Proposed" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
] as const;

const statusColors: Record<string, string> = {
  proposed: "bg-muted text-muted-foreground border-border",
  approved: "bg-blue-500/10 text-blue-700 border-blue-300",
  in_progress: "bg-amber-500/10 text-amber-700 border-amber-300",
  completed: "bg-green-500/10 text-green-700 border-green-300",
  cancelled: "bg-red-500/10 text-red-700 border-red-300",
};

const statusLabels: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CATEGORIES = [
  { value: "renovation", label: "Renovation" },
  { value: "equipment", label: "Equipment" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "building", label: "Building" },
  { value: "irrigation", label: "Irrigation" },
  { value: "other", label: "Other" },
] as const;

const categoryLabels: Record<string, string> = {
  renovation: "Renovation",
  equipment: "Equipment",
  infrastructure: "Infrastructure",
  building: "Building",
  irrigation: "Irrigation",
  other: "Other",
};

const STATUS_TRANSITIONS: Record<string, string> = {
  proposed: "approved",
  approved: "in_progress",
  in_progress: "completed",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CapitalProjectsPage() {
  const { user } = useAuth();

  // State
  const [projects, setProjects] = useState<CapitalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  // Add project form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Update spent dialog
  const [spendProjectId, setSpendProjectId] = useState<string | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [updatingSpend, setUpdatingSpend] = useState(false);

  // ── Fetch projects ──
  const fetchProjects = useCallback(async () => {
    // Direct REST avoids the supabase.from() wedge that has stuck other
    // pages on "Loading..." after navigation.
    try {
      const data = await directSelectList<CapitalProject>("capital_projects", {
        columns: "*",
        orderBy: [{ column: "created_at", ascending: false }],
        label: "capital-projects.fetchList",
      });
      setProjects(data);
    } catch (err) {
      console.error("[capital-projects] fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await fetchProjects();
      setLoading(false);
    }
    load();
  }, [fetchProjects]);

  useRefreshOnFocus(fetchProjects);

  // ── Filtered projects ──
  const filteredProjects =
    statusFilter === "all"
      ? projects
      : projects.filter((p) => p.status === statusFilter);

  // ── Add project ──
  const handleAddProject = async () => {
    if (!formName || !user) return;

    setSubmitting(true);
    try {
      // Direct REST so the insert can't wedge on a stalled supabase-js
      // auth wrapper.
      await directInsertRow(
        "capital_projects",
        {
          name: formName,
          description: formDescription || null,
          category: formCategory || null,
          budget_amount: formBudget ? parseFloat(formBudget) : null,
          start_date: formStartDate || null,
          target_completion: formTargetDate || null,
          status: "proposed",
          created_by: user.id,
        },
        "capital-projects.insert",
      );
      setFormName("");
      setFormDescription("");
      setFormCategory("");
      setFormBudget("");
      setFormStartDate("");
      setFormTargetDate("");
      setShowAddForm(false);
      await fetchProjects();
    } catch (err) {
      console.error("[capital-projects] add failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Advance status ──
  const handleAdvanceStatus = async (project: CapitalProject) => {
    const nextStatus = STATUS_TRANSITIONS[project.status];
    if (!nextStatus) return;

    const updates: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === "completed") {
      updates.actual_completion = todayLocal();
    }

    try {
      await directPatchRow(
        "capital_projects",
        "id",
        project.id,
        updates,
        "capital-projects.advanceStatus",
      );
      await fetchProjects();
    } catch (err) {
      console.error("[capital-projects] advance failed:", err);
    }
  };

  // ── Update spent ──
  const handleUpdateSpent = async () => {
    if (!spendProjectId || !spendAmount) return;

    setUpdatingSpend(true);
    const project = projects.find((p) => p.id === spendProjectId);
    if (!project) {
      setUpdatingSpend(false);
      return;
    }

    const newSpent = (Number(project.spent_amount) || 0) + parseFloat(spendAmount);
    try {
      await directPatchRow(
        "capital_projects",
        "id",
        spendProjectId,
        {
          spent_amount: newSpent,
          updated_at: new Date().toISOString(),
        },
        "capital-projects.updateSpent",
      );
      setSpendProjectId(null);
      setSpendAmount("");
      await fetchProjects();
    } catch (err) {
      console.error("[capital-projects] update spent failed:", err);
    } finally {
      setUpdatingSpend(false);
    }
  };

  return (
    <RoleGuard allowedRoles={GM_ROLES}>
      <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
        <PageHeader
          icon={Building}
          title="Capital Projects"
          description="Track major project budgets and progress"
        >
          <Button onClick={() => setShowAddForm(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </PageHeader>

        {/* ── Status Filter Tabs ── */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-4 pl-4 pr-6">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "all"
                ? projects.length
                : projects.filter((p) => p.status === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1.5 text-xs opacity-70">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Add Project Form ── */}
        {showAddForm && (
          <Card className="mb-6">
            <CardContent className="pt-5 space-y-4">
              <h3 className="font-semibold">New Project</h3>
              <div>
                <Label htmlFor="proj-name">Name</Label>
                <Input
                  id="proj-name"
                  placeholder="Project name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="proj-desc">Description</Label>
                <Textarea
                  id="proj-desc"
                  placeholder="Brief project description..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="proj-category">Category</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger id="proj-category">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="proj-budget">Budget ($)</Label>
                  <Input
                    id="proj-budget"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={formBudget}
                    onChange={(e) => setFormBudget(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="proj-start">Start Date</Label>
                  <Input
                    id="proj-start"
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="proj-target">Target Completion</Label>
                  <Input
                    id="proj-target"
                    type="date"
                    value={formTargetDate}
                    onChange={(e) => setFormTargetDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddProject}
                  disabled={!formName || submitting}
                  className="flex-1"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Create Project
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Project Cards ── */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {statusFilter === "all"
                ? "No capital projects yet. Add your first project."
                : `No ${statusLabels[statusFilter]?.toLowerCase() || statusFilter} projects.`}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => {
              const budget = Number(project.budget_amount) || 0;
              const spent = Number(project.spent_amount) || 0;
              const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
              const nextStatus = STATUS_TRANSITIONS[project.status];

              return (
                <Card key={project.id}>
                  <CardContent className="pt-4 pb-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base leading-tight">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                      <Badge
                        variant="outline"
                        className={statusColors[project.status] || ""}
                      >
                        {statusLabels[project.status] || project.status}
                      </Badge>
                      {project.category && (
                        <Badge variant="secondary">
                          {categoryLabels[project.category] || project.category}
                        </Badge>
                      )}
                    </div>

                    {/* Budget bar */}
                    {budget > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">
                            {formatCurrency(spent)} spent
                          </span>
                          <span className="font-medium">
                            {formatCurrency(budget)} budget
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct > 90
                                ? "bg-red-500"
                                : pct > 75
                                ? "bg-amber-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {pct}% of budget used
                          {budget - spent > 0 &&
                            ` \u00B7 ${formatCurrency(budget - spent)} remaining`}
                        </p>
                      </div>
                    )}

                    {/* Dates */}
                    {(project.start_date || project.target_completion) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(project.start_date)}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span>{formatDate(project.target_completion)}</span>
                        {project.actual_completion && (
                          <span className="ml-1 text-green-600">
                            (done {formatDate(project.actual_completion)})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Approval notes */}
                    {project.approval_notes && (
                      <p className="text-xs text-muted-foreground italic mb-3 bg-muted/50 rounded px-2 py-1.5">
                        {project.approval_notes}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {nextStatus && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdvanceStatus(project)}
                        >
                          <ChevronRight className="w-3.5 h-3.5 mr-1" />
                          Move to {statusLabels[nextStatus]}
                        </Button>
                      )}
                      {budget > 0 && project.status !== "completed" && project.status !== "cancelled" && (
                        <Dialog
                          open={spendProjectId === project.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setSpendProjectId(project.id);
                              setSpendAmount("");
                            } else {
                              setSpendProjectId(null);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <DollarSign className="w-3.5 h-3.5 mr-1" />
                              Add Spend
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>
                                Add Spending: {project.name}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                              <Label htmlFor="spend-amount">Amount ($)</Label>
                              <Input
                                id="spend-amount"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={spendAmount}
                                onChange={(e) => setSpendAmount(e.target.value)}
                              />
                              <p className="text-xs text-muted-foreground mt-2">
                                Current: {formatCurrency(spent)} of{" "}
                                {formatCurrency(budget)}
                              </p>
                            </div>
                            <DialogFooter>
                              <Button
                                onClick={handleUpdateSpent}
                                disabled={!spendAmount || updatingSpend}
                              >
                                {updatingSpend ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                Update
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Update spent dialog - rendered when spendProjectId is set via Dialog above */}
    </RoleGuard>
  );
}

