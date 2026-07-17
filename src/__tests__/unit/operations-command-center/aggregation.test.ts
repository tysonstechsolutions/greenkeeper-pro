import { describe, expect, it } from "vitest";
import { aggregateOperationalWork, dedupeOperationalWork } from "@/lib/operational-work/adapters";
import { operationalWorkDeepLink } from "@/lib/operational-work/deep-links";
import type { ProgramStandard, StandardWithStatus } from "@/lib/standards/types";
import type { Task } from "@/types/database";

const managerId = "10000000-0000-0000-0000-000000000001";
const employeeId = "10000000-0000-0000-0000-000000000002";
const taskId = "20000000-0000-0000-0000-000000000001";
const standardId = "30000000-0000-0000-0000-000000000001";

const task = {
  id: taskId,
  title: "Repair irrigation break",
  description: "Stop the leak",
  category: "irrigation",
  priority: "high",
  status: "pending",
  assigned_to: employeeId,
  assigned_crew: null,
  assigned_by: managerId,
  due_date: "2026-07-16",
  due_time: null,
  estimated_minutes: 30,
  actual_minutes: null,
  zone_id: null,
  hole_numbers: [],
  equipment_needed: [],
  materials_needed: [],
  checklist: [],
  requires_photo_before: false,
  requires_photo_after: false,
  weather_dependent: false,
  weather_conditions: null,
  recurring_rule: null,
  template_id: null,
  plan_goal_id: null,
  parent_task_id: null,
  series_id: null,
  notes: null,
  completed_at: null,
  completed_by: null,
  verified_at: null,
  verified_by: null,
  created_at: "2026-07-15T00:00:00Z",
  updated_at: "2026-07-15T00:00:00Z",
} as unknown as Task;

