import { describe, expect, it } from "vitest";
import {
  buildPositionListsPrintHtml,
  groupOpenWorkByPosition,
  POSITION_PRINT_RANGES,
  workInPrintRange,
} from "@/lib/operational-work/print-positions";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

const today = new Date(2026, 6, 25); // Saturday 2026-07-25

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
    dueDate: "2026-07-25",
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
    ...overrides,
  };
}

describe("print range windows", () => {
  it("keeps today's work and anything already overdue in the today range", () => {
    const range = POSITION_PRINT_RANGES.today;
    expect(workInPrintRange(item({ dueDate: "2026-07-25" }), today, range)).toBe(true);
    expect(workInPrintRange(item({ dueDate: "2026-07-20" }), today, range)).toBe(true);
    expect(workInPrintRange(item({ dueDate: "2026-07-26" }), today, range)).toBe(false);
  });

  it("keeps the next seven days in the week range", () => {
    const range = POSITION_PRINT_RANGES.week;
    expect(workInPrintRange(item({ dueDate: "2026-07-31" }), today, range)).toBe(true);
    expect(workInPrintRange(item({ dueDate: "2026-08-02" }), today, range)).toBe(false);
  });

  it("keeps undated work in every range so it is never silently dropped", () => {
    expect(workInPrintRange(item({ dueDate: null }), today, POSITION_PRINT_RANGES.today)).toBe(true);
  });

  it("leaves undated Program Standards off the hand-out sheets", () => {
    // Standards with no target date are the GM's improvement programme, not
    // shift work. Left in, the identical block printed on every sheet every
    // day and buried the real duties.
    const standard = item({ sourceType: "standard", dueDate: null, responsiblePosition: "GCM" });
    expect(workInPrintRange(standard, today, POSITION_PRINT_RANGES.today)).toBe(false);
    expect(workInPrintRange(standard, today, POSITION_PRINT_RANGES.week)).toBe(false);
  });

  it("keeps a Program Standard that has a real target date", () => {
    const standard = item({ sourceType: "standard", dueDate: "2026-07-25" });
    expect(workInPrintRange(standard, today, POSITION_PRINT_RANGES.today)).toBe(true);
  });

  it("keeps undated work from other sources, such as an equipment alert", () => {
    const alert = item({ sourceType: "equipment", dueDate: null, responsiblePosition: "mechanic" });
    expect(workInPrintRange(alert, today, POSITION_PRINT_RANGES.today)).toBe(true);
  });
});

describe("grouping open work by position", () => {
  it("groups duty occurrences by their role group, not by a named employee", () => {
    const groups = groupOpenWorkByPosition(
      [
        item({ stableId: "task:1", title: "Mow greens", responsiblePosition: "maintenance_staff" }),
        item({ stableId: "task:2", title: "Rake bunkers", responsiblePosition: "maintenance_staff" }),
        item({ stableId: "task:3", title: "Open pro shop", responsiblePosition: "pro_shop_staff" }),
      ],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups.map((group) => group.label)).toEqual(["Maintenance Staff", "Pro-Shop Staff"]);
    expect(groups[0].days[0].items.map((row) => row.title)).toEqual(["Mow greens", "Rake bunkers"]);
  });

  it("prints one sheet per role even when sources disagree about capitalisation", () => {
    // Equipment alerts hard-code "mechanic"; Program Standards carry a
    // free-text owner role that may read "Mechanic". Two sheets for the same
    // person is a printing bug, not two positions.
    const groups = groupOpenWorkByPosition(
      [
        item({ stableId: "equipment:1", title: "Mower down", responsiblePosition: "mechanic" }),
        item({ stableId: "standard:1", title: "PM schedule", responsiblePosition: "Mechanic" }),
      ],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].days.flatMap((day) => day.items)).toHaveLength(2);
  });

  it("names the person when work is owned by an employee rather than a position", () => {
    const groups = groupOpenWorkByPosition(
      [item({ responsiblePosition: null, responsibleEmployee: { id: "e1", name: "Maria Diaz", role: "crew" } })],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups[0].label).toBe("Maria Diaz");
  });

  it("collects work with no owner into its own reviewable bucket instead of hiding it", () => {
    const groups = groupOpenWorkByPosition(
      [item({ responsiblePosition: null, responsibleEmployee: null, title: "Nobody owns this" })],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("No position recorded");
    expect(groups[0].days[0].items[0].title).toBe("Nobody owns this");
  });

  it("drops finished work and work outside the range", () => {
    const groups = groupOpenWorkByPosition(
      [
        item({ stableId: "task:1", title: "Done already", status: "completed" }),
        item({ stableId: "task:2", title: "Next month", dueDate: "2026-08-30" }),
        item({ stableId: "task:3", title: "Real work" }),
      ],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].days.flatMap((day) => day.items).map((row) => row.title)).toEqual(["Real work"]);
  });

  it("splits a multi-day range into dated day sections in chronological order", () => {
    const groups = groupOpenWorkByPosition(
      [
        item({ stableId: "task:1", title: "Later", dueDate: "2026-07-28" }),
        item({ stableId: "task:2", title: "Sooner", dueDate: "2026-07-26" }),
        item({ stableId: "task:3", title: "Overdue", dueDate: "2026-07-20" }),
      ],
      today,
      POSITION_PRINT_RANGES.week,
    );
    expect(groups[0].days.map((day) => day.key)).toEqual(["2026-07-20", "2026-07-26", "2026-07-28"]);
    expect(groups[0].days[0].label).toContain("Overdue");
  });
});

describe("printable position sheets", () => {
  const items = [
    item({ stableId: "task:1", title: "Mow greens", responsiblePosition: "maintenance_staff" }),
    item({ stableId: "task:2", title: "Open pro shop", responsiblePosition: "pro_shop_staff" }),
  ];

  it("renders one self-contained page per position", () => {
    const html = buildPositionListsPrintHtml(items, today, POSITION_PRINT_RANGES.today);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Maintenance Staff");
    expect(html).toContain("Pro-Shop Staff");
    expect(html).toContain("Mow greens");
    expect(html).toContain("Open pro shop");
  });

  it("escapes untrusted text", () => {
    const html = buildPositionListsPrintHtml(
      [item({ title: "<script>alert(1)</script> A & B" })],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("explains an empty result instead of printing a blank page", () => {
    expect(buildPositionListsPrintHtml([], today, POSITION_PRINT_RANGES.today))
      .toContain("No open work");
  });
});
