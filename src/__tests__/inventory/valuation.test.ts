import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  cellNumber,
  parseMonthEnd,
  parseValuationSheet,
  parseValuationReport,
  parseValuationWorkbook,
  pickValuations,
  type Rows,
} from "@/lib/inventory/valuation";
import { readInventoryFiles } from "@/lib/inventory/read-files";
import { costByPeriod, withInventory } from "@/lib/restaurant/food-cost";

const FIXTURES = join(__dirname, "..", "fixtures", "inventory");
const book = (name: string) => {
  const wb = XLSX.read(readFileSync(join(FIXTURES, name)));
  return wb.SheetNames.map((n) => ({
    name: n,
    rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, defval: "", raw: false }) as Rows,
  }));
};

describe("cell helpers", () => {
  it("reads money and dashes", () => {
    expect(cellNumber("$1,234.56")).toBe(1234.56);
    expect(cellNumber(" - ")).toBeNull();
    expect(cellNumber("$-")).toBeNull();
    expect(cellNumber("(5.00)")).toBe(-5);
  });
  it("reads month-end dates", () => {
    expect(parseMonthEnd("30-Sep-26")).toBe("2026-09-30");
    expect(parseMonthEnd("28-Nov-25")).toBe("2025-11-28");
    expect(parseMonthEnd("3/31/26")).toBe("2026-03-31");
    expect(parseMonthEnd("whenever")).toBeNull();
  });
});

