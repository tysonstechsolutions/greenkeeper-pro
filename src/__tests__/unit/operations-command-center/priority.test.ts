import { describe, expect, it } from "vitest";
import {
  compareOperationalWork,
  partitionOperationalWork,
  primarySectionFor,
  scoreOperationalPriority,
} from "@/lib/operational-work/priority";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

const today = new Date(2026, 6, 16);

function input(overrides: Partial<Parameters<typeof scoreOperationalPriority>[0]> = {}) {
  return {
    dueDate: "2026-07-16",
    estimatedMinutes: 60,
    sourcePriority: "normal" as const,
    managerPriorityOverride: null,
    safetyFlag: false,
    complianceFlag: false,
    payrollDeadlineFlag: false,
    financialDeadlineFlag: false,
    dependentCount: 0,
    sourceType: "task" as const,
    impactLevel: null,
    status: "pending" as const,
    ...overrides,
  };
}

function item(overrides: Partial<OperationalWorkItem> = {}): OperationalWorkItem {
  return {
    stableId: "task:00000000-0000-0000-0000-000000000001",
    sourceType: "task",
    sourceRecordId: "00000000-0000-0000-0000-000000000001",
    title: "Test work",
    description: null,
    department: "maintenance",
    responsibleEmployee: null,
    responsiblePosition: null,
    accountableManager: null,
    status: "pending",
    dueDate: "2026-07-16",
    estimatedMinutes: 60,
    priorityBand: "high",
    priorityScore: 800,
    priorityExplanation: ["Due today."],
    blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false,
    delegationStatus: null,
    leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
    verificationState: "not_required",
    aiCapabilityState: "unknown",
    destinationRoute: "/tasks/view?id=1",
    sourceLabel: "Task",
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
    dutySeriesKey: null,
    ...overrides,
  };
}

describe("explainable operational priority", () => {
  it("orders overdue work ahead of due-today work and explains both", () => {
    const overdue = scoreOperationalPriority(input({ dueDate: "2026-07-14" }), today);
    const dueToday = scoreOperationalPriority(input(), today);
    expect(overdue.score).toBeGreaterThan(dueToday.score);
    expect(overdue.explanation).toContain("Overdue by 2 days.");
    expect(dueToday.explanation).toContain("Due today.");
  });

  it("explains dependent work, quick wins, and manager overrides", () => {
    const result = scoreOperationalPriority(input({
      dueDate: null,
      estimatedMinutes: 15,
      dependentCount: 3,
      managerPriorityOverride: 200,
    }), today);
    expect(result.explanation).toContain("Blocks 3 other tasks.");
    expect(result.explanation).toContain("Estimated at 15 minutes.");
    expect(result.explanation).toContain("Manager priority override.");
  });

  it("ranks a no-deadline Program Standard by impact and duration", () => {
    const result = scoreOperationalPriority(input({
      dueDate: null,
      estimatedMinutes: 30,
      sourceType: "standard",
      impactLevel: "high",
    }), today);
    expect(result.score).toBeGreaterThan(400);
    expect(result.explanation.join(" ")).toContain("Program Standard with no fixed deadline");
    expect(result.explanation.join(" ")).toContain("high-impact quick win");
  });

  it("uses a deterministic stable-id tiebreaker", () => {
    const a = item({ stableId: "task:a" });
    const b = item({ stableId: "task:b" });
    expect([b, a].sort(compareOperationalWork).map((row) => row.stableId)).toEqual(["task:a", "task:b"]);
  });

  it("assigns every item to one primary section without duplication", () => {
    const rows = [
      item(),
      item({ stableId: "task:blocked", status: "blocked", blockedState: { blocked: true, blockerKeys: ["task:a"], reason: "Waiting" } }),
      item({ stableId: "standard:1", sourceType: "standard", dueDate: null, estimatedMinutes: 120, priorityScore: 300 }),
    ];
    expect(primarySectionFor(rows[0], today, null)).toBe("due_today");
    expect(primarySectionFor(rows[1], today, null)).toBe("blocked");
    expect(primarySectionFor(rows[2], today, null)).toBe("program_improvements");
    const sections = partitionOperationalWork(rows, today, null);
    expect([...sections.values()].flat()).toHaveLength(rows.length);
    expect(new Set([...sections.values()].flat().map((row) => row.stableId)).size).toBe(rows.length);
  });

  it("keeps overdue critical work in Overdue while due-today safety work is Critical Now", () => {
    expect(primarySectionFor(item({
      dueDate: "2026-07-15",
      priorityBand: "critical",
      safetyFlag: true,
    }), today, null)).toBe("overdue");

    expect(primarySectionFor(item({
      dueDate: "2026-07-16",
      priorityBand: "critical",
      safetyFlag: true,
    }), today, null)).toBe("critical_now");
  });
});

describe("Program Standards as the course improvement backlog", () => {
  // Standards are the GM's long-term course-improvement programme, knocked out
  // when time allows. With no target date they were scattering into My work,
  // Quick wins and Critical now, leaving "Program improvements" empty.
  const standard = (overrides: Partial<OperationalWorkItem> = {}) =>
    item({ sourceType: "standard", dueDate: null, sourceLabel: "Program Standard 2.2.20", ...overrides });

  it("puts an undated standard in the improvement backlog, not My work", () => {
    const owned = standard({ responsibleEmployee: { id: "gm", name: "Tyson", role: "gm" }, delegated: true });
    expect(primarySectionFor(owned, today, "gm")).toBe("program_improvements");
  });

  it("keeps a short undated standard out of Quick wins", () => {
    expect(primarySectionFor(standard({ estimatedMinutes: 15 }), today, null)).toBe("program_improvements");
  });

  it("does not treat an undated standard as critical just because it is flagged", () => {
    const flagged = standard({ safetyFlag: true, complianceFlag: true, priorityBand: "critical" });
    expect(primarySectionFor(flagged, today, null)).toBe("program_improvements");
  });

  it("still respects a real target date on a standard", () => {
    expect(primarySectionFor(standard({ dueDate: "2026-07-10" }), today, null)).toBe("overdue");
    expect(primarySectionFor(standard({ dueDate: "2026-07-16" }), today, null)).toBe("due_today");
    expect(primarySectionFor(standard({ dueDate: "2026-07-18" }), today, null)).toBe("due_soon");
  });

  it("still surfaces a blocked or escalated standard in its workflow section", () => {
    expect(primarySectionFor(standard({ blockedState: { blocked: true, blockerKeys: [], reason: null } }), today, null))
      .toBe("blocked");
    expect(primarySectionFor(
      standard({ leadershipState: { active: true, status: "sent", followUpDate: null, followUpDue: false, recipient: "Region" } }),
      today, null,
    )).toBe("waiting_on_leadership");
  });

  it("leaves non-standard undated work where it was", () => {
    expect(primarySectionFor(item({ sourceType: "equipment", dueDate: null, estimatedMinutes: null }), today, null))
      .toBe("upcoming");
  });
});
