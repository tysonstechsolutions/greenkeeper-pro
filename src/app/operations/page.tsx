"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Filter, Loader2, Printer, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/hooks/useAuth";
import { applyOperationalFilters, EMPTY_OPERATIONAL_FILTERS } from "@/lib/operational-work/filters";
import { partitionOperationalWork } from "@/lib/operational-work/priority";
import {
  OPERATIONAL_SECTION_LABELS,
  OPERATIONAL_SECTION_ORDER,
  type OperationalAssignmentRow,
  type OperationalWorkFilters,
  type OperationalWorkItem,
} from "@/lib/operational-work/types";
import { useOperationalWork } from "@/lib/operational-work/use-operational-work";
import { buildAssignmentsPrintHtml } from "@/lib/operational-work/print-assignments";
import {
  WorkActionDialog,
  type WorkActionDialogMode,
} from "@/components/features/operations-command-center/work-action-dialog";
import { WorkCard } from "@/components/features/operations-command-center/work-card";
import { EmailDraftDialog } from "@/components/features/operations-command-center/email-draft-dialog";
import { MorningBrief } from "@/components/features/operations-command-center/morning-brief";
import { buildTaskEmailDraft, type EmailDraft } from "@/lib/operational-work/email-draft";
import type { InterpretedAction } from "@/lib/operational-work/instruction-interpreter";

export default function OperationsPage() {
  return <Suspense fallback={<OperationsLoading />}><OperationsCommandCenter /></Suspense>;
}

