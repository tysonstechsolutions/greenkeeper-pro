import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DutiesPage from "@/app/operations/duties/page";
import type { DutyAssignment, OperationDuty } from "@/lib/operations/types";

const mocks = vi.hoisted(() => ({
  saveDuty: vi.fn(),
  reassignAll: vi.fn(),
}));

const duty: OperationDuty = {
  id: "duty-1",
  title: "Monthly extinguisher verification",
  area: "restaurant",
  department: "food_and_beverage",
  role_group: "restaurant_staff",
  days: [],
  season: "year_round",
  cadence: "monthly",
  recurrence_rule: { cadence: "monthly", interval: 1, day_of_month: 1 },
  estimated_minutes: null,
  instructions: null,
  equipment_needed: [],
  required_document: null,
  standard_reference: null,
  evidence_requirements: [],
  manager_verification_required: true,
  task_category: "admin",
  priority: "normal",
  active_from: "2026-07-01",
  active_through: null,
  legacy_source: "pro_shop_duties",
  legacy_source_id: "legacy-duty-1",
  note: null,
  is_active: true,
  sort_order: 10,
  created_at: "2026-07-01T12:00:00Z",
  updated_at: "2026-07-01T12:00:00Z",
};

const assignment: DutyAssignment = {
  id: "assignment-1",
  duty_id: duty.id,
  assignee_type: "employee",
  primary_profile_id: "dj",
  backup_profile_id: null,
  contractor_vendor_id: null,
  effective_from: "2026-07-01",
  effective_through: null,
  change_reason: "Recorded manager assignment",
  assigned_by: "gm",
  created_at: "2026-07-01T12:00:00Z",
  primary: { id: "dj", full_name: "DJ" },
  backup: null,
  contractor: null,
};

vi.mock("@/lib/operations/use-duty-management", () => ({
  useDutyManagement: () => ({
    duties: [duty],
    assignments: [assignment],
    currentAssignments: [assignment],
    people: [
      { id: "dj", full_name: "DJ", department: "food_and_beverage", role_group: "restaurant_staff" },
      { id: "devin", full_name: "Devin", department: "pro_shop", role_group: "pro_shop_staff" },
    ],
    vendors: [],
    loading: false,
    saving: false,
    error: null,
    canManage: true,
    reload: vi.fn(),
    saveDuty: mocks.saveDuty,
    reassignAll: mocks.reassignAll,
  }),
}));

describe("DutiesPage", () => {
  beforeEach(() => {
    mocks.saveDuty.mockReset().mockResolvedValue(duty);
    mocks.reassignAll.mockReset().mockResolvedValue([
      { duty_id: duty.id, assignment_id: "assignment-2", role_changed: "primary" },
    ]);
  });

  it("renders missing operational facts honestly", () => {
    render(<DutiesPage />);
    expect(screen.getAllByText("Restaurant Staff").length).toBeGreaterThan(0);
    expect(screen.getByText("Primary:").parentElement).toHaveTextContent("DJ");
    expect(screen.getByText("Duration:").parentElement).toHaveTextContent("Not recorded");
    expect(screen.getByText("Instructions:").parentElement).toHaveTextContent("Not recorded");
    expect(screen.queryByText(/0 minutes/)).not.toBeInTheDocument();
  });

  it("previews and confirms all affected active duty assignments", async () => {
    const user = userEvent.setup();
    render(<DutiesPage />);

    await user.selectOptions(
      screen.getByLabelText("Employee leaving or changing roles"),
      "dj",
    );
    expect(screen.getByText("1 affected assignment")).toBeInTheDocument();
    expect(screen.getByText(/Monthly extinguisher verification · primary/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Replacement"), "devin");
    await user.type(screen.getByLabelText("Reason"), "Department transfer");
    await user.click(screen.getByRole("button", { name: "Confirm reassignment" }));

    expect(mocks.reassignAll).toHaveBeenCalledWith(expect.objectContaining({
      fromProfileId: "dj",
      replacementProfileId: "devin",
      reason: "Department transfer",
      dutyIds: [duty.id],
    }));
    expect(await screen.findByText("1 active duty assignment updated.")).toBeInTheDocument();
  });

  it("preserves the recurrence anchor and import provenance when editing ownership", async () => {
    const user = userEvent.setup();
    render(<DutiesPage />);

    await user.click(screen.getByRole("button", { name: "Edit Monthly extinguisher verification" }));
    await user.type(screen.getByLabelText("Assignment or change reason"), "Backup review");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.saveDuty).toHaveBeenCalledWith(expect.objectContaining({
      id: duty.id,
      duty: expect.objectContaining({
        active_from: "2026-07-01",
        legacy_source: "pro_shop_duties",
        legacy_source_id: "legacy-duty-1",
      }),
      assignmentReason: "Backup review",
    }));
  });
});
