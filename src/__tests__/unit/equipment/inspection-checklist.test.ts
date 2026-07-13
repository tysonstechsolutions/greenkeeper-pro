import { describe, expect, it } from "vitest";
import {
  TRIAGE_CHECK_ITEMS,
  emptyTriageChecklist,
  summarizeTriageChecklist,
  isTriageCheckItemId,
  type TriageChecklistEntry,
} from "@/lib/equipment/inspection-checklist";

describe("triage inspection checklist", () => {
  it("exposes the ten observation items", () => {
    expect(TRIAGE_CHECK_ITEMS.map((i) => i.id)).toEqual([
      "starts_runs", "leaks_observed", "tires", "belts_hoses", "guards",
      "cutting_units", "battery", "visible_damage", "fluids_checked", "meter_visible",
    ]);
  });

  it("starts every item as unknown (not checked)", () => {
    const list = emptyTriageChecklist();
    expect(list).toHaveLength(10);
    expect(list.every((e) => e.value === "unknown")).toBe(true);
  });

  it("treats a fully-unknown inspection as needs_attention, not a pass", () => {
    const summary = summarizeTriageChecklist(emptyTriageChecklist());
    expect(summary.overall).toBe("needs_attention");
    expect(summary.checkedCount).toBe(0);
    expect(summary.meterVisible).toBeNull();
  });

  it("flags problem items marked issue and yields needs_attention", () => {
    const entries: TriageChecklistEntry[] = [
      { id: "starts_runs", value: "ok" },
      { id: "tires", value: "issue" },
      { id: "battery", value: "issue" },
    ];
    const summary = summarizeTriageChecklist(entries);
    expect(summary.issues).toEqual(["tires", "battery"]);
    expect(summary.overall).toBe("needs_attention");
    expect(summary.checkedCount).toBe(3);
  });

  it("passes when items are checked and no problems found", () => {
    const entries: TriageChecklistEntry[] = TRIAGE_CHECK_ITEMS.map((i) => ({
      id: i.id, value: "ok" as const,
    }));
    expect(summarizeTriageChecklist(entries).overall).toBe("pass");
  });

  it("records meter visibility only when explicitly checked", () => {
    expect(summarizeTriageChecklist([{ id: "meter_visible", value: "ok" }]).meterVisible).toBe(true);
    expect(summarizeTriageChecklist([{ id: "meter_visible", value: "issue" }]).meterVisible).toBe(false);
    expect(summarizeTriageChecklist([{ id: "meter_visible", value: "unknown" }]).meterVisible).toBeNull();
  });

  it("does not treat informational items (fluids/meter) as problems", () => {
    const summary = summarizeTriageChecklist([
      { id: "fluids_checked", value: "issue" },
      { id: "meter_visible", value: "issue" },
    ]);
    expect(summary.issues).toEqual([]);
  });

  it("validates item ids", () => {
    expect(isTriageCheckItemId("tires")).toBe(true);
    expect(isTriageCheckItemId("engine_oil_change")).toBe(false);
  });
});
