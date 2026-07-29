"use client";

import Link from "next/link";
import { Check, CircleAlert, ExternalLink, Play, ShieldCheck, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  DUTY_DEPARTMENT_LABELS,
  DUTY_ROLE_GROUP_LABELS,
  DUTY_ROLE_GROUP_ORDER,
  dutyScheduleLabel,
  normalizeDutyRoleGroup,
} from "@/lib/operations/duties";
import type { DutyRoleGroup, DutyTodayItem, RequirementState } from "@/lib/operations/types";

function legacyRoleGroup(item: DutyTodayItem): DutyRoleGroup {
  const recorded = normalizeDutyRoleGroup(
    item.occurrence?.duty_role_group ?? item.duty.role_group,
  );
  if (recorded) return recorded;
  if (item.duty.area === "course") return "maintenance_staff";
  if (item.duty.area === "restaurant") return "restaurant_staff";
  // Pro-shop work is the golf ops assistant's — the two roles were merged.
  if (item.duty.area === "pro_shop") return "golf_operations_assistant";
  return "unassigned";
}

function displayGroup(item: DutyTodayItem): DutyRoleGroup {
  if (item.occurrence?.duty_owner_type === "contractor" || item.contractorName) return "contractor";
  if (!item.primaryName) return "unassigned";
  return legacyRoleGroup(item);
}

function requirementLabel(state: RequirementState | null | undefined, details: string[]): string {
  if (state === "not_required") return "Explicitly not required";
  if (state === "required") return details.length ? `Required: ${details.join(", ")}` : "Required - details missing";
  return "Not recorded";
}

