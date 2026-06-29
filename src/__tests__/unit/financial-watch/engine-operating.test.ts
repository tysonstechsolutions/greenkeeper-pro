import { describe, it, expect } from "vitest";
import { analyzeOperatingBudget } from "@/lib/financial-watch/engine";
import type { BudgetItemInput, ExpenseInput } from "@/lib/financial-watch/types";

const YEAR = 2026;
const MID_YEAR = new Date("2026-07-02T12:00:00"); // ~50% through the year

function item(partial: Partial<BudgetItemInput> & { id: string }): BudgetItemInput {
  return {
    fiscal_year: YEAR,
    category: "labor",
    budgeted_amount: 0,
    month: null,
    ...partial,
  };
}

function expense(partial: Partial<ExpenseInput>): ExpenseInput {
  return {
    amount: 0,
    expense_date: "2026-03-15",
    status: "approved",
    budget_item_id: null,
    vendor: null,
    description: "",
    ...partial,
  };
}

describe("analyzeOperatingBudget — metrics", () => {
  it("counts only approved and paid expenses as spent", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [
      expense({ amount: 10_000, status: "approved", budget_item_id: "labor" }),
      expense({ amount: 5_000, status: "paid", budget_item_id: "labor" }),
      expense({ amount: 99_000, status: "pending", budget_item_id: "labor" }),
      expense({ amount: 88_000, status: "denied", budget_item_id: "labor" }),
    ];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    const labor = a.byCategory.find((c) => c.category === "labor")!;
    expect(labor.spent).toBe(15_000);
    expect(a.totalSpent).toBe(15_000);
    expect(a.pendingCount).toBe(1);
    expect(a.pendingTotal).toBe(99_000);
  });

  it("counts unbucketed spend in the total but not in any category", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [
      expense({ amount: 10_000, status: "approved", budget_item_id: "labor" }),
      expense({ amount: 3_000, status: "approved", budget_item_id: null }),
    ];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.byCategory.find((c) => c.category === "labor")!.spent).toBe(10_000);
    expect(a.unbucketedSpent).toBe(3_000);
    expect(a.totalSpent).toBe(13_000);
  });

  it("computes remaining and percentUsed per category", () => {
    const items = [item({ id: "fuel", category: "fuel", budgeted_amount: 10_000 })];
    const expenses = [expense({ amount: 7_000, status: "approved", budget_item_id: "fuel" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    const fuel = a.byCategory.find((c) => c.category === "fuel")!;
    expect(fuel.remaining).toBe(3_000);
    expect(fuel.percentUsed).toBe(70);
  });

  it("buckets spend by calendar month", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [
      expense({ amount: 1_000, status: "approved", budget_item_id: "labor", expense_date: "2026-02-10" }),
      expense({ amount: 2_000, status: "approved", budget_item_id: "labor", expense_date: "2026-02-20" }),
      expense({ amount: 500, status: "approved", budget_item_id: "labor", expense_date: "2026-05-01" }),
    ];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.monthlySpend[1]).toBe(3_000); // Feb (index 1)
    expect(a.monthlySpend[4]).toBe(500); // May (index 4)
    expect(a.monthlySpend).toHaveLength(12);
  });

  it("projects full-year spend from the current pace", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [expense({ amount: 25_000, status: "approved", budget_item_id: "labor" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    // ~50k; not exact because real elapsed time includes the March DST hour.
    expect(a.projectedSpend!).toBeGreaterThan(49_500);
    expect(a.projectedSpend!).toBeLessThan(50_500);
  });
});

describe("analyzeOperatingBudget — flags", () => {
  it("flags a category over budget", () => {
    const items = [item({ id: "fert", category: "fertilizer", budgeted_amount: 5_000 })];
    const expenses = [expense({ amount: 6_000, status: "approved", budget_item_id: "fert" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    const f = a.flags.find((x) => x.id === "operating:over-budget:fertilizer");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
  });

  it("flags a category spending faster than the calendar", () => {
    const items = [item({ id: "fuel", category: "fuel", budgeted_amount: 10_000 })];
    const expenses = [expense({ amount: 7_000, status: "approved", budget_item_id: "fuel" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    const f = a.flags.find((x) => x.id === "operating:over-pace:fuel");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("flags spend against a zero-dollar budget", () => {
    const items = [item({ id: "chem", category: "chemicals", budgeted_amount: 0 })];
    const expenses = [expense({ amount: 1_500, status: "approved", budget_item_id: "chem" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.flags.find((x) => x.id === "operating:no-budget:chemicals")).toBeDefined();
  });

  it("flags material unbucketed spend", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [
      expense({ amount: 17_000, status: "approved", budget_item_id: "labor" }),
      expense({ amount: 3_000, status: "approved", budget_item_id: null }),
    ];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.flags.find((x) => x.id === "operating:unbucketed")).toBeDefined();
  });

  it("flags possible duplicate expenses", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [
      expense({ amount: 1_200, status: "approved", budget_item_id: "labor", vendor: "Acme", expense_date: "2026-05-01" }),
      expense({ amount: 1_200, status: "approved", budget_item_id: "labor", vendor: "Acme", expense_date: "2026-05-01" }),
    ];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.flags.some((x) => x.id.startsWith("operating:duplicate:"))).toBe(true);
  });

  it("flags a negative expense amount", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [expense({ amount: -500, status: "approved", budget_item_id: "labor", vendor: "Oops" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.flags.find((x) => x.id === "operating:negative-amount")).toBeDefined();
  });

  it("flags an overall projected overrun", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    // 70k spent at the half-year → projects to ~140k vs 100k budget.
    const expenses = [expense({ amount: 70_000, status: "approved", budget_item_id: "labor" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.flags.find((x) => x.id === "operating:projected-overrun")).toBeDefined();
  });

  it("stays quiet when everything is on track", () => {
    const items = [item({ id: "labor", category: "labor", budgeted_amount: 100_000 })];
    const expenses = [expense({ amount: 40_000, status: "approved", budget_item_id: "labor" })];
    const a = analyzeOperatingBudget(items, expenses, YEAR, MID_YEAR);
    expect(a.flags).toHaveLength(0);
  });
});
