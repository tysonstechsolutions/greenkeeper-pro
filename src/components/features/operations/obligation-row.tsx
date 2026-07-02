"use client";

// One obligation, evaluated: status badge + due date + complete/undo.
// Shared by the Today page and the workspace landings.

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvaluatedObligation } from "@/lib/operations/types";

const STATUS_STYLES: Record<
  EvaluatedObligation["status"],
  { label: (d: number) => string; className: string }
> = {
  overdue: {
    label: (d) => (d === -1 ? "1 day overdue" : `${-d} days overdue`),
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  due_soon: {
    label: (d) => (d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`),
    className: "bg-warning/15 text-warning-foreground border-warning/40",
  },
  upcoming: {
    label: (d) => `In ${d} days`,
    className: "bg-muted text-muted-foreground border-border",
  },
  done: {
    label: () => "Done",
    className: "bg-success/10 text-success border-success/30",
  },
};

function formatDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ObligationRow({
  item,
  onComplete,
  onUndo,
}: {
  item: EvaluatedObligation;
  onComplete?: () => Promise<void> | void;
  onUndo?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const s = STATUS_STYLES[item.status];

  const run = async (fn?: () => Promise<void> | void) => {
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gk-card flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{item.obligation.title}</span>
          <span
            className={cn(
              "text-[11px] font-semibold px-1.5 py-0.5 rounded-md border",
              s.className,
            )}
          >
            {s.label(item.daysUntil)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDue(item.dueDate)}
          {/* The seed notes already say "Delegable ..." where it matters —
              only add the flag when there's no note spelling it out. */}
          {item.obligation.delegable && !item.obligation.notes ? " · delegable" : ""}
          {item.obligation.notes ? ` · ${item.obligation.notes}` : ""}
        </p>
      </div>

      {item.obligation.link_href && (
        <Link
          href={item.obligation.link_href}
          className="inline-link p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
          aria-label={`Open ${item.obligation.title}`}
        >
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      )}

      {item.status === "done"
        ? onUndo && (
            <button
              onClick={() => run(onUndo)}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 rounded-lg text-muted-foreground hover:bg-muted/60 transition-colors shrink-0"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Undo
            </button>
          )
        : onComplete && (
            <button
              onClick={() => run(onComplete)}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all shrink-0"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Done
            </button>
          )}
    </div>
  );
}
