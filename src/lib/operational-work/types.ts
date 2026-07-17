export type OperationalWorkSource =
  | "task"
  | "duty"
  | "standard"
  | "obligation"
  | "goal"
  | "step"
  | "calendar"
  | "equipment"
  | "purchase_request"
  | "inspection";

export type OperationalWorkStatus =
  | "pending"
  | "awaiting_acceptance"
  | "in_progress"
  | "postponed"
  | "blocked"
  | "waiting_leadership"
  | "needs_verification"
  | "completed"
  | "verified"
  | "cancelled";

export type OperationalPriorityBand = "critical" | "high" | "normal" | "low";
export type OperationalImpact = "low" | "medium" | "high" | "critical";
export type OperationalVerificationState =
  | "not_required"
  | "required"
  | "needs_verification"
  | "verified";
export type OperationalAiState = "available" | "not_available" | "unknown";

export interface OperationalPerson {
  id: string;
  name: string;
  role: string | null;
}

export interface OperationalBlockedState {
  blocked: boolean;
  blockerKeys: string[];
  reason: string | null;
}

export interface OperationalLeadershipState {
  active: boolean;
  status: string | null;
  followUpDate: string | null;
  followUpDue: boolean;
  recipient: string | null;
}

/**
 * Canonical contract rendered by /operations. Every adapter must fill every
 * field so cards never need source-specific guesses.
 */
export interface OperationalWorkItem {
  stableId: string;
  sourceType: OperationalWorkSource;
  sourceRecordId: string;
  title: string;
  description: string | null;
  department: string | null;
  responsibleEmployee: OperationalPerson | null;
  responsiblePosition: string | null;
  accountableManager: OperationalPerson | null;
  status: OperationalWorkStatus;
  dueDate: string | null;
  estimatedMinutes: number | null;
  priorityBand: OperationalPriorityBand;
  priorityScore: number;
  priorityExplanation: string[];
  blockedState: OperationalBlockedState;
  delegated: boolean;
  delegationStatus: OperationalAssignmentStatus | null;
  leadershipState: OperationalLeadershipState;
  verificationState: OperationalVerificationState;
  aiCapabilityState: OperationalAiState;
  destinationRoute: string;
  sourceLabel: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  impactLevel: OperationalImpact | null;
  managerPriorityOverride: number | null;
  safetyFlag: boolean;
  complianceFlag: boolean;
  payrollDeadlineFlag: boolean;
  financialDeadlineFlag: boolean;
  dependentCount: number;
  waitingReason: OperationalPostponementReason | null;
  reviewDate: string | null;
  programStandardId: string | null;
  activitySummary: string | null;
}

export type OperationalSectionKey =
  | "critical_now"
  | "overdue"
  | "due_today"
  | "due_soon"
  | "quick_wins"
  | "my_work"
  | "delegated"
  | "waiting_on_someone"
  | "waiting_on_leadership"
  | "blocked"
  | "needs_verification"
  | "program_improvements"
  | "upcoming"
  | "completed_recently";

export const OPERATIONAL_SECTION_ORDER: OperationalSectionKey[] = [
  "critical_now",
  "overdue",
  "due_today",
  "due_soon",
  "quick_wins",
  "my_work",
  "delegated",
  "waiting_on_someone",
  "waiting_on_leadership",
  "blocked",
  "needs_verification",
  "program_improvements",
  "upcoming",
  "completed_recently",
];

export const OPERATIONAL_SECTION_LABELS: Record<OperationalSectionKey, string> = {
  critical_now: "Critical now",
  overdue: "Overdue",
  due_today: "Due today",
  due_soon: "Due soon",
  quick_wins: "Quick wins",
  my_work: "My work",
  delegated: "Delegated",
  waiting_on_someone: "Waiting on someone",
  waiting_on_leadership: "Waiting on leadership",
  blocked: "Blocked",
  needs_verification: "Needs verification",
  program_improvements: "Program improvements",
  upcoming: "Upcoming",
  completed_recently: "Completed recently",
};

