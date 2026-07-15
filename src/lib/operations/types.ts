// Operating-rhythm types — mirror the 20260702_operating_rhythm.sql tables.

export type ObligationCadence = "weekly" | "monthly" | "quarterly" | "annual";
export type ObligationWorkspace =
  | "course"
  | "restaurant"
  | "pro_shop"
  | "money"
  | "people"
  | "general";
export type DutyArea =
  | "course"
  | "restaurant"
  | "pro_shop"
  | "golf_operations"
  | "administration"
  | "external"
  | "unassigned";
export type DutySeason = "in_season" | "year_round";
export type DutyDepartment =
  | "golf_operations"
  | "maintenance"
  | "food_and_beverage"
  | "pro_shop"
  | "administration"
  | "external";
export type DutyRoleGroup =
  | "recreation_aide"
  | "golf_operations_assistant"
  | "maintenance_staff"
  | "restaurant_staff"
  | "pro_shop_staff"
  | "general_manager"
  | "contractor"
  | "unassigned";
export type DutyCadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type DutyAssigneeType = "employee" | "contractor" | "unassigned";
export type RequirementState = "not_recorded" | "not_required" | "required";

export type DutyEvidenceType =
  | "photo"
  | "photo_before"
  | "photo_after"
  | "record"
  | "document"
  | "external_reference";

export interface DutyEvidenceRequirement {
  key: string;
  type: DutyEvidenceType;
  label: string;
}

export interface DutyRecurrenceRule {
  cadence: DutyCadence;
  interval: number;
  /** Local weekday keys used by daily/weekly rules. */
  weekdays?: string[];
  /** 1..28, or -1 for the final day of the month. */
  day_of_month?: number;
  /** Calendar month numbers used by quarterly/annual rules. */
  months?: number[];
}

