import type { CalendarEvent } from "@/lib/calendar/types";
import type { DailyGoal, DailyStep } from "@/lib/my-day/types";
import type { EvaluatedObligation } from "@/lib/operations/types";
import type { StandardWithStatus } from "@/lib/standards/types";
import type { Equipment, PurchaseRequest, Task, TaskPriority } from "@/types/database";
import { operationalWorkDeepLink } from "./deep-links";
import { priorityBandForScore, scoreOperationalPriority } from "./priority";
import type {
  OperationalAssignmentRow,
  OperationalDependencyRow,
  OperationalEventRow,
  OperationalLeadershipRow,
  OperationalPerson,
  OperationalPostponementRow,
  OperationalPriorityBand,
  OperationalStaffDirectoryRow,
  OperationalVerificationState,
  OperationalWorkItem,
  OperationalWorkStateRow,
} from "./types";

type TaskOperationalFields = Task & {
  standard_id?: string | null;
  standard_code?: string | null;
  why_it_matters?: string | null;
  definition_of_done?: string | null;
};

export interface OperationalAggregationInput {
  tasks: TaskOperationalFields[];
  standards: StandardWithStatus[];
  obligations: EvaluatedObligation[];
  goals: DailyGoal[];
  steps: DailyStep[];
  calendarEvents: CalendarEvent[];
  equipment: Equipment[];
  purchaseRequests: PurchaseRequest[];
  states: OperationalWorkStateRow[];
  assignments: OperationalAssignmentRow[];
  postponements: OperationalPostponementRow[];
  dependencies: OperationalDependencyRow[];
  leadership: OperationalLeadershipRow[];
  events: OperationalEventRow[];
  staff: OperationalStaffDirectoryRow[];
  currentUserId: string | null;
  isManager: boolean;
  today: Date;
}

interface OverlayIndexes {
  state: Map<string, OperationalWorkStateRow>;
  assignment: Map<string, OperationalAssignmentRow>;
  postponement: Map<string, OperationalPostponementRow>;
  blockers: Map<string, string[]>;
  dependentCounts: Map<string, number>;
  leadership: Map<string, OperationalLeadershipRow>;
  event: Map<string, OperationalEventRow>;
  staff: Map<string, OperationalStaffDirectoryRow>;
}

function person(
  id: string | null | undefined,
  staff: Map<string, OperationalStaffDirectoryRow>,
): OperationalPerson | null {
  if (!id) return null;
  const row = staff.get(id);
  return {
    id,
    name: row?.display_name || row?.full_name || "Assigned employee",
    role: row?.role ?? null,
  };
}

function taskDepartment(task: TaskOperationalFields): string | null {
  if (task.duty_department) return task.duty_department;
  if (["pro_shop", "events", "customer_service"].includes(task.category)) return "pro_shop";
  if (["admin", "safety", "other"].includes(task.category)) return "administration";
  return "maintenance";
}

function taskStatus(task: TaskOperationalFields): OperationalWorkItem["status"] {
  if (task.status === "deferred") return "postponed";
  return task.status;
}

function taskVerification(task: TaskOperationalFields): OperationalVerificationState {
  if (task.status === "verified") return "verified";
  const required = task.duty_verification_requirement_state === "required";
  if (required && task.status === "completed") return "needs_verification";
  return required ? "required" : "not_required";
}

function priority(value: TaskPriority | null | undefined): OperationalPriorityBand {
  return value ?? "normal";
}

