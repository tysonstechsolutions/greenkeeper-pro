"use client";

// My Duties — the GM's own recurring work, by rhythm.
//
// Five tabs, one question each: what do I owe today, this week, this month,
// this quarter, this year — and how much of it is done? Recurring duties are
// checked off in one tap; anything missed earlier sits at the top under
// "Catch up first" so it can't silently fall off. Crew duties stay on their
// printed sheets (Operations → Print); this page is only the GM's list.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Hourglass,
  ListChecks,
  Loader2,
  PlayCircle,
  Plus,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DutyCheckRow, type DutyCheckRowVariant } from "@/components/features/rhythm/duty-check-row";
import { DutyEditorDialog } from "@/components/features/rhythm/duty-editor-dialog";
import { WorkRow } from "@/components/features/rhythm/work-row";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";
import { useOperations } from "@/lib/operations/use-operations";
import { useOperationalWork } from "@/lib/operational-work/use-operational-work";
import type { Obligation, ObligationCadence } from "@/lib/operations/types";
import {
  buildRhythmBoard,
  RHYTHM_CHECKLIST_LABELS,
  RHYTHM_TAB_LABELS,
  RHYTHM_TABS,
  type RhythmObligationRow,
  type RhythmTab,
  type RhythmWindow,
} from "@/lib/rhythm/cadence-board";
import { describeSchedule } from "@/lib/rhythm/obligation-form";
import { directPatchRow, directSelectAll } from "@/lib/supabase/rest";
import { trackAction } from "@/lib/usage/track";

const TAB_CADENCE: Record<RhythmTab, ObligationCadence> = {
  today: "weekly",
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "annual",
};

const WINDOW_NOUN: Record<RhythmTab, string> = {
  today: "today",
  week: "this week",
  month: "this month",
  quarter: "this quarter",
  year: "this year",
};

const CADENCE_WORD: Record<ObligationCadence, string> = {
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "yearly",
};

/** One-off work rows shown before "Show all". */
const WORK_PAGE_SIZE = 8;

function parseTab(value: string | null): RhythmTab {
  return RHYTHM_TABS.includes(value as RhythmTab) ? (value as RhythmTab) : "today";
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function MyDutiesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MyDuties />
    </Suspense>
  );
}

