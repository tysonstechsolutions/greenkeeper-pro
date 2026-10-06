import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TextPiece } from "@/lib/pdf/text-lines";
import { costCenterLabel, isBudgetReport, parseBudgetReport, type BudgetBlock } from "@/lib/sap/budget-report";

// Three pages of the real FY26 period 12 report: pro shop merchandise (20086)
// and Buckley's food & bar (20091), which runs over two pages.
const pages = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "sap", "budget-pages.json"), "utf8")) as TextPiece[][];

const line = (b: BudgetBlock, label: string, code: string | null = null) =>
  b.lines.find((l) => l.label === label && (code == null || l.code === code))!;

describe("SAP budget performance report", () => {
  const r = parseBudgetReport(pages)!;

  it("reads the period and every cost center, and each one checks out against itself", () => {
    expect(isBudgetReport(pages)).toBe(true);
    expect(r).toMatchObject({ fiscalYear: 2026, period: 12, periodName: "September", runDate: "2026-10-06", mismatches: [] });
    expect(r.blocks.map((b) => [b.costCenter, b.activity])).toEqual([
      ["20086", "00..ZZ"],
      ["20091", "00..ZZ"],
    ]);
  });

  it("puts every number in its column even when columns are blank", () => {
    const b = r.blocks.find((x) => x.costCenter === "20091")!;
    expect(b.costCenterName).toMatch(/BUCKLEY/);
    // Bar revenue has no plan: the 1,210 belongs under ACTUAL and VAR, not PLAN.
    expect(line(b, "RESALE REVENUE BAR", "301120")).toMatchObject({
      section: "revenue",
      level: 0,
      month: { actual: 1210, plan: null, variance: 1210, variancePct: null, prior: 5652 },
      ytd: { actual: 19166, plan: null, variance: 19166, variancePct: null, prior: 32114 },
    });
    // Trailing minus signs are negatives.
    expect(line(b, "RESALE REVENUE FOOD", "301110").ytd).toEqual({ actual: 28765, plan: 179800, variance: -151035, variancePct: -84, prior: 34372 });
    expect(line(b, "EE MEALS 50% DISC", "303002").ytd.actual).toBe(-503);
  });

  it("keeps subtotals with their level", () => {
    const b = r.blocks.find((x) => x.costCenter === "20091")!;
    expect(line(b, "COGS FOOD")).toMatchObject({ section: "cost", level: 1, code: null, ytd: { actual: 22791, plan: 62930 } });
    expect(line(b, "COGS BAR").ytd.actual).toBe(8078);
    expect(line(b, "REVENUE")).toMatchObject({ level: 4, ytd: { actual: 89951, plan: 342400 } });
    expect(line(b, "EXPENSE")).toMatchObject({ level: 4, ytd: { actual: 157291 } });
    expect(line(b, "PROFIT / LOSS")).toMatchObject({ section: "result", ytd: { actual: -67341, plan: 73729, prior: -67057 } });
    expect(line(b, "SELF SUFFICIENCY %").ytd).toMatchObject({ actual: 57, plan: 127, prior: 63 });
  });

  it("reads the pro shop's merchandise", () => {
    const b = r.blocks.find((x) => x.costCenter === "20086")!;
    expect(line(b, "RESALE REVENUE MDSE", "301130").ytd.actual).toBe(21040);
    expect(line(b, "COST OF GOODS SOLD").ytd.actual).toBe(11169);
  });

  it("flags a cost center that doesn't add up", () => {
    const bent = pages.map((p) => p.map((x) => (x.str.trim() === "67,341-" ? { ...x, str: "67,000-" } : x)));
    expect(parseBudgetReport(bent)!.mismatches).toEqual([
      expect.stringContaining("20091 (00..ZZ) year to date"),
    ]);
  });

  it("is not some other PDF", () => {
    expect(parseBudgetReport([[{ str: "Flash Report", x: 0, y: 0, width: 10, height: 10 }]])).toBeNull();
  });

  it("names cost centers plainly", () => {
    expect(costCenterLabel("20091", "x")).toBe("Buckley's food & bar");
    expect(costCenterLabel("99999", "SOMETHING ELSE 1353")).toBe("SOMETHING ELSE");
  });
});
