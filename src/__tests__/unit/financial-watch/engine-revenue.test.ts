import { describe, it, expect } from "vitest";
import { analyzeRevenue } from "@/lib/financial-watch/engine";
import type { RevenueEntryInput } from "@/lib/financial-watch/types";

const YEAR = 2026;
const MID_YEAR = new Date("2026-07-02T12:00:00");

function rev(partial: Partial<RevenueEntryInput>): RevenueEntryInput {
  return {
    entry_date: "2026-06-25",
    category: "greens_fees",
    amount: 0,
    rounds_count: null,
    ...partial,
  };
}

describe("analyzeRevenue — metrics", () => {
  it("sums year-to-date revenue up to now and ignores future-dated entries", () => {
    const entries = [
      rev({ amount: 1_000, entry_date: "2026-03-01" }),
      rev({ amount: 2_000, entry_date: "2026-06-15" }),
      rev({ amount: 5_000, entry_date: "2026-09-01" }), // after now → excluded
    ];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    expect(a.ytdTotal).toBe(3_000);
  });

  it("compares to the same period last year", () => {
    const entries = [
      rev({ amount: 3_000, entry_date: "2026-03-01" }),
      rev({ amount: 4_000, entry_date: "2025-03-01" }),
      rev({ amount: 9_999, entry_date: "2025-11-01" }), // after Jul 2 last year → excluded
    ];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    expect(a.priorYtdTotal).toBe(4_000);
    expect(a.yoyChange!).toBeCloseTo(-0.25, 5);
  });

  it("breaks down YTD revenue by category with shares", () => {
    const entries = [
      rev({ amount: 6_000, category: "greens_fees", entry_date: "2026-05-01" }),
      rev({ amount: 2_000, category: "cart_rentals", entry_date: "2026-05-01" }),
      rev({ amount: 2_000, category: "food_beverage", entry_date: "2026-05-01" }),
    ];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    const greens = a.byCategory.find((c) => c.category === "greens_fees")!;
    expect(greens.amount).toBe(6_000);
    expect(greens.share).toBeCloseTo(0.6, 5);
  });

  it("computes revenue per round from greens-fee rounds", () => {
    const entries = [
      rev({ amount: 5_000, category: "greens_fees", rounds_count: 100, entry_date: "2026-05-01" }),
      rev({ amount: 1_000, category: "cart_rentals", rounds_count: null, entry_date: "2026-05-01" }),
    ];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    expect(a.ytdRounds).toBe(100);
    expect(a.revenuePerRound!).toBeCloseTo(60, 5);
  });
});

describe("analyzeRevenue — flags", () => {
  it("flags revenue trending down year-over-year", () => {
    const entries = [
      rev({ amount: 3_000, entry_date: "2026-03-01" }),
      rev({ amount: 4_000, entry_date: "2025-03-01" }),
    ];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    const f = a.flags.find((x) => x.id === "revenue:yoy-down");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical"); // -25% is a big drop
  });

  it("does not flag a YoY drop when revenue is up", () => {
    const entries = [
      rev({ amount: 5_000, entry_date: "2026-06-25" }),
      rev({ amount: 4_000, entry_date: "2025-06-25" }),
    ];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    expect(a.flags.find((x) => x.id === "revenue:yoy-down")).toBeUndefined();
  });

  it("flags a negative revenue entry", () => {
    const entries = [rev({ amount: -100, entry_date: "2026-06-25" })];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    expect(a.flags.find((x) => x.id === "revenue:negative-entry")).toBeDefined();
  });

  it("suggests setting a revenue target when none exists", () => {
    const entries = [rev({ amount: 5_000, entry_date: "2026-06-25" })];
    const a = analyzeRevenue(entries, YEAR, MID_YEAR);
    expect(a.hasTarget).toBe(false);
    expect(a.flags.find((x) => x.id === "revenue:no-target")).toBeDefined();
  });
});
