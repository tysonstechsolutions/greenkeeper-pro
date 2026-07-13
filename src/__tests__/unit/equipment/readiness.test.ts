import { describe, expect, it } from "vitest";
import {
  formatEquipmentIdentity,
  getReadinessBuckets,
  sortEquipmentForAttention,
  summarizeEquipmentReadiness,
  type EquipmentReadinessUnit,
} from "@/lib/equipment/readiness";

function unit(overrides: Partial<EquipmentReadinessUnit> = {}): EquipmentReadinessUnit {
  return {
    status: "operational",
    needs_parts_ordered: false,
    current_hours: null,
    service_interval_hours: null,
    next_service_due_date: null,
    make: "Toro",
    model: "Reelmaster",
    ...overrides,
  };
}

describe("equipment readiness", () => {
  it("places operational equipment in only the Operational bucket", () => {
    expect(getReadinessBuckets(unit())).toEqual(["operational"]);
  });

  it.each(["out_of_service", "in_repair"] as const)(
    "places %s equipment in the Down bucket",
    (status) => {
      expect(getReadinessBuckets(unit({ status }))).toEqual(["down"]);
    },
  );

  it("places needs_service equipment in the Needs service bucket", () => {
    expect(getReadinessBuckets(unit({ status: "needs_service" }))).toEqual(["needs_service"]);
  });

  it("tracks waiting on parts independently from status", () => {
    expect(getReadinessBuckets(unit({
      status: "out_of_service",
      needs_parts_ordered: true,
    }))).toEqual(["down", "waiting_on_parts"]);
  });

  it("excludes retired equipment entirely", () => {
    const summary = summarizeEquipmentReadiness([
      unit({ status: "retired" }),
      unit(),
    ]);

    expect(getReadinessBuckets(unit({ status: "retired" }))).toEqual([]);
    expect(summary).toEqual({
      totalOwned: 1,
      operational: 1,
      down: 0,
      needsService: 0,
      waitingOnParts: 0,
    });
  });

  it("never treats missing hours, intervals, or dates as overdue", () => {
    expect(getReadinessBuckets(unit({
      status: "needs_service",
      current_hours: null,
      service_interval_hours: null,
      next_service_due_date: null,
    }))).toEqual(["needs_service"]);
  });

  it("orders attention as down, then needs service, then waiting on parts", () => {
    const parts = { ...unit({ needs_parts_ordered: true }), name: "parts" };
    const needsService = { ...unit({ status: "needs_service" }), name: "service" };
    const down = { ...unit({ status: "in_repair" }), name: "down" };

    expect(sortEquipmentForAttention([parts, needsService, down]).map((item) => item.name))
      .toEqual(["down", "service", "parts"]);
  });

  it("falls back to the model when make is missing", () => {
    expect(formatEquipmentIdentity({ make: null, model: "Workman GTX" })).toBe("Workman GTX");
  });

  it("reconciles the current 117-unit operational and down totals", () => {
    const fleet = [
      ...Array.from({ length: 58 }, () => unit({ status: "operational" })),
      ...Array.from({ length: 59 }, () => unit({ status: "out_of_service" })),
    ];

    expect(summarizeEquipmentReadiness(fleet)).toEqual({
      totalOwned: 117,
      operational: 58,
      down: 59,
      needsService: 0,
      waitingOnParts: 0,
    });
  });
});
