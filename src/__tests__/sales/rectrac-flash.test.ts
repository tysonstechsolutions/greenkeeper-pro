import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flashReportArea, isFlashReport, parseFlashReport } from "@/lib/sales/rectrac-flash";
import { planFlashImport, revenueRows } from "@/lib/sales/import";

const lines = readFileSync(join(__dirname, "..", "fixtures", "sales", "bar-flash-aug25-sep26.txt"), "utf8").split("\n");

describe("RecTrac flash report", () => {
  const r = parseFlashReport(lines)!;

  it("reads every sale and matches the report's own totals exactly", () => {
    expect(r).toMatchObject({
      title: "MA7009-Buckleys Restaurant Sep 2026",
      category: "Golf Bar",
      begin: "2025-08-01",
      end: "2026-09-30",
      grandTotal: 22200.25,
      transactions: 1971,
    });
    expect(r.sales).toHaveLength(4208);
    expect(r.dayTotals.size).toBe(246);
    expect(r.mismatches).toEqual([]);
  });

  it("keeps the date and receipt across lines and pages, and reads refunds", () => {
    expect(r.sales[0]).toEqual({
      date: "2025-08-01",
      receipt: "7392696",
      user: "MA0117",
      inventoryCode: "MA7009-16-128-0",
      description: "DOMESTIC BEER",
      qty: 1,
      fee: 4.5,
      discount: 0,
      tax: 0,
      net: 4.5,
    });
    expect(r.sales[1]).toMatchObject({ date: "2025-08-01", receipt: "7392696", description: "DOMESTIC BEER" });
    const refund = r.sales.find((s) => s.net < 0)!;
    expect(refund).toMatchObject({ qty: -1, net: -7.5 });
  });

  it("knows it's the bar from the report's category, despite the title", () => {
    expect(flashReportArea(r)).toBe("bar");
    expect(flashReportArea({ category: null, title: "MA7009-Buckleys Restaurant" })).toBe("restaurant");
    expect(flashReportArea({ category: "Pro Shop Merchandise", title: "x" })).toBe("pro_shop");
  });

  it("reports when the items don't match a day's total", () => {
    const broken = lines.map((l) => (l.startsWith("46 252 0.00 0.00") ? "46 252 0.00 0.00   999.00" : l));
    const b = parseFlashReport(broken)!;
    expect(b.mismatches[0]).toBe("2025-08-01: items add to 252.00, the report's day total is 999.00");
  });

  it("is null for anything else", () => {
    expect(isFlashReport(["INVOICE", "Page 1 of 2"])).toBe(false);
    expect(parseFlashReport(["INVOICE"])).toBeNull();
  });
});

describe("planning the import", () => {
  const plan = planFlashImport(parseFlashReport(lines)!, "bar");

  it("makes one revenue day per sales day and item rows per day", () => {
    expect(plan).toMatchObject({ outlet: "bar", begin: "2025-08-01", end: "2026-09-30", total: 22200.25 });
    expect(plan.days[0]).toEqual({ entry_date: "2025-08-01", amount: 252, items: 46 });
    expect(plan.months.find((m) => m.month === "2025-08")?.total).toBe(5027);
    const sum = Math.round(plan.itemDays.reduce((s, i) => s + i.net, 0) * 100) / 100;
    expect(sum).toBe(22200.25);
    const day1 = plan.itemDays.filter((i) => i.sale_date === "2025-08-01");
    expect(day1.find((i) => i.description === "DOMESTIC BEER")).toMatchObject({ qty: 15, net: 67.5 });
  });

  it("files the days as Bar revenue tied to the report", () => {
    const rows = revenueRows(plan, "rep1", "u1");
    expect(rows[0]).toEqual({
      entry_date: "2025-08-01",
      category: "bar",
      amount: 252,
      description: "RecTrac Buckley's bar sales (46 items)",
      source: "pos_upload",
      report_area: "bar",
      sales_report_id: "rep1",
      created_by: "u1",
    });
  });

  it("reads lines keyed with a lower-case inventory code (restaurant report, Aug 5 2025)", () => {
    const rest = parseFlashReport(
      readFileSync(join(__dirname, "..", "fixtures", "sales", "restaurant-flash-aug5-excerpt.txt"), "utf8").split("\n"),
    )!;
    expect(rest.mismatches).toEqual([]);
    expect(rest.dayTotals.get("2025-08-05")).toBe(101.6);
    expect(rest.sales.filter((s) => s.description === "BUFFALO TENDERS")).toEqual([
      expect.objectContaining({ inventoryCode: "MA7009-16-101-0", net: 5.25 }),
      expect.objectContaining({ inventoryCode: "MA7009-16-101-0", net: 5.25 }),
    ]);
    expect(rest.category).toBe("Golf Food");
    expect(flashReportArea(rest)).toBe("restaurant");
  });

  it("knows pro shop sales by the Golf Resale category, though the title says restaurant", () => {
    const pro = parseFlashReport(
      readFileSync(join(__dirname, "..", "fixtures", "sales", "proshop-flash-day1-excerpt.txt"), "utf8").split("\n"),
    )!;
    expect(pro).toMatchObject({ title: "MA7009-Buckleys Restaurant Sep 2026", category: "Golf Resale", mismatches: [] });
    expect(flashReportArea(pro)).toBe("pro_shop");
    expect(planFlashImport(pro, "pro_shop").days[0]).toMatchObject({ entry_date: "2025-08-01" });
  });
});
