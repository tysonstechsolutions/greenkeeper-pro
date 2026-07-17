import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkActionDialog } from "@/components/features/operations-command-center/work-action-dialog";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

const item: OperationalWorkItem = {
  stableId: "task:20000000-0000-0000-0000-000000000001",
  sourceType: "task",
  sourceRecordId: "20000000-0000-0000-0000-000000000001",
  title: "Repair irrigation break",
  description: null,
  department: "maintenance",
  responsibleEmployee: null,
  responsiblePosition: null,
  accountableManager: null,
  status: "pending",
  dueDate: "2026-07-17",
  estimatedMinutes: 30,
  priorityBand: "high",
  priorityScore: 500,
  priorityExplanation: ["Due soon."],
  blockedState: { blocked: false, blockerKeys: [], reason: null },
  delegated: false,
  delegationStatus: null,
  leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
  verificationState: "not_required",
  aiCapabilityState: "unknown",
  destinationRoute: "/tasks/view?id=20000000-0000-0000-0000-000000000001",
  sourceLabel: "Task",
  createdAt: "2026-07-16T00:00:00Z",
  updatedAt: "2026-07-16T00:00:00Z",
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

const callbacks = {
  onClose: vi.fn(),
  onDelegate: vi.fn(),
  onPostpone: vi.fn(),
  onDependency: vi.fn(),
  onLeadership: vi.fn(),
  onLeadershipResponse: vi.fn(),
  onClarification: vi.fn(),
  onBlock: vi.fn(),
  onEvidence: vi.fn(),
  onPriority: vi.fn(),
  onReopen: vi.fn(),
};

describe("Operations work action dialog", () => {
  it("clears mode-specific form values when a new action opens", async () => {
    const { rerender } = render(<WorkActionDialog
      {...callbacks}
      mode="postpone"
      item={item}
      items={[item]}
      staff={[]}
      leadership={null}
    />);

    fireEvent.change(screen.getByRole("textbox", { name: "Explanation" }), {
      target: { value: "Waiting for a blocker" },
    });
    expect(screen.getByRole("textbox", { name: "Explanation" })).toHaveValue("Waiting for a blocker");

    rerender(<WorkActionDialog
      {...callbacks}
      mode="leadership"
      item={item}
      items={[item]}
      staff={[]}
      leadership={null}
    />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue(""));
  });
});
