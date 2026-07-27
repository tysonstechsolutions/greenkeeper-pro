"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarClock, Check, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/hooks/useAuth";
import { useOperationalWork } from "@/lib/operational-work/use-operational-work";
import {
  classifyStaleWork,
  describeRecurringClear,
  type StaleWorkItem,
} from "@/lib/operations/stale-work";
import { isActionableStaleItem, stalePlanFor } from "@/lib/operations/stale-actions";
import { directDeleteRow, directPatchRow } from "@/lib/supabase/rest";
import { trackAction } from "@/lib/usage/track";

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Stale-work cleanup — the "clean up the overdue pile" view.
 *
 * The duty materializer keeps a year of occurrences on hand, so every missed
 * day accumulates permanently in Overdue. This screen separates the two cases
 * the GM actually faces and gives each exactly one action:
 *
 *  - a recurring duty that already runs again → clear the missed copies in bulk
 *  - anything else (one-off, seasonal window closed) → reschedule, done, delete
 *
 * Every write is a direct row update, shown and confirmed before it runs.
 */
export default function CleanupPage() {
  const { isManager, user } = useAuth();
  const operations = useOperationalWork();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(todayLocal());

  const stale = useMemo(
    () => classifyStaleWork(operations.items, new Date()),
    [operations.items],
  );

  async function run(key: string, action: () => Promise<void>, done: string) {
    trackAction(key === "bulk" ? "cleanup_bulk_clear" : "cleanup_single_action");
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      operations.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  /** Cancel with an explicit reason — never a silent delete. Recurring misses
   *  are always duty occurrences, so they always live in `tasks`. */
  async function cancelRows(rows: StaleWorkItem[], reason: string) {
    for (const row of rows) {
      if (stalePlanFor(row.item)?.table !== "tasks") continue;
      await directPatchRow("tasks", "id", row.item.sourceRecordId, {
        status: "cancelled",
        cancel_reason: reason,
      }, "cleanup.cancel");
    }
  }

  const clearRecurring = () => run(
    "bulk",
    () => cancelRows(stale.recurringMisses, "missed_recurring_occurrence"),
    `Cleared ${stale.recurringMisses.length} missed recurring occurrence(s). The duties stay active.`,
  );

  const reschedule = (row: StaleWorkItem, date: string) => run(
    row.item.stableId,
    async () => {
      const plan = stalePlanFor(row.item);
      if (!plan) throw new Error("This item is managed in its own workspace.");
      await directPatchRow(plan.table, "id", row.item.sourceRecordId,
        { [plan.dateColumn]: date }, "cleanup.reschedule");
      setRescheduleFor(null);
    },
    `"${row.item.title}" moved to ${date}.`,
  );

  const markDone = (row: StaleWorkItem) => run(
    row.item.stableId,
    async () => {
      const plan = stalePlanFor(row.item);
      if (!plan) throw new Error("This item is managed in its own workspace.");
      // Records who closed it and when, so it shows up in completion history.
      await directPatchRow(plan.table, "id", row.item.sourceRecordId,
        plan.donePatch(new Date().toISOString(), user?.id ?? null), "cleanup.complete");
    },
    `"${row.item.title}" marked done.`,
  );

  const remove = (row: StaleWorkItem) => run(
    row.item.stableId,
    async () => {
      const plan = stalePlanFor(row.item);
      if (!plan?.deletable) throw new Error("This item is managed in its own workspace.");
      await directDeleteRow(plan.table, "id", row.item.sourceRecordId, "cleanup.delete");
    },
    `"${row.item.title}" deleted.`,
  );

  if (!isManager) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        Only an operations manager can clean up stale work.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-28 pt-4 sm:px-5 md:pb-8">
      <Link href="/operations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Operations
      </Link>

      <PageHeader
        title="Clean up stale work"
        description="Everything more than a day past due, split into what repeats anyway and what needs a decision from you."
      />

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {operations.loading && operations.items.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading stale work…
        </div>
      ) : stale.total === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing is stale. Everything overdue is current enough to still matter.
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Stale items" value={stale.total} />
            <Metric label="Repeat anyway" value={stale.recurringMisses.length} />
            <Metric label="Need a decision" value={stale.needsDecision.length} tone="warning" />
          </div>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide">Missed, but it repeats</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These duties are already scheduled again, so the work is not lost. Clearing them
              only removes the missed copies from your overdue pile.
            </p>
            {stale.recurringMisses.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None.</p>
            ) : (
              <>
                <div className="mt-3 rounded-xl border border-border bg-card p-3">
                  <p className="text-sm">{describeRecurringClear(stale.recurringMisses)}</p>
                  {!confirmBulk ? (
                    <Button className="mt-3" variant="outline" onClick={() => setConfirmBulk(true)}>
                      <RotateCcw />Clear {stale.recurringMisses.length} missed occurrence{stale.recurringMisses.length === 1 ? "" : "s"}
                    </Button>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button disabled={busy === "bulk"} onClick={clearRecurring}>
                        {busy === "bulk" ? <Loader2 className="animate-spin" /> : <Check />}Yes, clear them
                      </Button>
                      <Button variant="ghost" disabled={busy === "bulk"} onClick={() => setConfirmBulk(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
                <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-3 text-xs">
                  {stale.recurringMisses.slice(0, 200).map((row) => (
                    <li key={row.item.stableId} className="flex justify-between gap-3">
                      <span className="truncate">{row.item.title}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.item.dueDate} · {row.daysOverdue}d · next {row.nextOccurrence}
                      </span>
                    </li>
                  ))}
                  {stale.recurringMisses.length > 200 && (
                    <li className="pt-1 text-muted-foreground">…and {stale.recurringMisses.length - 200} more</li>
                  )}
                </ul>
              </>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide">Needs a decision</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing else is scheduled for these — a one-off that slipped, or a seasonal job whose
              window has closed. Push it to a date you will actually do it, mark it done, or delete it.
            </p>
            {stale.needsDecision.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {stale.needsDecision.map((row) => {
                  const key = row.item.stableId;
                  const working = busy === key;
                  return (
                    <div key={key} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{row.item.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.item.sourceLabel} · due {row.item.dueDate} · {row.daysOverdue} days past
                            {row.item.responsiblePosition ? ` · ${row.item.responsiblePosition.replaceAll("_", " ")}` : ""}
                          </p>
                        </div>
                        {isActionableStaleItem(row.item) ? (
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="xs" variant="outline" disabled={working}
                              onClick={() => { setRescheduleFor(rescheduleFor === key ? null : key); setRescheduleDate(todayLocal()); }}>
                              <CalendarClock />Reschedule
                            </Button>
                            <Button size="xs" variant="outline" disabled={working} onClick={() => markDone(row)}>
                              <Check />Mark done
                            </Button>
                            <Button size="xs" variant="ghost" className="text-destructive" disabled={working} onClick={() => remove(row)}>
                              <Trash2 />Delete
                            </Button>
                          </div>
                        ) : (
                          // Money and compliance records keep their own audit
                          // trail — send the GM there rather than offering a
                          // generic delete that would destroy it.
                          <Button asChild size="xs" variant="outline">
                            <Link href={row.item.destinationRoute}>
                              <ArrowUpRight />Open {row.item.sourceLabel.toLowerCase()}
                            </Link>
                          </Button>
                        )}
                      </div>
                      {rescheduleFor === key && (
                        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
                          <label className="space-y-1">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">New date</span>
                            <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className="w-44" />
                          </label>
                          <Button size="sm" disabled={working || !rescheduleDate} onClick={() => reschedule(row, rescheduleDate)}>
                            {working ? <Loader2 className="animate-spin" /> : <Check />}Move it
                          </Button>
                          <Button size="sm" variant="ghost" disabled={working} onClick={() => setRescheduleFor(null)}>Cancel</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
