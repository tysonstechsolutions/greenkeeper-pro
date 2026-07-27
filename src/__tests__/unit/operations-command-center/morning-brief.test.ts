import { describe, expect, it } from "vitest";
import { buildMorningBrief } from "@/lib/operational-work/morning-brief";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

const today = new Date(2026, 6, 21); // Tuesday, July 21

function makeItem(overrides: Partial<OperationalWorkItem>): OperationalWorkItem {
  return {
    dutySeriesKey: null,
    stableId: "task:x", sourceType: "task", sourceRecordId: "x", title: "Task",
    description: null, department: "maintenance", responsibleEmployee: null,
    responsiblePosition: null, accountableManager: null, status: "pending",
    dueDate: null, estimatedMinutes: null, priorityBand: "normal", priorityScore: 100,
    priorityExplanation: [], blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false, delegationStatus: null,
    leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
    verificationState: "not_required", aiCapabilityState: "unknown", destinationRoute: "/operations",
    sourceLabel: "Task", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
    completedAt: null, impactLevel: null, managerPriorityOverride: null, safetyFlag: false,
    complianceFlag: false, payrollDeadlineFlag: false, financialDeadlineFlag: false,
    dependentCount: 0, waitingReason: null, reviewDate: null, programStandardId: null, activitySummary: null,
    ...overrides,
  };
}

describe("buildMorningBrief", () => {
  const items = [
    makeItem({ stableId: "task:1", title: "Fix mower guard", dueDate: "2026-07-10", safetyFlag: true, priorityScore: 1200 }),
    makeItem({ stableId: "task:2", title: "Change cups", dueDate: "2026-07-21", priorityScore: 800 }),
    makeItem({ stableId: "pr:1", sourceType: "purchase_request", title: "Approve fertilizer PR", dueDate: "2026-07-24", financialDeadlineFlag: true, priorityScore: 500 }),
    makeItem({ stableId: "task:9", title: "Old done task", status: "completed", dueDate: "2026-07-05", priorityScore: 900 }),
  ];

  it("summarizes the day from real counts", () => {
    const brief = buildMorningBrief(items, today);
    expect(brief.dateLabel).toContain("Tuesday");
    expect(brief.headline).toContain("1 overdue item");
    expect(brief.lines.join(" ")).toContain("overdue");
    expect(brief.lines.join(" ")).toContain("due today");
    expect(brief.lines.join(" ")).toContain("safety");
    expect(brief.lines.join(" ")).toContain("money");
  });

  it("lists the top actions by priority and excludes finished work", () => {
    const brief = buildMorningBrief(items, today);
    expect(brief.topActions.map((item) => item.stableId)).toEqual(["task:1", "task:2", "pr:1"]);
    expect(brief.topActions.some((item) => item.status === "completed")).toBe(false);
  });

  it("states an empty day plainly", () => {
    const brief = buildMorningBrief(
      [makeItem({ stableId: "task:5", title: "Someday", dueDate: "2026-09-01", priorityScore: 120 })],
      today,
    );
    expect(brief.headline).toContain("caught up");
  });
});
