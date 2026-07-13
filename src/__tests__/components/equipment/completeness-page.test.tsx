import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const equipment = Array.from({ length: 117 }, (_, index) => ({
    id: `unit-${index + 1}`,
    name: index === 0 ? "Down unit" : `Unit ${index + 1}`,
    equipment_type: "other",
    make: index === 0 ? "Toro" : null,
    model: null,
    year: null,
    serial_number: null,
    asset_tag: null,
    status: index === 0 ? "out_of_service" : "operational",
    current_hours: null,
    service_interval_hours: null,
    next_service_due_hours: null,
    next_service_due_date: null,
    location: null,
    purchase_date: null,
    purchase_price: null,
    notes: null,
    photo_url: index === 1 ? "photo.jpg" : null,
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
  }));
  return { equipment, directSelectList: vi.fn() };
});

vi.mock("@/lib/hooks/useEquipment", () => ({
  useEquipment: () => ({ equipment: mocks.equipment, loading: false, error: null }),
  equipmentStatusLabels: {
    operational: "Operational", needs_service: "Needs Service", in_repair: "In Repair", out_of_service: "Out of Service", retired: "Retired",
  },
}));

vi.mock("@/lib/supabase/rest", () => ({ directSelectList: mocks.directSelectList }));

import EquipmentCompletenessPage from "@/app/equipment/completeness/page";

describe("EquipmentCompletenessPage", () => {
  it("shows completeness totals for all 117 units, filters missing photos, and keeps down units first in the collection queue", async () => {
    const user = userEvent.setup();
    mocks.directSelectList.mockImplementation((table: string) => Promise.resolve(table === "equipment_service_records" ? [] : []));
    render(<EquipmentCompletenessPage />);

    await waitFor(() => expect(screen.getByText("Unit completeness (117 of 117)")).toBeInTheDocument());
    expect(screen.getAllByText("116 of 117")).toHaveLength(2);

    const queue = screen.getByRole("region", { name: "Manual & PM-data collection queue" });
    const queueLinks = within(queue).getAllByRole("link");
    expect(queueLinks[0]).toHaveTextContent("Down unit");

    await user.click(screen.getByRole("combobox", { name: "Filter by missing field" }));
    await user.click(screen.getByRole("option", { name: "Photo not recorded" }));
    expect(screen.getByText("Unit completeness (116 of 117)")).toBeInTheDocument();
    const unitList = screen.getByRole("region", { name: "Unit completeness (116 of 117)" });
    expect(within(unitList).getByText("Down unit")).toBeInTheDocument();
    expect(within(unitList).queryByText("Unit 2")).not.toBeInTheDocument();
  });
});
