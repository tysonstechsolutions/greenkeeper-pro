import { describe, expect, it } from "vitest";
import { evaluatePmSafe, pmIsComputable, type PmInputs } from "@/lib/equipment/pm-status";

function inputs(overrides: Partial<PmInputs> = {}): PmInputs {
  return {
    service_interval_hours: null,
    current_hours: null,
    next_service_due_hours: null,
    next_service_due_date: null,
    ...overrides,
  };
}

describe("safe PM status", () => {
  it("reports schedule unavailable when no interval is set (today's 117-unit case)", () => {
    const r = evaluatePmSafe(inputs());
    expect(r.state).toBe("unavailable_no_schedule");
    expect(r.label).toBe("PM schedule unavailable");
    expect(pmIsComputable(r.state)).toBe(false);
  });

  it("never treats a 0/absent interval as a real schedule", () => {
    expect(evaluatePmSafe(inputs({ service_interval_hours: 0 })).state).toBe("unavailable_no_schedule");
  });

  it("reports meter unavailable when an interval exists but no meter/date basis", () => {
    const r = evaluatePmSafe(inputs({ service_interval_hours: 50 }));
    expect(r.state).toBe("unavailable_no_meter");
    expect(r.label).toBe("Meter reading unavailable");
  });

  it("NEVER classifies overdue without both a confirmed interval and meter basis", () => {
    // Interval + hours but no next_service_due_hours → still cannot compute.
    const r = evaluatePmSafe(inputs({ service_interval_hours: 50, current_hours: 500 }));
    expect(r.state).toBe("unavailable_no_meter");
    expect(pmIsComputable(r.state)).toBe(false);
  });

  it("computes overdue only from confirmed entered numbers", () => {
    const r = evaluatePmSafe(inputs({
      service_interval_hours: 50,
      current_hours: 520,
      next_service_due_hours: 500,
    }));
    expect(r.state).toBe("overdue");
    expect(r.hoursRemaining).toBe(-20);
  });

  it("computes due-soon and ok from confirmed numbers", () => {
    expect(evaluatePmSafe(inputs({
      service_interval_hours: 50, current_hours: 495, next_service_due_hours: 500,
    })).state).toBe("due_soon");

    expect(evaluatePmSafe(inputs({
      service_interval_hours: 50, current_hours: 400, next_service_due_hours: 500,
    })).state).toBe("ok");
  });

  it("does not fabricate an overdue-by-date verdict from a date alone", () => {
    const r = evaluatePmSafe(inputs({
      service_interval_hours: 50,
      next_service_due_date: "2020-01-01", // long past
    }));
    // Date-only basis is acknowledged but not turned into "overdue".
    expect(["ok", "unable_to_calculate"]).toContain(r.state);
    expect(r.state).not.toBe("overdue");
  });
});
