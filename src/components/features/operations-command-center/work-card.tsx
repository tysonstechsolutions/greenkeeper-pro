"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Ban,
  Check,
  CirclePlay,
  Clock3,
  FileCheck2,
  GitBranch,
  MessageCircleQuestion,
  Pause,
  RefreshCcw,
  Send,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  OperationalAssignmentRow,
  OperationalDependencyRow,
  OperationalWorkItem,
} from "@/lib/operational-work/types";
import type { WorkActionDialogMode } from "./work-action-dialog";

interface Props {
  item: OperationalWorkItem;
  itemById: Map<string, OperationalWorkItem>;
  assignment: OperationalAssignmentRow | null;
  blockers: OperationalDependencyRow[];
  dependents: OperationalDependencyRow[];
  currentUserId: string | null;
  isManager: boolean;
  busy: boolean;
  onAction: (mode: WorkActionDialogMode, item: OperationalWorkItem) => void;
  onTransition: (item: OperationalWorkItem, action: string, note?: string) => Promise<void>;
  onAssignment: (assignmentId: string, status: string, note?: string) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  awaiting_acceptance: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  postponed: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  blocked: "bg-red-500/15 text-red-700 dark:text-red-300",
  waiting_leadership: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  needs_verification: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  verified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const PRIORITY_STYLE = {
  critical: "border-red-500/50 bg-red-500/5",
  high: "border-amber-500/40",
  normal: "border-border",
  low: "border-border/60",
};

const COMPLETE_SOURCES = new Set(["task", "duty", "step", "obligation"]);

export function WorkCard({
  item,
  itemById,
  assignment,
  blockers,
  dependents,
  currentUserId,
  isManager,
  busy,
  onAction,
  onTransition,
  onAssignment,
  onRemoveDependency,
}: Props) {
  const finished = ["completed", "verified", "cancelled"].includes(item.status);
  const assignedToMe = item.responsibleEmployee?.id === currentUserId;
  const mayExecute = isManager || assignedToMe || !item.responsibleEmployee;
  const acceptsDelegation = assignment?.status === "awaiting_acceptance" && assignedToMe;
  const canComplete = COMPLETE_SOURCES.has(item.sourceType) && mayExecute && !finished;

  async function complete() {
    if (assignment) {
      await onAssignment(
        assignment.id,
        assignment.verification_required ? "submitted_for_verification" : "completed",
      );
      return;
    }
    await onTransition(item, "complete");
  }

  return (
    <article
      id={`work-${item.stableId.replaceAll(":", "-")}`}
      data-work-id={item.stableId}
      className={cn(
        "rounded-xl border bg-card p-3 shadow-sm sm:p-4",
        PRIORITY_STYLE[item.priorityBand],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.sourceLabel}</span>
            <Badge className={STATUS_STYLE[item.status] ?? STATUS_STYLE.pending}>{item.status.replaceAll("_", " ")}</Badge>
            <Badge className="bg-background text-foreground ring-1 ring-border">{item.priorityBand} · {item.priorityScore}</Badge>
            {item.delegated && <Badge>Delegated{item.delegationStatus ? ` · ${item.delegationStatus.replaceAll("_", " ")}` : ""}</Badge>}
            {item.blockedState.blocked && <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">Blocked</Badge>}
            {item.leadershipState.active && <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300">Leadership</Badge>}
            {item.leadershipState.followUpDue && <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">Follow-up due</Badge>}
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-snug sm:text-base">{item.title}</h3>
          {item.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{item.description}</p>}
        </div>
        <Link href={item.destinationRoute} className="shrink-0 rounded-lg border border-border p-2 text-primary hover:bg-primary/5" aria-label={`Open ${item.title}`}>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {item.dueDate && <span>Due {item.dueDate}</span>}
        {item.estimatedMinutes !== null && <span>{item.estimatedMinutes} min</span>}
        {item.department && <span>{item.department.replaceAll("_", " ")}</span>}
        {item.responsibleEmployee && <span>Owner: {item.responsibleEmployee.name}</span>}
        {item.responsiblePosition && <span>Position: {item.responsiblePosition.replaceAll("_", " ")}</span>}
        {item.reviewDate && <span>Review {item.reviewDate}</span>}
      </div>

      <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Why this is ranked here</p>
        <p className="mt-0.5 text-xs">{item.priorityExplanation.join(" ")}</p>
      </div>

      {(blockers.length > 0 || dependents.length > 0) && (
        <div className="mt-2 space-y-1 rounded-lg border border-border/70 p-2 text-xs">
          {blockers.map((dependency) => {
            const blocker = itemById.get(dependency.blocker_work_key);
            return (
              <div key={dependency.id} className="flex items-center justify-between gap-2">
                <span>Blocked by {blocker ? <Link href={blocker.destinationRoute} className="font-medium text-primary hover:underline">{blocker.title}</Link> : dependency.blocker_work_key}</span>
                {isManager && <button className="text-destructive hover:underline" disabled={busy} onClick={() => onRemoveDependency(dependency.id)}>Remove</button>}
              </div>
            );
          })}
          {dependents.map((dependency) => {
            const dependent = itemById.get(dependency.dependent_work_key);
            return <p key={dependency.id}>Blocks {dependent ? <Link href={dependent.destinationRoute} className="font-medium text-primary hover:underline">{dependent.title}</Link> : dependency.dependent_work_key}</p>;
          })}
        </div>
      )}

      {item.activitySummary && <p className="mt-2 text-xs text-muted-foreground">Latest activity: {item.activitySummary}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Actions for ${item.title}`}>
        <Button asChild size="xs" variant="outline"><Link href={item.destinationRoute}><ArrowUpRight />Open</Link></Button>

        {acceptsDelegation && <Button size="xs" disabled={busy} onClick={() => onAssignment(assignment.id, "accepted")}><Check />Accept</Button>}
        {!finished && mayExecute && ["pending", "blocked", "awaiting_acceptance"].includes(item.status) && (
          <Button size="xs" disabled={busy} onClick={() => assignment ? onAssignment(assignment.id, "in_progress") : onTransition(item, "start")}><CirclePlay />Start</Button>
        )}
        {assignedToMe && assignment && ["accepted", "in_progress"].includes(assignment.status) && <Button size="xs" variant="outline" disabled={busy} onClick={() => onAction("clarification", item)}><MessageCircleQuestion />Needs clarification</Button>}
        {isManager && !finished && <Button size="xs" variant="outline" onClick={() => onAction("delegate", item)}><UserRoundPlus />Delegate</Button>}
        {!finished && mayExecute && <Button size="xs" variant="outline" onClick={() => onAction("postpone", item)}><Pause />Postpone</Button>}
        {!finished && mayExecute && item.status !== "blocked" && <Button size="xs" variant="outline" onClick={() => onAction("block", item)}><Ban />Mark blocked</Button>}
        {isManager && !finished && <Button size="xs" variant="outline" onClick={() => onAction("dependency", item)}><GitBranch />Add dependency</Button>}
        {isManager && !finished && !item.leadershipState.active && <Button size="xs" variant="outline" onClick={() => onAction("leadership", item)}><Send />Send to leadership</Button>}
        {isManager && item.leadershipState.active && <Button size="xs" variant="outline" onClick={() => onAction("leadership_response", item)}><Send />Record response</Button>}
        {!finished && mayExecute && <Button size="xs" variant="outline" onClick={() => onAction("evidence", item)}><FileCheck2 />Upload evidence</Button>}
        {!finished && mayExecute && item.verificationState === "required" && <Button size="xs" variant="outline" disabled={busy} onClick={() => assignment ? onAssignment(assignment.id, "submitted_for_verification") : onTransition(item, "submit_verification")}><ShieldCheck />Submit for verification</Button>}
        {canComplete && <Button size="xs" disabled={busy} onClick={complete}><Check />{item.verificationState === "required" ? "Complete & submit" : "Complete"}</Button>}
        {isManager && item.status === "needs_verification" && item.sourceType !== "standard" && <Button size="xs" disabled={busy} onClick={() => onTransition(item, "verify")}><ShieldCheck />Verify</Button>}
        {isManager && <Button size="xs" variant="ghost" onClick={() => onAction("priority", item)}><Clock3 />Priority</Button>}
        {isManager && finished && <Button size="xs" variant="outline" onClick={() => onAction("reopen", item)}><RefreshCcw />Reopen</Button>}
      </div>
    </article>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground", className)}>{children}</span>;
}
