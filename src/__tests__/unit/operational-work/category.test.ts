import { describe, expect, it } from "vitest";
import { categoryOf } from "@/lib/operational-work/category";
import { applyOperationalFilters, EMPTY_OPERATIONAL_FILTERS } from "@/lib/operational-work/filters";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

const today = new Date(2026, 6, 22);

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
    dueDate: null,
    estimatedMinutes: null,
    priorityBand: "normal",
    priorityScore: 0,
    priorityExplanation: [],
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

describe("categoryOf", () => {
  it("maps food_and_beverage to restaurant", () => {
    expect(categoryOf(item({ department: "food_and_beverage" }))).toBe("restaurant");
  });

  it("maps pro_shop (and golf_operations) to pro_shop", () => {
    expect(categoryOf(item({ department: "pro_shop" }))).toBe("pro_shop");
    expect(categoryOf(item({ department: "golf_operations" }))).toBe("pro_shop");
  });

  it("maps maintenance to grounds", () => {
    expect(categoryOf(item({ department: "maintenance" }))).toBe("grounds");
  });

  it("maps equipment-sourced work to grounds even without a department", () => {
    expect(categoryOf(item({ sourceType: "equipment", department: null }))).toBe("grounds");
  });

  it("maps administration to admin", () => {
    expect(categoryOf(item({ department: "administration" }))).toBe("admin");
  });

  it("falls through to admin for a null department", () => {
    expect(categoryOf(item({ department: null }))).toBe("admin");
  });
});

describe("applyOperationalFilters category filter", () => {
  const items = [
    item({ stableId: "a", department: "food_and_beverage" }),
    item({ stableId: "b", department: "pro_shop" }),
    item({ stableId: "c", department: "maintenance" }),
    item({ stableId: "d", sourceType: "equipment", department: null }),
    item({ stableId: "e", department: "administration" }),
    item({ stableId: "f", department: null }),
  ];

  it("keeps only restaurant items when category is restaurant", () => {
    const result = applyOperationalFilters(items, { ...EMPTY_OPERATIONAL_FILTERS, category: "restaurant" }, today);
    expect(result.map((row) => row.stableId)).toEqual(["a"]);
  });

  it("keeps only grounds items (maintenance + equipment) when category is grounds", () => {
    const result = applyOperationalFilters(items, { ...EMPTY_OPERATIONAL_FILTERS, category: "grounds" }, today);
    expect(result.map((row) => row.stableId)).toEqual(["c", "d"]);
  });

  it("keeps every item when category is all", () => {
    const result = applyOperationalFilters(items, { ...EMPTY_OPERATIONAL_FILTERS, category: "all" }, today);
    expect(result).toHaveLength(items.length);
  });
});

describe("applyOperationalFilters position filter", () => {
  // Duty occurrences carry lowercase role groups ("mechanic"); Program
  // Standards carry free-text owner roles that may be capitalised
  // ("Mechanic"). One choice in the filter must match both.
  const items = [
    item({ stableId: "duty", responsiblePosition: "mechanic" }),
    item({ stableId: "standard", responsiblePosition: "Mechanic" }),
    item({ stableId: "other", responsiblePosition: "recreation_aide" }),
    item({ stableId: "none", responsiblePosition: null }),
  ];

  it("matches every case variant of the chosen position", () => {
    const result = applyOperationalFilters(items, { ...EMPTY_OPERATIONAL_FILTERS, position: "mechanic" }, today);
    expect(result.map((row) => row.stableId)).toEqual(["duty", "standard"]);
  });

  it("still excludes other positions and unpositioned work", () => {
    const result = applyOperationalFilters(items, { ...EMPTY_OPERATIONAL_FILTERS, position: "recreation_aide" }, today);
    expect(result.map((row) => row.stableId)).toEqual(["other"]);
  });
});
