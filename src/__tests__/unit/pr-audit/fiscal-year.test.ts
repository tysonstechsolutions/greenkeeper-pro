/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  federalFiscalYear,
  federalFiscalYearFromIso,
  fiscalMonthIndex,
  currentFederalFiscalYear,
  fiscalYearShort,
  fiscalYearLabel,
  FISCAL_MONTH_LABELS,
} from "@/lib/pr-audit/fiscal-year";

describe("federalFiscalYear", () => {
  it("rolls Oct–Dec into the next calendar year's FY", () => {
    expect(federalFiscalYear(new Date(2025, 9, 1))).toBe(2026); // Oct 1 2025
    expect(federalFiscalYear(new Date(2025, 11, 31))).toBe(2026); // Dec 31 2025
  });

  it("keeps Jan–Sep in the same calendar year's FY", () => {
    expect(federalFiscalYear(new Date(2026, 0, 15))).toBe(2026); // Jan
    expect(federalFiscalYear(new Date(2026, 8, 30))).toBe(2026); // Sep 30 2026
  });
});

describe("federalFiscalYearFromIso", () => {
  it("parses an ISO date as local (no UTC off-by-one)", () => {
    expect(federalFiscalYearFromIso("2025-10-01")).toBe(2026);
    expect(federalFiscalYearFromIso("2025-09-30")).toBe(2025);
  });
});

describe("fiscalMonthIndex", () => {
  it("orders October first and September last", () => {
    expect(fiscalMonthIndex(new Date(2025, 9, 1))).toBe(0); // Oct
    expect(fiscalMonthIndex(new Date(2025, 10, 1))).toBe(1); // Nov
    expect(fiscalMonthIndex(new Date(2025, 11, 1))).toBe(2); // Dec
    expect(fiscalMonthIndex(new Date(2026, 0, 1))).toBe(3); // Jan
    expect(fiscalMonthIndex(new Date(2026, 8, 1))).toBe(11); // Sep
  });

  it("matches the FISCAL_MONTH_LABELS ordering", () => {
    expect(FISCAL_MONTH_LABELS[0]).toBe("Oct");
    expect(FISCAL_MONTH_LABELS[11]).toBe("Sep");
    expect(FISCAL_MONTH_LABELS).toHaveLength(12);
  });
});

describe("labels", () => {
  it("formats short and long FY labels", () => {
    expect(fiscalYearShort(2026)).toBe("FY26");
    expect(fiscalYearLabel(2026)).toBe("FY26 (Oct 2025 – Sep 2026)");
  });
});

describe("currentFederalFiscalYear", () => {
  it("uses the supplied date", () => {
    expect(currentFederalFiscalYear(new Date(2025, 9, 5))).toBe(2026);
    expect(currentFederalFiscalYear(new Date(2026, 5, 8))).toBe(2026);
  });
});
