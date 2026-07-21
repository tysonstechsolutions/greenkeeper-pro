import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkCard } from "@/components/features/operations-command-center/work-card";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

// Production default: single GM, no staff logins. The team-workflow controls
// must be hidden and "Delegate" reads as record-only "Assign".
vi.mock("@/lib/operational-work/solo-mode", () => ({ SOLO_MODE: true }));

const item: OperationalWorkItem = {
  stableId: "task:1",
  sourceType: "task",
  sourceRecordId: "1",
  title: "Aerate greens",
  description: "Spring aeration",
  department: "maintenance",
  responsibleEmployee: null,
  responsiblePosition: null,
  accountableManager: null,
  status: "pending",
  dueDate: "2026-05-01",
  estimatedMinutes: 240,
  priorityBand: "high",
  priorityScore: 500,
  priorityExplanation: ["Overdue by 76 days."],
  blockedState: { blocked: false, blockerKeys: [], reason: null },
  delegated: false,
  delegationStatus: null,
  leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
  verificationState: "not_required",
  aiCapabilityState: "unknown",
  destinationRoute: "/operations",
  sourceLabel: "Task",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
  completedAt: null,
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

function renderCard() {
  render(<WorkCard
    item={item}
    itemById={new Map([[item.stableId, item]])}
    assignment={null}
    assignmentHistory={[]}
    postponementHistory={[]}
    leadershipHistory={[]}
    evidence={[]}
    events={[]}
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
}

describe("solo-mode work card", () => {
  it("shows the simple solo actions", () => {
    renderCard();
    for (const action of ["Assign", "Reschedule", "Complete", "Priority"]) {
      expect(screen.getByRole("button", { name: new RegExp(action, "i") })).toBeVisible();
    }
  });

  it("hides the multi-person workflow controls", () => {
    renderCard();
    for (const action of ["Delegate", "Postpone", "Mark blocked", "Add dependency", "Send to leadership", "Upload evidence", "Submit for verification", "Verify"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${action}`, "i") })).not.toBeInTheDocument();
    }
  });
});
