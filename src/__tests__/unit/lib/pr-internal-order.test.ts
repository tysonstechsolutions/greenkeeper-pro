/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { formatInternalOrder } from "@/lib/pr-internal-order";
import { quoteFilename, purchaseRequestPdfFilename, quoteFilenameBase, resolveIoSeqPlaceholder } from "@/lib/reports/pr-naming";
import type { PurchaseRequest } from "@/types/database";

describe("formatInternalOrder", () => {
  it("uses the stored fiscal year over the date (FY27 opened in Sept 2026)", () => {
    expect(formatInternalOrder(2, "2026-09-22", 2027)).toBe("FY27-GC-0002");
  });

  it("falls back to the federal fiscal year of the date when none is stored", () => {
    expect(formatInternalOrder(60, "2026-09-22")).toBe("FY26-GC-0060");
    expect(formatInternalOrder(60, "2026-09-22", null)).toBe("FY26-GC-0060");
    expect(formatInternalOrder(5, "2026-10-01")).toBe("FY27-GC-0005");
  });

  it("returns null until a number is assigned", () => {
    expect(formatInternalOrder(null, "2026-09-22", 2027)).toBeNull();
  });
});

describe("PR filenames carry the fiscal-year number", () => {
  const pr = {
    pr_sequence_number: 2,
    pr_fiscal_year: 2027,
    date_prepared: "2026-09-22",
    vendor1_name: "Ace Hardware",
  } as PurchaseRequest;
  const now = new Date(2026, 8, 22);

  it("quote", () => {
    expect(quoteFilename(pr, "pdf", now)).toBe(
      "QUOTE-FY27-GC-0002-AceHardware-Golf Course-September2026.pdf",
    );
  });

  it("PR pdf", () => {
    expect(purchaseRequestPdfFilename(pr, now)).toBe(
      "PR-FY27-GC-0002 - Ace Hardware - Golf Course - September 2026.pdf",
    );
  });
});

describe("quote label before and after the number exists", () => {
  const base = {
    pr_sequence_number: null,
    pr_fiscal_year: 2027,
    date_prepared: "2026-09-22",
    vendor1_name: "Russo Power Equipment",
  } as unknown as PurchaseRequest;

  it("previews the fiscal year procurement opened, not the one the date implies", () => {
    expect(quoteFilenameBase(base)).toBe("QUOTE-FY27-GC-####-RussoPowerEquipment-Golf Course-September2026");
  });

  it("fills in the number — and the year — the database assigned", () => {
    // A label written with the date's year (FY26) still resolves to FY27.
    const saved = "QUOTE-FY26-GC-####-RussoPowerEquipment-Golf Course-September2026 and SOW";
    expect(resolveIoSeqPlaceholder(saved, 2, 2027)).toBe(
      "QUOTE-FY27-GC-0002-RussoPowerEquipment-Golf Course-September2026 and SOW",
    );
    expect(resolveIoSeqPlaceholder("Vendor Quote", 2, 2027)).toBe("Vendor Quote");
  });

  it("names the saved PR's quote with its stored fiscal year", () => {
    expect(quoteFilenameBase({ ...base, pr_sequence_number: 2 })).toBe(
      "QUOTE-FY27-GC-0002-RussoPowerEquipment-Golf Course-September2026",
    );
  });
});
