import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression guard for the Phase 1A corrective release.
//
// The legacy equipment-detail inspection writer (useEquipment.createInspection,
// used by src/app/equipment/view/page.tsx) historically submitted
// `condition_status`, `inspector_id`, and `status` — none of which are columns
// on `equipment_inspections`. The canonical contract (src/types/database.ts and
// the Phase B triage writer) is `inspected_by` + `overall_status`. These tests
// prove the legacy writer now speaks the canonical contract and never emits the
// unsupported fields again.

const rest = vi.hoisted(() => ({
  directSelectList: vi.fn().mockResolvedValue([]),
  directSelectRow: vi.fn().mockResolvedValue(null),
  directInsertRow: vi
    .fn()
    .mockResolvedValue({ id: "insp-1", created_at: "2026-07-13T12:00:00Z" }),
  directPatchRow: vi.fn().mockResolvedValue(undefined),
  directPatchRowReturning: vi.fn().mockResolvedValue(null),
  directDeleteRow: vi.fn().mockResolvedValue(undefined),
  directStorageUpload: vi.fn().mockResolvedValue(null),
  directStorageDelete: vi.fn().mockResolvedValue(undefined),
  publicStorageUrl: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/supabase/rest", () => rest);

import { useEquipment } from "@/lib/hooks/useEquipment";
import type { CreateInspectionData } from "@/lib/hooks/useEquipment";

const UNSUPPORTED_COLUMNS = ["condition_status", "inspector_id", "status"] as const;

function canonicalPayload(
  overrides: Partial<CreateInspectionData> = {},
): CreateInspectionData {
  return {
    equipment_id: "unit-1",
    inspection_type: "pre",
    inspected_by: "staff-1",
    overall_status: "needs_attention",
    notes: "Blade dull",
    checklist_items: [
      { item: "Reel condition", status: "issue", notes: "nicked" },
      { item: "Tire pressure", status: "ok" },
    ],
    engine_hours: 412.5,
    fuel_level: "half",
    oil_level: "ok",
    ...overrides,
  };
}

describe("legacy equipment inspection writer (createInspection)", () => {
  beforeEach(() => {
    rest.directInsertRow.mockClear();
  });

  it("writes to equipment_inspections using the canonical contract", async () => {
    const { result } = renderHook(() => useEquipment());

    await act(async () => {
      await result.current.createInspection(canonicalPayload());
    });

    expect(rest.directInsertRow).toHaveBeenCalledTimes(1);
    const [table, payload, tag] = rest.directInsertRow.mock.calls[0];
    expect(table).toBe("equipment_inspections");
    expect(tag).toBe("createInspection");

    expect(payload).toMatchObject({
      equipment_id: "unit-1",
      inspection_type: "pre",
      inspected_by: "staff-1",
      overall_status: "needs_attention",
      notes: "Blade dull",
      engine_hours: 412.5,
      fuel_level: "half",
      oil_level: "ok",
    });
    // Checklist findings preserved as the canonical array shape (not collapsed
    // to booleans), so the "issue" vs "na" distinction survives.
    expect(payload.checklist_items).toEqual([
      { item: "Reel condition", status: "issue", notes: "nicked" },
      { item: "Tire pressure", status: "ok", notes: undefined },
    ]);
  });

  it("never submits the unsupported legacy columns", async () => {
    const { result } = renderHook(() => useEquipment());

    await act(async () => {
      await result.current.createInspection(canonicalPayload());
    });

    const payload = rest.directInsertRow.mock.calls[0][1] as Record<string, unknown>;
    for (const column of UNSUPPORTED_COLUMNS) {
      expect(payload).not.toHaveProperty(column);
    }
    // Exhaustive: the payload keys are a subset of the real table columns.
    const allowed = new Set([
      "equipment_id",
      "inspection_type",
      "inspected_by",
      "overall_status",
      "notes",
      "checklist_items",
      "photos",
      "engine_hours",
      "fuel_level",
      "oil_level",
      "checkout_id",
    ]);
    for (const key of Object.keys(payload)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it("normalizes optional fields to null/empty without inventing columns", async () => {
    const { result } = renderHook(() => useEquipment());

    await act(async () => {
      await result.current.createInspection(
        canonicalPayload({
          overall_status: "pass",
          notes: null,
          checklist_items: undefined,
          engine_hours: null,
          fuel_level: null,
          oil_level: null,
        }),
      );
    });

    const payload = rest.directInsertRow.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.overall_status).toBe("pass");
    expect(payload.notes).toBeNull();
    expect(payload.checklist_items).toEqual([]);
    expect(payload.photos).toEqual([]);
    expect(payload.engine_hours).toBeNull();
    expect(payload).not.toHaveProperty("condition_status");
    expect(payload).not.toHaveProperty("inspector_id");
    expect(payload).not.toHaveProperty("status");
  });
});
