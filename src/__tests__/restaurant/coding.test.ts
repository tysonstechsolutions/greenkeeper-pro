import { describe, expect, it } from "vitest";
import { barCogs, codeLine, codingSummary, glFor, outletFor } from "@/lib/restaurant/coding";
import { categoryForReportLine, REVENUE_CATEGORY_KEYS } from "@/lib/money/revenue-categories";
import { areaForRevenueCategory } from "@/lib/money/areas";

describe("invoice line coding", () => {
  const none = new Map();
  it("codes food, alcohol, and supplies to Buckley's 20091", () => {
    expect(codeLine({ productNumber: "1", category: "food", description: "BEEF, GRND" }, none)).toEqual({
      outlet: "restaurant",
      cost_ctr: "20091",
      gl_acct: "151110",
    });
    expect(codeLine({ productNumber: "2", category: "alcohol", description: "BEER, LAGER" }, none)).toEqual({
      outlet: "bar",
      cost_ctr: "20091",
      gl_acct: "151120",
    });
    expect(glFor({ category: "supplies", description: "CLEANER, DEGREASER HD" })).toBe("701005");
    expect(glFor({ category: "supplies", description: "GLOVE, NTRLE MED PF BLU" })).toBe("701000");
    expect(glFor({ category: "supplies", description: "FUEL, CHAFING CAN 6 HR" })).toBe("701000");
    // A supply that mentions food is still not resale inventory.
    expect(glFor({ category: "supplies", description: "BAG, FOOD STRG 10X14" })).not.toMatch(/^1511/);
  });

  it("uses the remembered outlet, but alcohol is always bar", () => {
    const remembered = new Map([["5016423", "bar" as const], ["9", "restaurant" as const]]);
    expect(outletFor({ productNumber: "5016423", category: "food" }, remembered)).toBe("bar");
    expect(outletFor({ productNumber: "9", category: "alcohol" }, remembered)).toBe("bar");
    expect(outletFor({ productNumber: "x", category: "food" }, remembered)).toBe("restaurant");
  });

  it("totals by cost center and G/L, the unexplained remainder on food", () => {
    const rows = codingSummary(
      [
        { cost_ctr: "20091", gl_acct: "151110", extended: 100 },
        { cost_ctr: "20091", gl_acct: "151110", extended: 20.5 },
        { cost_ctr: "20091", gl_acct: "701000", extended: 50.11 },
      ],
      175,
    );
    expect(rows.map((r) => [r.cost_ctr, r.gl_acct, r.amount])).toEqual([
      ["20091", "151110", 124.89],
      ["20091", "701000", 50.11],
    ]);
    expect(rows[0].label).toBe("20091 · 151110 — RESALE INVENTORY FOOD");
  });

  it("bar cost is bar food and alcohol, never supplies", () => {
    expect(
      barCogs([
        { outlet: "bar", category: "food", extended: 11.88 },
        { outlet: "bar", category: "alcohol", extended: 100 },
        { outlet: "bar", category: "supplies", extended: 40 },
        { outlet: "restaurant", category: "food", extended: 500 },
      ]),
    ).toBe(111.88);
  });
});

describe("RecTrac report types", () => {
  it("a restaurant or bar report is all that outlet's sales", () => {
    expect(categoryForReportLine("restaurant", "other")).toBe("food_beverage");
    expect(categoryForReportLine("restaurant", "pro_shop")).toBe("food_beverage");
    expect(categoryForReportLine("bar", "food_beverage")).toBe("bar");
  });

  it("a pro shop report keeps what each line was read as", () => {
    expect(categoryForReportLine("pro_shop", "greens_fees")).toBe("greens_fees");
    expect(categoryForReportLine("pro_shop", "pro_shop")).toBe("pro_shop");
    expect(categoryForReportLine("pro_shop", "made_up")).toBe("other");
  });

  it("Bar is a revenue category that rolls into the restaurant area", () => {
    expect(REVENUE_CATEGORY_KEYS.has("bar")).toBe(true);
    expect(areaForRevenueCategory("bar")).toBe("restaurant");
  });
});