function MyDuties() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = parseTab(searchParams.get("tab"));
  const { user, isManager } = useAuth();
  const ops = useOperations();
  const work = useOperationalWork();
  const [actionError, setActionError] = useState<string | null>(null);
  const [undoRow, setUndoRow] = useState<RhythmObligationRow | null>(null);
  const [editor, setEditor] = useState<{ obligation: Obligation | null } | null>(null);
  const [paused, setPaused] = useState<Obligation[]>([]);
  const [pausedNonce, setPausedNonce] = useState(0);

  const today = useMemo(() => parseYmd(ops.today), [ops.today]);
  const board = useMemo(() => buildRhythmBoard({
    obligations: ops.obligations,
    completions: ops.completions,
    work: work.items,
    currentUserId: user?.id ?? null,
    today,
  }), [ops.obligations, ops.completions, work.items, user?.id, today]);
  const view = board[tab];

  // Paused duties are fetched separately (the operations hook only loads
  // active ones) so "Stop tracking" is never a one-way door.
  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    directSelectAll<Obligation>("obligations", {
      filters: ["is_active=eq.false"],
      orderBy: [{ column: "title" }, { column: "id" }],
      label: "my-duties.paused",
    }).then((rows) => { if (!cancelled) setPaused(rows); })
      .catch(() => { if (!cancelled) setPaused([]); });
    return () => { cancelled = true; };
  }, [isManager, pausedNonce]);

  const selectTab = useCallback((next: RhythmTab) => {
    trackAction(`my_duties_tab_${next}`);
    router.replace(next === "today" ? "/my-duties" : `/my-duties?tab=${next}`, { scroll: false });
  }, [router]);

  async function completeObligation(row: RhythmObligationRow) {
    setActionError(null);
    trackAction("my_duties_complete_duty");
    await ops.completeObligation({
      obligation: row.obligation,
      period: row.period,
      dueDate: row.dueDate,
      status: row.daysUntil < 0 ? "overdue" : "due_soon",
      daysUntil: row.daysUntil,
    });
  }

  async function completeWork(stableId: string) {
    setActionError(null);
    trackAction("my_duties_complete_work");
    try {
      await work.transition(stableId, "complete");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That couldn't be marked done.");
    }
  }

  async function resume(obligation: Obligation) {
    setActionError(null);
    try {
      await directPatchRow("obligations", "id", obligation.id, {
        is_active: true,
        // Months it spent paused are not owed.
        effective_from: ops.today,
        updated_at: new Date().toISOString(),
      }, "my-duties.resume-obligation");
      ops.reload();
      setPausedNonce((n) => n + 1);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Couldn't resume it.");
    }
  }

  const rowProps = (row: RhythmObligationRow, variant: DutyCheckRowVariant) => ({
    row,
    variant,
    onComplete: () => completeObligation(row),
    onUndo: ops.canUndoObligations ? () => setUndoRow(row) : undefined,
    onEdit: isManager ? () => setEditor({ obligation: row.obligation }) : undefined,
  });

  const error = actionError || ops.error || work.error;
  const firstLoad = ops.loading && ops.obligations.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 sm:px-5 md:pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-2xl font-bold leading-tight">My Duties</h1>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => setEditor({ obligation: null })}>
            <Plus />Add duty
          </Button>
        )}
      </header>

      <TabBar board={board} active={tab} onSelect={selectTab} />

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {firstLoad ? <PageLoading /> : (
        <div className="space-y-6">
          <ProgressCard view={view} />

          {view.catchUp.length > 0 && (
            <Section
              icon={AlertTriangle}
              title="Catch up first"
              hint="Missed earlier. Oldest first — checking one off brings up the next."
              tone="danger"
              count={view.catchUp.length}
            >
              {view.catchUp.map((row) => (
                <DutyCheckRow key={`${row.obligation.id}:${row.period}`} {...rowProps(row, "catch-up")} />
              ))}
            </Section>
          )}

          <Section
            icon={ListChecks}
            title={RHYTHM_CHECKLIST_LABELS[tab]}
            count={view.checklist.length}
          >
            {view.checklist.length > 0
              ? view.checklist.map((row) => (
                <DutyCheckRow key={`${row.obligation.id}:${row.period}`} {...rowProps(row, tab === "today" ? "also-due" : "checklist")} />
              ))
              : <EmptyLine tab={tab} canAdd={isManager} onAdd={() => setEditor({ obligation: null })} />}
          </Section>

          {tab === "today" && <WorkSection view={view} title="Your other work" loading={work.loading} onComplete={completeWork} />}

          {view.startSoon.length > 0 && (
            <Section
              icon={PlayCircle}
              title="Start these soon"
              hint="Coming due — inside the heads-up window you set."
              count={view.startSoon.length}
            >
              {view.startSoon.map((row) => (
                <DutyCheckRow key={`${row.obligation.id}:${row.period}`} {...rowProps(row, "soon")} />
              ))}
            </Section>
          )}

          {view.alsoDue.length > 0 && (
            <Section
              icon={CalendarRange}
              title={`Also due ${WINDOW_NOUN[tab]}`}
              hint="From your longer cycles."
              count={view.alsoDue.length}
            >
              {view.alsoDue.map((row) => (
                <DutyCheckRow key={`${row.obligation.id}:${row.period}`} {...rowProps(row, "also-due")} />
              ))}
            </Section>
          )}

          {(tab === "week" || tab === "month") && (
            <WorkSection view={view} title={`Other work due ${WINDOW_NOUN[tab]}`} loading={work.loading} onComplete={completeWork} />
          )}

          {tab === "year" && <YearAhead view={view} />}

          {isManager && paused.length > 0 && (
            <details className="group rounded-2xl border border-border bg-card/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
                <span>Duties you stopped tracking · {paused.length}</span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="divide-y divide-border/60 border-t border-border/60">
                {paused.map((obligation) => (
                  <li key={obligation.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{obligation.title}</span>
                      <span className="block text-xs text-muted-foreground">{describeSchedule(obligation)}</span>
                    </span>
                    <Button size="xs" variant="outline" onClick={() => resume(obligation)}>Resume</Button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Link
            href="/operations"
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm hover:bg-muted/40"
          >
            <span className="flex items-center gap-3">
              <Printer className="h-4 w-4 text-muted-foreground" />
              <span>
                <span className="block font-semibold">All work &amp; crew sheets</span>
                <span className="block text-xs text-muted-foreground">Every task and crew duty, filters, and printable lists for each position.</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>
      )}

      <UndoDialog
        row={undoRow}
        onClose={() => setUndoRow(null)}
        onConfirm={async (reason) => {
          if (!undoRow) return;
          await ops.uncompleteObligation(undoRow.obligation.id, undoRow.period, reason);
          setUndoRow(null);
        }}
      />

      <DutyEditorDialog
        open={!!editor}
        obligation={editor?.obligation ?? null}
        defaultCadence={TAB_CADENCE[tab]}
        currentUserId={user?.id ?? null}
        today={ops.today}
        onClose={() => setEditor(null)}
        onSaved={() => {
          trackAction(editor?.obligation ? "my_duties_edit_duty" : "my_duties_add_duty");
          ops.reload();
          setPausedNonce((n) => n + 1);
        }}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function TabBar({ board, active, onSelect }: {
  board: Record<RhythmTab, RhythmWindow>;
  active: RhythmTab;
  onSelect: (tab: RhythmTab) => void;
}) {
  return (
    <nav
      aria-label="Duty timeframe"
      className="sticky top-0 z-20 -mx-3 mb-4 bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5"
    >
      <div className="grid grid-cols-5 gap-1 rounded-2xl border border-border bg-muted/50 p-1">
        {RHYTHM_TABS.map((tab) => {
          const slot = board[tab];
          const isActive = tab === active;
          const late = slot.catchUp.length > 0;
          return (
            <button
              key={tab}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(tab)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-xs font-semibold transition-colors sm:text-sm",
                isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{RHYTHM_TAB_LABELS[tab]}</span>
              <span
                className={cn(
                  "min-w-[1.5rem] rounded-full px-1.5 text-[11px] tabular-nums leading-5",
                  slot.remaining === 0
                    ? "text-success"
                    : late
                      ? "bg-destructive/15 text-destructive"
                      : isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {slot.remaining === 0 ? <CheckCircle2 className="mx-auto h-4 w-4" aria-label="All done" /> : slot.remaining}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ProgressCard({ view }: { view: RhythmWindow }) {
  const percent = view.total === 0 ? 0 : Math.round((view.done / view.total) * 100);
  const left = view.total - view.done;
  const allDone = view.total > 0 && left === 0;
  const noun = WINDOW_NOUN[view.tab];
  let message: string;
  if (view.total === 0) message = `Nothing recurring is scheduled ${noun}.`;
  else if (allDone) message = `All done ${noun}.`;
  else message = `${left} left ${noun}.`;
  if (view.catchUp.length > 0) {
    message += ` ${view.catchUp.length} to catch up from before.`;
  }

  return (
    <section
      aria-label={`Progress ${noun}`}
      className={cn(
        "rounded-2xl border p-4",
        allDone && view.catchUp.length === 0
          ? "border-success/30 bg-success/5"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {view.tab === "today" ? "Today" : `This ${view.tab}`}
          </p>
          <p className="truncate text-lg font-bold">{view.rangeLabel}</p>
        </div>
        {view.total > 0 && (
          <p className="shrink-0 text-3xl font-bold tabular-nums leading-none">
            {view.done}
            <span className="text-lg font-semibold text-muted-foreground">/{view.total}</span>
          </p>
        )}
      </div>
      {view.total > 0 && (
        <div
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className={cn("h-full rounded-full transition-all duration-500", allDone ? "bg-success" : "bg-primary")}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        {allDone && <CheckCircle2 className="h-4 w-4 text-success" />}
        {message}
      </p>
    </section>
  );
}

function Section({ icon: Icon, title, hint, tone = "default", count, children }: {
  icon: typeof ListChecks;
  title: string;
  hint?: string;
  tone?: "default" | "danger";
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className={cn(
          "flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide",
          tone === "danger" && "text-destructive",
        )}>
          <Icon className="h-4 w-4" />
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        )}
      </div>
      {hint && <p className="-mt-1 mb-2 px-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyLine({ tab, canAdd, onAdd }: { tab: RhythmTab; canAdd: boolean; onAdd: () => void }) {
  const text = tab === "today"
    ? "No recurring duties land on today."
    : `No ${CADENCE_WORD[TAB_CADENCE[tab]]} duties yet.`;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
      <span>{text}</span>
      {canAdd && tab !== "today" && (
        <Button size="xs" variant="outline" onClick={onAdd}><Plus />Add one</Button>
      )}
    </div>
  );
}

function WorkSection({ view, title, loading, onComplete }: {
  view: RhythmWindow;
  title: string;
  loading: boolean;
  onComplete: (stableId: string) => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = view.work;
  const shown = showAll ? rows : rows.slice(0, WORK_PAGE_SIZE);
  return (
    <Section icon={Hourglass} title={title} hint="Tasks, purchase requests, goals, and deadlines with a date." count={rows.length}>
      {loading && rows.length === 0 ? (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading tasks and requests…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          Nothing else with a date {WINDOW_NOUN[view.tab]}.
        </p>
      ) : (
        <>
          {shown.map((row) => (
            <WorkRow key={row.item.stableId} row={row} onComplete={() => onComplete(row.item.stableId)} />
          ))}
          {shown.length < rows.length && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAll(true)}>
              Show all {rows.length}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}

function YearAhead({ view }: { view: RhythmWindow }) {
  const months = view.months.filter((month) => month.rows.length > 0);
  return (
    <Section
      icon={CalendarRange}
      title="Next 12 months"
      hint="Quarterly and yearly duties, month by month — for planning ahead."
    >
      {months.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          No quarterly or yearly duties in the next 12 months.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-border/70 pl-4">
          {months.map((month) => (
            <li key={month.key} className="relative">
              <span className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" aria-hidden />
              <p className="text-sm font-bold">{month.label}</p>
              <ul className="mt-1 space-y-1">
                {month.rows.map((row) => (
                  <li key={`${row.obligation.id}:${row.period}`} className="flex items-center gap-2 text-sm">
                    {row.done
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Done" />
                      : <span className="ml-1 mr-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />}
                    <span className={cn("min-w-0 flex-1 truncate", row.done && "text-muted-foreground line-through")}>
                      {row.obligation.title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {parseYmd(row.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function UndoDialog({ row, onClose, onConfirm }: {
  row: RhythmObligationRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(row);
  if (row !== seen) {
    setSeen(row);
    setReason("");
  }

  async function confirm() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undo &ldquo;{row?.obligation.title}&rdquo;?</DialogTitle>
          <DialogDescription>
            It goes back on the list as not done. The change is logged, so say why.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="e.g. Checked it off by mistake"
          autoFocus
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>Keep it done</Button>
          <Button disabled={busy || !reason.trim()} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" />}Undo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Loading your duties…
    </div>
  );
}
