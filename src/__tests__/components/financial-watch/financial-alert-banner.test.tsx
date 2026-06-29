import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "../../utils/test-utils";
import { FinancialAlertBanner } from "@/components/features/financial-watch/financial-alert-banner";
import { flagHref } from "@/components/features/financial-watch/severity";
import { buildFinancialWatch } from "@/lib/financial-watch/engine";
import type { FinancialWatchInput } from "@/lib/financial-watch/types";

const NOW = new Date("2026-07-02T12:00:00");

function watchWith(over: Partial<FinancialWatchInput>) {
  return buildFinancialWatch({
    now: NOW,
    calendarYear: 2026,
    fiscalYear: 2026,
    budgetItems: [],
    expenses: [],
    revenueEntries: [],
    procurement: [],
    ...over,
  });
}

const alertWatch = watchWith({
  budgetItems: [
    { id: "fert", fiscal_year: 2026, category: "fertilizer", budgeted_amount: 5_000, month: null },
  ],
  expenses: [
    { amount: 6_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "fert", vendor: null, description: "" },
  ],
});

const okWatch = watchWith({
  budgetItems: [
    { id: "labor", fiscal_year: 2026, category: "labor", budgeted_amount: 100_000, month: null },
  ],
  expenses: [
    { amount: 40_000, expense_date: "2026-03-01", status: "approved", budget_item_id: "labor", vendor: null, description: "" },
  ],
});

describe("FinancialAlertBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows a proactive alert when there are critical flags", () => {
    render(<FinancialAlertBanner watch={alertWatch} />);
    expect(screen.getByText(/need your attention/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /financial watch/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("/financial-watch");
  });

  it("renders nothing when finances are on track", () => {
    const { container } = render(<FinancialAlertBanner watch={okWatch} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when there's no data yet", () => {
    const { container } = render(<FinancialAlertBanner watch={null} />);
    expect(container.textContent).toBe("");
  });
});

describe("flagHref", () => {
  it("routes a no-cost-center-budgets flag to the PR Audit budget page", () => {
    const w = watchWith({
      procurement: [
        {
          cost_ctr: "25581",
          label: "Maintenance",
          category: null,
          categoryId: null,
          budget: 0,
          monthlyBudget: new Array(12).fill(0),
          spent: 3_000,
          pending: 0,
          remaining: -3_000,
          percentUsed: 100,
          byMonth: [],
          known: true,
        },
      ],
    });
    const flag = w.flags.find((f) => f.id === "procurement:no-budgets")!;
    expect(flagHref(flag)).toBe("/pr-audit/budget");
  });

  it("routes an over-budget operating flag to the budget page", () => {
    const flag = alertWatch.flags.find((f) => f.id.startsWith("operating:over-budget"))!;
    expect(flagHref(flag)).toBe("/budget");
  });
});
