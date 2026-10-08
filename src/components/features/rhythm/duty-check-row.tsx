"use client";

// One recurring duty occurrence on the My Duties page: a big round check
// target, the name, when it's due, and a jump to the tool that does the work.

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { CADENCE_NOUNS, type RhythmObligationRow } from "@/lib/rhythm/cadence-board";
import { dueText, shortDueDate } from "@/lib/rhythm/labels";
import { liveObligationHref } from "@/lib/operations/obligation-links";

export type DutyCheckRowVariant = "checklist" | "catch-up" | "also-due" | "soon";

export function DutyCheckRow({
  row,
  variant = "checklist",
  onComplete,
  onUndo,
  onEdit,
}: {
  row: RhythmObligationRow;
  variant?: DutyCheckRowVariant;
  onComplete: () => Promise<void> | void;
  /** Only offered to roles allowed to correct a completion. */
  onUndo?: () => void;
  onEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { obligation, done, daysUntil, dueDate } = row;
  const late = !done && daysUntil < 0;
  const showCadence = variant !== "checklist";
  const href = liveObligationHref(obligation.link_href);

  async function toggle() {
    if (busy) return;
    if (done) {
      onUndo?.();
      return;
    }
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  }

  const checkLabel = done
    ? onUndo ? `Undo ${obligation.title}` : `${obligation.title} is done`
    : `Mark ${obligation.title} done`;

  return (
    <div
      data-testid="duty-row"
      className={cn(
        "flex items-start gap-3 rounded-2xl border bg-card px-3 py-3 transition-colors sm:px-4",
        done ? "border-border/60 bg-card/60" : late ? "border-destructive/35" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={busy || (done && !onUndo)}
        aria-label={checkLabel}
        aria-pressed={done}
        className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-default"
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all",
            done
              ? "border-success bg-success text-white"
              : late
                ? "border-destructive/60 hover:bg-destructive/10"
                : "border-primary/50 hover:bg-primary/10",
            busy && "border-primary",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : done ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
        </span>
      </button>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("text-[15px] font-semibold leading-snug", done && "text-muted-foreground line-through decoration-1")}>
          {obligation.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          {showCadence && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {CADENCE_NOUNS[obligation.cadence]}
            </span>
          )}
          {done ? (
            <span className="font-medium text-success">Done</span>
          ) : variant === "catch-up" ? (
            <span className="font-medium text-destructive">Was due {shortDueDate(dueDate)} · {dueText(daysUntil, dueDate)}</span>
          ) : (
            <span className={cn(late && "font-medium text-destructive", daysUntil === 0 && "font-medium text-foreground")}>
              {dueText(daysUntil, dueDate)}
              {late ? ` · ${shortDueDate(dueDate)}` : ""}
            </span>
          )}
          {row.moreMissed > 0 && (
            <span className="font-medium text-destructive">
              +{row.moreMissed} more behind it
            </span>
          )}
        </p>
        {obligation.detail && !done && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90">{obligation.detail}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${obligation.title}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {href && (
          <Link
            href={href}
            aria-label={`Open the page for ${obligation.title}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
