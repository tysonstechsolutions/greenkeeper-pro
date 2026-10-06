import { describe, expect, it } from "vitest";
import { matchCost, productWords, type CostItem } from "@/lib/performance/match";
import {
  addMonths,
  areaMonths,
  costBook,
  fiscalYear,
  fiscalYearLabel,
  itemCostByMonth,
  monthRange,
  outlook,
  pricedItems,
  quarterUp,
  recommendations,
  unsoldPurchases,
  yearOverYear,
  type AreaMonth,
  type CountLine,
  type ItemSale,
} from "@/lib/performance/performance";

// Names as they appear on the real count sheets and RecTrac reports.
const BAR_BOOK: CostItem[] = [
  { description: "COORS LIGHT 16OZ", category: "BEER", unitCost: 1.06 },
  { description: "Coors Light 16oz Can", category: "BEER", unitCost: 1.14 },
  { description: "MILLER LIGHT 16OZ", category: "BEER", unitCost: 1.09 },
  { description: "BUD LITE 16 OZ", category: "BEER", unitCost: 0.93 },
  { description: "BUD 16 OZ", category: "BEER", unitCost: 1.01 },
  { description: "PABST 16 OZ", category: "BEER", unitCost: 0.94 },
  { description: "MODELO ESPECIAL 16OZ", category: "BEER", unitCost: 1.44 },
  { description: "CORONA EXTRA 16OZ", category: "BEER", unitCost: 1.44 },
  { description: "GUINESS 16OZ", category: "BEER", unitCost: 1.56 },
  { description: "GOOSE ISLAND: TROPICAL HUG", category: "BEER", unitCost: 1.51 },
  { description: "TWISTED TEA 16OZ", category: "SPECIAL", unitCost: 1.65 },
  { description: "SUNCRUISER HARD TEA 12OZ", category: "SPECIAL", unitCost: 1.9 },
  { description: "SUTTER/HOME: CHARDONNAY", category: "WINE", unitCost: 1.29 },
  { description: "SUTTER/HOME: CABARNET", category: "WINE", unitCost: 1.36 },
];

describe("matching sold items to count-sheet costs", () => {
  it("cuts names down to the words that identify the product", () => {
    // Plurals come off on both sides ("COORS" → "COOR"), so they always meet.
    expect(productWords("COORS LIGHT 16OZ")).toEqual(["COOR", "LIGHT"]);
    expect(productWords("Coors Lt 16oz 12pk Cn")).toEqual(["COOR", "LIGHT"]);
    expect(productWords("GI BH TROPICAL")).toEqual(["GOOSE", "ISLAND", "BH", "TROPICAL"]);
    expect(productWords("CUT LEMON DROP 6/4/12")).toEqual(["CUTWATER", "LEMON", "DROP"]);
    expect(productWords("Sprecher's Soda")).toEqual(["SPRECHER", "SODA"]);
    expect(productWords("SPRECHER SODA 6/4EA")).toEqual(["SPRECHER", "SODA"]);
  });

  it("matches a brand to its can, averaging the same beer counted twice", () => {
    expect(matchCost("Coors Light", BAR_BOOK)).toEqual({ unitCost: 1.1, from: ["COORS LIGHT 16OZ", "Coors Light 16oz Can"] });
    expect(matchCost("Bud Light", BAR_BOOK)?.from).toEqual(["BUD LITE 16 OZ"]);
    expect(matchCost("Pabst Blue Ribbon", BAR_BOOK)?.unitCost).toBe(0.94);
    expect(matchCost("Guiness", BAR_BOOK)?.unitCost).toBe(1.56);
    expect(matchCost("GI Tropical Beer Hug", BAR_BOOK)?.unitCost).toBe(1.51);
    expect(matchCost("Sun Cruiser", BAR_BOOK)?.unitCost).toBe(1.9);
    expect(matchCost("Long Grove Lager", BAR_BOOK)).toBeNull();
  });

  it("covers the old catch-all buttons with their family", () => {
    expect(matchCost("DOMESTIC BEER", BAR_BOOK)?.from.sort()).toEqual(
      ["BUD 16 OZ", "BUD LITE 16 OZ", "COORS LIGHT 16OZ", "Coors Light 16oz Can", "MILLER LIGHT 16OZ", "PABST 16 OZ"].sort(),
    );
    expect(matchCost("IMPORT BEER", BAR_BOOK)?.from.sort()).toEqual(["CORONA EXTRA 16OZ", "GUINESS 16OZ", "MODELO ESPECIAL 16OZ"]);
    expect(matchCost("WINE", BAR_BOOK)?.unitCost).toBeCloseTo(1.325);
    const food: CostItem[] = [
      { description: "20 OZ PEPSI", category: "BEVERAGES", unitCost: 0.77 },
      { description: "Pepsi (6/2L)", category: "BEVERAGES", unitCost: 3.06 },
      { description: "WATER: 20 OZ (CS-24)", category: "BEVERAGES", unitCost: 0.29 },
    ];
    expect(matchCost("Bottle Soda", food)).toEqual({ unitCost: 0.77, from: ["20 OZ PEPSI"] });
    expect(matchCost("Bottle Water", food)?.unitCost).toBe(0.29);
  });

  it("allows for RecTrac's 18-character cut-off and items counted by the sleeve and the dozen", () => {
    const pro: CostItem[] = [
      { description: "CALLAWAY SUPERSOFT", category: null, unitCost: 5.24 },
      { description: "CALLAWAY SUPERSOFT", category: null, unitCost: 20.96 },
      { description: "CALLAWAY WARBIRD", category: null, unitCost: 3.99 },
    ];
    expect(matchCost("CALLAWAY SUPERSO", pro, 9.42)?.unitCost).toBe(5.24);
    expect(matchCost("CALLAWAY SUPERSO", pro, 29.99)?.unitCost).toBe(20.96);
    expect(matchCost("CALLAWAY WARBIRD", pro, 6.5)?.unitCost).toBe(3.99);
  });
});

