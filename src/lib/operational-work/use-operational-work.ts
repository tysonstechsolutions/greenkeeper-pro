"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import type { CalendarEvent } from "@/lib/calendar/types";
import { evaluateObligations, ymdLocal } from "@/lib/operations/engine";
import type { Obligation, ObligationCompletion } from "@/lib/operations/types";
import type { DailyGoal, DailyStep } from "@/lib/my-day/types";
import { currentStatusOf } from "@/lib/standards/scoring";
import type {
  CorrectiveAction,
  ProgramStandard,
  StandardEvaluation,
  StandardWithStatus,
} from "@/lib/standards/types";
import { directRpc, directSelectAll } from "@/lib/supabase/rest";
import type { Equipment, PurchaseRequest, Task } from "@/types/database";
import { aggregateOperationalWork } from "./adapters";
import type {
  OperationalAssignmentRow,
  OperationalDependencyRow,
  OperationalEvidenceRow,
  OperationalEventRow,
  OperationalLeadershipRow,
  OperationalPostponementReason,
  OperationalPostponementRow,
  OperationalStaffDirectoryRow,
  OperationalWorkItem,
  OperationalWorkStateRow,
} from "./types";

export interface DelegateWorkInput {
  employeeId: string | null;
  position: string | null;
  instructions: string;
  dueDate: string;
  expectedEvidence: string;
  followUpDate: string | null;
  verificationRequired: boolean;
  notes: string;
}

export interface PostponeWorkInput {
  reason: OperationalPostponementReason;
  explanation: string;
  resumeDate: string | null;
  reviewDate: string | null;
  blockingWorkKey: string | null;
}

export interface LeadershipWorkInput {
  recipient: string;
  leadershipGroup: string;
  reason: string;
  request: string;
  dateSent: string;
  requestedResponseDate: string | null;
  followUpDate: string;
  relatedReference: string;
}

export interface PriorityOverrideInput {
  override: number | null;
  safety: boolean;
  compliance: boolean;
  payroll: boolean;
  financial: boolean;
  reason: string;
}

interface UseOperationalWork {
  items: OperationalWorkItem[];
  staff: OperationalStaffDirectoryRow[];
  assignments: OperationalAssignmentRow[];
  postponements: OperationalPostponementRow[];
  dependencies: OperationalDependencyRow[];
  leadership: OperationalLeadershipRow[];
  evidence: OperationalEvidenceRow[];
  events: OperationalEventRow[];
  loading: boolean;
  error: string | null;
  today: string;
  reload: () => void;
  delegate: (workKey: string, input: DelegateWorkInput) => Promise<void>;
  transitionAssignment: (assignmentId: string, status: string, note?: string) => Promise<void>;
  postpone: (workKey: string, input: PostponeWorkInput) => Promise<void>;
  reschedule: (workKey: string, date: string, note: string) => Promise<void>;
  addDependency: (dependentWorkKey: string, blockerWorkKey: string) => Promise<void>;
  removeDependency: (dependencyId: string, reason: string) => Promise<void>;
  sendToLeadership: (workKey: string, input: LeadershipWorkInput) => Promise<void>;
  resolveLeadership: (
    handoffId: string,
    status: string,
    response: string,
    outcome: string,
    nextAction: string,
  ) => Promise<void>;
  transition: (workKey: string, action: string, note?: string) => Promise<void>;
  reopen: (workKey: string, reason: string) => Promise<void>;
  addEvidence: (workKey: string, type: string, label: string, reference: string) => Promise<void>;
  setPriority: (workKey: string, input: PriorityOverrideInput) => Promise<void>;
}

function daysAgoYmd(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return ymdLocal(date);
}

