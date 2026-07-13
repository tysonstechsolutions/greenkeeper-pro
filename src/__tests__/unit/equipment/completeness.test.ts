import { describe, expect, it } from "vitest";
import {
  assessUnit,
  summarizeCompleteness,
  collectionQueue,
  type CompletenessUnitInput,
} from "@/lib/equipment/completeness";

const ASOF = "2026-07-13";

function unit(overrides: Partial<CompletenessUnitInput> = {}): CompletenessUnitInput {
  return {
    id: "u1",
    name: "Unit 1",
    status: "operational",
    make: null,
    model: null,
    serial_number: null,
    photo_url: null,
    photos: null,
    current_hours: null,
    service_interval_hours: null,
    needs_parts_ordered: false,
    parts_needed: null,
    last_inspection_date: null,
    triage_status: null,
    ...overrides,
  };
}

describe("equipment completeness", () => {
  it("does NOT treat a missing meter or interval as zero — they read as not recorded", () => {
    const a = assessUnit(unit(), { serviceRecordCount: 0, partsCount: 0 }, ASOF);
    expect(a.present.meter).toBe(false); // current_hours null → not recorded
    expect(a.present.pm_schedule).toBe(false);
    expect(a.missing).toContain("meter");
    expect(a.missing).toContain("pm_schedule");
  });

  it("recognizes recorded identity fields and photos", () => {
    const a = assessUnit(
      unit({ make: "Toro", model: "Reelmaster", serial_number: "SN1", photos: ["p.jpg"] }),
      { serviceRecordCount: 2, partsCount: 0 },
      ASOF,
    );
    expect(a.present.make).toBe(true);
    expect(a.present.model).toBe(true);
    expect(a.present.serial).toBe(true);
    expect(a.present.photo).toBe(true);
    expect(a.present.service_history).toBe(true);
  });

  it("only treats a real hour reading as a meter (0 counts, null does not)", () => {
    expect(assessUnit(unit({ current_hours: 0 }), { serviceRecordCount: 0, partsCount: 0 }, ASOF).present.meter).toBe(true);
    expect(assessUnit(unit({ current_hours: null }), { serviceRecordCount: 0, partsCount: 0 }, ASOF).present.meter).toBe(false);
  });

  it("marks diagnosis/parts as not-applicable for an operational unit", () => {
    const a = assessUnit(unit({ status: "operational" }), { serviceRecordCount: 0, partsCount: 0 }, ASOF);
    expect(a.notApplicable).toEqual(["repair_diagnosis", "parts_info"]);
    expect(a.missing).not.toContain("repair_diagnosis");
    expect(a.missing).not.toContain("parts_info");
  });

  it("expects diagnosis/parts for a down unit and reflects triage state", () => {
    const undiagnosed = assessUnit(
      unit({ status: "out_of_service", triage_status: "needs_inspection" }),
      { serviceRecordCount: 0, partsCount: 0 }, ASOF,
    );
    expect(undiagnosed.notApplicable).toEqual([]);
    expect(undiagnosed.present.repair_diagnosis).toBe(false);
    expect(undiagnosed.missing).toContain("repair_diagnosis");

    const diagnosed = assessUnit(
      unit({ status: "out_of_service", triage_status: "diagnosed" }),
      { serviceRecordCount: 0, partsCount: 1 }, ASOF,
    );
    expect(diagnosed.present.repair_diagnosis).toBe(true);
    expect(diagnosed.present.parts_info).toBe(true);
  });

  it("honors the 90-day recent-inspection window", () => {
    expect(assessUnit(unit({ last_inspection_date: "2026-07-01" }), { serviceRecordCount: 0, partsCount: 0 }, ASOF).present.recent_inspection).toBe(true);
    expect(assessUnit(unit({ last_inspection_date: "2026-01-01" }), { serviceRecordCount: 0, partsCount: 0 }, ASOF).present.recent_inspection).toBe(false);
  });

  it("summarizes missing counts across units without counting not-applicable", () => {
    const units = [
      unit({ id: "a", status: "operational" }),
      unit({ id: "b", status: "out_of_service", make: "Toro" }),
    ];
    const assessments = units.map((u) => assessUnit(u, { serviceRecordCount: 0, partsCount: 0 }, ASOF));
    const summary = summarizeCompleteness(assessments);
    expect(summary.totalUnits).toBe(2);
    expect(summary.missingByField.make).toBe(1); // only unit a lacks make
    expect(summary.presentByField.make).toBe(1);
    // repair_diagnosis missing only counts for the down unit (a is N/A).
    expect(summary.missingByField.repair_diagnosis).toBe(1);
  });

  it("prioritizes the collection queue: down units and most-missing first", () => {
    const units = [
      unit({ id: "up", name: "Up unit", status: "operational" }), // missing meter+schedule+make+serial
      unit({ id: "down", name: "Down unit", status: "out_of_service", make: "Toro", model: "X" }), // missing meter+schedule+serial
    ];
    const assessments = units.map((u) => assessUnit(u, { serviceRecordCount: 0, partsCount: 0 }, ASOF));
    const queue = collectionQueue(units, assessments);
    expect(queue[0].id).toBe("down"); // down beats up despite fewer missing fields
    expect(queue.map((q) => q.id)).toEqual(["down", "up"]);
    expect(queue[0].needs).toEqual(["meter", "pm_schedule", "serial"]);
  });

  it("omits fully-complete units from the collection queue", () => {
    const complete = unit({
      id: "c", make: "Toro", model: "X", serial_number: "SN", current_hours: 10, service_interval_hours: 50,
    });
    const assessments = [assessUnit(complete, { serviceRecordCount: 1, partsCount: 0 }, ASOF)];
    expect(collectionQueue([complete], assessments)).toEqual([]);
  });
});
