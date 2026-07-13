import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const equipment = Array.from({ length: 117 }, (_, index) => ({
    id: `unit-${index + 1}`,
    name: `Unit ${index + 1}`,
    equipment_type: "other",
    make: null,
    model: `Model ${index + 1}`,
    year: null,
    serial_number: null,
    asset_tag: null,
    status: index < 58 ? "operational" : "out_of_service",
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));

  return {
    directSelectList: vi.fn().mockResolvedValue([]),
    equipment,
  };
});

vi.mock("@/lib/hooks/useEquipment", () => ({
  useEquipment: () => ({ equipment: mocks.equipment, loading: false, error: null }),
  equipmentStatusLabels: {
    operational: "Operational",
    needs_service: "Needs Service",
    in_repair: "In Repair",
    out_of_service: "Out of Service",
    retired: "Retired",
  },
  equipmentStatusColors: {
    operational: "#22c55e",
    needs_service: "#eab308",
    in_repair: "#f97316",
    out_of_service: "#ef4444",
    retired: "#6b7280",
  },
  equipmentTypeLabels: { other: "Other" },
}));

vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: mocks.directSelectList,
}));

import EquipmentReadinessPage from "@/app/equipment/page";

function tileFor(label: string): HTMLElement {
  const labelElement = screen.getByText(label, { selector: "span.text-sm.font-medium" });
  const card = labelElement.parentElement?.parentElement?.parentElement;
  if (!card) throw new Error(`Missing tile for ${label}`);
  return card;
}

describe("EquipmentReadinessPage", () => {
  it("renders all 117 loaded units with reconciled operational and down totals", async () => {
    render(<EquipmentReadinessPage />);

    await waitFor(() => {
      expect(mocks.directSelectList).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText("No service history yet.")).toHaveLength(117);
    });

    expect(tileFor("Total owned")).toHaveTextContent("117");
    expect(tileFor("Operational")).toHaveTextContent("58");
    expect(tileFor("Down")).toHaveTextContent("59");
    expect(screen.getByText("Fleet units (117 of 117)")).toBeInTheDocument();

    const fleetListHeading = screen.getByText("Fleet units (117 of 117)");
    const fleetList = fleetListHeading.closest("section");
    expect(fleetList).not.toBeNull();
    const unitLinks = within(fleetList as HTMLElement)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/equipment/view?id="));
    expect(unitLinks).toHaveLength(117);
    expect(unitLinks.at(-1)).toHaveAttribute("href", "/equipment/view?id=unit-117");
  });
});
