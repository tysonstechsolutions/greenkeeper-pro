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

  it("counts Cutwater as sold once its flavors are rung up, with or without the name", () => {
    const cut = (description: string, extended: number) => ({ purchase_date: "2026-05-01", description, extended, outlet: "bar", category: "alcohol" });
    const lines = [cut("CUT LEMON DROP", 1500), cut("CUT LIME MARG", 1100), cut("CUT LONG ISLAN", 900), cut("CUT TIKI MAI T", 475), cut("CUT PEPERMINT", 115)];
    const sold = [
      sale("bar", "2026-10-02", "Lemon Drop", 3, 24),
      sale("bar", "2026-10-02", "Lime Margarita", 2, 16),
      sale("bar", "2026-10-03", "Mai Tai", 1, 8),
    ];
    // Long Island and Peppermint haven't sold yet: only those are left.
    expect(unsoldPurchases(lines, sold, "2025-10-01")).toEqual([{ description: "Cutwater (CUT LONG ISLAN)", spend: 1015 }]);
    // RecTrac's 18-character cut, rung with the name: all of Cutwater counts as sold.
    expect(unsoldPurchases(lines, [sale("bar", "2026-10-02", "Cutwater Long Isla", 1, 8)], "2025-10-01")).toEqual([]);
    // One shared word isn't enough ("Lime" alone could be anything).
    expect(unsoldPurchases([cut("CUT LIME MARG", 1100)], [sale("bar", "2026-10-02", "Lime Seltzer", 1, 6)], "2025-10-01")).toHaveLength(1);
  });

  it("spells out the invoices' short Cutwater flavors", () => {
    expect(productWords("CUT LIME MARG")).toEqual(["CUTWATER", "LIME", "MARGARITA"]);
    expect(productWords("CUT LONG ISLAN")).toEqual(["CUTWATER", "LONG", "ISLAND"]);
    expect(productWords("CUT TIKI MAI T")).toEqual(["CUTWATER", "TIKI", "MAI", "TAI"]);
    expect(productWords("CUT ESP MARTIN")).toEqual(["CUTWATER", "ESPRESSO", "MARTINI"]);
    expect(productWords("CUT VOD TRANS")).toEqual(["CUTWATER", "VODKA", "TRANSFUSION"]);
    expect(productWords("CUT STRAW MARG")).toEqual(["CUTWATER", "STRAWBERRY", "MARGARITA"]);
    expect(productWords("CUT WHITE RUSS")).toEqual(["CUTWATER", "WHITE", "RUSSIAN"]);
    // Only for Cutwater: other names keep their words.
    expect(productWords("PINE NUT")).toEqual(["PINE", "NUT"]);
  });

  it("costs a Cutwater flavor from the count sheet when it's rung up by flavor", () => {
    const book: CostItem[] = [
      { description: "CUTWATER 12OZ LEMON DROP MARTINI", category: "Seltzer", unitCost: 2.47 },
      { description: "CUTWATER 12OZ EXPRESSO MARTINI", category: "Seltzer", unitCost: 2.47 },
      { description: "CUTWATER 12OZ LIME MARGARITA", category: "Seltzer", unitCost: 2.47 },
      { description: "CUTWATER 12OZ LONG ISLAND ICED TEA", category: "Seltzer", unitCost: 2.47 },
      { description: "CUTWATER 12OZ TIKI RUN MAI TAI", category: "Seltzer", unitCost: 2.5 },
    ];
    expect(matchCost("Lemon Drop", book)?.from).toEqual(["CUTWATER 12OZ LEMON DROP MARTINI"]);
    expect(matchCost("Espresso Martini", book)?.from).toEqual(["CUTWATER 12OZ EXPRESSO MARTINI"]);
    expect(matchCost("Cutwater Lime Marg", book)?.from).toEqual(["CUTWATER 12OZ LIME MARGARITA"]);
    expect(matchCost("Long Island", book)?.from).toEqual(["CUTWATER 12OZ LONG ISLAND ICED TEA"]);
    expect(matchCost("Mai Tai", book)?.unitCost).toBe(2.5);
  });

  it("costs liquor by the pour, and extra shots from that shelf", () => {
    const count = (description: string, unit_cost: number, category = "LIQUOR") => ({ outlet: "bar", month_end: "2026-08-31", description, category, unit_cost });
    const book = costBook(
      [count("CROWN ROYAL", 33.5), count("RUM: CAPT. MORGAN", 25), count("RUM: MALIBU 1.75L", 36.66), count("VODKA: ARISTOCRAT", 4.66), count("COORS LITE 16 OZ", 1.1, "BEER")],
      "bar",
    );
    // 1.5 oz pours: 16.9 from a 750 ml bottle, 39.4 from a 1.75 L.
    expect(book.find((c) => c.description === "CROWN ROYAL")).toMatchObject({ unitCost: 1.98, bottleCost: 33.5 });
    expect(book.find((c) => /MALIBU/.test(c.description))?.unitCost).toBe(0.93);
    expect(book.find((c) => /COORS/.test(c.description))).toEqual({ description: "COORS LITE 16 OZ", category: "BEER", unitCost: 1.1 });
    expect(matchCost("CAPTAIN MORGAN", book)?.unitCost).toBe(1.48);
    expect(matchCost("MALABU RUM", book)?.unitCost).toBe(0.93);
    expect(matchCost("EXTRA SHOT TOP SHELF", book)?.from).toEqual(["CROWN ROYAL", "RUM: CAPT. MORGAN", "RUM: MALIBU 1.75L"]);
    expect(matchCost("EXTRA SHOT HOUSE LIQUOR", book)?.from).toEqual(["VODKA: ARISTOCRAT"]);
    // Liquor is the bar's: the restaurant never gets it.
    expect(costBook([{ ...count("CROWN ROYAL", 33.5), outlet: "restaurant" }], "restaurant")).toEqual([]);
  });

  it("costs RTC shirts at $0 (they come free) but still skips other $0 items", () => {
    const count = (description: string, unit_cost: number) => ({ outlet: "pro_shop", month_end: "2026-09-30", description, category: null, unit_cost });
    const book = costBook([count("RTC TEE SHIRTS", 0), count("RTC HOODIES", 0), count("Got Booted T-shirt", 0), count("BC AMERICAN CLASSIC", 18.55)], "pro_shop");
    expect(book.map((c) => c.description)).toEqual(["RTC TEE SHIRTS", "RTC HOODIES", "BC AMERICAN CLASSIC"]);
    const items = pricedItems([{ outlet: "pro_shop", sale_date: "2026-09-12", description: "RTC TEE SHIRTS", qty: 10, net: 30 }], book, "pro_shop");
    expect(items[0]).toMatchObject({ unitCost: 0, costPct: 0 });
  });

  it("matches the Cutwater flavor buttons and the plain Cutwater button", () => {
    const book: CostItem[] = [
      { description: "CUTWATER 12OZ TIKI RUN MAI TAI", category: "Seltzer", unitCost: 2.47 },
      { description: "CUTWATER 12OZ VODKA MULE", category: "Seltzer", unitCost: 2.47 },
      { description: "CUTWATER, ASST 12OZ", category: "SPECIAL", unitCost: 2.26 },
    ];
    expect(matchCost("CW Tiki Rum Mai Tai", book)?.from).toEqual(["CUTWATER 12OZ TIKI RUN MAI TAI"]);
    expect(matchCost("CW Vodka Mule", book)?.from).toEqual(["CUTWATER 12OZ VODKA MULE"]);
    expect(matchCost("Cutwater", book)?.from).toEqual(["CUTWATER, ASST 12OZ"]);
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
