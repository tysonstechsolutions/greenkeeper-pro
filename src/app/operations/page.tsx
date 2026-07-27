"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardList, Filter, LayoutGrid, Loader2, Printer, RefreshCw, Search, ShoppingBag, SlidersHorizontal, Sprout, UsersRound, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/hooks/useAuth";
import { applyOperationalFilters, EMPTY_OPERATIONAL_FILTERS } from "@/lib/operational-work/filters";
import { positionOptions } from "@/lib/operational-work/position";
import {
  categoryOf,
  OPERATIONAL_CATEGORY_LABELS,
  OPERATIONAL_CATEGORY_ORDER,
  type OperationalCategory,
} from "@/lib/operational-work/category";
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
  buildPositionListsPrintHtml,
  POSITION_PRINT_RANGES,
  type PositionPrintRange,
} from "@/lib/operational-work/print-positions";
import {
  WorkActionDialog,
  type WorkActionDialogMode,
} from "@/components/features/operations-command-center/work-action-dialog";
import { WorkCard } from "@/components/features/operations-command-center/work-card";
import { EmailDraftDialog } from "@/components/features/operations-command-center/email-draft-dialog";
import { MorningBrief } from "@/components/features/operations-command-center/morning-brief";
import { buildTaskEmailDraft, type EmailDraft } from "@/lib/operational-work/email-draft";
import type { InterpretedAction } from "@/lib/operational-work/instruction-interpreter";
import { classifyStaleWork } from "@/lib/operations/stale-work";
import { trackAction } from "@/lib/usage/track";
import {
  listObligationDocuments,
  groupDocumentsByObligation,
  type ObligationDocument,
} from "@/lib/operations/obligation-documents";

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
  const [reportDocs, setReportDocs] = useState<ObligationDocument[]>([]);
  const [reportsNonce, setReportsNonce] = useState(0);
  const [printOpen, setPrintOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const personalView = searchParams.get("view") === "mine";
  // Typing stays responsive: React renders the (cheap) input update first and
  // re-filters the (expensive) list at a lower priority.
  const deferredQuery = useDeferredValue(query);
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
    const needle = deferredQuery.trim().toLowerCase();
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
  }, [operations.items, personalView, user?.id, filters, deferredQuery]);

  // Banner only: the cleanup screen does its own full classification.
  const staleCount = useMemo(
    () => classifyStaleWork(operations.items, new Date()).total,
    [operations.items],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<OperationalCategory, number> = { restaurant: 0, pro_shop: 0, grounds: 0, admin: 0 };
    for (const item of operations.items) counts[categoryOf(item)] += 1;
    return counts;
  }, [operations.items]);

  // Load the report samples / how-to instructions attached to obligations.
  // Best-effort: the obligation_documents table won't exist until the owner
  // applies the migration, so any failure falls back to an empty list rather
  // than breaking the dashboard render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const docs = await listObligationDocuments();
        if (!cancelled) setReportDocs(docs);
      } catch {
        if (!cancelled) setReportDocs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [reportsNonce]);

  const reportDocsByObligation = useMemo(
    () => groupDocumentsByObligation(reportDocs),
    [reportDocs],
  );

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
  // Each card needs its own slice of six audit tables. Filtering those arrays
  // inside the render loop was O(cards x rows) on every keystroke; index them
  // by work_key once instead.
  const assignmentsByWork = useMemo(() => groupBy(operations.assignments, (row) => row.work_key), [operations.assignments]);
  const postponementsByWork = useMemo(() => groupBy(operations.postponements, (row) => row.work_key), [operations.postponements]);
  const leadershipByWork = useMemo(() => groupBy(operations.leadership, (row) => row.work_key), [operations.leadership]);
  const evidenceByWork = useMemo(() => groupBy(operations.evidence, (row) => row.work_key), [operations.evidence]);
  const eventsByWork = useMemo(() => groupBy(operations.events, (row) => row.work_key), [operations.events]);
  const blockersByWork = useMemo(
    () => groupBy(operations.dependencies.filter((row) => row.active), (row) => row.dependent_work_key),
    [operations.dependencies],
  );
  const dependentsByWork = useMemo(
    () => groupBy(operations.dependencies.filter((row) => row.active), (row) => row.blocker_work_key),
    [operations.dependencies],
  );
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

  // Every filter's options come from the loaded work itself. A filter whose
  // options are empty is not rendered at all — previously the Employee and
  // Duration selects were always offered even though no task in the database
  // carries an assignee or an estimate, so choosing one always emptied the
  // list and read as "the filters are broken".
  const filterOptions = useMemo(() => {
    const items = operations.items;
    const staffById = new Map(operations.staff.map((person) => [person.id, person]));
    const employees = new Map<string, string>();
    for (const item of items) {
      const owner = item.responsibleEmployee;
      if (!owner) continue;
      const row = staffById.get(owner.id);
      employees.set(owner.id, row?.display_name || row?.full_name || owner.name);
    }
    const durations: string[][] = [];
    const minutes = items.map((item) => item.estimatedMinutes).filter((value): value is number => value !== null);
    if (minutes.some((value) => value <= 15)) durations.push(["15", "15 minutes or less"]);
    if (minutes.some((value) => value <= 30)) durations.push(["30", "30 minutes or less"]);
    if (minutes.some((value) => value <= 60)) durations.push(["60", "60 minutes or less"]);
    if (minutes.some((value) => value > 60)) durations.push(["long", "Over 60 minutes"]);
    return {
      department: unique(items.map((item) => item.department)).map((value) => [value, pretty(value)]),
      employee: [...employees.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => [id, name]),
      position: positionOptions(items.map((item) => item.responsiblePosition)),
      status: unique(items.map((item) => item.status)).map((value) => [value, pretty(value)]),
      source: unique(items.map((item) => item.sourceType)).map((value) => [value, pretty(value)]),
      priority: ["critical", "high", "normal", "low"]
        .filter((band) => items.some((item) => item.priorityBand === band))
        .map((value) => [value, pretty(value)]),
      duration: durations,
      standard: items
        .filter((item) => item.sourceType === "standard")
        .map((item) => [item.sourceRecordId, item.title]),
    };
  }, [operations.items, operations.staff]);

  function updateFilter(key: keyof OperationalWorkFilters, value: string) {
    if (value !== "all") trackAction(`filter_${key}`);
    setFilters((prior) => ({ ...prior, [key]: value }));
  }

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) => key !== "category" && value !== "all").length,
    [filters],
  );

  function openAction(mode: WorkActionDialogMode, item: OperationalWorkItem) {
    setSelectedItem(item);
    setDialogMode(mode);
    setActionError(null);
  }

  function openPrintWindow(html: string) {
    setPrintOpen(false);
    const win = window.open("", "_blank");
    if (!win) {
      setActionError("Allow pop-ups to print work lists.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  /** The lists the GM hands to each work area — crew have no app logins. */
  function printByPosition(range: PositionPrintRange) {
    trackAction(`print_by_position_${range.key}`);
    openPrintWindow(buildPositionListsPrintHtml(operations.items, new Date(), range));
  }

  function printByPerson() {
    trackAction("print_by_person");
    openPrintWindow(buildAssignmentsPrintHtml(operations.items, new Date()));
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

      <p className="mb-3 text-xs text-muted-foreground">
        Showing everything overdue plus work due through {formatHorizon(operations.horizonDate)}. Later
        occurrences of recurring duties are scheduled but not loaded here — see{" "}
        <Link href="/operations/duties" className="font-medium text-primary hover:underline">Duty ownership</Link>.
      </p>

      {staleCount > 0 && (
        <Link
          href="/operations/cleanup"
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm hover:bg-amber-500/10"
        >
          <span>
            <span className="font-semibold">{staleCount} item{staleCount === 1 ? "" : "s"} more than a day past due.</span>{" "}
            <span className="text-muted-foreground">Most repeat anyway — clear them in one tap.</span>
          </span>
          <span className="shrink-0 font-medium text-primary">Clean up →</span>
        </Link>
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
            <Button variant="outline" className="flex-1 md:flex-none" onClick={() => setShowFilters((value) => !value)}>
              <SlidersHorizontal />Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </Button>
            <div className="relative flex-1 md:flex-none">
              <Button
                variant="outline"
                className="w-full md:w-auto"
                aria-haspopup="menu"
                aria-expanded={printOpen}
                onClick={() => setPrintOpen((value) => !value)}
              >
                <Printer />Print
              </Button>
              {printOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close print menu"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setPrintOpen(false)}
                  />
                  <div role="menu" className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-border bg-card p-1.5 shadow-lg">
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Crew sheets — hand out or post on a wall
                    </p>
                    <PrintMenuItem
                      icon={UsersRound}
                      label="Today — by position"
                      hint="One page per role: Recreation Aides, Maintenance Staff, Pro-Shop Staff…"
                      onClick={() => printByPosition(POSITION_PRINT_RANGES.today)}
                    />
                    <PrintMenuItem
                      icon={UsersRound}
                      label="Next 7 days — by position"
                      hint="Same sheets, one section per day."
                      onClick={() => printByPosition(POSITION_PRINT_RANGES.week)}
                    />
                    <div className="my-1 border-t border-border" />
                    <PrintMenuItem
                      icon={Printer}
                      label="By named person"
                      hint="Only work delegated to a specific employee."
                      onClick={printByPerson}
                    />
                    <Link
                      href="/operations/duties"
                      role="menuitem"
                      onClick={() => setPrintOpen(false)}
                      className="mt-0.5 block rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="font-medium">Wall posters — standing duties</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Duty ownership page → &ldquo;Print role duty sheets&rdquo;.
                      </span>
                    </Link>
                    <p className="border-t border-border px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
                      Crew roles only. Your own work — Program Standards, purchase
                      requests, equipment — stays here in the command center.
                    </p>
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" size="icon" onClick={operations.reload} aria-label="Refresh work"><RefreshCw className={operations.loading ? "animate-spin" : ""} /></Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by business area">
          <CategoryPill
            label="All"
            icon={LayoutGrid}
            count={operations.items.length}
            active={filters.category === "all"}
            onClick={() => updateFilter("category", "all")}
          />
          {OPERATIONAL_CATEGORY_ORDER.map((category) => (
            <CategoryPill
              key={category}
              label={OPERATIONAL_CATEGORY_LABELS[category]}
              icon={CATEGORY_ICONS[category]}
              count={categoryCounts[category]}
              active={filters.category === category}
              onClick={() => updateFilter("category", filters.category === category ? "all" : category)}
            />
          ))}
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <FilterSelect label="Department" value={filters.department} onChange={(value) => updateFilter("department", value)} options={filterOptions.department} />
            <FilterSelect label="Employee" value={filters.employee} onChange={(value) => updateFilter("employee", value)} options={filterOptions.employee} />
            <FilterSelect label="Position" value={filters.position} onChange={(value) => updateFilter("position", value)} options={filterOptions.position} />
            <FilterSelect label="Status" value={filters.status} onChange={(value) => updateFilter("status", value)} options={filterOptions.status} />
            <FilterSelect label="Source" value={filters.source} onChange={(value) => updateFilter("source", value)} options={filterOptions.source} />
            <FilterSelect label="Priority" value={filters.priority} onChange={(value) => updateFilter("priority", value)} options={filterOptions.priority} />
            <FilterSelect label="Due date" value={filters.due} onChange={(value) => updateFilter("due", value)} options={[["overdue", "Overdue"], ["today", "Today"], ["week", "Next 7 days"], ["none", "No due date"]]} />
            <FilterSelect label="Duration" value={filters.duration} onChange={(value) => updateFilter("duration", value)} options={filterOptions.duration} />
            <FilterSelect label="Program Standard" value={filters.standard} onChange={(value) => updateFilter("standard", value)} options={filterOptions.standard} />
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
            const expanded = expandedSections.has(key);
            const shown = expanded ? rows : rows.slice(0, SECTION_PAGE_SIZE);
            return (
              <section key={key} id={`section-${key}`} className="scroll-mt-28">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide">{OPERATIONAL_SECTION_LABELS[key]}</h2>
                  <span className="text-xs text-muted-foreground">
                    {shown.length < rows.length ? `${shown.length} of ${rows.length}` : rows.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {shown.map((item) => (
                    <WorkCard
                      key={item.stableId}
                      item={item}
                      itemById={itemById}
                      assignment={assignmentByWork.get(item.stableId) ?? null}
                      assignmentHistory={assignmentsByWork.get(item.stableId) ?? EMPTY_ROWS}
                      postponementHistory={postponementsByWork.get(item.stableId) ?? EMPTY_ROWS}
                      leadershipHistory={leadershipByWork.get(item.stableId) ?? EMPTY_ROWS}
                      evidence={evidenceByWork.get(item.stableId) ?? EMPTY_ROWS}
                      events={eventsByWork.get(item.stableId) ?? EMPTY_ROWS}
                      blockers={blockersByWork.get(item.stableId) ?? EMPTY_ROWS}
                      dependents={dependentsByWork.get(item.stableId) ?? EMPTY_ROWS}
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
                      reportDocs={item.sourceType === "obligation" ? (reportDocsByObligation.get(item.sourceRecordId) ?? []) : []}
                      onReschedule={(work, date, note) => run(work.stableId, () => operations.reschedule(work.stableId, date, note))}
                      onReportChange={() => { setReportsNonce((n) => n + 1); operations.reload(); }}
                    />
                  ))}
                </div>
                {shown.length < rows.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setExpandedSections((prior) => new Set(prior).add(key))}
                  >
                    Show all {rows.length} in {OPERATIONAL_SECTION_LABELS[key]}
                  </Button>
                )}
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

/**
 * Cards rendered per section before "Show all". The duty materializer keeps a
 * year of occurrences on hand, so an uncapped list put tens of thousands of
 * interactive cards in the DOM and froze the tab on every filter change.
 */
const SECTION_PAGE_SIZE = 25;

/** Shared empty array so cards with no audit rows keep a stable prop identity. */
const EMPTY_ROWS: never[] = [];

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function PrintMenuItem({ icon: Icon, label, hint, onClick }: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted/60"
    >
      <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-3.5 w-3.5" />{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

const CATEGORY_ICONS: Record<OperationalCategory, LucideIcon> = {
  restaurant: UtensilsCrossed,
  pro_shop: ShoppingBag,
  grounds: Sprout,
  admin: ClipboardList,
};

function CategoryPill({ label, icon: Icon, count, active, onClick }: {
  label: string;
  icon: LucideIcon;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted/50"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="whitespace-nowrap">{label}</span>
      <span className={`rounded-full px-1.5 text-xs font-bold tabular-nums ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>{count}</span>
    </button>
  );
}

function OperationsLoading() {
  return <div className="flex min-h-[45vh] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading operational work…</div>;
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" | "warning" }) {
  return <div className={`rounded-xl border p-3 ${tone === "danger" ? "border-red-500/30 bg-red-500/5" : tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  // A select with nothing to choose can only ever empty the list, which reads
  // as a broken filter. Hide it unless it is already carrying a selection the
  // user needs to be able to clear.
  if (options.length === 0 && value === "all") return null;
  return <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs"><option value="all">All</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))].sort();
}

function pretty(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatHorizon(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}