export interface OperationalWorkStateRow {
  work_key: string;
  source_type: string;
  source_record_id: string;
  responsible_employee_id: string | null;
  responsible_position: string | null;
  accountable_manager_id: string | null;
  workflow_status: string;
  verification_required: boolean;
  manager_priority_override: number | null;
  safety_flag: boolean;
  compliance_flag: boolean;
  payroll_deadline_flag: boolean;
  financial_deadline_flag: boolean;
  notes: string | null;
  last_transition_at: string;
  created_at: string;
  updated_at: string;
}

export type OperationalAssignmentStatus =
  | "awaiting_acceptance"
  | "accepted"
  | "in_progress"
  | "needs_clarification"
  | "submitted_for_verification"
  | "completed"
  | "reassigned"
  | "overdue";

export interface OperationalAssignmentRow {
  id: string;
  work_key: string;
  employee_id: string | null;
  position: string | null;
  resolved_employee_id: string | null;
  instructions: string | null;
  due_date: string;
  expected_evidence: string | null;
  follow_up_date: string | null;
  verification_required: boolean;
  notes: string | null;
  status: OperationalAssignmentStatus;
  assigned_by: string;
  accepted_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OperationalPostponementReason =
  | "waiting_on_another_task"
  | "waiting_on_leadership"
  | "waiting_on_employee"
  | "waiting_on_vendor"
  | "waiting_on_contractor"
  | "waiting_on_parts"
  | "waiting_on_funding"
  | "waiting_on_approval"
  | "waiting_on_weather"
  | "equipment_unavailable"
  | "staffing_unavailable"
  | "higher_priority_emergency"
  | "scheduled_operational_window"
  | "other";

export const POSTPONEMENT_LABELS: Record<OperationalPostponementReason, string> = {
  waiting_on_another_task: "Waiting on another task",
  waiting_on_leadership: "Waiting on leadership",
  waiting_on_employee: "Waiting on employee",
  waiting_on_vendor: "Waiting on vendor",
  waiting_on_contractor: "Waiting on contractor",
  waiting_on_parts: "Waiting on parts",
  waiting_on_funding: "Waiting on funding",
  waiting_on_approval: "Waiting on approval",
  waiting_on_weather: "Waiting on weather",
  equipment_unavailable: "Equipment unavailable",
  staffing_unavailable: "Staffing unavailable",
  higher_priority_emergency: "Higher-priority emergency",
  scheduled_operational_window: "Scheduled operational window",
  other: "Other",
};

export interface OperationalPostponementRow {
  id: string;
  work_key: string;
  reason: OperationalPostponementReason;
  explanation: string;
  resume_date: string | null;
  review_date: string | null;
  blocking_work_key: string | null;
  actor_id: string;
  active: boolean;
  ended_at: string | null;
  ended_by: string | null;
  created_at: string;
}

export interface OperationalDependencyRow {
  id: string;
  blocker_work_key: string;
  dependent_work_key: string;
  active: boolean;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  resolution_reason: string | null;
}

export interface OperationalLeadershipRow {
  id: string;
  work_key: string;
  recipient: string | null;
  leadership_group: string | null;
  reason: string;
  request_or_decision_needed: string;
  date_sent: string;
  requested_response_date: string | null;
  follow_up_date: string;
  related_reference: string | null;
  status: string;
  response: string | null;
  outcome: string | null;
  created_by: string;
  updated_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationalEvidenceRow {
  id: string;
  work_key: string;
  evidence_type: string;
  label: string;
  reference: string;
  added_by: string;
  created_at: string;
}

export interface OperationalEventRow {
  id: string;
  work_key: string;
  event_type: string;
  actor_id: string | null;
  detail: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OperationalStaffDirectoryRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  role: string | null;
  department: string | null;
  role_group: string | null;
  is_active: boolean;
  supervisor_id: string | null;
}

export interface OperationalWorkFilters {
  department: string;
  employee: string;
  position: string;
  status: string;
  source: string;
  priority: string;
  due: string;
  duration: string;
  standard: string;
  delegated: string;
  blocked: string;
  leadership: string;
}
