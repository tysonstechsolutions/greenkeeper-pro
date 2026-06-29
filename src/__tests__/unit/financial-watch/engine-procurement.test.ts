import { describe, it, expect } from "vitest";
import { analyzeProcurement } from "@/lib/financial-watch/engine";
import type { CostCenterRollup } from "@/lib/pr-audit/rollup";

const FY = 2026;
const MID_FY = new Date("2026-04-01T12:00:00"); // ~half through FY26 (Oct–Sep)

function cc(
  p: Partial<CostCenterRollup> & { cost_ctr: string },
): CostCenterRollup {
  const budget = p.budget ?? 0;
  const spent = p.spent ?? 0;
  const pending = p.pending ?? 0;
  return {
    cost_ctr: p.cost_ctr,
    label: p.label ?? p.cost_ctr,
    category: p.category ?? null,
    categoryId: p.categoryId ?? null,
    budget,
    monthlyBudget: p.monthlyBudget ?? new Array(12).fill(budget / 12),
    spent,
    pending,
    remaining: p.remaining ?? budget - spent,
    percentUsed:
      p.percentUsed ?? (budget > 0 ? Math.round((spent / budget) * 100) : spent > 0 ? 100 : 0),
    byMonth: p.byMonth ?? [],
    known: p.known ?? true,
  };
}

describe("analyzeProcurement — metrics", () => {
  it("totals committed spend, pipeline, and budget across cost centers", () => {
    const rollup = [
      cc({ cost_ctr: "25581", budget: 100_000, spent: 40_000, pending: 10_000 }),
      cc({ cost_ctr: "20087", budget: 50_000, spent: 30_000, pending: 5_000 }),
    ];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    expect(a.totalBudget).toBe(150_000);
    expect(a.totalSpent).toBe(70_000);
    expect(a.totalPending).toBe(15_000);
    expect(a.remaining).toBe(80_000);
  });

  it("adds pace and projection per cost center", () => {
    const rollup = [cc({ cost_ctr: "25581", budget: 10_000, spent: 7_000 })];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    const row = a.byCostCenter.find((c) => c.costCtr === "25581")!;
    expect(row.paceRatio!).toBeCloseTo(1.4, 1);
    expect(row.projectedSpend!).toBeGreaterThan(row.budget);
  });

  it("separates committed spend that has no cost center", () => {
    const rollup = [
      cc({ cost_ctr: "25581", budget: 10_000, spent: 4_000 }),
      cc({ cost_ctr: "", spent: 2_000, known: false }),
    ];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    expect(a.unassignedSpent).toBe(2_000);
    expect(a.byCostCenter.some((c) => c.costCtr === "")).toBe(false);
  });
});

describe("analyzeProcurement — flags", () => {
  it("flags a cost center over budget", () => {
    const rollup = [cc({ cost_ctr: "25581", budget: 5_000, spent: 6_000 })];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    const f = a.flags.find((x) => x.id === "procurement:over-budget:25581");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
  });

  it("flags a cost center spending faster than the fiscal year", () => {
    const rollup = [cc({ cost_ctr: "25581", budget: 10_000, spent: 7_000 })];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    expect(a.flags.find((x) => x.id === "procurement:over-pace:25581")).toBeDefined();
  });

  it("flags pipeline that would exceed the remaining budget", () => {
    const rollup = [cc({ cost_ctr: "25581", budget: 10_000, spent: 5_000, pending: 6_000 })];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    expect(
      a.flags.find((x) => x.id === "procurement:pipeline-exceeds:25581"),
    ).toBeDefined();
  });

  it("flags committed spend with no cost center", () => {
    const rollup = [
      cc({ cost_ctr: "25581", budget: 10_000, spent: 4_000 }),
      cc({ cost_ctr: "", spent: 2_000, known: false }),
    ];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    expect(a.flags.find((x) => x.id === "procurement:unassigned")).toBeDefined();
  });

  it("suggests setting cost-center budgets when none exist but money is moving", () => {
    const rollup = [cc({ cost_ctr: "25581", budget: 0, spent: 3_000 })];
    const a = analyzeProcurement(rollup, FY, MID_FY);
    expect(a.flags.find((x) => x.id === "procurement:no-budgets")).toBeDefined();
  });
});
