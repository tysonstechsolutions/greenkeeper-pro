import { describe, expect, it } from "vitest";
import { classifyStaleWork, describeRecurringClear } from "@/lib/operations/stale-work";
import { isActionableStaleItem, stalePlanFor } from "@/lib/operations/stale-actions";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

const today = new Date(2026, 6, 26); // 2026-07-26

function item(overrides: Partial<OperationalWorkItem> = {}): OperationalWorkItem {
  return {
    stableId: "task:1",
    sourceType: "duty",
    sourceRecordId: "1",
    title: "Mow greens",
    description: null,
    department: "maintenance",
    responsibleEmployee: null,
    responsiblePosition: "maintenance_staff",
    accountableManager: null,
    status: "pending",
    dueDate: "2026-07-20",
    estimatedMinutes: null,
    priorityBand: "normal",
    priorityScore: 100,
    priorityExplanation: [],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
    verificationState: "not_required",
    aiCapabilityState: "unknown",
    destinationRoute: "/operations",
    sourceLabel: "Duty occurrence",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    completedAt: null,
    impactLevel: null,
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    waitingReason: null,
    reviewDate: null,
    programStandardId: null,
    activitySummary: null,
    dutySeriesKey: "duty-mow",
    ...overrides,
  };
}

describe("classifyStaleWork", () => {
  it("treats a missed occurrence as recurring when the same duty is scheduled again", () => {
    const result = classifyStaleWork([
      item({ stableId: "task:missed", dueDate: "2026-07-20" }),
      item({ stableId: "task:future", dueDate: "2026-07-27" }),
    ], today);
    expect(result.recurringMisses.map((r) => r.item.stableId)).toEqual(["task:missed"]);
    expect(result.recurringMisses[0].nextOccurrence).toBe("2026-07-27");
    expect(result.needsDecision).toEqual([]);
  });

  it("sends a seasonal duty with no future occurrence to the decision pile", () => {
    // Spring aeration in July: the window has closed and nothing is scheduled.
    const result = classifyStaleWork([
      item({ stableId: "task:aeration", title: "Spring aeration", dueDate: "2026-04-15", dutySeriesKey: "duty-aeration" }),
    ], today);
    expect(result.needsDecision.map((r) => r.item.title)).toEqual(["Spring aeration"]);
    expect(result.needsDecision[0].daysOverdue).toBe(102);
    expect(result.recurringMisses).toEqual([]);
  });

  it("never lets one duty's future occurrence excuse another duty's miss", () => {
    const result = classifyStaleWork([
      item({ stableId: "task:a", title: "Mow", dueDate: "2026-07-20", dutySeriesKey: "duty-mow" }),
      item({ stableId: "task:b", title: "Aerate", dueDate: "2026-07-20", dutySeriesKey: "duty-aerate" }),
      item({ stableId: "task:c", title: "Mow", dueDate: "2026-07-28", dutySeriesKey: "duty-mow" }),
    ], today);
    expect(result.recurringMisses.map((r) => r.item.stableId)).toEqual(["task:a"]);
    expect(result.needsDecision.map((r) => r.item.stableId)).toEqual(["task:b"]);
  });

  it("treats a plain one-off task as needing a decision", () => {
    const result = classifyStaleWork([
      item({ sourceType: "task", dutySeriesKey: null, title: "Call the striping vendor" }),
    ], today);
    expect(result.needsDecision).toHaveLength(1);
  });

  it("ignores work that is not overdue, and work already finished", () => {
    const result = classifyStaleWork([
      item({ stableId: "task:today", dueDate: "2026-07-26" }),
      item({ stableId: "task:future", dueDate: "2026-08-01" }),
      item({ stableId: "task:done", dueDate: "2026-07-01", status: "completed" }),
      item({ stableId: "task:cancelled", dueDate: "2026-07-01", status: "cancelled" }),
      item({ stableId: "task:undated", dueDate: null }),
    ], today);
    expect(result.total).toBe(0);
  });

  it("leaves equipment alerts and Program Standards out of the cleanup pile", () => {
    // These are not scheduled work and must never be offered for deletion here.
    const result = classifyStaleWork([
      item({ sourceType: "equipment", dutySeriesKey: null, dueDate: "2026-06-01" }),
      item({ sourceType: "standard", dutySeriesKey: null, dueDate: "2026-06-01" }),
    ], today);
    expect(result.total).toBe(0);
  });

  it("counts blocked and postponed work as stale once it is past due", () => {
    const result = classifyStaleWork([
      item({ stableId: "task:blocked", status: "blocked", dutySeriesKey: null }),
      item({ stableId: "task:postponed", status: "postponed", dutySeriesKey: null }),
    ], today);
    expect(result.total).toBe(2);
  });

  it("reports the oldest miss and sorts worst-first", () => {
    const result = classifyStaleWork([
      item({ stableId: "task:recent", dueDate: "2026-07-24", dutySeriesKey: null }),
      item({ stableId: "task:ancient", dueDate: "2026-05-01", dutySeriesKey: null }),
    ], today);
    expect(result.oldestDays).toBe(86);
    expect(result.needsDecision.map((r) => r.item.stableId)).toEqual(["task:ancient", "task:recent"]);
  });

  it("respects the staleness threshold so yesterday is not instantly a problem", () => {
    const yesterday = [item({ dueDate: "2026-07-25", dutySeriesKey: null })];
    expect(classifyStaleWork(yesterday, today, 1).total).toBe(1);
    expect(classifyStaleWork(yesterday, today, 7).total).toBe(0);
  });
});