function baseTask(task: TaskOperationalFields): OperationalWorkItem {
  const sourceType = task.duty_id ? "duty" : "task";
  const stableId = `task:${task.id}`;
  return {
    stableId,
    sourceType,
    sourceRecordId: task.id,
    title: task.title,
    description: task.description || task.why_it_matters || null,
    department: taskDepartment(task),
    responsibleEmployee: task.assigned_to
      ? { id: task.assigned_to, name: "Assigned employee", role: null }
      : null,
    responsiblePosition: task.duty_role_group ?? null,
    accountableManager: task.assigned_by
      ? { id: task.assigned_by, name: "Accountable manager", role: null }
      : null,
    status: taskStatus(task),
    dueDate: task.due_date,
    estimatedMinutes: task.estimated_minutes,
    priorityBand: priority(task.priority),
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: {
      blocked: task.status === "blocked",
      blockerKeys: [],
      reason: task.blocked_reason ?? null,
    },
    delegated: false,
    delegationStatus: null,
    leadershipState: {
      active: false,
      status: null,
      followUpDate: null,
      followUpDue: false,
      recipient: null,
    },
    verificationState: taskVerification(task),
    aiCapabilityState: "unknown",
    destinationRoute: operationalWorkDeepLink(sourceType, task.id, stableId),
    sourceLabel: task.duty_id ? "Duty occurrence" : "Task",
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: task.category === "safety",
    complianceFlag: task.category === "chemical" || !!task.standard_id,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: task.standard_id ?? null,
    activitySummary: null,
  };
}

function standardPriority(value: string | null): OperationalPriorityBand {
  if (value === "P1") return "critical";
  if (value === "P2") return "high";
  if (value === "P4") return "low";
  return "normal";
}

function baseStandard(item: StandardWithStatus): OperationalWorkItem {
  const standard = item.standard;
  const stableId = `standard:${standard.id}`;
  let status: OperationalWorkItem["status"] = "pending";
  if (standard.operational_status === "complete" || standard.operational_status === "not_applicable") {
    status = "completed";
  } else if (standard.operational_status === "partially_complete") {
    status = "in_progress";
  } else if (item.status === "blocked") {
    status = "blocked";
  } else if (item.status === "awaiting_verification") {
    status = "needs_verification";
  }
  return {
    stableId,
    sourceType: "standard",
    sourceRecordId: standard.id,
    title: standard.title,
    description: item.detail || standard.expected_condition || standard.standard_text,
    department: "administration",
    responsibleEmployee: standard.owner_profile_id
      ? { id: standard.owner_profile_id, name: "Standard owner", role: standard.owner_role }
      : null,
    responsiblePosition: standard.owner_role,
    accountableManager: null,
    status,
    dueDate: standard.manager_target_date,
    estimatedMinutes: standard.estimated_minutes,
    priorityBand: standardPriority(standard.priority),
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: {
      blocked: status === "blocked",
      blockerKeys: [],
      reason: status === "blocked" ? item.detail : null,
    },
    delegated: !!standard.owner_profile_id,
    delegationStatus: null,
    leadershipState: {
      active: false,
      status: null,
      followUpDate: null,
      followUpDue: false,
      recipient: null,
    },
    verificationState: item.status === "awaiting_verification"
      ? "needs_verification"
      : standard.verification_required ? "required" : "not_required",
    aiCapabilityState: standard.evaluation_method === "rule" ? "available" : "unknown",
    destinationRoute: operationalWorkDeepLink("standard", standard.id, stableId),
    sourceLabel: `Program Standard ${standard.code}`,
    createdAt: standard.created_at,
    updatedAt: standard.updated_at,
    completedAt: status === "completed" ? standard.updated_at : null,
    impactLevel: standard.impact_level,
    managerPriorityOverride: null,
    safetyFlag: /safety/i.test(`${standard.title} ${standard.standard_text}`),
    complianceFlag: ["regulatory_requirement", "contract_requirement"].includes(standard.source_type),
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: standard.id,
    activitySummary: null,
  };
}