const standard: ProgramStandard = {
  id: standardId,
  code: "4.1.15",
  section: "4",
  subsection: "4.1",
  title: "Document preventive maintenance",
  standard_text: "Maintain a documented program.",
  expected_condition: "Current records exist.",
  current_state: null,
  possible_score: 10,
  recommended_actions: [],
  dependencies: [],
  owner_role: "gm",
  owner_profile_id: managerId,
  backup_profile_id: null,
  priority: "P2",
  effort: "Low",
  timeline: null,
  cost_estimate: 0,
  source_type: "navy_program_standard",
  source_document: null,
  requires_confirmation: false,
  evaluation_method: "manual",
  evaluation_frequency: null,
  evidence_requirements: [],
  verification_required: false,
  operational_status: "not_started",
  estimated_minutes: 20,
  impact_level: "high",
  manager_target_date: null,
  not_applicable_reason: null,
  is_active: true,
  inactive_reason: null,
  effective_date: null,
  version: 1,
  notes: null,
  created_by: managerId,
  updated_by: managerId,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

function source(overrides: Record<string, unknown> = {}) {
  return {
    tasks: [task],
    standards: [{ standard, status: "below_standard", evaluatedAt: null, detail: "Records are incomplete", openAction: null }] as StandardWithStatus[],
    obligations: [], goals: [], steps: [], calendarEvents: [], equipment: [], purchaseRequests: [],
    states: [], assignments: [], postponements: [], dependencies: [], leadership: [], events: [],
    staff: [
      { id: managerId, full_name: "Manager", display_name: "Manager", role: "gm", department: "administration", role_group: "general_manager", is_active: true, supervisor_id: null },
      { id: employeeId, full_name: "Employee", display_name: "Employee", role: "crew", department: "maintenance", role_group: "maintenance_staff", is_active: true, supervisor_id: managerId },
    ],
    currentUserId: managerId,
    isManager: true,
    today: new Date(2026, 6, 16),
    ...overrides,
  };
}

describe("canonical operational aggregation", () => {
  it("projects task and Program Standard records into the complete contract", () => {
    const rows = aggregateOperationalWork(source());
    expect(rows.map((row) => row.stableId)).toEqual(expect.arrayContaining([`task:${taskId}`, `standard:${standardId}`]));
    const projected = rows.find((row) => row.stableId === `standard:${standardId}`)!;
    expect(projected.destinationRoute).toBe(`/standards?standard=${standardId}`);
    expect(projected.estimatedMinutes).toBe(20);
    expect(projected.priorityExplanation.join(" ")).toContain("Program Standard with no fixed deadline");
    expect(Object.keys(projected)).toEqual(expect.arrayContaining([
      "sourceType", "sourceRecordId", "department", "responsibleEmployee", "responsiblePosition",
      "accountableManager", "priorityScore", "priorityExplanation", "blockedState", "leadershipState",
      "verificationState", "aiCapabilityState", "destinationRoute", "createdAt", "updatedAt",
    ]));
  });

  it("applies delegation, postponement, dependency, and leadership overlays", () => {
    const rows = aggregateOperationalWork(source({
      states: [{ work_key: `task:${taskId}`, source_type: "task", source_record_id: taskId, responsible_employee_id: employeeId, responsible_position: null, accountable_manager_id: managerId, workflow_status: "waiting_leadership", verification_required: true, manager_priority_override: 200, safety_flag: false, compliance_flag: false, payroll_deadline_flag: false, financial_deadline_flag: false, notes: "Raised", last_transition_at: "2026-07-16T00:00:00Z", created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z" }],
      assignments: [{ id: "a", work_key: `task:${taskId}`, employee_id: employeeId, position: null, resolved_employee_id: employeeId, instructions: "Fix", due_date: "2026-07-17", expected_evidence: "Photo", follow_up_date: null, verification_required: true, notes: null, status: "in_progress", assigned_by: managerId, accepted_at: "2026-07-16T00:00:00Z", ended_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z" }],
      dependencies: [{ id: "d", blocker_work_key: `standard:${standardId}`, dependent_work_key: `task:${taskId}`, active: true, created_by: managerId, created_at: "2026-07-16T00:00:00Z", resolved_at: null, resolution_reason: null }],
      leadership: [{ id: "l", work_key: `task:${taskId}`, recipient: "Director", leadership_group: null, reason: "Approval", request_or_decision_needed: "Approve", date_sent: "2026-07-16", requested_response_date: null, follow_up_date: "2026-07-16", related_reference: null, status: "awaiting_response", response: null, outcome: null, created_by: managerId, updated_by: managerId, completed_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z" }],
    }));
    const projected = rows.find((row) => row.stableId === `task:${taskId}`)!;
    expect(projected.delegated).toBe(true);
    expect(projected.leadershipState.active).toBe(true);
    expect(projected.leadershipState.followUpDue).toBe(true);
    expect(projected.blockedState.blockerKeys).toEqual([`standard:${standardId}`]);
    expect(projected.managerPriorityOverride).toBe(200);
  });

  it("derives overdue delegation state without requiring a background scheduler", () => {
    const rows = aggregateOperationalWork(source({
      assignments: [{ id: "late", work_key: `task:${taskId}`, employee_id: employeeId, position: null, resolved_employee_id: employeeId, instructions: "Fix", due_date: "2026-07-15", expected_evidence: null, follow_up_date: null, verification_required: false, notes: null, status: "in_progress", assigned_by: managerId, accepted_at: "2026-07-14T00:00:00Z", ended_at: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z" }],
    }));
    expect(rows.find((row) => row.stableId === `task:${taskId}`)?.delegationStatus).toBe("overdue");
  });

  it("returns a due postponement review to active attention without rewriting its history", () => {
    const rows = aggregateOperationalWork(source({
      postponements: [{
        id: "review", work_key: `task:${taskId}`, reason: "waiting_on_vendor",
        explanation: "Confirm the vendor delivery", resume_date: null,
        review_date: "2026-07-16", blocking_work_key: null, actor_id: managerId,
        active: true, ended_at: null, ended_by: null,
        created_at: "2026-07-15T00:00:00Z",
      }],
      states: [{ work_key: `task:${taskId}`, source_type: "task", source_record_id: taskId, responsible_employee_id: employeeId, responsible_position: null, accountable_manager_id: managerId, workflow_status: "postponed", verification_required: false, manager_priority_override: null, safety_flag: false, compliance_flag: false, payroll_deadline_flag: false, financial_deadline_flag: false, notes: null, last_transition_at: "2026-07-15T00:00:00Z", created_at: "2026-07-15T00:00:00Z", updated_at: "2026-07-15T00:00:00Z" }],
    }));
    const projected = rows.find((row) => row.stableId === `task:${taskId}`)!;
    expect(projected.status).toBe("pending");
    expect(projected.dueDate).toBe("2026-07-16");
    expect(projected.waitingReason).toBeNull();
    expect(projected.activitySummary).toContain("Postponement review due");
  });

  it("keeps a completed source in needs-verification until its delegation is verified", () => {
    const completedTask = {
      ...task,
      status: "completed",
      completed_at: "2026-07-16T12:00:00Z",
      updated_at: "2026-07-16T12:00:00Z",
    } as unknown as Task;
    const rows = aggregateOperationalWork(source({
      tasks: [completedTask],
      standards: [],
      states: [{ work_key: `task:${taskId}`, source_type: "task", source_record_id: taskId, responsible_employee_id: employeeId, responsible_position: null, accountable_manager_id: managerId, workflow_status: "needs_verification", verification_required: true, manager_priority_override: null, safety_flag: false, compliance_flag: false, payroll_deadline_flag: false, financial_deadline_flag: false, notes: null, last_transition_at: "2026-07-16T12:00:00Z", created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T12:00:00Z" }],
      assignments: [{ id: "verify", work_key: `task:${taskId}`, employee_id: employeeId, position: null, resolved_employee_id: employeeId, instructions: "Fix", due_date: "2026-07-16", expected_evidence: "Note", follow_up_date: null, verification_required: true, notes: null, status: "submitted_for_verification", assigned_by: managerId, accepted_at: null, ended_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T12:00:00Z" }],
    }));

    const projected = rows.find((row) => row.stableId === `task:${taskId}`)!;
    expect(projected.status).toBe("needs_verification");
    expect(projected.verificationState).toBe("needs_verification");
  });

  it("keeps completed-recently bounded to the last fourteen days", () => {
    const oldCompleted = {
      ...task,
      status: "completed",
      completed_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    } as unknown as Task;
    expect(aggregateOperationalWork(source({ tasks: [oldCompleted], standards: [] }))).toEqual([]);
  });

  it("deduplicates by stable id and keeps the newest projection", () => {
    const [first] = aggregateOperationalWork(source({ standards: [] }));
    const newer = { ...first, updatedAt: "2026-07-16T12:00:00Z", title: "Newest" };
    expect(dedupeOperationalWork([first, newer])).toEqual([newer]);
  });

  it("generates a live destination for every supported source", () => {
    expect(operationalWorkDeepLink("duty", taskId, `task:${taskId}`)).toBe(`/tasks/view?id=${taskId}`);
    expect(operationalWorkDeepLink("equipment", taskId, `equipment:${taskId}`)).toBe(`/equipment/view?id=${taskId}`);
    expect(operationalWorkDeepLink("purchase_request", taskId, `purchase_request:${taskId}`)).toBe(`/purchase-requests/view?id=${taskId}`);
    expect(operationalWorkDeepLink("calendar", taskId, `calendar:${taskId}`)).toBe(`/calendar?event=${taskId}`);
    expect(operationalWorkDeepLink("goal", taskId, `goal:${taskId}`)).toBe(`/operations?focus=goal%3A${taskId}`);
  });
});
