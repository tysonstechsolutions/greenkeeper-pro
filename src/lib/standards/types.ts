/**
 * Golf Program Standards Framework — types.
 *
 * The standards catalog is seeded from the FY24 Navy Standards assessment
 * (public/data/standards_plan.json). See
 * docs/audit/standards-execution-audit-2026-07-15.md for why this exists.
 */

/**
 * Honest evaluation states. The distinction that matters most:
 * `not_evaluated` and `insufficient_data` are NOT failures. Missing data must
 * never render as a zero or as "below standard".
 */
export type StandardStatus =
  | "not_evaluated"
  | "insufficient_data"
  | "meets_standard"
  | "at_risk"
  | "below_standard"
  | "critical"
  | "corrective_action_active"
  | "awaiting_verification"
  | "blocked"
  | "not_applicable";

/** Plain-language labels — no database vocabulary reaches the screen. */
export const STATUS_LABELS: Record<StandardStatus, string> = {
  not_evaluated: "Not checked yet",
  insufficient_data: "Not enough info",
  meets_standard: "Meets standard",
  at_risk: "At risk",
  below_standard: "Below standard",
  critical: "Critical",
  corrective_action_active: "Being fixed",
  awaiting_verification: "Waiting on your check",
  blocked: "Blocked",
  not_applicable: "Not applicable",
};

/**
 * Sort rank for "what needs attention first". Lower = more urgent.
 * Unknown states rank AFTER real problems but BEFORE healthy ones — they're
 * work (go find out), not alarms.
 */
export const STATUS_RANK: Record<StandardStatus, number> = {
  critical: 0,
  blocked: 1,
  below_standard: 2,
  at_risk: 3,
  awaiting_verification: 4,
  corrective_action_active: 5,
  not_evaluated: 6,
  insufficient_data: 7,
  meets_standard: 8,
  not_applicable: 9,
};

/** States that mean the standard is not currently being met. */
export const FAILING_STATUSES: ReadonlySet<StandardStatus> = new Set<StandardStatus>([
  "critical",
  "below_standard",
  "at_risk",
  "blocked",
]);

/** States where we genuinely do not know — never counted as pass or fail. */
export const UNKNOWN_STATUSES: ReadonlySet<StandardStatus> = new Set<StandardStatus>([
  "not_evaluated",
  "insufficient_data",
]);

export type StandardPriority = "P1" | "P2" | "P3" | "P4";

export type StandardSourceType =
  | "navy_program_standard"
  | "management_defined"
  | "manufacturer_requirement"
  | "regulatory_requirement"
  | "contract_requirement"
  | "best_practice"
  | "locally_configured";

/** Where a standard's authority comes from — shown so nothing is over-claimed. */
export const SOURCE_LABELS: Record<StandardSourceType, string> = {
  navy_program_standard: "Navy program standard",
  management_defined: "Management-defined",
  manufacturer_requirement: "Manufacturer requirement",
  regulatory_requirement: "Regulatory requirement",
  contract_requirement: "Contract requirement",
  best_practice: "Best practice",
  locally_configured: "Locally configured",
};

export interface ProgramStandard {
  id: string;
  code: string;
  section: string;
  subsection: string;
  title: string;
  standard_text: string;
  expected_condition: string | null;
  current_state: string | null;
  possible_score: number;
  recommended_actions: string[];
  dependencies: string[];
  owner_role: string | null;
  owner_profile_id: string | null;
  backup_profile_id: string | null;
  priority: StandardPriority | null;
  effort: "Low" | "Medium" | "High" | null;
  timeline: string | null;
  cost_estimate: number;
  source_type: StandardSourceType;
  source_document: string | null;
  requires_confirmation: boolean;
  evaluation_method: string;
  evaluation_frequency: string | null;
  evidence_requirements: string[];
  verification_required: boolean;
  operational_status: "not_started" | "partially_complete" | "complete" | "not_applicable";
  estimated_minutes: number;
  impact_level: "low" | "medium" | "high" | "critical";
  manager_target_date: string | null;
  not_applicable_reason: string | null;
  is_active: boolean;
  inactive_reason: string | null;
  effective_date: string | null;
  version: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramStandardVersion {
  id: string;
  standard_id: string;
  version: number;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  change_reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface ProgramStandardEvidence {
  id: string;
  work_key: string;
  evidence_type: string;
  label: string;
  reference: string;
  added_by: string;
  created_at: string;
}

export interface StandardProgressInput {
  status: "not_started" | "partially_complete" | "complete" | "not_applicable" | "reopen";
  notes: string;
  estimatedMinutes: number;
  impactLevel: "low" | "medium" | "high" | "critical";
  managerTargetDate: string | null;
  notApplicableReason?: string | null;
  evidenceLabel?: string | null;
  evidenceReference?: string | null;
}

export interface StandardSection {
  section: string;
  name: string;
  weight: number;
  sort_order: number;
}

export interface StandardSubsection {
  subsection: string;
  section: string;
  earned: number;
  possible: number;
  count_y: number;
  count_n: number;
  count_na: number;
  count_blank: number;
  baseline_as_of: string | null;
}

export interface StandardEvaluation {
  id: string;
  standard_id: string;
  status: StandardStatus;
  score_earned: number | null;
  score_possible: number | null;
  method: string;
  source_kind: string | null;
  source_id: string | null;
  source_ref: string | null;
  detail: string | null;
  is_automated: boolean;
  evaluated_by: string | null;
  evaluated_at: string;
}

export type CorrectiveStatus =
  | "proposed"
  | "active"
  | "awaiting_verification"
  | "resolved"
  | "dismissed";

export interface CorrectiveAction {
  id: string;
  standard_id: string;
  task_id: string | null;
  gap_detail: string;
  why_it_matters: string | null;
  definition_of_done: string | null;
  rule_key: string | null;
  source_kind: string | null;
  source_id: string | null;
  status: CorrectiveStatus;
  dismissed_reason: string | null;
  priority: "critical" | "high" | "normal" | "low" | null;
  due_date: string | null;
  escalate_on: string | null;
  reevaluate_on: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** A standard joined with its newest evaluation — the "current state" view. */
export interface StandardWithStatus {
  standard: ProgramStandard;
  status: StandardStatus;
  evaluatedAt: string | null;
  detail: string | null;
  openAction: CorrectiveAction | null;
}
