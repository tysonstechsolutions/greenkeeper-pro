import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DutyRhythm } from "@/components/features/operations/duty-rhythm";
import type { DutyTodayItem, OperationDuty } from "@/lib/operations/types";

function duty(partial: Partial<OperationDuty>): OperationDuty {
  return {
    id: partial.id ?? "duty-1",
    title: partial.title ?? "Test duty",
    area: partial.area ?? "course",
    days: ["mon"],
    season: "year_round",
    note: null,
    is_active: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function item(partial: Partial<DutyTodayItem> & { duty: OperationDuty }): DutyTodayItem {
  return {
    done: false,
    occurrence: null,
    assignment: null,
    primaryName: null,
    backupName: null,
    contractorName: null,
    ...partial,
  };
}

describe("DutyRhythm", () => {
  it("keeps recreation aides, golf operations assistants, and pro-shop staff distinct", () => {
    render(<DutyRhythm items={[
      item({ duty: duty({ id: "rec", title: "Range setup", role_group: "recreation_aide", department: "golf_operations" }), primaryName: "Alex" }),
      item({ duty: duty({ id: "ops", title: "Open counter", role_group: "golf_operations_assistant", department: "golf_operations" }), primaryName: "Blair" }),
      item({ duty: duty({ id: "shop", title: "Merchandise check", role_group: "pro_shop_staff", department: "pro_shop" }), primaryName: "Casey" }),
    ]} onToggle={() => {}} />);

    expect(screen.getByText("Recreation Aides")).toBeInTheDocument();
    expect(screen.getByText("Golf Operations Assistants")).toBeInTheDocument();
    expect(screen.getByText("Pro-Shop Staff")).toBeInTheDocument();
  });

  it("shows ownership, instructions, evidence, and honest missing duration", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<DutyRhythm items={[
      item({
        duty: duty({
          id: "vacuum",
          title: "Vacuum offices",
          role_group: "pro_shop_staff",
          department: "pro_shop",
          instructions: "Vacuum the pro shop, administration room, and GM office.",
          evidence_requirements: ["Completion note"],
          manager_verification_required: true,
          estimated_minutes: null,
        }),
        primaryName: "Devin",
        backupName: "Jordan",
      }),
    ]} onToggle={onToggle} />);

    expect(screen.getByText(/Devin · Duration not recorded/)).toBeInTheDocument();
    expect(screen.getByText("Backup: Jordan")).toBeInTheDocument();
    expect(screen.getByText(/Vacuum the pro shop/)).toBeInTheDocument();
    expect(screen.getByText("Evidence: Completion note")).toBeInTheDocument();
    expect(screen.getByText("Manager verification required")).toBeInTheDocument();
    expect(screen.queryByText(/0 min/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Complete Vacuum offices" }));
    expect(onToggle).toHaveBeenCalledWith("vacuum", true);
  });

  it("moves ownerless work into the explicit unassigned group", () => {
    render(<DutyRhythm items={[
      item({ duty: duty({ id: "unassigned", title: "Unowned inspection", role_group: "maintenance_staff", department: "maintenance" }) }),
    ]} onToggle={() => {}} />);

    expect(screen.getByText("Unassigned Work")).toBeInTheDocument();
    expect(screen.getByText("Target group: Maintenance Staff")).toBeInTheDocument();
  });

  it("shows verified work without offering an invalid Today-page reopen", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<DutyRhythm items={[
      item({
        duty: duty({ id: "verified", title: "Opening inspection" }),
        done: true,
        primaryName: "Alex",
        occurrence: {
          id: "task-1",
          duty_id: "verified",
          duty_assignment_id: null,
          series_id: "series-1",
          occurrence_key: "2026-07-13",
          original_due_date: "2026-07-13",
          due_date: "2026-07-13",
          assigned_to: "alex",
          status: "verified",
          completed_at: "2026-07-13T12:00:00Z",
          completed_by: "alex",
          verified_at: "2026-07-13T13:00:00Z",
          verified_by: "manager",
        },
      }),
    ]} onToggle={onToggle} />);

    const verified = screen.getByRole("button", { name: "Verified Opening inspection" });
    expect(verified).toBeDisabled();
    expect(screen.getByText("Verified by manager")).toBeInTheDocument();
    await user.click(verified);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
