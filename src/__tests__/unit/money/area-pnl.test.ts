import { describe, expect, it } from "vitest";
import {
  computeAreaPnl,
  fiscalYearStart,
  monthKey,
  type RevenueRollupRow,
  type SpendRollupRow,
} from "@/lib/money/area-pnl";
import { areaForCostCenter, areaForRevenueCategory } from "@/lib/money/areas";

const TODAY = new Date(2026, 6, 15); // Jul 15 2026 → FY26 started Oct 1 2025

function rev(month: string, category: string, total: number): RevenueRollupRow {
  return { month, category, total };
}

function spend(month: string, cost_ctr: string | null, total: number): SpendRollupRow {
  return { month, cost_ctr, total };
}

describe("area mappings", () => {
  it("maps every revenue category to an area", () => {
    for (const c of [
      "greens_fees",
      "cart_rentals",
      "pro_shop",
      "food_beverage",
      "events",
      "memberships",
      "driving_range",
      "other",
    ]) {
      expect(areaForRevenueCategory(c)).toBeTruthy();
    }
  });

  it("maps the five NAF cost centers; unknown codes go to unassigned", () => {
    expect(areaForCostCenter("20086")).toBe("pro_shop");
    expect(areaForCostCenter("25224")).toBe("range");
    expect(areaForCostCenter("25581")).toBe("course");
    expect(areaForCostCenter("99999")).toBe("unassigned");
    expect(areaForCostCenter(null)).toBe("unassigned");
    expect(areaForCostCenter(" 20087 ")).toBe("course"); // whitespace tolerated
  });
});

describe("fiscalYearStart / monthKey", () => {
  it("uses Oct 1 of the prior year before October", () => {
    expect(fiscalYearStart(new Date(2026, 6, 15)).getFullYear()).toBe(2025);
    expect(fiscalYearStart(new Date(2026, 8, 30)).getMonth()).toBe(9);
  });
  it("rolls forward in October", () => {
    const s = fiscalYearStart(new Date(2026, 9, 1));
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(9);
  });
  it("monthKey matches the rollup views' month column format", () => {
    expect(monthKey(new Date(2026, 6, 15))).toBe("2026-07-01");
    expect(monthKey(new Date(2026, 0, 31))).toBe("2026-01-01");
  });
});

describe("computeAreaPnl", () => {
  it("splits revenue and spend by area with correct nets", () => {
    const revenue = [
      rev("2026-07-01", "greens_fees", 1000),
      rev("2026-07-01", "cart_rentals", 200), // course
      rev("2026-07-01", "pro_shop", 300),
      rev("2026-07-01", "food_beverage", 400),
      rev("2026-07-01", "driving_range", 150),
    ];
    const spendRows = [
      spend("2026-07-01", "25581", 200), // course
      spend("2026-07-01", "20086", 50), // pro_shop
    ];
    const out = computeAreaPnl(revenue, spendRows, TODAY);
    const month = Object.fromEntries(out.month.map((r) => [r.area, r]));
    expect(month.course.revenue).toBe(1200);
    expect(month.course.spend).toBe(200);
    expect(month.course.net).toBe(1000);
    expect(month.pro_shop.revenue).toBe(300);
    expect(month.pro_shop.spend).toBe(50);
    expect(month.restaurant.revenue).toBe(400);
    expect(month.range.revenue).toBe(150);
  });

  it("month window excludes prior months; FY window includes them but not pre-FY", () => {
    const revenue = [
      rev("2026-06-01", "greens_fees", 500), // prior month, same FY
      rev("2026-07-01", "greens_fees", 100),
      rev("2025-09-01", "greens_fees", 9999), // BEFORE Oct 1 2025 → outside FY26
    ];
    const out = computeAreaPnl(revenue, [], TODAY);
    const month = Object.fromEntries(out.month.map((r) => [r.area, r]));
    const fy = Object.fromEntries(out.fiscalYear.map((r) => [r.area, r]));
    expect(month.course.revenue).toBe(100);
    expect(fy.course.revenue).toBe(600);
  });

  it("October rollup rows count toward the NEW fiscal year", () => {
    const octToday = new Date(2026, 9, 20); // Oct 20 2026 → FY27
    const revenue = [
      rev("2026-10-01", "greens_fees", 100),
      rev("2026-09-01", "greens_fees", 400), // FY26 — must not count
    ];
    const out = computeAreaPnl(revenue, [], octToday);
    const fy = Object.fromEntries(out.fiscalYear.map((r) => [r.area, r]));
    expect(fy.course.revenue).toBe(100);
    expect(out.fiscalYearLabel).toBe("FY27 to date");
  });

  it("unknown cost centers land in a visible unassigned bucket", () => {
    const out = computeAreaPnl([], [spend("2026-07-01", "77777", 42)], TODAY);
    const unassigned = out.month.find((r) => r.area === "unassigned");
    expect(unassigned).toBeDefined();
    expect(unassigned!.spend).toBe(42);
  });

  it("hides the unassigned bucket when everything mapped", () => {
    const out = computeAreaPnl([rev("2026-07-01", "greens_fees", 10)], [], TODAY);
    expect(out.month.some((r) => r.area === "unassigned")).toBe(false);
  });

  it("tolerates string numerics from PostgREST without NaN", () => {
    // NUMERIC columns arrive as strings through PostgREST.
    const revenue = [rev("2026-07-01", "greens_fees", "59.97" as unknown as number)];
    const out = computeAreaPnl(revenue, [], TODAY);
    const month = Object.fromEntries(out.month.map((r) => [r.area, r]));
    expect(month.course.revenue).toBe(59.97);
    for (const r of out.month) {
      expect(Number.isNaN(r.net)).toBe(false);
    }
  });

  it("labels the windows", () => {
    const out = computeAreaPnl([], [], TODAY);
    expect(out.monthLabel).toBe("July 2026");
    expect(out.fiscalYearLabel).toBe("FY26 to date");
  });
});
