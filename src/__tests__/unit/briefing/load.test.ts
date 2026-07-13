import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  directSelectList: vi.fn(),
}));

vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: mocks.directSelectList,
}));

import { loadLeadershipBriefing } from "@/lib/briefing/load";

describe("loadLeadershipBriefing", () => {
  beforeEach(() => {
    mocks.directSelectList.mockReset();
    mocks.directSelectList.mockImplementation(async (table: string) => {
      if (table === "revenue_monthly_rollup") {
        return [{ month: "2026-09-01", category: "green_fees", total: "1500.00" }];
      }
      if (table === "pr_spend_monthly_rollup") {
        return [{ month: "2026-09-01", cost_ctr: "11000", total: "400.00" }];
      }
      return [];
    });
  });

  it("loads only the approved source map and passes it to the deterministic engine", async () => {
    const briefing = await loadLeadershipBriefing({
      asOf: "2026-09-30",
      generatedAt: "2026-09-30T17:00:00.000Z",
    });

    expect(mocks.directSelectList.mock.calls.map(([table]) => table)).toEqual([
      "revenue_monthly_rollup",
      "pr_spend_monthly_rollup",
      "budget_items",
      "purchase_requests",
      "equipment",
      "hole_observations",
      "obligations",
      "obligation_completions",
      "profiles",
      "certifications",
      "work_orders",
      "restaurant_purchases",
      "inventory_items",
      "capital_projects",
      "staff_records",
    ]);
    expect(briefing.financial.data.revenueTotal).toMatchObject({
      value: 1500,
      availability: "recorded",
    });
    expect(briefing.financial.data.prCommittedOrderedSpendTotal).toMatchObject({
      value: 400,
      availability: "recorded",
    });
  });
});
