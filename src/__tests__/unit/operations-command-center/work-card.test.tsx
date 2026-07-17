import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkCard } from "@/components/features/operations-command-center/work-card";
import type { OperationalAssignmentRow, OperationalWorkItem } from "@/lib/operational-work/types";

const item: OperationalWorkItem = {
  stableId: "task:20000000-0000-0000-0000-000000000001",
  sourceType: "task",
  sourceRecordId: "20000000-0000-0000-0000-000000000001",
  title: "Repair irrigation break",
  description: "Stop the leak before morning play.",
  department: "maintenance",
  responsibleEmployee: { id: "employee", name: "Crew Member", role: "crew" },
  responsiblePosition: null,
  accountableManager: { id: "manager", name: "Manager", role: "gm" },
  status: "in_progress",
  dueDate: "2026-07-16",
  estimatedMinutes: 30,
  priorityBand: "critical",
  priorityScore: 810,
  priorityExplanation: ["Due today.", "Safety-sensitive work."],
  blockedState: { blocked: false, blockerKeys: [], reason: null },
  delegated: true,
  delegationStatus: "in_progress",
  leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
  verificationState: "not_required",
  aiCapabilityState: "unknown",
  destinationRoute: "/tasks/view?id=20000000-0000-0000-0000-000000000001",
  sourceLabel: "Task",
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-16T00:00:00Z",
  completedAt: null,
  impactLevel: "high",
  managerPriorityOverride: null,
  safetyFlag: true,
  complianceFlag: false,
  payrollDeadlineFlag: false,
  financialDeadlineFlag: false,
  dependentCount: 0,
  waitingReason: null,
  reviewDate: null,
  programStandardId: null,
  activitySummary: "Work started",
};

describe("Operations work card", () => {
  it("keeps destination and management actions visible in the compact card", () => {
    render(<WorkCard
      item={item}
      itemById={new Map([[item.stableId, item]])}
      assignment={null}
      blockers={[]}
      dependents={[]}
      currentUserId="manager"
      isManager
      busy={false}
      onAction={vi.fn()}
      onTransition={vi.fn()}
      onAssignment={vi.fn()}
      onRemoveDependency={vi.fn()}
    />);

    expect(screen.getByRole("heading", { name: item.title })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open/i })[0]).toHaveAttribute("href", item.destinationRoute);
    for (const action of ["Delegate", "Postpone", "Mark blocked", "Add dependency", "Send to leadership", "Upload evidence", "Complete", "Priority"]) {
      expect(screen.getByRole("button", { name: new RegExp(action, "i") })).toBeVisible();
    }
  });

  it("routes completion through an active delegation even before acceptance", () => {
    const onAssignment = vi.fn().mockResolvedValue(undefined);
    const onTransition = vi.fn().mockResolvedValue(undefined);
    const assignment = {
      id: "assignment",
      work_key: item.stableId,
      employee_id: "employee",
      position: null,
      resolved_employee_id: "employee",
      instructions: "Finish it",
      due_date: "2026-07-16",
      expected_evidence: "Completion note",
      follow_up_date: null,
      verification_required: true,
      notes: null,
      status: "awaiting_acceptance",
      assigned_by: "manager",
      accepted_at: null,
      ended_at: null,
      created_at: "2026-07-16T00:00:00Z",
      updated_at: "2026-07-16T00:00:00Z",
    } satisfies OperationalAssignmentRow;

    render(<WorkCard
      item={{ ...item, status: "awaiting_acceptance", verificationState: "required" }}
      itemById={new Map([[item.stableId, item]])}
      assignment={assignment}
      blockers={[]}
      dependents={[]}
      currentUserId="manager"
      isManager
      busy={false}
      onAction={vi.fn()}
      onTransition={onTransition}
      onAssignment={onAssignment}
      onRemoveDependency={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Complete & submit" }));
    expect(onAssignment).toHaveBeenCalledWith("assignment", "submitted_for_verification");
    expect(onTransition).not.toHaveBeenCalled();
  });
});
