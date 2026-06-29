import { describe, it, expect } from "vitest";
import { buildFinancialWatch } from "@/lib/financial-watch/engine";
import { serializeForAdvisor } from "@/lib/financial-watch/advisor-context";
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

describe("serializeForAdvisor", () => {
  const watch = buildFinancialWatch(
    input({
      budgetItems: [
        { id: "fert", fiscal_year: 2026, category: "fertilizer", budgeted_amount: 5_000, month: null },
      ],
      expenses: [
        { amount: 6_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "fert", vendor: null, description: "" },
      ],
      revenueEntries: [
        { entry_date: "2026-06-25", category: "greens_fees", amount: 8_000, rounds_count: 120 },
      ],
    }),
  );
  const text = serializeForAdvisor(watch);

  it("includes the three lens section headers", () => {
    expect(text).toMatch(/OPERATING BUDGET/i);
    expect(text).toMatch(/PROCUREMENT/i);
    expect(text).toMatch(/REVENUE/i);
  });

  it("includes the overall status and flag counts", () => {
    expect(text).toMatch(/critical/i);
    expect(text).toMatch(/warning/i);
  });

  it("includes each flag's title and detail with real numbers", () => {
    expect(text).toContain("Fertilizer over budget");
    expect(text).toContain("$6,000");
    expect(text).toContain("$5,000");
  });

  it("includes real revenue figures", () => {
    expect(text).toContain("$8,000");
  });

  it("states when nothing is flagged", () => {
    const clean = buildFinancialWatch(
      input({
        budgetItems: [
          { id: "labor", fiscal_year: 2026, category: "labor", budgeted_amount: 100_000, month: null },
        ],
        expenses: [
          { amount: 40_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "labor", vendor: null, description: "" },
        ],
      }),
    );
    expect(serializeForAdvisor(clean)).toMatch(/no (flags|issues)/i);
  });
});