function baseObligation(row: EvaluatedObligation): OperationalWorkItem {
  const stableId = `obligation:${row.obligation.id}:${row.period}`;
  const workspaceDepartment: Record<string, string> = {
    course: "maintenance",
    restaurant: "food_and_beverage",
    pro_shop: "pro_shop",
    money: "administration",
    people: "administration",
    general: "administration",
  };
  return {
    stableId,
    sourceType: "obligation",
    sourceRecordId: row.obligation.id,
    title: row.obligation.title,
    description: row.obligation.detail,
    department: workspaceDepartment[row.obligation.workspace] ?? null,
    responsibleEmployee: row.obligation.owner_profile_id
      ? { id: row.obligation.owner_profile_id, name: "Obligation owner", role: null }
      : null,
    responsiblePosition: null,
    accountableManager: null,
    status: row.status === "done" ? "completed" : "pending",
    dueDate: row.dueDate,
    estimatedMinutes: null,
    priorityBand: row.status === "overdue" ? "high" : "normal",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: !!row.obligation.owner_profile_id,
    delegationStatus: null,
    leadershipState: {
      active: false, status: null, followUpDate: null, followUpDue: false, recipient: null,
    },
    verificationState: "not_required",
    aiCapabilityState: "not_available",
    destinationRoute: operationalWorkDeepLink("obligation", row.obligation.id, stableId),
    sourceLabel: `${row.obligation.cadence} obligation`,
    createdAt: row.obligation.created_at,
    updatedAt: row.obligation.updated_at,
    completedAt: row.status === "done" ? row.obligation.updated_at : null,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: /safety/i.test(`${row.obligation.title} ${row.obligation.detail ?? ""}`),
    complianceFlag: /inspect|compliance|certif|report/i.test(row.obligation.title),
    payrollDeadlineFlag: /payroll|timecard/i.test(row.obligation.title),
    financialDeadlineFlag: /budget|invoice|financial|purchase/i.test(row.obligation.title),
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
  };
}

function baseStep(step: DailyStep, goal: DailyGoal | undefined): OperationalWorkItem {
  const stableId = `step:${step.id}`;
  return {
    stableId,
    sourceType: "step",
    sourceRecordId: step.id,
    title: step.title,
    description: goal?.detail ?? null,
    department: "administration",
    responsibleEmployee: step.created_by
      ? { id: step.created_by, name: "My work", role: null }
      : null,
    responsiblePosition: null,
    accountableManager: null,
    status: step.done ? "completed" : "pending",
    dueDate: step.target_date,
    estimatedMinutes: null,
    priorityBand: step.urgent ? "high" : "normal",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: {
      active: false, status: null, followUpDate: null, followUpDue: false, recipient: null,
    },
    verificationState: "not_required",
    aiCapabilityState: step.source === "capability" ? "available" : "unknown",
    destinationRoute: operationalWorkDeepLink("step", step.id, stableId),
    sourceLabel: goal ? `Goal: ${goal.title}` : "My Day step",
    createdAt: step.created_at,
    updatedAt: step.updated_at,
    completedAt: step.done_at,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
  };
}

function baseGoal(goal: DailyGoal): OperationalWorkItem {
  const stableId = `goal:${goal.id}`;
  return {
    stableId,
    sourceType: "goal",
    sourceRecordId: goal.id,
    title: goal.title,
    description: goal.detail,
    department: "administration",
    responsibleEmployee: goal.created_by
      ? { id: goal.created_by, name: "Goal owner", role: null }
      : null,
    responsiblePosition: null,
    accountableManager: null,
    status: goal.status === "done" ? "completed" : goal.status === "archived" ? "cancelled" : "pending",
    dueDate: goal.deadline,
    estimatedMinutes: null,
    priorityBand: "normal",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: {
      active: false, status: null, followUpDate: null, followUpDue: false, recipient: null,
    },
    verificationState: "not_required",
    aiCapabilityState: "unknown",
    destinationRoute: operationalWorkDeepLink("goal", goal.id, stableId),
    sourceLabel: "Goal",
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    completedAt: goal.status === "done" ? goal.updated_at : null,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
  };
}

