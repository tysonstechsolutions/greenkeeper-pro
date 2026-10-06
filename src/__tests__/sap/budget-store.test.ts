import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TextPiece } from "@/lib/pdf/text-lines";
import { parseBudgetReport } from "@/lib/sap/budget-report";
import {
  blocksFromRows,
  budgetLineRows,
  budgetReportRow,
  budgetSummary,
  goodsKind,
  mainBlocks,
  officialForArea,
  officialNotes,
  periodMonth,
} from "@/lib/sap/budget-store";

const pages = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "sap", "budget-pages.json"), "utf8")) as TextPiece[][];
const report = parseBudgetReport(pages)!;
const saved = blocksFromRows(budgetLineRows(report, "r1"));

describe("SAP budget reports saved and read back", () => {
  it("saves one row per printed line and reads back the same report", () => {
    expect(budgetReportRow(report, "sap.pdf")).toEqual({ fiscal_year: 2026, period: 12, period_name: "September", run_date: "2026-10-06", source_file: "sap.pdf" });
    const rows = budgetLineRows(report, "r1");
    expect(rows).toHaveLength(report.blocks.reduce((s, b) => s + b.lines.length, 0));
    expect(rows[0]).toMatchObject({ report_id: "r1", cost_center: "20086", activity: "00..ZZ", line_no: 1, code: "301130", ytd_actual: 21040 });
    expect(saved.map((b) => [b.costCenter, b.lines.length])).toEqual(report.blocks.map((b) => [b.costCenter, b.lines.length]));
    // Variance is worked out again: better than plan is positive for revenue and for cost.
    const bb = saved.find((b) => b.costCenter === "20091")!;
    expect(bb.lines.find((l) => l.code === "301110")!.ytd).toMatchObject({ actual: 28765, plan: 179800, variance: -151035, variancePct: -84 });
    expect(bb.lines.find((l) => l.label === "COGS FOOD")!.ytd).toMatchObject({ variance: 40139, variancePct: 64 });
  });

  it("keeps the all-activities block for each cost center", () => {
    const two = [
      { ...saved[0], activity: "40 GOLF PROGRAM" },
      saved[0],
      saved[1],
    ];
    expect(mainBlocks(two).map((b) => [b.costCenter, b.activity])).toEqual([
      ["20086", "00..ZZ"],
      ["20091", "00..ZZ"],
    ]);
  });

  it("works out the official cost of goods % for food, bar, and merchandise", () => {
    const buckleys = budgetSummary(saved.find((b) => b.costCenter === "20091")!, "ytd");
    expect(buckleys.revenue.actual).toBe(89951);
    expect(buckleys.expense.actual).toBe(157291);
    expect(buckleys.profit).toMatchObject({ actual: -67341, plan: 73729, prior: -67057 });
    expect(buckleys.selfSufficiency.actual).toBe(57);
    expect(buckleys.goods).toEqual([
      // 22,791 of 28,765 resale + 9,629 catering.
      { kind: "food", sales: { actual: 38394, plan: 229800, prior: 49926 }, cogs: { actual: 22791, plan: 62930, prior: 28335 }, pct: { actual: 59.4, plan: 27.4, prior: 56.8 } },
      { kind: "bar", sales: { actual: 19366, plan: 107400, prior: 33514 }, cogs: { actual: 8078, plan: 26850, prior: 7732 }, pct: { actual: 41.7, plan: 25, prior: 23.1 } },
    ]);
    const shop = budgetSummary(saved.find((b) => b.costCenter === "20086")!, "ytd");
    expect(shop.goods).toEqual([
      { kind: "merchandise", sales: { actual: 21040, plan: 30000, prior: 14202 }, cogs: { actual: 11169, plan: 15000, prior: 9934 }, pct: { actual: 53.1, plan: 50, prior: 69.9 } },
    ]);
    // September cost wasn't posted yet: no cost, so no %.
    expect(budgetSummary(saved.find((b) => b.costCenter === "20086")!, "month").goods[0].pct.actual).toBeNull();
  });

  it("knows which goods an element is about", () => {
    expect(goodsKind("301110")).toEqual({ kind: "food", side: "sales" });
    expect(goodsKind("302220")).toEqual({ kind: "bar", side: "sales" });
    expect(goodsKind("401116")).toEqual({ kind: "food", side: "cogs" });
    expect(goodsKind("401130")).toEqual({ kind: "merchandise", side: "cogs" });
    expect(goodsKind("303002")).toBeNull();
    expect(goodsKind("501000")).toBeNull();
    expect(goodsKind(null)).toBeNull();
  });

  it("turns a fiscal period into its month", () => {
    expect(periodMonth(2026, 1)).toBe("2025-10");
    expect(periodMonth(2026, 3)).toBe("2025-12");
    expect(periodMonth(2026, 4)).toBe("2026-01");
    expect(periodMonth(2026, 12)).toBe("2026-09");
  });

  it("gives Performance each area's official numbers and what they say", () => {
    const stored = { id: "r1", fiscal_year: 2026, period: 12, period_name: "September", run_date: "2026-10-06", source_file: null };
    const food = officialForArea(stored, saved, "restaurant")!;
    expect(food).toEqual({ kind: "food", fiscalYear: 2026, period: 12, periodName: "September", through: "2026-09", sales: 38394, cogs: 22791, pct: 59.4, planPct: 27.4, priorPct: 56.8 });
    expect(officialForArea(stored, saved, "pro_shop")).toMatchObject({ kind: "merchandise", sales: 21040, pct: 53.1 });
    expect(officialForArea(stored, [], "bar")).toBeNull();

    // RecTrac had $15,781 of the $38,394: most food sales aren't here.
    const notes = officialNotes(food, 15781, 35, "FY26");
    expect(notes.map((n) => [n.level, n.title, n.dollars])).toEqual([
      ["watch", "SAP has $22,613 more food sales than the reports here", 22613],
      ["act", "Official food cost of goods is 59.4%, target 35%", 9353],
    ]);
    expect(notes[0].detail).toContain("SAP shows $38,394 of food sales for FY26 through September (resale and catering), the sales entered here for those months add up to $15,781.");
    expect(notes[1].detail).toBe("SAP: $22,791 cost on $38,394 sales, FY26 through September, plan 27.4%, last year 56.8%. At 35% the cost would have been $13,438.");

    // Pro shop at 53.1% of a 65% target, with its sales all here: nothing to say.
    expect(officialNotes(officialForArea(stored, saved, "pro_shop")!, 21000, 65, "FY26")).toEqual([]);
  });
});
