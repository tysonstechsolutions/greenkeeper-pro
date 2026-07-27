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
    dutySeriesKey: null,
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

  it("keeps undated work from other sources, such as a one-off crew task", () => {
    const task = item({ sourceType: "task", dueDate: null, responsiblePosition: "maintenance_staff" });
    expect(workInPrintRange(task, today, POSITION_PRINT_RANGES.today)).toBe(true);
  });
});

describe("crew sheets carry crew work only", () => {
  // These sheets are handed to employees or posted on a wall. The GM works out
  // of the command center, so nothing that belongs to him should print.
  function sheetLabels(items: OperationalWorkItem[]) {
    return groupOpenWorkByPosition(items, today, POSITION_PRINT_RANGES.today).map((group) => group.label);
  }

  it("prints a sheet for each crew role group", () => {
    expect(sheetLabels([
      item({ stableId: "a", responsiblePosition: "recreation_aide" }),
      item({ stableId: "b", responsiblePosition: "maintenance_staff" }),
      item({ stableId: "c", responsiblePosition: "restaurant_staff" }),
      item({ stableId: "d", responsiblePosition: "pro_shop_staff" }),
      item({ stableId: "e", responsiblePosition: "golf_operations_assistant" }),
      item({ stableId: "f", responsiblePosition: "contractor" }),
    ])).toEqual([
      "Contractors", "Golf Operations Assistants", "Maintenance Staff",
      "Pro-Shop Staff", "Recreation Aides", "Restaurant Staff",
    ]);
  });

  it("never prints a Program Standard, whatever role owns it", () => {
    // All 93 are Navy program standards owned by manager roles ("Crew",
    // "Mechanic", "GCM"); they are the GM's improvement backlog, not shift work.
    expect(sheetLabels([
      item({ sourceType: "standard", responsiblePosition: "Crew", dueDate: "2026-07-25" }),
      item({ sourceType: "standard", responsiblePosition: "maintenance_staff", dueDate: null }),
    ])).toEqual([]);
  });

  it("never prints the General Manager's own work", () => {
    expect(sheetLabels([
      item({ responsiblePosition: "general_manager" }),
      item({ sourceType: "step", responsiblePosition: null, responsibleEmployee: { id: "gm", name: "Tyson", role: "gm" } }),
      item({ sourceType: "purchase_request", responsiblePosition: null, responsibleEmployee: null }),
    ])).toEqual([]);
  });

  it("does not print manager-only roles that only exist as free text", () => {
    expect(sheetLabels([
      item({ responsiblePosition: "GCM" }),
      item({ responsiblePosition: "Superintendent" }),
      item({ responsiblePosition: "Leadership" }),
      item({ sourceType: "equipment", responsiblePosition: "mechanic" }),
    ])).toEqual([]);
  });

  it("groups by position even when a named owner is recorded", () => {
    const groups = groupOpenWorkByPosition(
      [item({ responsiblePosition: "maintenance_staff", responsibleEmployee: { id: "r", name: "Rosie Lloyd", role: "crew" } })],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups.map((group) => group.label)).toEqual(["Maintenance Staff"]);
    expect(groups[0].days[0].items[0].responsibleEmployee?.name).toBe("Rosie Lloyd");
  });

  it("names the responsible person on the printed line when one is recorded", () => {
    const html = buildPositionListsPrintHtml(
      [
        item({ stableId: "a", title: "Mow greens", responsiblePosition: "maintenance_staff", responsibleEmployee: { id: "r", name: "Rosie Lloyd", role: "crew" } }),
        item({ stableId: "b", title: "Rake bunkers", responsiblePosition: "maintenance_staff" }),
      ],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(html).toContain("Rosie Lloyd");
    expect(html).toContain("Rake bunkers");
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
    // Two sheets for the same role is a printing bug, not two positions.
    const groups = groupOpenWorkByPosition(
      [
        item({ stableId: "task:1", title: "Mow greens", responsiblePosition: "maintenance_staff" }),
        item({ stableId: "task:2", title: "Rake bunkers", responsiblePosition: "Maintenance_Staff" }),
      ],
      today,
      POSITION_PRINT_RANGES.today,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Maintenance Staff");
    expect(groups[0].days.flatMap((day) => day.items)).toHaveLength(2);
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
    const html = buildPositionListsPrintHtml([], today, POSITION_PRINT_RANGES.today);
    expect(html).toContain("No open crew work");
    expect(html).toContain("Operations Command Center");
  });
});