describe("count sheets", () => {
  it("values every counted bar item, including rows the sheet's TOTAL formula missed", () => {
    const v = parseValuationWorkbook(book("sep-bar.xlsx"), "SEP - 20091 (151120) - BUCKLEYS BAR.xlsx")!;
    expect(v).toMatchObject({ outlet: "bar", account: "151120", costCenter: "20091", monthEnd: "2026-09-30", statedTotal: 2089.97 });
    expect(v.total).toBe(2594.78);
    expect(v.lines.find((l) => l.description === "CARBLISS WATERMELON")?.value).toBe(42.78);
    expect(v.lines.find((l) => l.description === "CORONA EXTRA 16OZ")).toMatchObject({ qty: 54, unitCost: 1.44, value: 77.76 });
    // Uncounted items (count 0, no value) are left out.
    expect(v.lines.some((l) => l.description.startsWith("BUD 16 OZ (BULLET)"))).toBe(false);
    expect(v.notes[0]).toMatch(/items add up to \$2,594\.78 but the sheet's TOTAL shows \$2,089\.97/);
  });

  it("uses the items when the TOTAL is linked to another month's file", () => {
    const v = parseValuationWorkbook(book("jan-food.xlsx"), "JAN - 20091 (151110) - BUCKLEYS -FOOD.xlsx")!;
    expect(v).toMatchObject({ outlet: "restaurant", monthEnd: "2026-01-31", statedTotal: 5853.58, total: 5054.01 });
  });

  it("reads an empty sheet as nothing counted", () => {
    const v = parseValuationWorkbook(book("jun-bar-empty.xlsx"), "JUN - 20091 (151120) - BUCKLEYS BAR.xlsx")!;
    expect(v).toMatchObject({ outlet: "bar", monthEnd: "2026-06-30", total: 0, statedTotal: null, linesTotal: null });
    expect(v.notes).toEqual(["Nothing counted on this sheet and no total."]);
  });

  it("reads a total-only pro shop sheet", () => {
    const rows: Rows = [
      ["", "FACILITY", "", "SITE NO", "COST CTR", "ACCOUNT", "MONTH ENDING"],
      ["", "VETERANS MEMORIAL GOLF COURSE", "", "7009", "20086", "151130", "31-Mar-26"],
      ["", "", "", "", "", "TOTAL:", "$8,689.69"],
      ["", "SEE ATTACHED"],
    ];
    expect(parseValuationSheet(rows, "MAR retail.xlsx")).toMatchObject({
      outlet: "pro_shop",
      monthEnd: "2026-03-31",
      total: 8689.69,
      lines: [],
      notes: ["Total only (no item rows). The item detail is on the attached valuation report."],
    });
  });

  it("is null for a spreadsheet that isn't a count sheet", () => {
    expect(parseValuationSheet([["Name", "Phone"], ["Ann", "555"]])).toBeNull();
  });
});

describe("picking one count per month", () => {
  const val = (outlet: "bar" | "restaurant", total: number, n = 1) => ({
    outlet, account: "151120", costCenter: "20091", monthEnd: "2026-05-31", statedTotal: total, linesTotal: total, total,
    lines: Array.from({ length: n }, () => ({ description: "x", category: null, unit: null, qty: 1, unitCost: 1, value: 1, inventoryCode: null })),
    countedBy: null, notes: [],
  });
  it("prefers FINAL, then a file with a total", () => {
    const { kept, setAside } = pickValuations([
      { fileName: "MAY - BAR.xlsx", valuation: val("bar", 0) },
      { fileName: "MAY - BAR FINAL.xlsx", valuation: val("bar", 3452.94) },
      { fileName: "MAY - FOOD.xlsx", valuation: val("restaurant", 3483.61) },
    ]);
    expect(kept.map((k) => k.fileName)).toEqual(["MAY - BAR FINAL.xlsx", "MAY - FOOD.xlsx"]);
    expect(setAside.map((s) => s.fileName)).toEqual(["MAY - BAR.xlsx"]);
  });
});

// RecTrac's Inventory Valuation Report as pdf.js prints it (September 2026, trimmed).
const REPORT = [
  "Veteran Memorial Golf Page: 1 of 4",
  "Inventory Valuation Report",
  "September 2026",
  "Inventory Code Description UOM Qty on Hand Last Cost Cost Value Unit Price Sale Value Margin",
  "MA7009-16-204-040 BC AMERICAN CLASSIC EACH 3 18.55 55.65 19.00 57.00 1.35",
  "MA7009-16-204-046   RTC TEE SHIRTS   EACH   -202 0.00 0.00 3.00 -606.00 -606.00",
  "MA7009-16-204-061 LVLWR ORIGINAL ICE 2 EACH 6 32.15 192.90 55.00 330.00 137.10",
  "MA7009-16-204-401 Got Booted T-shirt EACH 0 9.55 0.00 18.00 0.00 0.00",
  "MA7009-16-209-025 SWANK 1500404763 GLASSE EACH 1 19.22 19.22 30.00 30.00 10.78",
  "MA7009-16-207-010 LONG ITEM EACH 1,200 1.00 1,200.00 2.00 2,400.00 1,200.00",
  "Totals: 1007 1,467.77 2,211.00 743.23",
  "Averages: 10 22.56 132.28 36.02 192.70 60.42",
  "Items Selected: 6",
  "Veterans Memorial Golf Course User: MA0110 Run Date/Time: 10/07/2026 @ 13:40",
];

describe("RecTrac Inventory Valuation Report", () => {
  it("reads every item at its last cost, for pro shop retail at the month's end", () => {
    const v = parseValuationReport(REPORT)!;
    expect(v).toMatchObject({
      outlet: "pro_shop", account: "151130", costCenter: "20086", monthEnd: "2026-09-30",
      statedTotal: 1467.77, linesTotal: 1467.77, total: 1467.77, fromReport: true,
    });
    // The zero-on-hand item is left out.
    expect(v.lines.map((l) => l.inventoryCode)).toEqual([
      "MA7009-16-204-040", "MA7009-16-204-046", "MA7009-16-204-061", "MA7009-16-209-025", "MA7009-16-207-010",
    ]);
    expect(v.lines[2]).toEqual({
      inventoryCode: "MA7009-16-204-061", description: "LVLWR ORIGINAL ICE 2", category: null, unit: "EACH", qty: 6, unitCost: 32.15, value: 192.9,
    });
    expect(v.lines[4].qty).toBe(1200);
    expect(v.notes).toEqual(["1 item shows less than zero on hand in RecTrac (sold more than was received in): RTC TEE SHIRTS."]);
  });

  it("notes a Totals line that doesn't match the items", () => {
    const v = parseValuationReport(REPORT.map((l) => (l.startsWith("Totals:") ? "Totals: 1007 1,500.00 2,211.00 743.23" : l)))!;
    expect(v.total).toBe(1467.77);
    expect(v.notes[0]).toMatch(/add up to \$1,467\.77 but the report's Totals line shows \$1,500\.00/);
  });

  it("isn't fooled by other reports or unknown outlets", () => {
    expect(parseValuationReport(["Inventory Sales History By Item", "September 2026", REPORT[4]])).toBeNull();
    expect(parseValuationReport(REPORT.slice(0, 4))).toBeNull();
    expect(parseValuationReport(REPORT.map((l) => l.replace("MA7009-16-204-040", "MA7009-31-101-040")))).toBeNull();
  });

  it("is used over the pro shop's total-only count sheet for the same month", () => {
    const report = parseValuationReport(REPORT)!;
    const sheet = { ...report, fromReport: undefined, lines: [], linesTotal: null, statedTotal: 1467.77, total: 1467.77 };
    const { kept, setAside } = pickValuations([
      { fileName: "SEP - 20086 (151130) - RETAIL FINAL.xlsx", valuation: sheet },
      { fileName: "Inventory_Valuation_Report.pdf", valuation: report },
    ]);
    expect(kept.map((k) => k.fileName)).toEqual(["Inventory_Valuation_Report.pdf"]);
    expect(setAside.map((s) => s.fileName)).toEqual(["SEP - 20086 (151130) - RETAIL FINAL.xlsx"]);
  });
});

describe("reading files", () => {
  it("opens a zip of count sheets and skips the rest", async () => {
    const zip = new JSZip();
    zip.file("inventory/SEP - 20091 (151120) - BUCKLEYS BAR.xlsx", readFileSync(join(FIXTURES, "sep-bar.xlsx")));
    zip.file("inventory/October retail inventory.pdf", "pdf");
    zip.file("__MACOSX/inventory/._SEP.xlsx", "junk");
    const r = await readInventoryFiles([{ name: "inventory.zip", data: await zip.generateAsync({ type: "uint8array" }) }]);
    expect(r.kept.map((k) => [k.valuation.outlet, k.valuation.monthEnd, k.valuation.total])).toEqual([["bar", "2026-09-30", 2594.78]]);
    expect(r.unreadable).toEqual(["October retail inventory.pdf"]);
  });
});

describe("true cost of goods with counts", () => {
  it("is starting count + purchases − ending count, when both counts exist", () => {
    const purchases = [
      { purchase_date: "2026-09-10", amount: 2979.72, food_amount: 2979.72, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0 },
      { purchase_date: "2026-08-10", amount: 1911.77, food_amount: 1911.77, alcohol_amount: 0, supplies_amount: 0, bar_cogs_amount: 0 },
    ];
    const sales = [{ entry_date: "2026-09-15", amount: 10000, category: "food_beverage" }];
    const counts = [
      { outlet: "restaurant", month_end: "2026-08-31", total: 4908.93 },
      { outlet: "restaurant", month_end: "2026-09-30", total: 5613.38 },
      { outlet: "bar", month_end: "2026-07-31", total: 999 },
    ];
    const rows = withInventory(costByPeriod(purchases, sales, "month", "restaurant"), counts, "restaurant");
    expect(rows[0]).toMatchObject({
      key: "2026-09",
      basis: "inventory",
      startInventory: 4908.93,
      purchases: 2979.72,
      endInventory: 5613.38,
      cogs: 2275.27,
      pct: 22.8,
      status: "good",
    });
    // No count for July: August stays on purchases.
    expect(rows[1]).toMatchObject({ key: "2026-08", basis: "purchases", cogs: 1911.77 });
  });

  it("shows a month with counts but no purchases (stock was still used)", () => {
    const counts = [
      { outlet: "restaurant", month_end: "2025-11-28", total: 5463.02 },
      { outlet: "restaurant", month_end: "2025-12-31", total: 5000 },
    ];
    const rows = withInventory([], counts, "restaurant");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "2025-12", basis: "inventory", cogs: 463.02 });
  });
});
