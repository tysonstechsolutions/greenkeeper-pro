"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  CirclePlay,
  Clock3,
  FileCheck2,
  GitBranch,
  MessageCircleQuestion,
  Paperclip,
  Pause,
  RefreshCcw,
  Send,
  Sparkles,
  ShieldCheck,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  interpretTaskInstruction,
  type InterpretedAction,
} from "@/lib/operational-work/instruction-interpreter";
import type { OperationalStaffDirectoryRow } from "@/lib/operational-work/types";
import type {
  OperationalAssignmentRow,
  OperationalDependencyRow,
  OperationalEvidenceRow,
  OperationalEventRow,
  OperationalLeadershipRow,
  OperationalPostponementRow,
  OperationalWorkItem,
} from "@/lib/operational-work/types";
import { POSTPONEMENT_LABELS } from "@/lib/operational-work/types";
import { SOLO_MODE } from "@/lib/operational-work/solo-mode";
import {
  obligationReportUrl,
  type ObligationDocument,
} from "@/lib/operations/obligation-documents";
import type { WorkActionDialogMode } from "./work-action-dialog";
import { ObligationReportDialog } from "./obligation-report-dialog";

interface Props {
  item: OperationalWorkItem;
  itemById: Map<string, OperationalWorkItem>;
  assignment: OperationalAssignmentRow | null;
  assignmentHistory: OperationalAssignmentRow[];
  postponementHistory: OperationalPostponementRow[];
  leadershipHistory: OperationalLeadershipRow[];
  evidence: OperationalEvidenceRow[];
  events: OperationalEventRow[];
  blockers: OperationalDependencyRow[];
  dependents: OperationalDependencyRow[];
  currentUserId: string | null;
  isManager: boolean;
  busy: boolean;
  staff: OperationalStaffDirectoryRow[];
  today: Date;
  onAction: (mode: WorkActionDialogMode, item: OperationalWorkItem) => void;
  onTransition: (item: OperationalWorkItem, action: string, note?: string) => Promise<void>;
  onAssignment: (assignmentId: string, status: string, note?: string) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onInstruction: (item: OperationalWorkItem, action: InterpretedAction) => Promise<void>;
  reportDocs?: ObligationDocument[];
  onReschedule?: (item: OperationalWorkItem, date: string, note: string) => Promise<void>;
  onReportChange?: () => void;
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
  assignmentHistory,
  postponementHistory,
  leadershipHistory,
  evidence,
  events,
  blockers,
  dependents,
  currentUserId,
  isManager,
  busy,
  staff,
  today,
  onAction,
  onTransition,
  onAssignment,
  onRemoveDependency,
  onInstruction,
  reportDocs = [],
  onReschedule,
  onReportChange,
}: Props) {
  const finished = ["completed", "verified", "cancelled"].includes(item.status);
  const isObligation = item.sourceType === "obligation";
  const canAttachReport = isObligation && !!onReschedule;
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const assignedToMe = item.responsibleEmployee?.id === currentUserId;
  const mayExecute = isManager || assignedToMe;
  const hasActiveDependency = blockers.length > 0;
  const acceptsDelegation = assignment?.status === "awaiting_acceptance" && assignedToMe;
  const canComplete = COMPLETE_SOURCES.has(item.sourceType)
    && mayExecute
    && !finished
    && !hasActiveDependency
    && !item.leadershipState.active
    && item.status !== "needs_verification";
  const auditCount = assignmentHistory.length + postponementHistory.length
    + leadershipHistory.length + evidence.length + events.length;

  const [instructionOpen, setInstructionOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState<InterpretedAction | null>(null);
  const [applying, setApplying] = useState(false);
  const [instructionError, setInstructionError] = useState<string | null>(null);

  function previewInstruction() {
    if (!instruction.trim()) return;
    setInstructionError(null);
    setPending(interpretTaskInstruction(instruction, {
      today,
      dueDate: item.dueDate,
      staff: staff.map((person) => ({ id: person.id, name: person.display_name || person.full_name || "" })),
    }));
  }

  function resetInstruction() {
    setInstructionOpen(false);
    setInstruction("");
    setPending(null);
    setInstructionError(null);
  }

  async function applyInstruction() {
    if (!pending || pending.kind === "unknown") return;
    setApplying(true);
    setInstructionError(null);
    try {
      await onInstruction(item, pending);
      resetInstruction();
    } catch (caught) {
      setInstructionError(caught instanceof Error ? caught.message : "That action could not be completed.");
    } finally {
      setApplying(false);
    }
  }

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
        {item.responsiblePosition && !item.responsibleEmployee && <span>Owner: Unfilled position</span>}
        {item.reviewDate && <span>Review {item.reviewDate}</span>}
      </div>

      {item.waitingReason && (
        <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">
          {POSTPONEMENT_LABELS[item.waitingReason]}
          {item.blockedState.reason ? ` — ${item.blockedState.reason}` : ""}
        </p>
      )}

      {assignment && (assignment.instructions || assignment.expected_evidence || assignment.follow_up_date || assignment.notes) && (
        <div className="mt-2 rounded-lg border border-border/70 p-2 text-xs">
          <p className="font-semibold">Assigned work details</p>
          {assignment.instructions && <p className="mt-1"><span className="text-muted-foreground">Instructions:</span> {assignment.instructions}</p>}
          {assignment.expected_evidence && <p className="mt-1"><span className="text-muted-foreground">Expected evidence:</span> {assignment.expected_evidence}</p>}
          {assignment.follow_up_date && <p className="mt-1"><span className="text-muted-foreground">Follow-up:</span> {assignment.follow_up_date}</p>}
          {assignment.notes && <p className="mt-1"><span className="text-muted-foreground">Notes:</span> {assignment.notes}</p>}
        </div>
      )}

      {isObligation && reportDocs.length > 0 && (
        <div className="mt-2 rounded-lg border border-border/70 p-2 text-xs">
          <p className="font-semibold">Report &amp; how-to</p>
          <div className="mt-1 space-y-2">
            {reportDocs.map((doc) => {
              const url = obligationReportUrl(doc.storage_path);
              return (
                <div key={doc.id} className="space-y-0.5">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {doc.file_name || "Report sample"}
                    </a>
                  ) : (
                    doc.file_name && <span className="font-medium">{doc.file_name}</span>
                  )}
                  {doc.instructions && (
                    <p className="whitespace-pre-wrap"><span className="text-muted-foreground">How to: </span>{doc.instructions}</p>
                  )}
                  {doc.due_date && <p className="text-muted-foreground">Due {doc.due_date}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {auditCount > 0 && (
        <details className="mt-2 rounded-lg border border-border/70 p-2 text-xs">
          <summary className="cursor-pointer font-semibold">Audit history · {auditCount} record{auditCount === 1 ? "" : "s"}</summary>
          <div className="mt-2 space-y-2">
            {assignmentHistory.map((row) => (
              <p key={`assignment-${row.id}`}><span className="font-medium">Delegation · {row.status.replaceAll("_", " ")}</span>{row.position ? ` · ${row.position}` : " · named employee"} · {row.created_at.slice(0, 10)}</p>
            ))}
            {postponementHistory.map((row) => (
              <p key={`postponement-${row.id}`}><span className="font-medium">{POSTPONEMENT_LABELS[row.reason]} · {row.active ? "active" : "ended"}</span> · {row.explanation} · {row.created_at.slice(0, 10)}</p>
            ))}
            {leadershipHistory.map((row) => (
              <p key={`leadership-${row.id}`}><span className="font-medium">Leadership · {row.status.replaceAll("_", " ")}</span> · {row.recipient || row.leadership_group}{row.outcome || row.response ? ` · ${row.outcome || row.response}` : ""} · {row.created_at.slice(0, 10)}</p>
            ))}
            {evidence.map((row) => (
              <p key={`evidence-${row.id}`}><span className="font-medium">Evidence · {row.label}</span> · {row.evidence_type.replaceAll("_", " ")} · {row.reference} · {row.created_at.slice(0, 10)}</p>
            ))}
            {events.map((row) => (
              <p key={`event-${row.id}`}><span className="font-medium">{row.event_type.replaceAll("_", " ")}</span>{row.detail ? ` · ${row.detail}` : ""} · {row.created_at.slice(0, 10)}</p>
            ))}
          </div>
        </details>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Actions for ${item.title}`}>
        <Button asChild size="xs" variant="outline"><Link href={item.destinationRoute}><ArrowUpRight />Open</Link></Button>

        {canAttachReport && <Button size="xs" variant="outline" onClick={() => setReportDialogOpen(true)}><Paperclip />Attach report / set due date</Button>}

        {!SOLO_MODE && acceptsDelegation && <Button size="xs" disabled={busy} onClick={() => onAssignment(assignment.id, "accepted")}><Check />Accept</Button>}
        {!finished && mayExecute && !hasActiveDependency && ["pending", "blocked", "awaiting_acceptance"].includes(item.status) && (
          <Button size="xs" disabled={busy} onClick={() => assignment ? onAssignment(assignment.id, "in_progress") : onTransition(item, "start")}><CirclePlay />Start</Button>
        )}
        {!SOLO_MODE && assignedToMe && assignment && ["accepted", "in_progress"].includes(assignment.status) && <Button size="xs" variant="outline" disabled={busy} onClick={() => onAction("clarification", item)}><MessageCircleQuestion />Needs clarification</Button>}
        {isManager && !finished && <Button size="xs" variant="outline" onClick={() => onAction("delegate", item)}><UserRoundPlus />{SOLO_MODE ? "Assign" : "Delegate"}</Button>}
        {!finished && mayExecute && <Button size="xs" variant="outline" onClick={() => onAction("reschedule", item)}><CalendarClock />Reschedule</Button>}
        {!SOLO_MODE && !finished && mayExecute && <Button size="xs" variant="outline" onClick={() => onAction("postpone", item)}><Pause />Postpone</Button>}
        {!SOLO_MODE && !finished && mayExecute && item.status !== "blocked" && <Button size="xs" variant="outline" onClick={() => onAction("block", item)}><Ban />Mark blocked</Button>}
        {!SOLO_MODE && isManager && !finished && <Button size="xs" variant="outline" onClick={() => onAction("dependency", item)}><GitBranch />Add dependency</Button>}
        {!SOLO_MODE && isManager && !finished && !item.leadershipState.active && <Button size="xs" variant="outline" onClick={() => onAction("leadership", item)}><Send />Send to leadership</Button>}
        {!SOLO_MODE && isManager && item.leadershipState.active && <Button size="xs" variant="outline" onClick={() => onAction("leadership_response", item)}><Send />Record response</Button>}
        {!SOLO_MODE && !finished && mayExecute && <Button size="xs" variant="outline" onClick={() => onAction("evidence", item)}><FileCheck2 />Upload evidence</Button>}
        {!SOLO_MODE && !finished && mayExecute && !hasActiveDependency && !item.leadershipState.active && item.verificationState === "required" && <Button size="xs" variant="outline" disabled={busy} onClick={() => assignment ? onAssignment(assignment.id, "submitted_for_verification") : onTransition(item, "submit_verification")}><ShieldCheck />Submit for verification</Button>}
        {canComplete && <Button size="xs" disabled={busy} onClick={complete}><Check />{!SOLO_MODE && item.verificationState === "required" ? "Complete & submit" : "Complete"}</Button>}
        {!SOLO_MODE && isManager && item.status === "needs_verification" && item.sourceType !== "standard" && <Button size="xs" disabled={busy} onClick={() => onTransition(item, "verify")}><ShieldCheck />Verify</Button>}
        {isManager && <Button size="xs" variant="ghost" onClick={() => onAction("priority", item)}><Clock3 />Priority</Button>}
        {isManager && finished && <Button size="xs" variant="outline" onClick={() => onAction("reopen", item)}><RefreshCcw />Reopen</Button>}
      </div>

      {!finished && (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          {!instructionOpen ? (
            <button
              type="button"
              onClick={() => setInstructionOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" />Tell the assistant what to do
            </button>
          ) : (
            <div className="space-y-2">
              <form
                className="flex items-start gap-2"
                onSubmit={(event) => { event.preventDefault(); previewInstruction(); }}
              >
                <Textarea
                  autoFocus
                  value={instruction}
                  onChange={(event) => { setInstruction(event.target.value); setPending(null); }}
                  placeholder={'e.g. "move this to Wednesday" · "assign to John" · "mark done" · "draft an email to leadership"'}
                  rows={2}
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={resetInstruction}
                  aria-label="Close instruction box"
                  className="mt-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>

              {!pending && (
                <Button size="xs" disabled={!instruction.trim()} onClick={previewInstruction}>
                  <Sparkles />Interpret
                </Button>
              )}

              {pending && pending.kind === "unknown" && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                  <p>{pending.summary} Try a date (“move to Friday”), “mark done”, “assign to …”, or “draft an email”.</p>
                  <Link href="/assistant" className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    Ask the full AI assistant <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {pending && pending.kind !== "unknown" && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                  <p className="font-medium">{pending.summary}</p>
                  {pending.kind === "reschedule" && pending.recurringHint && (
                    <p className="mt-1 text-muted-foreground">{pending.recurringHint}</p>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    <Button size="xs" disabled={applying} onClick={applyInstruction}>
                      <Check />{pending.kind === "email" ? "Draft email" : applying ? "Applying…" : "Apply"}
                    </Button>
                    <Button size="xs" variant="ghost" disabled={applying} onClick={() => setPending(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {instructionError && <p role="alert" className="text-xs text-destructive">{instructionError}</p>}
            </div>
          )}
        </div>
      )}

      {canAttachReport && (
        <ObligationReportDialog
          open={reportDialogOpen}
          obligationTitle={item.title}
          obligationId={item.sourceRecordId}
          onReschedule={(date, note) => onReschedule!(item, date, note)}
          onSaved={() => { onReportChange?.(); }}
          onClose={() => setReportDialogOpen(false)}
        />
      )}
    </article>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground", className)}>{children}</span>;
}
