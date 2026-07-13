import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { todayLocal } from "@/lib/utils/date";
import type { Equipment } from "@/types/database";

const rest = vi.hoisted(() => ({
  directPatchRow: vi.fn().mockResolvedValue(undefined),
  directInsertRow: vi.fn().mockResolvedValue({ id: "record-1", created_at: "2026-07-13T12:00:00Z" }),
}));

vi.mock("@/lib/supabase/rest", () => rest);

import { EquipmentPhaseBWorkflows } from "@/components/features/equipment/phase-b-workflows";

function equipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "unit-1",
    name: "Greens Mower",
    equipment_type: "other",
    make: null,
    model: null,
    year: null,
    serial_number: null,
    asset_tag: null,
    status: "out_of_service",
    current_hours: null,
    service_interval_hours: null,
    next_service_due_hours: null,
    next_service_due_date: null,
    location: null,
    purchase_date: null,
    purchase_price: null,
    notes: null,
    photo_url: null,
    condition_status: "unknown",
    condition_notes: null,
    needs_parts_ordered: false,
    parts_needed: null,
    estimated_repair_cost: null,
    photos: [],
    requires_pre_inspection: false,
    requires_post_inspection: false,
    last_inspection_date: null,
    last_inspected_by: null,
    fuel_type: "gasoline",
    triage_status: null,
    down_since: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function renderWorkflows(unit = equipment()) {
  const onEquipmentPatched = vi.fn();
  const onLogCreated = vi.fn();
  render(
    <EquipmentPhaseBWorkflows
      equipment={unit}
      parts={[]}
      serviceRecords={[]}
      logs={[]}
      canEdit
      userId="staff-1"
      onEquipmentPatched={onEquipmentPatched}
      onLogCreated={onLogCreated}
      onUploadPhoto={vi.fn().mockResolvedValue(null)}
    />,
  );
  return { onEquipmentPatched, onLogCreated };
}

describe("EquipmentPhaseBWorkflows", () => {
  it("patches only human-selected triage and sets a missing down date once", async () => {
    const user = userEvent.setup();
    const { onEquipmentPatched } = renderWorkflows();

    await user.click(screen.getByRole("combobox", { name: "Diagnosis status" }));
    await user.click(screen.getByRole("option", { name: /Diagnosed/ }));
    await user.click(screen.getByRole("button", { name: "Save triage" }));

    await waitFor(() => expect(rest.directPatchRow).toHaveBeenCalled());
    expect(rest.directPatchRow).toHaveBeenCalledWith(
      "equipment",
      "id",
      "unit-1",
      { triage_status: "diagnosed", down_since: todayLocal() },
      "equipment.phaseB.saveTriage",
    );
    expect(onEquipmentPatched).toHaveBeenCalledWith({ triage_status: "diagnosed", down_since: todayLocal() });
    expect(rest.directPatchRow.mock.calls[0][3]).not.toHaveProperty("status");
  });

  it("keeps every triage inspection observation unknown by default and saves the derived result", async () => {
    const user = userEvent.setup();
    renderWorkflows();

    await user.click(screen.getByRole("button", { name: "Start inspection" }));
    const resultControls = [
      "Starts / runs", "Leaks observed", "Tires", "Belts & hoses", "Guards",
      "Cutting units", "Battery", "Visible damage", "Fluid checks done", "Hour meter visible",
    ].map((label) => screen.getByRole("combobox", { name: `${label} result` }) as HTMLSelectElement);
    expect(resultControls).toHaveLength(10);
    resultControls.forEach((control) => expect(control.value).toBe("unknown"));

    await user.click(screen.getByRole("button", { name: "Save triage inspection" }));

    await waitFor(() => expect(rest.directInsertRow).toHaveBeenCalled());
    expect(rest.directInsertRow).toHaveBeenCalledWith(
      "equipment_inspections",
      expect.objectContaining({
        equipment_id: "unit-1",
        inspection_type: "triage",
        overall_status: "needs_attention",
        engine_hours: null,
        checklist_items: expect.arrayContaining([
          expect.objectContaining({ id: "starts_runs", value: "unknown" }),
        ]),
      }),
      "equipment.phaseB.createTriageInspection",
    );
    expect(rest.directPatchRow).toHaveBeenLastCalledWith(
      "equipment",
      "id",
      "unit-1",
      { last_inspection_date: todayLocal() },
      "equipment.phaseB.updateLastInspectionDate",
    );
  });
});
