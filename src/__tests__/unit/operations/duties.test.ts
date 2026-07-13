import { describe, expect, it } from "vitest";
import {
  assignmentForDate,
  dutiesForTodayFromOccurrences,
  dutyRunsOn,
  missingDutyOccurrenceKeys,
  occurrenceDatesForDuty,
  previewActiveDutyReassignment,
} from "@/lib/operations/duties";
import type { DutyAssignment, DutyTaskOccurrence, OperationDuty } from "@/lib/operations/types";

function duty(partial: Partial<OperationDuty> = {}): OperationDuty {
  return {
    id: "duty-1",
    title: "Test duty",
    area: "course",
    days: ["mon"],
    season: "year_round",
    note: null,
    is_active: true,
    sort_order: 0,
    created_at: "2026-07-13T12:00:00Z",
    updated_at: "2026-07-13T12:00:00Z",
    active_from: "2026-07-13",
    ...partial,
  };
}

function assignment(partial: Partial<DutyAssignment> = {}): DutyAssignment {
  return {
    id: "assignment-1",
    duty_id: "duty-1",
    assignee_type: "employee",
    primary_profile_id: "employee-a",
    backup_profile_id: "employee-b",
    contractor_vendor_id: null,
    effective_from: "2026-07-01",
    effective_through: null,
    change_reason: "Initial assignment",
    assigned_by: "manager",
    created_at: "2026-07-01T12:00:00Z",
    ...partial,
  };
}

function occurrence(partial: Partial<DutyTaskOccurrence> = {}): DutyTaskOccurrence {
  return {
    id: "task-1",
    duty_id: "duty-1",
    duty_assignment_id: "assignment-1",
    series_id: "series-1",
    occurrence_key: "2026-08-15",
    original_due_date: "2026-08-15",
    due_date: "2026-08-15",
    assigned_to: "employee-a",
    status: "pending",
    completed_at: null,
    completed_by: null,
    verified_at: null,
    verified_by: null,
    ...partial,
  };
}

describe("duty recurrence", () => {
  it("generates selected weekdays without treating golf operations as pro shop", () => {
    const value = duty({
      department: "golf_operations",
      role_group: "recreation_aide",
      recurrence_rule: { cadence: "weekly", interval: 1, weekdays: ["mon", "fri"] },
    });

    expect(occurrenceDatesForDuty(value, "2026-07-13", "2026-07-19")).toEqual([
      "2026-07-13",
      "2026-07-17",
    ]);
  });

  it("supports monthly, quarterly, and annual dates from confirmed rules", () => {
    expect(dutyRunsOn(duty({
      recurrence_rule: { cadence: "monthly", interval: 1, day_of_month: 15 },
    }), "2026-08-15")).toBe(true);

    expect(dutyRunsOn(duty({
      recurrence_rule: {
        cadence: "quarterly",
        interval: 1,
        day_of_month: 15,
        months: [7, 10, 1, 4],
      },
    }), "2026-10-15")).toBe(true);

    expect(dutyRunsOn(duty({
      recurrence_rule: { cadence: "annual", interval: 1, day_of_month: 13, months: [7] },
    }), "2027-07-13")).toBe(true);
  });

  it("uses the immutable occurrence key after one occurrence is moved", () => {
    const value = duty({
      recurrence_rule: { cadence: "weekly", interval: 1, weekdays: ["mon"] },
    });
    // The July 13 occurrence now has due_date July 14, but its key remains
    // July 13. The recurrence planner must not recreate the Monday slot.
    const existingKeys = new Set(["2026-07-13"]);
    expect(missingDutyOccurrenceKeys(
      value,
      "2026-07-13",
      "2026-07-20",
      existingKeys,
    )).toEqual(["2026-07-20"]);
  });

  it("uses generated occurrences for monthly work and a moved single occurrence", () => {
    const monthly = duty({
      recurrence_rule: { cadence: "monthly", interval: 1, day_of_month: 15 },
    });
    const moved = occurrence({
      occurrence_key: "2026-08-15",
      original_due_date: "2026-08-15",
      due_date: "2026-08-16",
    });

    expect(dutiesForTodayFromOccurrences([monthly], [moved], "2026-08-15")).toEqual([]);
    expect(dutiesForTodayFromOccurrences([monthly], [moved], "2026-08-16")).toEqual([monthly]);
  });

  it("respects effective and seasonal boundaries", () => {
    const value = duty({
      season: "in_season",
      active_from: "2026-03-20",
      active_through: "2026-10-15",
      recurrence_rule: { cadence: "daily", interval: 1 },
    });
    expect(dutyRunsOn(value, "2026-03-19")).toBe(false);
    expect(dutyRunsOn(value, "2026-03-20")).toBe(true);
    expect(dutyRunsOn(value, "2026-10-15")).toBe(true);
    expect(dutyRunsOn(value, "2026-10-16")).toBe(false);
  });
});

describe("duty ownership", () => {
  it("selects the assignment effective for the occurrence date", () => {
    const history = [
      assignment({ id: "old", effective_through: "2026-07-14" }),
      assignment({
        id: "new",
        primary_profile_id: "employee-c",
        effective_from: "2026-07-15",
      }),
    ];
    expect(assignmentForDate(history, "duty-1", "2026-07-14")?.id).toBe("old");
    expect(assignmentForDate(history, "duty-1", "2026-07-15")?.id).toBe("new");
  });

  it("previews all active primary and backup duties while preserving ended history", () => {
    const duties = [
      duty({ id: "duty-1", title: "Primary duty", sort_order: 2 }),
      duty({ id: "duty-2", title: "Backup duty", sort_order: 1 }),
      duty({ id: "duty-3", title: "Ended duty", sort_order: 0 }),
    ];
    const assignments = [
      assignment(),
      assignment({ id: "a2", duty_id: "duty-2", primary_profile_id: "someone", backup_profile_id: "employee-a" }),
      assignment({ id: "a3", duty_id: "duty-3", effective_through: "2026-06-30" }),
    ];

    expect(previewActiveDutyReassignment(
      duties,
      assignments,
      "employee-a",
      "2026-07-13",
    ).map((item) => [item.duty.id, item.role])).toEqual([
      ["duty-2", "backup"],
      ["duty-1", "primary"],
    ]);
  });
});
