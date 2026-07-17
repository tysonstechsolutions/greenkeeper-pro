"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  DelegateWorkInput,
  LeadershipWorkInput,
  PostponeWorkInput,
  PriorityOverrideInput,
} from "@/lib/operational-work/use-operational-work";
import {
  POSTPONEMENT_LABELS,
  type OperationalLeadershipRow,
  type OperationalPostponementReason,
  type OperationalStaffDirectoryRow,
  type OperationalWorkItem,
} from "@/lib/operational-work/types";

export type WorkActionDialogMode =
  | "delegate"
  | "postpone"
  | "dependency"
  | "leadership"
  | "leadership_response"
  | "clarification"
  | "block"
  | "evidence"
  | "priority"
  | "reopen";

interface Props {
  mode: WorkActionDialogMode | null;
  item: OperationalWorkItem | null;
  items: OperationalWorkItem[];
  staff: OperationalStaffDirectoryRow[];
  leadership: OperationalLeadershipRow | null;
  onClose: () => void;
  onDelegate: (workKey: string, input: DelegateWorkInput) => Promise<void>;
  onPostpone: (workKey: string, input: PostponeWorkInput) => Promise<void>;
  onDependency: (dependentKey: string, blockerKey: string) => Promise<void>;
  onLeadership: (workKey: string, input: LeadershipWorkInput) => Promise<void>;
  onLeadershipResponse: (
    handoffId: string,
    status: string,
    response: string,
    outcome: string,
    nextAction: string,
  ) => Promise<void>;
  onClarification: (workKey: string, note: string) => Promise<void>;
  onBlock: (workKey: string, note: string) => Promise<void>;
  onEvidence: (workKey: string, type: string, label: string, reference: string) => Promise<void>;
  onPriority: (workKey: string, input: PriorityOverrideInput) => Promise<void>;
  onReopen: (workKey: string, reason: string) => Promise<void>;
}

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const TITLES: Record<WorkActionDialogMode, string> = {
  delegate: "Delegate work",
  postpone: "Postpone with accountability",
  dependency: "Add a blocking dependency",
  leadership: "Send to leadership",
  leadership_response: "Record leadership response",
  clarification: "Request clarification",
  block: "Mark work blocked",
  evidence: "Attach evidence",
  priority: "Manager priority override",
  reopen: "Reopen completed work",
};