export function DutyRhythm({
  items,
  onTransition,
}: {
  items: DutyTodayItem[];
  onTransition: (
    dutyId: string,
    status: "in_progress" | "completed" | "blocked" | "verified",
    blockedReason?: string,
  ) => Promise<boolean> | boolean;
}) {
  const { isManager } = useAuth();
  const grouped = new Map<DutyRoleGroup, DutyTodayItem[]>();
  for (const item of items) {
    const group = displayGroup(item);
    grouped.set(group, [...(grouped.get(group) ?? []), item]);
  }

  if (items.length === 0) {
    return (
      <section className="mb-6" aria-labelledby="duty-rhythm-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p id="duty-rhythm-heading" className="gk-section-label">The day&apos;s delegated rhythm</p>
          {isManager && <Link href="/operations/duties" className="text-xs font-medium text-primary">Manage duties</Link>}
        </div>
        <div className="gk-card p-4 text-sm text-muted-foreground">No duty occurrences are scheduled for today.</div>
      </section>
    );
  }

  return (
    <section className="mb-6 gk-animate-in gk-animate-in-3" aria-labelledby="duty-rhythm-heading">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p id="duty-rhythm-heading" className="gk-section-label">The day&apos;s delegated rhythm</p>
        {isManager && <Link href="/operations/duties" className="inline-flex items-center gap-1 text-xs font-medium text-primary"><UserRoundCog className="h-3.5 w-3.5" />Manage duties</Link>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DUTY_ROLE_GROUP_ORDER.map((group) => {
          const duties = grouped.get(group);
          if (!duties?.length) return null;
          const doneCount = duties.filter((item) => item.done).length;
          return (
            <div key={group} className="gk-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2.5">
                <span className="text-xs font-semibold">{DUTY_ROLE_GROUP_LABELS[group]}</span>
                <span className="text-[11px] text-muted-foreground">{doneCount}/{duties.length}</span>
              </div>
              <div className="divide-y divide-border/50">
                {duties.map((item) => {
                  const occurrence = item.occurrence;
                  const owner = occurrence?.duty_contractor_name ?? occurrence?.duty_primary_name ?? item.contractorName ?? item.primaryName ?? "Unassigned";
                  const originalDate = occurrence?.original_due_date;
                  const currentDate = occurrence?.due_date;
                  const status = occurrence?.status ?? "pending";
                  const evidence = occurrence?.duty_evidence_requirements ?? item.duty.evidence_requirements ?? [];
                  const evidenceState = occurrence?.duty_evidence_requirement_state ?? item.duty.evidence_requirement_state;
                  const verificationState = occurrence?.duty_verification_requirement_state ?? item.duty.verification_requirement_state;
                  const equipmentState = occurrence?.duty_equipment_requirement_state ?? item.duty.equipment_requirement_state;
                  const equipment = occurrence?.equipment_needed ?? item.duty.equipment_needed ?? [];
                  const canExecute = !!occurrence && !["completed", "verified", "cancelled"].includes(status);
                  const canComplete = canExecute && (
                    evidenceState !== "required" || occurrence?.duty_evidence_satisfied === true
                  );
                  return (
                    <article key={occurrence?.id ?? item.duty.id} className="space-y-3 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div><h3 className="text-sm font-semibold leading-snug">{item.duty.title}</h3><p className={owner === "Unassigned" ? "text-xs font-medium text-warning-foreground" : "text-xs text-muted-foreground"}>{occurrence?.duty_owner_type === "contractor" ? `Contractor: ${owner}` : owner}</p></div>
                        <Badge variant="outline">{status.replace("_", " ")}</Badge>
                      </div>
                      <dl className="space-y-1 text-xs text-muted-foreground">
                        <div><dt className="inline font-medium text-foreground">Backup: </dt><dd className="inline">{occurrence?.duty_backup_name ?? item.backupName ?? "Not recorded"}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Department: </dt><dd className="inline">{occurrence?.duty_department ? DUTY_DEPARTMENT_LABELS[occurrence.duty_department] : item.duty.department ? DUTY_DEPARTMENT_LABELS[item.duty.department] : "Not recorded"}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Role group: </dt><dd className="inline">{DUTY_ROLE_GROUP_LABELS[legacyRoleGroup(item)]}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Schedule: </dt><dd className="inline">{dutyScheduleLabel({ ...item.duty, recurrence_rule: occurrence?.duty_recurrence_rule ?? item.duty.recurrence_rule })}</dd></div>
                        {originalDate && currentDate && <div><dt className="inline font-medium text-foreground">Date: </dt><dd className="inline">{originalDate === currentDate ? currentDate : `${currentDate} (moved from ${originalDate})`}</dd></div>}
                        <div><dt className="inline font-medium text-foreground">Duration: </dt><dd className="inline">{occurrence?.estimated_minutes == null ? "Not recorded" : `${occurrence.estimated_minutes} minutes`}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Instructions: </dt><dd className="inline">{occurrence?.duty_instructions || item.duty.instructions || "Not recorded"}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Equipment: </dt><dd className="inline">{requirementLabel(equipmentState, equipment)}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Evidence: </dt><dd className="inline">{requirementLabel(evidenceState, evidence.map((entry) => entry.label))}{evidenceState === "required" ? occurrence?.duty_evidence_satisfied === true ? " · satisfied" : " · missing" : ""}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Verification: </dt><dd className="inline">{requirementLabel(verificationState, [])}</dd></div>
                      </dl>
                      {status === "blocked" && occurrence?.blocked_reason && <p className="flex items-start gap-1 text-xs text-destructive"><CircleAlert className="mt-0.5 h-3.5 w-3.5" />{occurrence.blocked_reason}</p>}
                      <div className="flex flex-wrap gap-2">
                        {occurrence && <Button asChild variant="outline" size="sm"><Link href={`/tasks/view?id=${occurrence.id}`}><ExternalLink className="h-3.5 w-3.5" />Open</Link></Button>}
                        <Button asChild variant="ghost" size="sm"><Link href={`/operations/duties?duty=${item.duty.id}`}>Duty</Link></Button>
                        {canExecute && status !== "in_progress" && <Button size="sm" variant="outline" onClick={() => void onTransition(item.duty.id, "in_progress")}><Play className="h-3.5 w-3.5" />Start</Button>}
                        {canComplete && <Button size="sm" onClick={() => void onTransition(item.duty.id, "completed")}><Check className="h-3.5 w-3.5" />Complete</Button>}
                        {canExecute && !canComplete && <Button size="sm" disabled title="Record required evidence in the task before completing">Evidence missing</Button>}
                        {canExecute && <Button size="sm" variant="outline" onClick={() => { const reason = window.prompt(`Why is ${item.duty.title} blocked?`); if (reason?.trim()) void onTransition(item.duty.id, "blocked", reason); }}>Block</Button>}
                        {isManager && status === "completed" && verificationState === "required" && <Button size="sm" onClick={() => void onTransition(item.duty.id, "verified")}><ShieldCheck className="h-3.5 w-3.5" />Review</Button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
