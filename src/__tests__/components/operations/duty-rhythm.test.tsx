import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DutyRhythm } from "@/components/features/operations/duty-rhythm";
import type { DutyTaskOccurrence, DutyTodayItem, OperationDuty } from "@/lib/operations/types";

function duty(partial: Partial<OperationDuty>): OperationDuty {
  return {
    id: partial.id ?? "duty-1", title: partial.title ?? "Test duty",
    area: partial.area ?? "course", days: ["mon"], season: "year_round",
    note: null, is_active: true, sort_order: 0, created_at: "", updated_at: "", ...partial,
  };
}

function occurrence(partial: Partial<DutyTaskOccurrence> = {}): DutyTaskOccurrence {
  return {
    id: "task-1", duty_id: "duty-1", duty_assignment_id: null,
    series_id: "series-1", occurrence_key: "2026-07-13",
    original_due_date: "2026-07-13", due_date: "2026-07-13",
    assigned_to: "employee-1", status: "pending", completed_at: null,
    completed_by: null, verified_at: null, verified_by: null, ...partial,
  };
}

function item(partial: Partial<DutyTodayItem> & { duty: OperationDuty }): DutyTodayItem {
  return { done: false, occurrence: null, assignment: null, primaryName: null,
    backupName: null, contractorName: null, ...partial };
}

describe("DutyRhythm", () => {
  it("keeps recreation aides, golf operations assistants, and pro-shop staff distinct", () => {
    render(<DutyRhythm items={[
      item({ duty: duty({ id: "rec", title: "Range setup", role_group: "recreation_aide", department: "golf_operations" }), primaryName: "Alex" }),
      item({ duty: duty({ id: "ops", title: "Open counter", role_group: "golf_operations_assistant", department: "golf_operations" }), primaryName: "Blair" }),
      item({ duty: duty({ id: "shop", title: "Merchandise check", role_group: "pro_shop_staff", department: "pro_shop" }), primaryName: "Casey" }),
    ]} onTransition={() => false} />);
    expect(screen.getAllByText("Recreation Aides").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Golf Operations Assistants").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro-Shop Staff").length).toBeGreaterThan(0);
  });

  it("shows source-backed execution detail and separate actions without fabricating missing values", async () => {
    const onTransition = vi.fn().mockResolvedValue(true);
    render(<DutyRhythm items={[item({
      duty: duty({ id: "vacuum", title: "Vacuum offices", role_group: "pro_shop_staff", department: "pro_shop" }),
      occurrence: occurrence({
        duty_id: "vacuum", duty_primary_name: "Devin", duty_backup_name: "Jordan",
        duty_department: "pro_shop", duty_role_group: "pro_shop_staff",
        duty_instructions: "Vacuum the pro shop, administration room, and GM office.",
        duty_evidence_requirement_state: "not_recorded",
        duty_verification_requirement_state: "required",
        duty_equipment_requirement_state: "not_recorded",
      }),
      primaryName: "Devin", backupName: "Jordan",
    })]} onTransition={onTransition} />);

    expect(screen.getByText(/Duration:/).parentElement).toHaveTextContent("Not recorded");
    expect(screen.getByText(/Instructions:/).parentElement).toHaveTextContent("Vacuum the pro shop");
    expect(screen.getAllByText(/Not recorded/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 minutes/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute("href", "/tasks/view?id=task-1");

    await userEvent.click(screen.getByRole("button", { name: /Start/ }));
    expect(onTransition).toHaveBeenCalledWith("vacuum", "in_progress");
  });

  it("shows contractor ownership instead of Unassigned", () => {
    render(<DutyRhythm items={[item({
      duty: duty({ id: "contract", title: "Pump service", role_group: "contractor", department: "external" }),
      occurrence: occurrence({ duty_id: "contract", assigned_to: null, duty_owner_type: "contractor", duty_contractor_name: "Acme Service" }),
      contractorName: "Acme Service",
    })]} onTransition={() => false} />);
    expect(screen.getAllByText("Contractors").length).toBeGreaterThan(0);
    expect(screen.getByText("Contractor: Acme Service")).toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
  });

  it("blocks one-click completion while required evidence is missing", () => {
    render(<DutyRhythm items={[item({
      duty: duty({ id: "photo-duty", title: "Photo inspection" }),
      occurrence: occurrence({
        duty_id: "photo-duty", duty_evidence_requirement_state: "required",
        duty_evidence_requirements: [{ key: "after", type: "photo_after", label: "After photo" }],
        duty_evidence_satisfied: false,
      }),
      primaryName: "Alex",
    })]} onTransition={() => false} />);
    expect(screen.getByRole("button", { name: "Evidence missing" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Complete/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(/missing/).length).toBeGreaterThan(0);
  });

  it("shows verified work without a reopen action", () => {
    render(<DutyRhythm items={[item({
      duty: duty({ id: "verified", title: "Opening inspection" }), done: true,
      primaryName: "Alex", occurrence: occurrence({ duty_id: "verified", status: "verified" }),
    })]} onTransition={() => false} />);
    expect(screen.getByText("verified")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete|Start|Block/ })).not.toBeInTheDocument();
  });
});
