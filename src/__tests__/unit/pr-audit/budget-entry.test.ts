/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  splitAnnualToMonths,
  fiscalIndexToCalendarMonth,
  buildMonthlyBudgetRows,
  monthlyFromRows,
} from "@/lib/pr-audit/budget-entry";

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe("splitAnnualToMonths", () => {
  it("splits an evenly-divisible amount into twelve equal months", () => {
    const months = splitAnnualToMonths(1200);
    expect(months).toHaveLength(12);
    expect(months.every((m) => m === 100)).toBe(true);
    expect(sum(months)).toBe(1200);
  });

  it("is cents-exact when the amount doesn't divide evenly", () => {
    const months = splitAnnualToMonths(100);
    expect(months).toHaveLength(12);
    // Every month is within a cent of 100/12.
    expect(months.every((m) => m === 8.33 || m === 8.34)).toBe(true);
    // The 12 months sum EXACTLY back to the annual — no rounding drift.
    expect(sum(months)).toBe(100);
  });

  it("handles an awkward dollar-and-cents annual without drift", () => {
    const months = splitAnnualToMonths(1000.01);
    expect(sum(months)).toBe(1000.01);
  });

  it("returns all zeros for a zero (or cleared) budget", () => {
    expect(splitAnnualToMonths(0)).toEqual(new Array(12).fill(0));
  });
});

describe("fiscalIndexToCalendarMonth", () => {
  it("maps fiscal index (0=Oct) to calendar month (1-12)", () => {
    expect(fiscalIndexToCalendarMonth(0)).toBe(10); // Oct
    expect(fiscalIndexToCalendarMonth(1)).toBe(11); // Nov
    expect(fiscalIndexToCalendarMonth(2)).toBe(12); // Dec
    expect(fiscalIndexToCalendarMonth(3)).toBe(1); // Jan
    expect(fiscalIndexToCalendarMonth(11)).toBe(9); // Sep
  });

  it("inverts the rollup's calendar->fiscal mapping", () => {
    for (let fi = 0; fi < 12; fi++) {
      const cal = fiscalIndexToCalendarMonth(fi);
      const back = (cal - 10 + 12) % 12; // the rollup's cal->fiscal formula
      expect(back).toBe(fi);
    }
  });
});

describe("buildMonthlyBudgetRows", () => {
  it("emits one row per non-zero month with the right calendar month", () => {
    const monthly = splitAnnualToMonths(1200); // twelve 100s
    const rows = buildMonthlyBudgetRows({
      fiscalYear: 2026,
      costCtr: "25581",
      monthly,
      createdBy: "user-1",
    });
    expect(rows).toHaveLength(12);
    // Oct is the first fiscal month -> calendar month 10.
    expect(rows[0]).toMatchObject({
      fiscal_year: 2026,
      cost_ctr: "25581",
      month: 10,
      annual_amount: 100,
      created_by: "user-1",
    });
    // Calendar months present are exactly 1..12.
    expect(rows.map((r) => r.month).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // Stored amounts sum to the annual.
    expect(sum(rows.map((r) => r.annual_amount))).toBe(1200);
  });

  it("skips zero months so seasonal budgets stay lean", () => {
    // Spend only in Apr (fiscal index 6) and May (index 7).
    const monthly = new Array(12).fill(0);
    monthly[6] = 500;
    monthly[7] = 750;
    const rows = buildMonthlyBudgetRows({
      fiscalYear: 2026,
      costCtr: "25583",
      monthly,
      createdBy: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.month).sort((a, b) => a - b)).toEqual([4, 5]); // Apr, May
    expect(sum(rows.map((r) => r.annual_amount))).toBe(1250);
  });

  it("returns no rows when every month is zero", () => {
    expect(
      buildMonthlyBudgetRows({
        fiscalYear: 2026,
        costCtr: "25581",
        monthly: new Array(12).fill(0),
        createdBy: null,
      }),
    ).toEqual([]);
  });
});

describe("monthlyFromRows", () => {
  it("places each monthly row in its fiscal slot (Oct first)", () => {
    const rows = [
      { cost_ctr: "25581", month: 10, annual_amount: 100 }, // Oct -> idx 0
      { cost_ctr: "25581", month: 1, annual_amount: 200 }, // Jan -> idx 3
      { cost_ctr: "25581", month: 9, annual_amount: 300 }, // Sep -> idx 11
    ];
    const monthly = monthlyFromRows(rows, "25581");
    expect(monthly[0]).toBe(100);
    expect(monthly[3]).toBe(200);
    expect(monthly[11]).toBe(300);
    expect(sum(monthly)).toBe(600);
  });

  it("spreads a legacy whole-year (null-month) row evenly", () => {
    const rows = [{ cost_ctr: "25581", month: null, annual_amount: 1200 }];
    const monthly = monthlyFromRows(rows, "25581");
    expect(monthly.every((m) => m === 100)).toBe(true);
    expect(sum(monthly)).toBe(1200);
  });

  it("ignores rows for other cost centers", () => {
    const rows = [
      { cost_ctr: "25581", month: 10, annual_amount: 100 },
      { cost_ctr: "25583", month: 10, annual_amount: 999 },
    ];
    expect(sum(monthlyFromRows(rows, "25581"))).toBe(100);
  });

  it("returns all zeros when the cost center has no rows", () => {
    expect(monthlyFromRows([], "25581")).toEqual(new Array(12).fill(0));
  });

  it("round-trips through buildMonthlyBudgetRows", () => {
    const annual = 1000.01;
    const rows = buildMonthlyBudgetRows({
      fiscalYear: 2026,
      costCtr: "25581",
      monthly: splitAnnualToMonths(annual),
      createdBy: null,
    });
    const back = monthlyFromRows(
      rows.map((r) => ({ cost_ctr: r.cost_ctr, month: r.month, annual_amount: r.annual_amount })),
      "25581",
    );
    expect(sum(back)).toBe(annual);
  });
});
