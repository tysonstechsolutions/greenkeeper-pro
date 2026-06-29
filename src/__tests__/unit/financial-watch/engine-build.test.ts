import { describe, it, expect } from "vitest";
import { buildFinancialWatch } from "@/lib/financial-watch/engine";
import type { FinancialWatchInput } from "@/lib/financial-watch/types";

const NOW = new Date("2026-07-02T12:00:00");

function input(over: Partial<FinancialWatchInput> = {}): FinancialWatchInput {
  return {
    now: NOW,
    calendarYear: 2026,
    fiscalYear: 2026,
    budgetItems: [],
    expenses: [],
    revenueEntries: [],
    procurement: [],
    ...over,
  };
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

describe("buildFinancialWatch", () => {
  it("merges all lens flags and ranks them critical-first", () => {
    const w = buildFinancialWatch(
      input({
        budgetItems: [
          { id: "fert", fiscal_year: 2026, category: "fertilizer", budgeted_amount: 5_000, month: null },
          { id: "fuel", fiscal_year: 2026, category: "fuel", budgeted_amount: 10_000, month: null },
        ],
        expenses: [
          { amount: 6_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "fert", vendor: null, description: "" },
          { amount: 7_000, expense_date: "2026-02-01", status: "approved", budget_item_id: "fuel", vendor: null, description: "" },
        ],
        revenueEntries: [
          { entry_date: "2026-06-25", category: "greens_fees", amount: 8_000, rounds_count: 120 },
        ],
      }),
    );
    expect(w.flags.length).toBeGreaterThan(0);
    // Non-increasing severity order.
    const ranks = w.flags.map((f) => SEVERITY_RANK[f.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(w.flags[0].severity).toBe("critical");
  });

  it("counts criticals and warnings and sets overallStatus to alert", () => {
    const w = buildFinancialWatch(
      input({
        budgetItems: [
          { id: "fert", fiscal_year: 2026, category: "fertilizer", budgeted_amount: 5_000, month: null },
        ],
        expenses: [
          { amount: 6_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "fert", vendor: null, description: "" },
        ],
      }),
    );
    expect(w.headline.criticalCount).toBeGreaterThanOrEqual(1);
    expect(w.headline.overallStatus).toBe("alert");
    expect(w.headline.topFlags.length).toBeGreaterThan(0);
  });

  it("computes net position YTD as revenue minus operating spend", () => {
    const w = buildFinancialWatch(
      input({
        budgetItems: [
          { id: "labor", fiscal_year: 2026, category: "labor", budgeted_amount: 100_000, month: null },
        ],
        expenses: [
          { amount: 13_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "labor", vendor: null, description: "" },
        ],
        revenueEntries: [
          { entry_date: "2026-06-25", category: "greens_fees", amount: 8_000, rounds_count: 120 },
        ],
      }),
    );
    expect(w.headline.netPositionYtd).toBe(-5_000);
  });

  it("nulls net position when only prior-year revenue exists (no current-year data)", () => {
    const w = buildFinancialWatch(
      input({
        budgetItems: [
          { id: "labor", fiscal_year: 2026, category: "labor", budgeted_amount: 100_000, month: null },
        ],
        expenses: [
          { amount: 10_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "labor", vendor: null, description: "" },
        ],
        // Prior-year revenue only — nothing logged for the current year yet.
        revenueEntries: [
          { entry_date: "2025-06-10", category: "greens_fees", amount: 5_000, rounds_count: 80 },
        ],
      }),
    );
    expect(w.headline.netPositionYtd).toBeNull();
  });

  it("reports an ok status and null net position when there's nothing to flag", () => {
    const w = buildFinancialWatch(
      input({
        budgetItems: [
          { id: "labor", fiscal_year: 2026, category: "labor", budgeted_amount: 100_000, month: null },
        ],
        expenses: [
          { amount: 40_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "labor", vendor: null, description: "" },
        ],
      }),
    );
    expect(w.flags).toHaveLength(0);
    expect(w.headline.overallStatus).toBe("ok");
    expect(w.headline.netPositionYtd).toBeNull();
  });

  it("stamps generatedAt from the injected now", () => {
    const w = buildFinancialWatch(input());
    expect(w.generatedAt).toBe(NOW.toISOString());
  });
});