function baseCalendar(event: CalendarEvent): OperationalWorkItem {
  const stableId = `calendar:${event.id}`;
  return {
    stableId,
    sourceType: "calendar",
    sourceRecordId: event.id,
    title: event.title,
    description: event.notes,
    department: event.category === "fb_event" ? "food_and_beverage" : "administration",
    responsibleEmployee: event.created_by
      ? { id: event.created_by, name: "Event owner", role: null }
      : null,
    responsiblePosition: null,
    accountableManager: null,
    status: ["completed", "cancelled"].includes(event.status ?? "")
      ? event.status === "completed" ? "completed" : "cancelled"
      : "pending",
    dueDate: event.event_date,
    estimatedMinutes: event.start_time && event.end_time ? 60 : null,
    priorityBand: event.category === "deadline" ? "high" : "normal",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: {
      active: false, status: null, followUpDate: null, followUpDue: false, recipient: null,
    },
    verificationState: "not_required",
    aiCapabilityState: "not_available",
    destinationRoute: operationalWorkDeepLink("calendar", event.id, stableId),
    sourceLabel: event.category === "deadline" ? "Calendar deadline" : "Calendar event",
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    completedAt: event.status === "completed" ? event.updated_at : null,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: event.category === "deadline",
    payrollDeadlineFlag: /payroll|timecard/i.test(event.title),
    financialDeadlineFlag: /budget|invoice|financial/i.test(event.title),
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
  };
}

function baseEquipment(unit: Equipment): OperationalWorkItem {
  const stableId = `equipment:${unit.id}`;
  const down = ["out_of_service", "in_repair"].includes(unit.status);
  return {
    stableId,
    sourceType: "equipment",
    sourceRecordId: unit.id,
    title: `${unit.name}: ${unit.status.replaceAll("_", " ")}`,
    description: unit.condition_notes || unit.parts_needed || unit.notes,
    department: "maintenance",
    responsibleEmployee: null,
    responsiblePosition: "mechanic",
    accountableManager: null,
    status: unit.status === "operational" ? "completed" : "pending",
    dueDate: unit.next_service_due_date,
    estimatedMinutes: null,
    priorityBand: down ? "critical" : "high",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: {
      active: false, status: null, followUpDate: null, followUpDue: false, recipient: null,
    },
    verificationState: "not_required",
    aiCapabilityState: "unknown",
    destinationRoute: operationalWorkDeepLink("equipment", unit.id, stableId),
    sourceLabel: "Equipment alert",
    createdAt: unit.created_at,
    updatedAt: unit.updated_at,
    completedAt: unit.status === "operational" ? unit.updated_at : null,
    impactLevel: down ? "high" : "medium",
    managerPriorityOverride: null,
    safetyFlag: down,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: unit.triage_status === "waiting_on_parts" ? "waiting_on_parts"
      : unit.triage_status === "waiting_on_vendor" ? "waiting_on_vendor" : null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
  };
}

function basePurchaseRequest(pr: PurchaseRequest): OperationalWorkItem {
  const stableId = `purchase_request:${pr.id}`;
  const completed = !!pr.completed_at;
  return {
    stableId,
    sourceType: "purchase_request",
    sourceRecordId: pr.id,
    title: `Purchase request: ${pr.vendor1_name || pr.requestor_name}`,
    description: pr.justification,
    department: "administration",
    responsibleEmployee: pr.created_by
      ? { id: pr.created_by, name: pr.requestor_name || "Request owner", role: null }
      : null,
    responsiblePosition: null,
    accountableManager: null,
    status: completed ? "completed" : pr.status === "draft" ? "pending" : "in_progress",
    dueDate: pr.required_delivery_date,
    estimatedMinutes: 30,
    priorityBand: pr.status === "sent" || pr.status === "submitted" ? "high" : "normal",
    priorityScore: 0,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: {
      active: false, status: null, followUpDate: null, followUpDue: false, recipient: null,
    },
    verificationState: "not_required",
    aiCapabilityState: "available",
    destinationRoute: operationalWorkDeepLink("purchase_request", pr.id, stableId),
    sourceLabel: "Purchase request",
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    completedAt: pr.completed_at ?? null,
    impactLevel: "medium",
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: true,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
  };
}