export function useOperationalWork(): UseOperationalWork {
  const { session, user, isManager } = useAuth();
  const ready = !!session?.access_token;
  const [items, setItems] = useState<OperationalWorkItem[]>([]);
  const [staff, setStaff] = useState<OperationalStaffDirectoryRow[]>([]);
  const [assignments, setAssignments] = useState<OperationalAssignmentRow[]>([]);
  const [postponements, setPostponements] = useState<OperationalPostponementRow[]>([]);
  const [dependencies, setDependencies] = useState<OperationalDependencyRow[]>([]);
  const [leadership, setLeadership] = useState<OperationalLeadershipRow[]>([]);
  const [evidence, setEvidence] = useState<OperationalEvidenceRow[]>([]);
  const [events, setEvents] = useState<OperationalEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [today, setToday] = useState(() => ymdLocal(new Date()));
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = ymdLocal(new Date());
      setToday((prior) => {
        if (prior !== next) setNonce((value) => value + 1);
        return next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          taskRows,
          standardRows,
          evaluationRows,
          correctiveRows,
          obligationRows,
          completionRows,
          goalRows,
          stepRows,
          calendarRows,
          equipmentRows,
          purchaseRows,
          stateRows,
          assignmentRows,
          postponementRows,
          dependencyRows,
          leadershipRows,
          evidenceRows,
          eventRows,
          staffRows,
        ] = await Promise.all([
          directSelectAll<Task>("tasks", {
            columns: "*",
            filters: ["status=not.eq.cancelled"],
            orderBy: [{ column: "due_date" }, { column: "id" }],
            label: "operational-work.tasks",
          }),
          directSelectAll<ProgramStandard>("program_standards", {
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "code" }, { column: "id" }],
            label: "operational-work.standards",
          }),
          directSelectAll<StandardEvaluation>("standard_evaluations", {
            orderBy: [{ column: "evaluated_at", ascending: false }, { column: "id" }],
            label: "operational-work.standard-evaluations",
          }),
          directSelectAll<CorrectiveAction>("standard_corrective_actions", {
            filters: ["status=in.(proposed,active,awaiting_verification)"],
            orderBy: [{ column: "created_at", ascending: false }, { column: "id" }],
            label: "operational-work.corrective-actions",
          }),
          directSelectAll<Obligation>("obligations", {
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "sort_order" }, { column: "id" }],
            label: "operational-work.obligations",
          }),
          directSelectAll<ObligationCompletion>("obligation_completions", {
            orderBy: [{ column: "completed_at", ascending: false }, { column: "id" }],
            label: "operational-work.obligation-completions",
          }),
          directSelectAll<DailyGoal>("daily_goals", {
            orderBy: [{ column: "deadline" }, { column: "id" }],
            label: "operational-work.goals",
          }),
          directSelectAll<DailyStep>("daily_steps", {
            orderBy: [{ column: "target_date" }, { column: "id" }],
            label: "operational-work.steps",
          }),
          directSelectAll<CalendarEvent>("calendar_events", {
            filters: [`event_date=gte.${daysAgoYmd(14)}`],
            orderBy: [{ column: "event_date" }, { column: "id" }],
            label: "operational-work.calendar",
          }),
          directSelectAll<Equipment>("equipment", {
            filters: ["status=in.(needs_service,in_repair,out_of_service)"],
            orderBy: [{ column: "status" }, { column: "id" }],
            label: "operational-work.equipment",
          }),
          directSelectAll<PurchaseRequest>("purchase_requests", {
            filters: ["completed_at=is.null"],
            orderBy: [{ column: "required_delivery_date" }, { column: "id" }],
            label: "operational-work.purchase-requests",
          }),
          directSelectAll<OperationalWorkStateRow>("operational_work_states", {
            orderBy: [{ column: "updated_at", ascending: false }, { column: "work_key" }],
            label: "operational-work.states",
          }),
          directSelectAll<OperationalAssignmentRow>("operational_work_assignments", {
            orderBy: [{ column: "updated_at", ascending: false }, { column: "id" }],
            label: "operational-work.assignments",
          }),
          directSelectAll<OperationalPostponementRow>("operational_work_postponements", {
            orderBy: [{ column: "created_at", ascending: false }, { column: "id" }],
            label: "operational-work.postponements",
          }),
          directSelectAll<OperationalDependencyRow>("operational_work_dependencies", {
            orderBy: [{ column: "created_at", ascending: false }, { column: "id" }],
            label: "operational-work.dependencies",
          }),
          directSelectAll<OperationalLeadershipRow>("operational_work_leadership_handoffs", {
            orderBy: [{ column: "updated_at", ascending: false }, { column: "id" }],
            label: "operational-work.leadership",
          }),
          directSelectAll<OperationalEvidenceRow>("operational_work_evidence", {
            orderBy: [{ column: "created_at", ascending: false }, { column: "id" }],
            label: "operational-work.evidence",
          }),
          directSelectAll<OperationalEventRow>("operational_work_events", {
            orderBy: [{ column: "created_at", ascending: false }, { column: "id" }],
            label: "operational-work.events",
          }),
          directSelectAll<OperationalStaffDirectoryRow>("staff_directory", {
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "full_name" }, { column: "id" }],
            label: "operational-work.staff-directory",
          }),
        ]);
        if (cancelled) return;

        const evaluationsByStandard = new Map<string, StandardEvaluation[]>();
        for (const evaluation of evaluationRows) {
          evaluationsByStandard.set(evaluation.standard_id, [
            ...(evaluationsByStandard.get(evaluation.standard_id) ?? []),
            evaluation,
          ]);
        }
        const correctiveByStandard = new Map<string, CorrectiveAction>();
        for (const action of correctiveRows) {
          if (!correctiveByStandard.has(action.standard_id)) {
            correctiveByStandard.set(action.standard_id, action);
          }
        }
        const standards: StandardWithStatus[] = standardRows.map((standard) => {
          const evaluations = evaluationsByStandard.get(standard.id) ?? [];
          return {
            standard,
            status: currentStatusOf(evaluations),
            evaluatedAt: evaluations[0]?.evaluated_at ?? null,
            detail: evaluations[0]?.detail ?? null,
            openAction: correctiveByStandard.get(standard.id) ?? null,
          };
        });
        const evaluatedObligations = evaluateObligations(
          obligationRows,
          completionRows,
          new Date(),
        );
        const normalized = aggregateOperationalWork({
          tasks: taskRows,
          standards,
          obligations: evaluatedObligations,
          goals: goalRows,
          steps: stepRows,
          calendarEvents: calendarRows,
          equipment: equipmentRows,
          purchaseRequests: purchaseRows,
          states: stateRows,
          assignments: assignmentRows,
          postponements: postponementRows,
          dependencies: dependencyRows,
          leadership: leadershipRows,
          events: eventRows,
          staff: staffRows,
          currentUserId: user?.id ?? null,
          isManager,
          today: new Date(),
        });
        setItems(normalized);
        setStaff(staffRows);
        setAssignments(assignmentRows);
        setPostponements(postponementRows);
        setDependencies(dependencyRows);
        setLeadership(leadershipRows);
        setEvidence(evidenceRows);
        setEvents(eventRows);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Couldn't load operational work.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, nonce, today, user?.id, isManager]);

  const mutate = useCallback(async (
    functionName: string,
    args: Record<string, unknown>,
    label: string,
  ) => {
    await directRpc(functionName, args, label);
    reload();
  }, [reload]);

  return useMemo(() => ({
    items,
    staff,
    assignments,
    postponements,
    dependencies,
    leadership,
    evidence,
    events,
    loading,
    error,
    today,
    reload,
    delegate: (workKey: string, input: DelegateWorkInput) => mutate("delegate_operational_work", {
      p_work_key: workKey,
      p_employee_id: input.employeeId,
      p_position: input.position,
      p_instructions: input.instructions,
      p_due_date: input.dueDate,
      p_expected_evidence: input.expectedEvidence,
      p_follow_up_date: input.followUpDate,
      p_verification_required: input.verificationRequired,
      p_notes: input.notes,
    }, "operational-work.delegate"),
    transitionAssignment: (assignmentId: string, status: string, note = "") => mutate(
      "transition_operational_assignment",
      { p_assignment_id: assignmentId, p_status: status, p_note: note },
      "operational-work.assignment-transition",
    ),
    postpone: (workKey: string, input: PostponeWorkInput) => mutate("postpone_operational_work", {
      p_work_key: workKey,
      p_reason: input.reason,
      p_explanation: input.explanation,
      p_resume_date: input.resumeDate,
      p_review_date: input.reviewDate,
      p_blocking_work_key: input.blockingWorkKey,
    }, "operational-work.postpone"),
    reschedule: (workKey: string, date: string, note: string) => mutate(
      "postpone_operational_work",
      {
        p_work_key: workKey,
        p_reason: "scheduled_operational_window",
        p_explanation: note.trim() || `Rescheduled to ${date}`,
        p_resume_date: date,
        p_review_date: null,
        p_blocking_work_key: null,
      },
      "operational-work.reschedule",
    ),
    addDependency: (dependentWorkKey: string, blockerWorkKey: string) => mutate(
      "add_operational_dependency",
      { p_dependent_work_key: dependentWorkKey, p_blocker_work_key: blockerWorkKey },
      "operational-work.add-dependency",
    ),
    removeDependency: (dependencyId: string, reason: string) => mutate(
      "remove_operational_dependency",
      { p_dependency_id: dependencyId, p_reason: reason },
      "operational-work.remove-dependency",
    ),
    sendToLeadership: (workKey: string, input: LeadershipWorkInput) => mutate(
      "send_operational_work_to_leadership",
      {
        p_work_key: workKey,
        p_recipient: input.recipient,
        p_leadership_group: input.leadershipGroup,
        p_reason: input.reason,
        p_request_or_decision_needed: input.request,
        p_date_sent: input.dateSent,
        p_requested_response_date: input.requestedResponseDate,
        p_follow_up_date: input.followUpDate,
        p_related_reference: input.relatedReference,
      },
      "operational-work.leadership",
    ),
    resolveLeadership: (
      handoffId: string,
      status: string,
      response: string,
      outcome: string,
      nextAction: string,
    ) => mutate("resolve_operational_leadership_handoff", {
      p_handoff_id: handoffId,
      p_status: status,
      p_response: response,
      p_outcome: outcome,
      p_next_action: nextAction,
    }, "operational-work.leadership-response"),
    transition: (workKey: string, action: string, note = "") => mutate(
      "transition_operational_work",
      { p_work_key: workKey, p_action: action, p_note: note },
      "operational-work.transition",
    ),
    reopen: (workKey: string, reason: string) => mutate(
      "reopen_operational_work",
      { p_work_key: workKey, p_reason: reason },
      "operational-work.reopen",
    ),
    addEvidence: (workKey: string, type: string, label: string, reference: string) => mutate(
      "record_operational_work_evidence",
      { p_work_key: workKey, p_evidence_type: type, p_label: label, p_reference: reference },
      "operational-work.evidence",
    ),
    setPriority: (workKey: string, input: PriorityOverrideInput) => mutate(
      "set_operational_work_priority",
      {
        p_work_key: workKey,
        p_override: input.override,
        p_safety_flag: input.safety,
        p_compliance_flag: input.compliance,
        p_payroll_deadline_flag: input.payroll,
        p_financial_deadline_flag: input.financial,
        p_reason: input.reason,
      },
      "operational-work.priority",
    ),
  }), [
    items, staff, assignments, postponements, dependencies, leadership, evidence, events, loading, error,
    today, reload, mutate,
  ]);
}