export function WorkActionDialog(props: Props) {
  const { mode, item } = props;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"employee" | "position">("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [position, setPosition] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState(addDays(7));
  const [expectedEvidence, setExpectedEvidence] = useState("");
  const [followUpDate, setFollowUpDate] = useState(addDays(3));
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [notes, setNotes] = useState("");
  const [postponeReason, setPostponeReason] = useState<OperationalPostponementReason>("other");
  const [explanation, setExplanation] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const [reviewDate, setReviewDate] = useState(addDays(3));
  const [blockerKey, setBlockerKey] = useState("");
  const [recipient, setRecipient] = useState("");
  const [leadershipGroup, setLeadershipGroup] = useState("");
  const [dateSent, setDateSent] = useState(addDays(0));
  const [request, setRequest] = useState("");
  const [relatedReference, setRelatedReference] = useState("");
  const [responseStatus, setResponseStatus] = useState("returned_to_local_management");
  const [response, setResponse] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextAction, setNextAction] = useState("reactivate");
  const [evidenceType, setEvidenceType] = useState("external_reference");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [priorityOverride, setPriorityOverride] = useState("200");
  const [safety, setSafety] = useState(false);
  const [compliance, setCompliance] = useState(false);
  const [payroll, setPayroll] = useState(false);
  const [financial, setFinancial] = useState(false);

  useEffect(() => {
    if (!mode || !item) return;
    setError(null);
    setSaving(false);
    setTargetType("employee");
    setEmployeeId("");
    setPosition("");
    setInstructions("");
    setDueDate(item.dueDate || addDays(7));
    setExpectedEvidence("");
    setFollowUpDate(addDays(3));
    setVerificationRequired(item.verificationState !== "not_required");
    setNotes("");
    setPostponeReason("other");
    setExplanation("");
    setResumeDate("");
    setReviewDate(addDays(3));
    setBlockerKey("");
    setRecipient("");
    setLeadershipGroup("");
    setDateSent(addDays(0));
    setRequest("");
    setRelatedReference("");
    setResponseStatus("returned_to_local_management");
    setResponse("");
    setOutcome("");
    setNextAction("reactivate");
    setEvidenceType("external_reference");
    setEvidenceLabel("");
    setEvidenceReference("");
    setPriorityOverride("200");
    setSafety(item.safetyFlag);
    setCompliance(item.complianceFlag);
    setPayroll(item.payrollDeadlineFlag);
    setFinancial(item.financialDeadlineFlag);
  }, [mode, item]);

  async function submit() {
    if (!mode || !item) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "delegate") {
        if ((targetType === "employee" && !employeeId) || (targetType === "position" && !position.trim())) {
          throw new Error("Choose an active employee or enter a position.");
        }
        if (!dueDate) throw new Error("A due date is required.");
        await props.onDelegate(item.stableId, {
          employeeId: targetType === "employee" ? employeeId : null,
          position: targetType === "position" ? position.trim() : null,
          instructions,
          dueDate,
          expectedEvidence,
          followUpDate: followUpDate || null,
          verificationRequired,
          notes,
        });
      } else if (mode === "postpone") {
        if (!explanation.trim()) throw new Error("Explain why the work is being postponed.");
        if (!resumeDate && !reviewDate) throw new Error("Set a resume date or review date.");
        if (postponeReason === "waiting_on_another_task" && !blockerKey) {
          throw new Error("Choose the task this item is waiting on.");
        }
        await props.onPostpone(item.stableId, {
          reason: postponeReason,
          explanation,
          resumeDate: resumeDate || null,
          reviewDate: reviewDate || null,
          blockingWorkKey: postponeReason === "waiting_on_another_task" ? blockerKey : null,
        });
      } else if (mode === "dependency") {
        if (!blockerKey) throw new Error("Choose a blocker.");
        await props.onDependency(item.stableId, blockerKey);
      } else if (mode === "leadership") {
        if (!recipient.trim() && !leadershipGroup.trim()) throw new Error("Enter a recipient or leadership group.");
        if (!explanation.trim() || !request.trim()) throw new Error("A reason and requested decision are required.");
        if (!dateSent) throw new Error("A sent date is required.");
        if (!followUpDate) throw new Error("A follow-up date is required.");
        await props.onLeadership(item.stableId, {
          recipient,
          leadershipGroup,
          reason: explanation,
          request,
          dateSent,
          requestedResponseDate: dueDate || null,
          followUpDate,
          relatedReference,
        });
      } else if (mode === "leadership_response") {
        if (!props.leadership) throw new Error("No active leadership handoff was found.");
        if (!response.trim() && !outcome.trim()) throw new Error("Record the response or outcome.");
        await props.onLeadershipResponse(
          props.leadership.id,
          responseStatus,
          response,
          outcome,
          nextAction,
        );
      } else if (mode === "clarification") {
        if (!explanation.trim()) throw new Error("Explain what needs clarification.");
        await props.onClarification(item.stableId, explanation);
      } else if (mode === "block") {
        if (!explanation.trim()) throw new Error("A blocked reason is required.");
        await props.onBlock(item.stableId, explanation);
      } else if (mode === "evidence") {
        if (!evidenceLabel.trim() || !evidenceReference.trim()) {
          throw new Error("An evidence label and reference are required.");
        }
        await props.onEvidence(item.stableId, evidenceType, evidenceLabel, evidenceReference);
      } else if (mode === "priority") {
        if (!explanation.trim()) throw new Error("Explain the manager override.");
        await props.onPriority(item.stableId, {
          override: Number(priorityOverride),
          safety,
          compliance,
          payroll,
          financial,
          reason: explanation,
        });
      } else if (mode === "reopen") {
        if (!explanation.trim()) throw new Error("A reopen reason is required.");
        await props.onReopen(item.stableId, explanation);
      }
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!mode && !!item} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode ? TITLES[mode] : "Work action"}</DialogTitle>
          <DialogDescription>{item?.title}</DialogDescription>
        </DialogHeader>

        {mode === "delegate" && (
          <div className="space-y-3">
            <Field label="Delegate to">
              <select value={targetType} onChange={(event) => setTargetType(event.target.value as "employee" | "position")} className={INPUT_CLASS}>
                <option value="employee">Named active employee</option>
                <option value="position">Position</option>
              </select>
            </Field>
            {targetType === "employee" ? (
              <Field label="Employee">
                <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={INPUT_CLASS}>
                  <option value="">Choose employee</option>
                  {props.staff.map((person) => (
                    <option key={person.id} value={person.id}>{person.display_name || person.full_name} · {person.role || "staff"}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Position"><Input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="e.g. mechanic" /></Field>
            )}
            <Field label="Instructions"><Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Due date"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
              <Field label="Follow-up date"><Input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /></Field>
            </div>
            <Field label="Expected evidence"><Input value={expectedEvidence} onChange={(event) => setExpectedEvidence(event.target.value)} placeholder="Photo, document, record…" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verificationRequired} onChange={(event) => setVerificationRequired(event.target.checked)} /> Manager verification required</label>
            <Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          </div>
        )}

        {mode === "postpone" && (
          <div className="space-y-3">
            <Field label="Reason">
              <select value={postponeReason} onChange={(event) => setPostponeReason(event.target.value as OperationalPostponementReason)} className={INPUT_CLASS}>
                {Object.entries(POSTPONEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Explanation"><Textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Resume date"><Input type="date" value={resumeDate} onChange={(event) => setResumeDate(event.target.value)} /></Field>
              <Field label="Review date"><Input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /></Field>
            </div>
            {postponeReason === "waiting_on_another_task" && <BlockerPicker item={item} items={props.items} value={blockerKey} onChange={setBlockerKey} />}
          </div>
        )}

        {mode === "dependency" && <BlockerPicker item={item} items={props.items} value={blockerKey} onChange={setBlockerKey} />}

        {mode === "leadership" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Recipient"><Input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></Field>
              <Field label="Leadership group"><Input value={leadershipGroup} onChange={(event) => setLeadershipGroup(event.target.value)} /></Field>
            </div>
            <Field label="Reason"><Textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></Field>
            <Field label="Request or decision needed"><Textarea value={request} onChange={(event) => setRequest(event.target.value)} /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Sent date"><Input type="date" value={dateSent} onChange={(event) => setDateSent(event.target.value)} /></Field>
              <Field label="Requested response"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
              <Field label="Follow-up date"><Input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /></Field>
            </div>
            <Field label="Related document or communication"><Input value={relatedReference} onChange={(event) => setRelatedReference(event.target.value)} placeholder="URL, document path, or email reference" /></Field>
          </div>
        )}

        {mode === "leadership_response" && (
          <div className="space-y-3">
            <Field label="Leadership status"><select value={responseStatus} onChange={(event) => setResponseStatus(event.target.value)} className={INPUT_CLASS}>
              <option value="awaiting_response">Awaiting response</option>
              <option value="additional_information_requested">Additional information requested</option>
              <option value="approved">Approved</option><option value="denied">Denied</option>
              <option value="deferred">Deferred</option><option value="leadership_completing_action">Leadership completing action</option>
              <option value="returned_to_local_management">Returned to local management</option>
              <option value="completed">Completed</option><option value="closed_without_action">Closed without action</option>
            </select></Field>
            <Field label="Response"><Textarea value={response} onChange={(event) => setResponse(event.target.value)} /></Field>
            <Field label="Outcome"><Textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} /></Field>
            <Field label="Originating item should"><select value={nextAction} onChange={(event) => setNextAction(event.target.value)} className={INPUT_CLASS}>
              <option value="reactivate">Reactivate</option><option value="verification">Advance to verification</option>
              <option value="next_action">Advance to next action</option><option value="complete">Complete — leadership fully satisfied it</option>
            </select></Field>
          </div>
        )}

        {(mode === "block" || mode === "reopen" || mode === "clarification") && <Field label={mode === "block" ? "Blocked reason" : mode === "reopen" ? "Reopen reason" : "Clarification needed"}><Textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></Field>}

        {mode === "evidence" && (
          <div className="space-y-3">
            <Field label="Evidence type"><select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} className={INPUT_CLASS}>
              <option value="external_reference">External reference</option><option value="document">Document</option>
              <option value="photo">Photo</option><option value="record">Record</option><option value="note">Note</option>
            </select></Field>
            <Field label="Label"><Input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} /></Field>
            <Field label="Reference or uploaded-file URL"><Input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /></Field>
          </div>
        )}

        {mode === "priority" && (
          <div className="space-y-3">
            <Field label="Priority adjustment"><select value={priorityOverride} onChange={(event) => setPriorityOverride(event.target.value)} className={INPUT_CLASS}>
              <option value="-200">Lower substantially</option><option value="0">No score adjustment</option>
              <option value="200">Raise</option><option value="400">Make urgent</option>
            </select></Field>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label><input type="checkbox" checked={safety} onChange={(event) => setSafety(event.target.checked)} /> Safety</label>
              <label><input type="checkbox" checked={compliance} onChange={(event) => setCompliance(event.target.checked)} /> Compliance</label>
              <label><input type="checkbox" checked={payroll} onChange={(event) => setPayroll(event.target.checked)} /> Payroll deadline</label>
              <label><input type="checkbox" checked={financial} onChange={(event) => setFinancial(event.target.checked)} /> Financial deadline</label>
            </div>
            <Field label="Reason"><Textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></Field>
          </div>
        )}

        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save action"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function BlockerPicker({
  item,
  items,
  value,
  onChange,
}: {
  item: OperationalWorkItem | null;
  items: OperationalWorkItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Blocking work item">
      <select value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}>
        <option value="">Choose blocker</option>
        {items.filter((candidate) => candidate.stableId !== item?.stableId && !["completed", "verified", "cancelled"].includes(candidate.status)).map((candidate) => (
          <option key={candidate.stableId} value={candidate.stableId}>{candidate.title} · {candidate.sourceLabel}</option>
        ))}
      </select>
    </Field>
  );
}
