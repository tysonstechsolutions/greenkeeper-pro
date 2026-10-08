"use client";

// One dated piece of one-off work (a task, PR, goal step, calendar deadline…)
// on the My Duties page. Simple work can be checked off right here; anything
// with its own workflow (a purchase request, a standard) opens its page.

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RhythmWorkRow } from "@/lib/rhythm/cadence-board";
import { dueText, shortDueDate } from "@/lib/rhythm/labels";

/** Sources whose "complete" is a single transition (mirrors the work card). */
const CHECKABLE = new Set(["task", "duty", "step"]);

const WAITING_LABELS: Partial<Record<RhythmWorkRow["item"]["status"], string>> = {
  in_progress: "In progress",
  postponed: "Postponed",
  blocked: "Blocked",
  waiting_leadership: "With leadership",
  needs_verification: "Needs verification",
  awaiting_acceptance: "Not accepted yet",
};

export function canCheckOff(row: RhythmWorkRow): boolean {
  const { item } = row;
  return CHECKABLE.has(item.sourceType)
    && !row.done
    && !item.blockedState.blockerKeys.length
    && !item.leadershipState.active
    && item.status !== "needs_verification";
}

export function WorkRow({
  row,
  onComplete,
}: {
  row: RhythmWorkRow;
  onComplete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const { item, done, daysUntil, dueDate } = row;
  const checkable = canCheckOff(row);
  const late = !done && daysUntil < 0;
  const waiting = WAITING_LABELS[item.status];

  async function complete() {
    if (busy || !checkable) return;
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="work-row"
      className={cn(
        "flex items-start gap-3 rounded-2xl border bg-card px-3 py-3 sm:px-4",
        done ? "border-border/60 bg-card/60" : late ? "border-destructive/35" : "border-border",
      )}
    >
      {checkable || done ? (
        <button
          type="button"
          onClick={complete}
          disabled={busy || done}
          aria-label={done ? `${item.title} is done` : `Mark ${item.title} done`}
          aria-pressed={done}
          className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-default"
        >
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-all",
              done ? "border-success bg-success text-white" : "border-primary/50 hover:bg-primary/10",
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : done ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
          </span>
        </button>
      ) : (
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
        </span>
      )}

      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("text-[15px] font-semibold leading-snug", done && "text-muted-foreground line-through decoration-1")}>
          {item.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {item.sourceLabel}
          </span>
          {done ? (
            <span className="font-medium text-success">Done</span>
          ) : (
            <span className={cn(late && "font-medium text-destructive", daysUntil === 0 && "font-medium text-foreground")}>
              {dueText(daysUntil, dueDate)}
              {late ? ` · ${shortDueDate(dueDate)}` : ""}
            </span>
          )}
          {waiting && !done && (
            <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
              {waiting}
            </span>
          )}
        </p>
      </div>

      <Link
        href={item.destinationRoute}
        aria-label={`Open ${item.title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