function buildIndexes(input: OperationalAggregationInput): OverlayIndexes {
  const newest = <T extends { work_key: string; created_at?: string; updated_at?: string }>(
    rows: T[],
  ) => {
    const map = new Map<string, T>();
    for (const row of rows) {
      const prior = map.get(row.work_key);
      const stamp = row.updated_at ?? row.created_at ?? "";
      const priorStamp = prior?.updated_at ?? prior?.created_at ?? "";
      if (!prior || stamp > priorStamp) map.set(row.work_key, row);
    }
    return map;
  };
  const blockers = new Map<string, string[]>();
  const dependentCounts = new Map<string, number>();
  for (const dep of input.dependencies.filter((row) => row.active)) {
    blockers.set(dep.dependent_work_key, [
      ...(blockers.get(dep.dependent_work_key) ?? []),
      dep.blocker_work_key,
    ]);
    dependentCounts.set(
      dep.blocker_work_key,
      (dependentCounts.get(dep.blocker_work_key) ?? 0) + 1,
    );
  }
  return {
    state: new Map(input.states.map((row) => [row.work_key, row])),
    assignment: newest(input.assignments.filter((row) => !["completed", "reassigned"].includes(row.status))),
    postponement: newest(input.postponements.filter((row) => row.active)),
    blockers,
    dependentCounts,
    leadership: newest(input.leadership.filter((row) => ![
      "approved", "denied", "returned_to_local_management", "completed", "closed_without_action",
    ].includes(row.status))),
    event: newest(input.events),
    staff: new Map(input.staff.map((row) => [row.id, row])),
  };
}

function applyOverlay(
  item: OperationalWorkItem,
  indexes: OverlayIndexes,
  today: Date,
): OperationalWorkItem {
  const state = indexes.state.get(item.stableId);
  const assignment = indexes.assignment.get(item.stableId);
  const postponement = indexes.postponement.get(item.stableId);
  const blockers = indexes.blockers.get(item.stableId) ?? [];
  const leadership = indexes.leadership.get(item.stableId);
  const lastEvent = indexes.event.get(item.stableId);
  const sourceIsFinished = ["completed", "verified", "cancelled"].includes(item.status);

  let status = item.status;
  if (!sourceIsFinished && leadership) status = "waiting_leadership";
  else if (state) {
    const allowed = new Set<OperationalWorkItem["status"]>([
      "awaiting_acceptance", "in_progress", "postponed", "blocked",
      "waiting_leadership", "needs_verification", "completed",
    ]);
    const workflowStatus = state.workflow_status as OperationalWorkItem["status"];
    if (allowed.has(workflowStatus) && (!sourceIsFinished || workflowStatus === "needs_verification")) {
      status = state.workflow_status as OperationalWorkItem["status"];
    }
  }
  if (!sourceIsFinished && assignment?.status === "awaiting_acceptance") status = "awaiting_acceptance";
  if (assignment?.status === "submitted_for_verification") status = "needs_verification";

  const responsibleId = assignment?.resolved_employee_id
    || assignment?.employee_id
    || state?.responsible_employee_id
    || item.responsibleEmployee?.id;
  const managerId = state?.accountable_manager_id || item.accountableManager?.id;
  const verificationRequired = assignment?.verification_required
    || state?.verification_required
    || item.verificationState === "required"
    || item.verificationState === "needs_verification";
  let verificationState = item.verificationState;
  if (status === "needs_verification") verificationState = "needs_verification";
  else if (status === "verified") verificationState = "verified";
  else if (verificationRequired) verificationState = "required";

  const followUpDate = leadership?.follow_up_date ?? null;
  const todayYmd = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  const delegationStatus = assignment
    && assignment.due_date < todayYmd
    && !["completed", "reassigned", "submitted_for_verification"].includes(assignment.status)
    ? "overdue"
    : assignment?.status ?? item.delegationStatus;
  const overlaid: OperationalWorkItem = {
    ...item,
    responsibleEmployee: person(responsibleId, indexes.staff),
    responsiblePosition: assignment?.position || state?.responsible_position || item.responsiblePosition,
    accountableManager: person(managerId, indexes.staff),
    status,
    dueDate: assignment?.due_date || item.dueDate,
    blockedState: {
      blocked: blockers.length > 0 || status === "blocked" || item.blockedState.blocked,
      blockerKeys: blockers,
      reason: postponement?.explanation || item.blockedState.reason,
    },
    delegated: !!assignment || item.delegated,
    delegationStatus,
    leadershipState: {
      active: !!leadership,
      status: leadership?.status ?? null,
      followUpDate,
      followUpDue: !!followUpDate && followUpDate <= todayYmd,
      recipient: leadership?.recipient || leadership?.leadership_group || null,
    },
    verificationState,
    managerPriorityOverride: state?.manager_priority_override ?? null,
    safetyFlag: state?.safety_flag || item.safetyFlag,
    complianceFlag: state?.compliance_flag || item.complianceFlag,
    payrollDeadlineFlag: state?.payroll_deadline_flag || item.payrollDeadlineFlag,
    financialDeadlineFlag: state?.financial_deadline_flag || item.financialDeadlineFlag,
    dependentCount: indexes.dependentCounts.get(item.stableId) ?? 0,
    waitingReason: postponement?.reason ?? item.waitingReason,
    reviewDate: postponement?.review_date || postponement?.resume_date || item.reviewDate,
    activitySummary: lastEvent?.detail || lastEvent?.event_type.replaceAll("_", " ") || null,
  };
  const ranked = scoreOperationalPriority({
    dueDate: overlaid.dueDate,
    estimatedMinutes: overlaid.estimatedMinutes,
    sourcePriority: item.priorityBand,
    managerPriorityOverride: overlaid.managerPriorityOverride,
    safetyFlag: overlaid.safetyFlag,
    complianceFlag: overlaid.complianceFlag,
    payrollDeadlineFlag: overlaid.payrollDeadlineFlag,
    financialDeadlineFlag: overlaid.financialDeadlineFlag,
    dependentCount: overlaid.dependentCount,
    sourceType: overlaid.sourceType,
    impactLevel: overlaid.impactLevel,
    status: overlaid.status,
  }, today);
  return {
    ...overlaid,
    priorityScore: ranked.score,
    priorityBand: priorityBandForScore(ranked.score),
    priorityExplanation: ranked.explanation,
  };
}

