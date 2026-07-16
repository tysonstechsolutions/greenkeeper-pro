"use client";

// Custom workspace landing (Restaurant, Pro Shop): the area's obligations
// with lead-time status, today's duties as check-offs, and the workspace's
// tools as a link grid. Course & Range keeps its own richer pages; Money and
// People use the plain HubPage grid.

import Link from "next/link";
import { AlertTriangle, CalendarClock, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOperations } from "@/lib/operations/use-operations";
import type { DutyArea, ObligationWorkspace } from "@/lib/operations/types";
import type { AppEntry } from "@/lib/layout/app-catalog";
import { ObligationRow } from "@/components/features/operations/obligation-row";

export function WorkspaceLanding({
  title,
  description,
  area,
  workspaces,
  items,
}: {
  title: string;
  description: string;
  /** Duty area shown in the "Today here" checklist. */
  area: DutyArea;
  /** Obligation workspaces surfaced on this landing. */
  workspaces: ObligationWorkspace[];
  /** Link cards (the hub's children). */
  items: AppEntry[];
}) {
  const ops = useOperations();

  const obligations = ops.evaluated.filter((e) =>
    workspaces.includes(e.obligation.workspace),
  );
  const attention = obligations.filter(
    (e) => e.status === "overdue" || e.status === "due_soon",
  );
  const rest = obligations.filter(
    (e) => e.status !== "overdue" && e.status !== "due_soon",
  );
  const duties = ops.dutiesToday.filter((d) => d.duty.area === area);

  return (
    <div className="gk-page mx-auto">
      <h1 className="mb-1">{title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>

      {/* Needs attention */}
      {attention.length > 0 && (
        <section className="mb-6 gk-animate-in gk-animate-in-1">
          <p className="gk-section-label mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            Needs attention
          </p>
          <div className="space-y-2">
            {attention.map((e) => (
              <ObligationRow
                key={e.obligation.id}
                item={e}
                onComplete={() => ops.completeObligation(e)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Today's duties for this area */}
      {duties.length > 0 && (
        <section className="mb-6 gk-animate-in gk-animate-in-2">
          <p className="gk-section-label mb-2 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />
            Today here
          </p>
          <div className="gk-card divide-y divide-border/60">
            {duties.map(({ duty, done }) => (
              <button
                key={duty.id}
                onClick={() => ops.toggleDuty(duty.id, !done)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                    done
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {done && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className={cn("text-sm", done && "line-through text-muted-foreground")}>
                  {duty.title}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Tools */}
      <section className="mb-6 gk-animate-in gk-animate-in-3">
        <p className="gk-section-label mb-2">Tools</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 active:scale-95 active:bg-muted/40 transition-all"
            >
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium text-foreground text-center leading-tight">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Everything scheduled here, quiet */}
      {rest.length > 0 && (
        <section className="gk-animate-in gk-animate-in-4">
          <p className="gk-section-label mb-2">Scheduled</p>
          <div className="space-y-2">
            {rest.map((e) => (
              <ObligationRow
                key={e.obligation.id}
                item={e}
                onComplete={() => ops.completeObligation(e)}
                onUndo={ops.canUndoObligations ? async () => {
                  const reason = window.prompt("Why is this completion being corrected?")?.trim();
                  if (!reason) return;
                  await ops.uncompleteObligation(e.obligation.id, e.period, reason);
                } : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {ops.error && (
        <p className="mt-4 text-sm text-destructive flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" />
          {ops.error}
        </p>
      )}
    </div>
  );
}