describe("months and fiscal years", () => {
  it("runs the fiscal year Oct–Sep", () => {
    expect(fiscalYear("2026-09-30")).toBe(2026);
    expect(fiscalYear("2026-10-01")).toBe(2027);
    expect(fiscalYearLabel(2027)).toBe("FY27");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(quarterUp(7.51)).toBe(7.75);
    expect(quarterUp(8)).toBe(8);
  });
});

const sale = (outlet: string, sale_date: string, description: string, qty: number, net: number): ItemSale => ({
  outlet,
  sale_date,
  description,
  qty,
  net,
});

describe("area months", () => {
  const purchases = [
    { purchase_date: "2026-05-04", amount: 1000, food_amount: 1000, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0, vendor: "US Foods" },
    { purchase_date: "2026-06-04", amount: 900, food_amount: 900, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0, vendor: "US Foods" },
    { purchase_date: "2026-06-10", amount: 500, food_amount: 0, alcohol_amount: 500, supplies_amount: 0, bar_cogs_amount: 500, vendor: "Lakeshore Beverage" },
  ];
  const sales = [
    { entry_date: "2025-06-15", amount: 2000, category: "food_beverage" },
    { entry_date: "2026-05-15", amount: 2500, category: "food_beverage" },
    { entry_date: "2026-06-15", amount: 3000, category: "food_beverage" },
    { entry_date: "2026-06-15", amount: 1800, category: "bar" },
    { entry_date: "2026-06-20", amount: 400, category: "pro_shop" },
  ];
  const counts = [
    { outlet: "restaurant", month_end: "2026-05-31", total: 5000 },
    { outlet: "restaurant", month_end: "2026-06-30", total: 4800 },
    // The bar's June sheet came in empty: a missing count, not an empty cooler.
    { outlet: "bar", month_end: "2026-05-31", total: 3000 },
    { outlet: "bar", month_end: "2026-06-30", total: 0 },
  ];
  const countLines: CountLine[] = [{ outlet: "pro_shop", month_end: "2026-06-30", description: "PRO V1X", category: null, unit_cost: 11 }];
  const itemSales = [sale("pro_shop", "2026-06-20", "PRO V1X", 20, 300), sale("pro_shop", "2026-06-21", "RTC HOODIES", 10, 100)];
  const input = { purchases, sales, counts, countLines, itemSales };

  it("works restaurant cost from the counts, and last year's sales beside each month", () => {
    const m = areaMonths("restaurant", input, "2026-06");
    expect(m.at(-1)).toEqual({ key: "2026-06", sales: 3000, cost: 1100, pct: 36.7, basis: "inventory", lastYearSales: 2000 });
    expect(m.at(-2)).toMatchObject({ key: "2026-05", cost: 1000, basis: "purchases" });
    expect(m[0].key).toBe("2025-06");
  });

  it("doesn't treat an empty count sheet as an empty shelf", () => {
    const bar = areaMonths("bar", input, "2026-06").at(-1)!;
    expect(bar).toMatchObject({ key: "2026-06", cost: 500, basis: "purchases" });
  });

  it("costs the pro shop from item costs, filling unmatched sales at the same rate", () => {
    const pro = areaMonths("pro_shop", input, "2026-06").at(-1)!;
    // PRO V1X: 20 × $11 = $220 on $300; hoodies have no cost, so $400 × 220/300.
    expect(pro).toMatchObject({ sales: 400, cost: 293.33, pct: 73.3, basis: "item cost" });
    expect(itemCostByMonth(itemSales, costBook(countLines, "pro_shop"), "pro_shop").get("2026-06")).toEqual({
      cost: 293.33,
      sales: 400,
      matchedSales: 300,
    });
  });
});

