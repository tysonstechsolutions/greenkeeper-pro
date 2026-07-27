import { describe, expect, it } from "vitest";
import { aggregateOperationalWork } from "@/lib/operational-work/adapters";
import { primarySectionFor } from "@/lib/operational-work/priority";
import {
  buildAssignmentsPrintHtml,
  groupAssignmentsByEmployee,
} from "@/lib/operational-work/print-assignments";
import type {
  OperationalPostponementRow,
  OperationalWorkItem,
} from "@/lib/operational-work/types";
import type { Task } from "@/types/database";

const taskId = "20000000-0000-0000-0000-000000000001";
const today = new Date(2026, 6, 16); // 2026-07-16

function overdueTask(): Task {
  return {
    id: taskId,
    title: "Aerate greens",
    description: "Spring aeration",
    category: "maintenance",
    priority: "high",
    status: "pending",
    assigned_to: null,
    assigned_crew: null,
    assigned_by: null,
    due_date: "2026-05-01",
    due_time: null,
    estimated_minutes: 240,
    actual_minutes: null,
    completed_at: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  } as unknown as Task;
}

function emptySource(task: Task, postponements: OperationalPostponementRow[]) {
  return {
    tasks: [task],
    standards: [], obligations: [], goals: [], steps: [], calendarEvents: [],
    equipment: [], purchaseRequests: [], states: [], assignments: [],
    postponements, dependencies: [], leadership: [], events: [], staff: [],
    currentUserId: null, isManager: true, today,
  };
}

function reschedulePostponement(resumeDate: string): OperationalPostponementRow {
  return {
    id: "40000000-0000-0000-0000-000000000001",
    work_key: `task:${taskId}`,
    reason: "scheduled_operational_window",
    explanation: `Rescheduled to ${resumeDate}`,
    resume_date: resumeDate,
    review_date: null,
    blocking_work_key: null,
    actor_id: "10000000-0000-0000-0000-000000000001",
    active: true,
    ended_at: null,
    ended_by: null,
    created_at: "2026-07-16T00:00:00Z",
  };
}

describe("reschedule (scheduled operational window)", () => {
  it("leaves a stale seasonal task in Overdue when nothing is done", () => {
    const [item] = aggregateOperationalWork(emptySource(overdueTask(), []));
    expect(item.dueDate).toBe("2026-05-01");
    expect(primarySectionFor(item, today, null)).toBe("overdue");
  });

  it("pushes the effective due date forward and clears Overdue after a reschedule", () => {
    const [item] = aggregateOperationalWork(
      emptySource(overdueTask(), [reschedulePostponement("2026-09-15")]),
    );
    expect(item.dueDate).toBe("2026-09-15");
    expect(primarySectionFor(item, today, null)).not.toBe("overdue");
    expect(primarySectionFor(item, today, null)).toBe("upcoming");
  });

  it("returns the work to attention once the rescheduled date arrives", () => {
    const [item] = aggregateOperationalWork(
      emptySource(overdueTask(), [reschedulePostponement("2026-07-16")]),
    );
    // The window is now due; it should not be hidden as a future item.
    expect(primarySectionFor(item, today, null)).not.toBe("upcoming");
  });
});

function assignedItem(overrides: Partial<OperationalWorkItem>): OperationalWorkItem {
  return {
    stableId: "task:x",
    sourceType: "task",
    sourceRecordId: "x",
    title: "Task",
    description: null,
    department: "maintenance",
    responsibleEmployee: null,
    responsiblePosition: null,
    accountableManager: null,
    status: "pending",
    dueDate: null,
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

describe("printable per-employee assignment lists", () => {
  const john = { id: "j", name: "John Smith", role: "crew" };
  const maria = { id: "m", name: "Maria Diaz", role: "crew" };

  const items = [
    assignedItem({ stableId: "task:1", title: "Mow greens", dueDate: "2026-07-17", responsibleEmployee: john }),
    assignedItem({ stableId: "task:2", title: "Change cups", dueDate: "2026-07-16", responsibleEmployee: john }),
    assignedItem({ stableId: "task:3", title: "Stock cooler", dueDate: "2026-07-18", responsibleEmployee: maria }),
    assignedItem({ stableId: "task:4", title: "Already done", status: "completed", responsibleEmployee: john }),
    assignedItem({ stableId: "task:5", title: "Unassigned", responsibleEmployee: null }),
  ];

  it("groups only open, assigned work by employee, earliest due first", () => {
    const groups = groupAssignmentsByEmployee(items);
    expect(groups.map((group) => group.name)).toEqual(["John Smith", "Maria Diaz"]);
    const johnGroup = groups[0];
    expect(johnGroup.items.map((item) => item.title)).toEqual(["Change cups", "Mow greens"]);
    expect(groups[1].items).toHaveLength(1);
  });

  it("renders a self-contained printable document with names and tasks", () => {
    const html = buildAssignmentsPrintHtml(items, today);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("John Smith");
    expect(html).toContain("Maria Diaz");
    expect(html).toContain("Mow greens");
    expect(html).not.toContain("Already done");
    expect(html).not.toContain("Unassigned");
  });

  it("escapes untrusted text and handles an empty roster", () => {
    const html = buildAssignmentsPrintHtml(
      [assignedItem({ title: "<script>x</script>", responsibleEmployee: { id: "e", name: "A & B", role: null } })],
      today,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(buildAssignmentsPrintHtml([], today)).toContain("No work is currently assigned");
  });
});