function OperationsCommandCenter() {
  const searchParams = useSearchParams();
  const { user, isManager } = useAuth();
  const operations = useOperationalWork();
  const operationsLoading = operations.loading;
  const [filters, setFilters] = useState<OperationalWorkFilters>(EMPTY_OPERATIONAL_FILTERS);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dialogMode, setDialogMode] = useState<WorkActionDialogMode | null>(null);
  const [selectedItem, setSelectedItem] = useState<OperationalWorkItem | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const personalView = searchParams.get("view") === "mine";
  const todayDate = useMemo(() => {
    const [year, month, day] = operations.today.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [operations.today]);
  const signerName = useMemo(() => {
    const me = operations.staff.find((person) => person.id === user?.id);
    return me?.display_name || me?.full_name || "General Manager";
  }, [operations.staff, user?.id]);

  const visibleItems = useMemo(() => {
    let rows = operations.items;
    if (personalView) {
      rows = rows.filter((item) => item.responsibleEmployee?.id === user?.id);
    }
    rows = applyOperationalFilters(rows, filters, new Date());
    const needle = query.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((item) => [
        item.title,
        item.description,
        item.sourceLabel,
        item.department,
        item.responsibleEmployee?.name,
      ].some((value) => value?.toLowerCase().includes(needle)));
    }
    return rows;
  }, [operations.items, personalView, user?.id, filters, query]);

  const sections = useMemo(
    () => partitionOperationalWork(visibleItems, new Date(), user?.id ?? null),
    [visibleItems, user?.id],
  );
  const itemById = useMemo(
    () => new Map(operations.items.map((item) => [item.stableId, item])),
    [operations.items],
  );
  const assignmentByWork = useMemo(() => {
    const map = new Map<string, OperationalAssignmentRow>();
    for (const assignment of operations.assignments) {
      if (["completed", "reassigned"].includes(assignment.status)) continue;
      if (!map.has(assignment.work_key)) map.set(assignment.work_key, assignment);
    }
    return map;
  }, [operations.assignments]);
  const activeLeadershipByWork = useMemo(() => {
    const terminal = new Set(["approved", "denied", "returned_to_local_management", "completed", "closed_without_action"]);
    return new Map(operations.leadership.filter((row) => !terminal.has(row.status)).map((row) => [row.work_key, row]));
  }, [operations.leadership]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || operationsLoading) return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-work-id="${CSS.escape(focus)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchParams, operationsLoading]);

  const departments = unique(operations.items.map((item) => item.department));
  const positions = unique(operations.items.map((item) => item.responsiblePosition));
  const standards = operations.items.filter((item) => item.sourceType === "standard");

  function updateFilter(key: keyof OperationalWorkFilters, value: string) {
    setFilters((prior) => ({ ...prior, [key]: value }));
  }

  function openAction(mode: WorkActionDialogMode, item: OperationalWorkItem) {
    setSelectedItem(item);
    setDialogMode(mode);
    setActionError(null);
  }

  function printAssignments() {
    const html = buildAssignmentsPrintHtml(operations.items, new Date());
    const win = window.open("", "_blank");
    if (!win) {
      setActionError("Allow pop-ups to print the assignment lists.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleInstruction(item: OperationalWorkItem, action: InterpretedAction) {
    switch (action.kind) {
      case "reschedule":
        await operations.reschedule(item.stableId, action.date, action.note);
        return;
      case "complete":
        await operations.transition(item.stableId, "complete");
        return;
      case "assign":
        await operations.delegate(item.stableId, {
          employeeId: action.employeeId,
          position: null,
          instructions: action.note,
          dueDate: action.dueDate,
          expectedEvidence: "",
          followUpDate: null,
          verificationRequired: false,
          notes: "",
        });
        return;
      case "priority":
        await operations.setPriority(item.stableId, {
          override: action.override,
          safety: false,
          compliance: false,
          payroll: false,
          financial: false,
          reason: action.reason,
        });
        return;
      case "email":
        setEmailDraft(buildTaskEmailDraft(item, action.instruction, signerName));
        return;
      default:
        return;
    }
  }

  async function run(workKey: string, action: () => Promise<void>) {
    setBusyKey(workKey);
    setActionError(null);
    try {
      await action();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The action could not be completed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 pb-28 pt-4 sm:px-5 md:pb-8">
      <PageHeader
        title={personalView ? "My operational work" : "Operations Command Center"}
        description={personalView
          ? "Your assigned work, using the same priority and workflow data as management."
          : "One explainable list for tasks, duties, obligations, standards, goals, calendar deadlines, equipment alerts, and purchase requests."}
      />

      {!personalView && !operationsLoading && operations.items.length > 0 && (
        <MorningBrief items={operations.items} today={todayDate} />
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Visible work" value={visibleItems.length} />
        <Metric label="Overdue" value={sections.get("overdue")?.length ?? 0} tone="danger" />
        <Metric label="Blocked / waiting" value={(sections.get("blocked")?.length ?? 0) + (sections.get("waiting_on_leadership")?.length ?? 0)} tone="warning" />
        <Metric label="Needs verification" value={sections.get("needs_verification")?.length ?? 0} />
      </div>

      <div className="sticky top-0 z-20 -mx-3 mb-4 border-y border-border/70 bg-background/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search operational work" className="pl-9" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 md:flex-none" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal />Filters</Button>
            <Button variant="outline" className="flex-1 md:flex-none" onClick={printAssignments}><Printer />Print lists</Button>
            <Button variant="outline" size="icon" onClick={operations.reload} aria-label="Refresh work"><RefreshCw className={operations.loading ? "animate-spin" : ""} /></Button>
          </div>
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <FilterSelect label="Department" value={filters.department} onChange={(value) => updateFilter("department", value)} options={departments.map((value) => [value, pretty(value)])} />
            <FilterSelect label="Employee" value={filters.employee} onChange={(value) => updateFilter("employee", value)} options={operations.staff.map((person) => [person.id, person.display_name || person.full_name || "Unnamed"])} />
            <FilterSelect label="Position" value={filters.position} onChange={(value) => updateFilter("position", value)} options={positions.map((value) => [value, pretty(value)])} />
            <FilterSelect label="Status" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["pending", "awaiting_acceptance", "in_progress", "postponed", "blocked", "waiting_leadership", "needs_verification", "completed", "verified"].map((value) => [value, pretty(value)])} />
            <FilterSelect label="Source" value={filters.source} onChange={(value) => updateFilter("source", value)} options={unique(operations.items.map((item) => item.sourceType)).map((value) => [value, pretty(value)])} />
            <FilterSelect label="Priority" value={filters.priority} onChange={(value) => updateFilter("priority", value)} options={["critical", "high", "normal", "low"].map((value) => [value, pretty(value)])} />
            <FilterSelect label="Due date" value={filters.due} onChange={(value) => updateFilter("due", value)} options={[["overdue", "Overdue"], ["today", "Today"], ["week", "Next 7 days"], ["none", "No due date"]]} />
            <FilterSelect label="Duration" value={filters.duration} onChange={(value) => updateFilter("duration", value)} options={[["15", "15 minutes or less"], ["30", "30 minutes or less"], ["60", "60 minutes or less"], ["long", "Over 60 minutes"]]} />
            <FilterSelect label="Program Standard" value={filters.standard} onChange={(value) => updateFilter("standard", value)} options={standards.map((item) => [item.sourceRecordId, item.title])} />
            <FilterSelect label="Delegated" value={filters.delegated} onChange={(value) => updateFilter("delegated", value)} options={[["yes", "Delegated"], ["no", "Not delegated"]]} />
            <FilterSelect label="Blocked" value={filters.blocked} onChange={(value) => updateFilter("blocked", value)} options={[["yes", "Blocked"], ["no", "Not blocked"]]} />
            <FilterSelect label="Leadership" value={filters.leadership} onChange={(value) => updateFilter("leadership", value)} options={[["yes", "With leadership"], ["no", "Not with leadership"]]} />
            <Button variant="ghost" size="xs" onClick={() => { setFilters(EMPTY_OPERATIONAL_FILTERS); setQuery(""); }}><Filter />Clear filters</Button>
          </div>
        )}
      </div>

      <nav aria-label="Operations sections" className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {OPERATIONAL_SECTION_ORDER.map((key) => (
          <a key={key} href={`#section-${key}`} className="whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium">
            {OPERATIONAL_SECTION_LABELS[key]} · {sections.get(key)?.length ?? 0}
          </a>
        ))}
      </nav>

      {(operations.error || actionError) && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError || operations.error}</span>
        </div>
      )}

      {operations.loading && visibleItems.length === 0 ? <OperationsLoading /> : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No work matches the current view.</div>
      ) : (
        <div className="space-y-7">
          {OPERATIONAL_SECTION_ORDER.map((key) => {
            const rows = sections.get(key) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={key} id={`section-${key}`} className="scroll-mt-28">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide">{OPERATIONAL_SECTION_LABELS[key]}</h2>
                  <span className="text-xs text-muted-foreground">{rows.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {rows.map((item) => (
                    <WorkCard
                      key={item.stableId}
                      item={item}
                      itemById={itemById}
                      assignment={assignmentByWork.get(item.stableId) ?? null}
                      assignmentHistory={operations.assignments.filter((row) => row.work_key === item.stableId)}
                      postponementHistory={operations.postponements.filter((row) => row.work_key === item.stableId)}
                      leadershipHistory={operations.leadership.filter((row) => row.work_key === item.stableId)}
                      evidence={operations.evidence.filter((row) => row.work_key === item.stableId)}
                      events={operations.events.filter((row) => row.work_key === item.stableId)}
                      blockers={operations.dependencies.filter((dependency) => dependency.active && dependency.dependent_work_key === item.stableId)}
                      dependents={operations.dependencies.filter((dependency) => dependency.active && dependency.blocker_work_key === item.stableId)}
                      currentUserId={user?.id ?? null}
                      isManager={isManager}
                      busy={busyKey === item.stableId}
                      staff={operations.staff}
                      today={todayDate}
                      onAction={openAction}
                      onTransition={(work, action, note) => run(work.stableId, () => operations.transition(work.stableId, action, note))}
                      onAssignment={(assignmentId, status, note) => run(item.stableId, () => operations.transitionAssignment(assignmentId, status, note))}
                      onRemoveDependency={(dependencyId) => run(item.stableId, () => operations.removeDependency(dependencyId, "Removed from the Operations Command Center"))}
                      onInstruction={handleInstruction}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <WorkActionDialog
        mode={dialogMode}
        item={selectedItem}
        items={operations.items}
        staff={operations.staff}
        leadership={selectedItem ? activeLeadershipByWork.get(selectedItem.stableId) ?? null : null}
        onClose={() => { setDialogMode(null); setSelectedItem(null); }}
        onDelegate={operations.delegate}
        onPostpone={operations.postpone}
        onReschedule={operations.reschedule}
        onDependency={operations.addDependency}
        onLeadership={operations.sendToLeadership}
        onLeadershipResponse={operations.resolveLeadership}
        onClarification={(workKey, note) => {
          const assignment = assignmentByWork.get(workKey);
          if (!assignment) return Promise.reject(new Error("No active delegation was found."));
          return operations.transitionAssignment(assignment.id, "needs_clarification", note);
        }}
        onBlock={(workKey, note) => operations.transition(workKey, "mark_blocked", note)}
        onEvidence={operations.addEvidence}
        onPriority={operations.setPriority}
        onReopen={operations.reopen}
      />

      <EmailDraftDialog
        open={!!emailDraft}
        draft={emailDraft}
        onClose={() => setEmailDraft(null)}
      />
    </div>
  );
}

function OperationsLoading() {
  return <div className="flex min-h-[45vh] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading operational work…</div>;
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" | "warning" }) {
  return <div className={`rounded-xl border p-3 ${tone === "danger" ? "border-red-500/30 bg-red-500/5" : tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs"><option value="all">All</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function pretty(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