describe("prices", () => {
  it("recommends the lowest quarter-dollar price that meets the target, and skips costs in another unit", () => {
    const book: CostItem[] = [
      { description: "PRO V1", category: null, unitCost: 12.06 },
      { description: "PINNACLE DISTANCE YELLOW 15PK", category: null, unitCost: 13.87 },
      { description: "BAMBO 2 1/4 TEES", category: null, unitCost: 0.34 },
    ];
    const items = pricedItems(
      [
        sale("pro_shop", "2026-06-01", "PRO V1", 46, 690),
        sale("pro_shop", "2026-06-02", "PINNACLE DISTANCE", 177, 1572),
        sale("pro_shop", "2026-06-03", "BAMBO 2 1/4 TEES", 317, 317),
        sale("bar", "2026-06-03", "Coors Light", 10, 45),
      ],
      book,
      "pro_shop",
    );
    expect(items.map((i) => i.description)).toEqual(["PINNACLE DISTANCE", "PRO V1", "BAMBO 2 1/4 TEES"]);
    expect(items[1]).toMatchObject({ price: 15, unitCost: 12.06, costPct: 80.4, recommended: 18.75, extraPerYear: 172.5 });
    expect(items[0]).toMatchObject({ unitMismatch: true, recommended: null, extraPerYear: 0 });
    expect(items[2]).toMatchObject({ costPct: 34, recommended: null });
  });
});

const month = (key: string, sales: number, cost: number | null, lastYearSales: number | null = null): AreaMonth => ({
  key,
  sales,
  cost,
  pct: cost != null && sales > 0 ? Math.round((cost / sales) * 1000) / 10 : null,
  basis: cost == null ? "none" : "inventory",
  lastYearSales,
});

describe("outlook and year over year", () => {
  const months = [
    month("2025-08", 5000, 1500),
    month("2025-09", 4000, 1200),
    month("2025-10", 3000, 900),
    month("2025-11", 400, 200),
    month("2026-08", 2500, 1000, 5000),
    month("2026-09", 2000, 900, 4000),
  ];

  it("scales last year's months by how recent months compare", () => {
    const o = outlook(months, "restaurant", "2026-09", 2);
    expect(o.trend).toBe(0.5);
    expect(o.trendMonths).toEqual(["2026-09", "2026-08"]);
    expect(o.months).toEqual([
      { key: "2026-10", expectedSales: 1500, expectedCost: expect.any(Number), targetCost: 525 },
      { key: "2026-11", expectedSales: 200, expectedCost: expect.any(Number), targetCost: 70 },
    ]);
  });

  it("compares only months that have reports both years", () => {
    expect(yearOverYear(months, "2026-09")).toEqual({ now: 4500, before: 9000, months: 2, change: -50 });
    expect(yearOverYear(months, "2026-08")).toEqual({ now: 2500, before: 5000, months: 1, change: -50 });
    expect(yearOverYear(months.slice(0, 4), "2025-11")).toBeNull();
  });
});

describe("recommendations", () => {
  const months = [month("2026-07", 2000, 1000), month("2026-08", 2000, 1000), month("2026-09", 2000, 1000)];
  const base = {
    months,
    through: "2026-09",
    items: [],
    latestCount: null,
    outlook: { months: [], trend: null, trendMonths: [], pctUsed: 50 },
  };

  it("says how far over target and what closing it takes", () => {
    const [first] = recommendations({ ...base, area: "restaurant" });
    expect(first).toMatchObject({ level: "act", title: "Cost is 50% of sales, target 35%", dollars: 900 });
    expect(first.detail).toContain("prices about 43% higher");
  });

  it("checks that sales are complete first when cost is far over target", () => {
    const high = [month("2026-08", 2000, 1100), month("2026-09", 2000, 1100)];
    const [first] = recommendations({ ...base, months: high, area: "bar" });
    expect(first.title).toBe("Cost is 55% of sales, target 25%");
    expect(first.detail).toContain("make sure every sale is in");
  });

  it("flags bar product bought but never sold by name", () => {
    const lines = [
      { purchase_date: "2026-05-01", description: "CUT LEMON DROP", extended: 2000, outlet: "bar", category: "alcohol" },
      { purchase_date: "2026-05-01", description: "Coors Lt 16oz 12pk Cn", extended: 300, outlet: "bar", category: "alcohol" },
      { purchase_date: "2026-05-01", description: "SERVICE CHARGE", extended: 10, outlet: "bar", category: "alcohol" },
    ];
    const unsold = unsoldPurchases(lines, [sale("bar", "2026-05-02", "Coors Light", 40, 180)], "2025-10-01");
    expect(unsold).toEqual([{ description: "Cutwater (CUT LEMON DROP)", spend: 2000 }]);
    const recs = recommendations({ ...base, area: "bar", unsoldPurchases: unsold });
    expect(recs.find((r) => r.title.includes("never shows up"))?.title).toBe("$2,000 bought that never shows up in bar sales by name");
  });

  it("warns about stock going into the slow months", () => {
    const recs = recommendations({
      ...base,
      area: "pro_shop",
      latestCount: { month_end: "2026-09-30", total: 12000 },
      outlook: { months: [{ key: "2026-10", expectedSales: 1000, expectedCost: 650, targetCost: 650 }], trend: null, trendMonths: [], pctUsed: 65 },
    });
    expect(recs.find((r) => r.level === "watch")?.title).toBe("$12,000 on the shelf is more than a year of stock");
  });
});