describe("describeRecurringClear", () => {
  it("says exactly what will happen and when the duty next runs", () => {
    const { recurringMisses } = classifyStaleWork([
      item({ stableId: "task:missed", title: "Mow greens", dueDate: "2026-07-20" }),
      item({ stableId: "task:future", title: "Mow greens", dueDate: "2026-07-27" }),
    ], today);
    const text = describeRecurringClear(recurringMisses);
    expect(text).toContain("Clears 1 missed occurrence of Mow greens");
    expect(text).toContain("already scheduled for 2026-07-27");
  });

  it("handles an empty pile", () => {
    expect(describeRecurringClear([])).toBe("Nothing to clear.");
  });
});

describe("stale action routing", () => {
  it("sends tasks and duty occurrences to the tasks table", () => {
    for (const sourceType of ["task", "duty"] as const) {
      const plan = stalePlanFor(item({ sourceType }))!;
      expect(plan.table).toBe("tasks");
      expect(plan.dateColumn).toBe("due_date");
      expect(plan.deletable).toBe(true);
      expect(plan.donePatch("2026-07-26T12:00:00Z", "gm")).toEqual({
        status: "completed",
        completed_at: "2026-07-26T12:00:00Z",
        completed_by: "gm",
      });
    }
  });

  it("sends My Day steps and goals to their own tables, not tasks", () => {
    // Patching `tasks` with a daily_steps id silently matches nothing.
    const step = stalePlanFor(item({ sourceType: "step" }))!;
    expect(step.table).toBe("daily_steps");
    expect(step.dateColumn).toBe("target_date");
    expect(step.donePatch("2026-07-26T12:00:00Z", "gm")).toEqual({ done: true, done_at: "2026-07-26T12:00:00Z" });

    const goal = stalePlanFor(item({ sourceType: "goal" }))!;
    expect(goal.table).toBe("daily_goals");
    expect(goal.dateColumn).toBe("deadline");
    expect(goal.donePatch("2026-07-26T12:00:00Z", "gm")).toEqual({ status: "done" });
  });

  it("refuses to invent an action for money and compliance records", () => {
    // A purchase request past its delivery date is a procurement matter with an
    // audit trail — never a row for a cleanup screen to delete.
    for (const sourceType of ["purchase_request", "obligation", "standard", "equipment", "calendar"] as const) {
      expect(stalePlanFor(item({ sourceType }))).toBeNull();
      expect(isActionableStaleItem(item({ sourceType }))).toBe(false);
    }
  });

  it("marks task-backed work as actionable", () => {
    expect(isActionableStaleItem(item({ sourceType: "duty" }))).toBe(true);
    expect(isActionableStaleItem(item({ sourceType: "step" }))).toBe(true);
  });
});