export function dedupeOperationalWork(items: OperationalWorkItem[]): OperationalWorkItem[] {
  const map = new Map<string, OperationalWorkItem>();
  for (const item of items) {
    const prior = map.get(item.stableId);
    if (!prior || item.updatedAt > prior.updatedAt) map.set(item.stableId, item);
  }
  return [...map.values()];
}

/** Build one normalized list from the existing domain systems. */
export function aggregateOperationalWork(input: OperationalAggregationInput): OperationalWorkItem[] {
  const indexes = buildIndexes(input);
  const stepsByGoal = new Map<string, DailyStep[]>();
  for (const step of input.steps) {
    if (!step.goal_id) continue;
    stepsByGoal.set(step.goal_id, [...(stepsByGoal.get(step.goal_id) ?? []), step]);
  }
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));

  const raw: OperationalWorkItem[] = [
    ...input.tasks.map(baseTask),
    ...input.standards
      .filter((row) => input.isManager
        || row.standard.owner_profile_id === input.currentUserId
        || row.standard.backup_profile_id === input.currentUserId)
      .map(baseStandard),
    ...input.obligations.map(baseObligation),
    ...input.steps.map((step) => baseStep(step, step.goal_id ? goalsById.get(step.goal_id) : undefined)),
    ...input.goals.filter((goal) => (stepsByGoal.get(goal.id) ?? []).length === 0).map(baseGoal),
    ...input.calendarEvents.map(baseCalendar),
    ...input.equipment
      .filter((unit) => ["needs_service", "in_repair", "out_of_service"].includes(unit.status))
      .map(baseEquipment),
    ...input.purchaseRequests.filter((pr) => !pr.completed_at).map(basePurchaseRequest),
  ];

  const recentCutoff = new Date(input.today);
  recentCutoff.setDate(recentCutoff.getDate() - 14);
  const recentCutoffIso = recentCutoff.toISOString();
  return dedupeOperationalWork(raw.map((item) => applyOverlay(item, indexes, input.today)))
    .filter((item) => !["completed", "verified"].includes(item.status)
      || (item.completedAt || item.updatedAt) >= recentCutoffIso);
}