export interface Obligation {
  id: string;
  slug: string;
  title: string;
  detail: string | null;
  workspace: ObligationWorkspace;
  cadence: ObligationCadence;
  /** 1..28, or -1 = last day of the due month. Ignored when cadence=weekly. */
  due_day: number;
  /** annual: calendar month 1..12; quarterly: month within quarter 1..3. */
  due_month: number | null;
  /**
   * weekly only: 0=Sun .. 6=Sat, the day it's due within the Sun–Sat week.
   * Defaults to Monday. Null for every other cadence.
   */
  due_weekday?: number | null;
  /** Who is accountable. NULL = nobody, which is itself a gap worth showing. */
  owner_profile_id?: string | null;
  lead_days: number;
  delegable: boolean;
  link_href: string | null;
  is_active: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ObligationCompletion {
  id: string;
  obligation_id: string;
  /** '2026-07' (monthly) | '2026-Q3' (quarterly) | '2026' (annual). */
  period: string;
  completed_at: string;
  completed_by: string | null;
  note: string | null;
}

export type ObligationStatus = "done" | "overdue" | "due_soon" | "upcoming";

/** One obligation evaluated against today — what the UI renders. */
export interface EvaluatedObligation {
  obligation: Obligation;
  /** Period key of the occurrence being shown. */
  period: string;
  /** Due date of that occurrence, local YYYY-MM-DD. */
  dueDate: string;
  status: ObligationStatus;
  /** Days from today to the due date (negative = overdue by that many). */
  daysUntil: number;
}

export interface OperationDuty {
  id: string;
  title: string;
  area: DutyArea;
  /** Weekday keys, e.g. ["mon","wed"] — same convention as pro_shop_duties. */
  days: string[];
  season: DutySeason;
  department?: DutyDepartment;
  role_group?: DutyRoleGroup;
  cadence?: DutyCadence;
  recurrence_rule?: DutyRecurrenceRule;
  estimated_minutes?: number | null;
  instructions?: string | null;
  equipment_needed?: string[];
  required_document?: string | null;
  standard_reference?: string | null;
  evidence_requirements?: DutyEvidenceRequirement[];
  evidence_requirement_state?: RequirementState;
  manager_verification_required?: boolean;
  verification_requirement_state?: RequirementState;
  equipment_requirement_state?: RequirementState;
  task_category?: string;
  priority?: "critical" | "high" | "normal" | "low";
  active_from?: string;
  active_through?: string | null;
  inactive_reason?: string | null;
  seasonal_start_mmdd?: string | null;
  seasonal_end_mmdd?: string | null;
  legacy_source?: string | null;
  legacy_source_id?: string | null;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DutyPersonSummary {
  id: string;
  full_name: string;
  role?: string | null;
  department?: DutyDepartment | null;
  role_group?: DutyRoleGroup | null;
}

export interface DutyVendorSummary {
  id: string;
  name: string;
  company?: string | null;
}

export interface DutyAssignment {
  id: string;
  duty_id: string;
  assignee_type: DutyAssigneeType;
  primary_profile_id: string | null;
  backup_profile_id: string | null;
  contractor_vendor_id: string | null;
  effective_from: string;
  effective_through: string | null;
  change_reason: string;
  assigned_by: string | null;
  created_at: string;
  primary?: DutyPersonSummary | null;
  backup?: DutyPersonSummary | null;
  contractor?: DutyVendorSummary | null;
}

export interface DutyTemporaryCoverage {
  id: string;
  duty_id: string;
  permanent_assignment_id: string;
  assignee_type: DutyAssigneeType;
  primary_profile_id: string | null;
  backup_profile_id: string | null;
  contractor_vendor_id: string | null;
  starts_on: string;
  ends_on: string;
  reason: string;
  created_by: string | null;
  created_at: string;
  primary?: DutyPersonSummary | null;
  backup?: DutyPersonSummary | null;
  contractor?: DutyVendorSummary | null;
}

export interface DutyRecurrenceVersion {
  id: string;
  duty_id: string;
  cadence: DutyCadence;
  recurrence_rule: DutyRecurrenceRule;
  effective_from: string;
  effective_through: string | null;
  change_reason: string;
  changed_by: string | null;
  created_at: string;
}

export interface DutyAuditEvent {
  id: string;
  duty_id: string | null;
  event_type: string;
  actor_id: string | null;
  reason: string;
  effective_date: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LegacyRosterLink {
  id: string;
  full_name: string;
  position: string;
  is_active: boolean;
  profile_id: string | null;
}

export interface DutyTaskOccurrence {
  id: string;
  duty_id: string;
  duty_assignment_id: string | null;
  duty_coverage_id?: string | null;
  duty_recurrence_version_id?: string | null;
  series_id: string;
  occurrence_key: string;
  original_due_date: string;
  due_date: string;
  assigned_to: string | null;
  duty_department?: DutyDepartment | null;
  duty_role_group?: DutyRoleGroup | null;
  duty_recurrence_rule?: DutyRecurrenceRule | null;
  duty_instructions?: string | null;
  estimated_minutes?: number | null;
  equipment_needed?: string[];
  duty_evidence_requirements?: DutyEvidenceRequirement[] | null;
  duty_evidence_requirement_state?: RequirementState | null;
  /** Server-evaluated against photos and structured evidence records. */
  duty_evidence_satisfied?: boolean | null;
  duty_verification_requirement_state?: RequirementState | null;
  duty_equipment_requirement_state?: RequirementState | null;
  duty_owner_type?: DutyAssigneeType | null;
  duty_primary_profile_id?: string | null;
  duty_backup_profile_id?: string | null;
  duty_contractor_vendor_id?: string | null;
  duty_primary_name?: string | null;
  duty_backup_name?: string | null;
  duty_contractor_name?: string | null;
  blocked_reason?: string | null;
  status: "pending" | "in_progress" | "completed" | "verified" | "blocked" | "deferred" | "cancelled";
  completed_at: string | null;
  completed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

export interface DutyTodayItem {
  duty: OperationDuty;
  done: boolean;
  occurrence: DutyTaskOccurrence | null;
  assignment: DutyAssignment | null;
  primaryName: string | null;
  backupName: string | null;
  contractorName: string | null;
}

export interface DutyCompletion {
  id: string;
  duty_id: string;
  duty_date: string;
  completed_at: string;
  completed_by: string | null;
}
