/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  combineExtractions,
  hasRealItems,
  type ExtractedQuote,
  type ExtractedItem,
} from "@/lib/quote/extraction";
import type { PurchaseRequestItem } from "@/types/database";

function mkExtractedItem(
  overrides: Partial<ExtractedItem> = {},
): ExtractedItem {
  return {
    description: "Toro mower blade",
    part_number: "100-1234",
    qty: 1,
    unit: "Each",
    unit_price: 25,
    ...overrides,
  };
}

function mkResult(overrides: Partial<ExtractedQuote> = {}): ExtractedQuote {
  return {
    vendor: null,
    items: [],
    warnings: [],
    ...overrides,
  };
}

function mkPrItem(
  overrides: Partial<PurchaseRequestItem> = {},
): PurchaseRequestItem {
  return {
    item: 1,
    site: "",
    cost_ctr: "",
    gl_acct: "",
    description: "",
    part_number: "",
    qty: 0,
    unit: "",
    unit_price: 0,
    ...overrides,
  };
}

describe("combineExtractions", () => {
  it("returns an empty result when given no pages", () => {
    const combined = combineExtractions([]);
    expect(combined.items).toEqual([]);
    expect(combined.vendor).toBeNull();
    expect(combined.warnings).toEqual([]);
  });

  it("returns the single page unchanged when given exactly one", () => {
    const only = mkResult({
      vendor: { name: "Toro Direct", address: null, line2: null, city_state_zip: null, poc: null, email: null, phone: null },
      items: [mkExtractedItem({ description: "Blade" })],
      warnings: ["one warning"],
    });
    // Same reference -> proves the proven single-page path is untouched.
    expect(combineExtractions([only])).toBe(only);
  });

  it("concatenates items from multiple pages in page order", () => {
    const page1 = mkResult({ items: [mkExtractedItem({ description: "A", part_number: "A1" })] });
    const page2 = mkResult({
      items: [
        mkExtractedItem({ description: "B", part_number: "B1" }),
        mkExtractedItem({ description: "C", part_number: "C1" }),
      ],
    });
    const combined = combineExtractions([page1, page2]);
    expect(combined.items.map((i) => i.description)).toEqual(["A", "B", "C"]);
  });

  it("collapses an exact-duplicate row produced by overlapping screenshots", () => {
    // Page 1 ends with row B; page 2 (overlapping) starts again with B.
    const page1 = mkResult({
      items: [
        mkExtractedItem({ description: "A", part_number: "A1", qty: 1, unit_price: 10 }),
        mkExtractedItem({ description: "B", part_number: "B1", qty: 2, unit_price: 20 }),
      ],
    });
    const page2 = mkResult({
      items: [
        mkExtractedItem({ description: "B", part_number: "B1", qty: 2, unit_price: 20 }),
        mkExtractedItem({ description: "D", part_number: "D1", qty: 1, unit_price: 40 }),
      ],
    });
    const combined = combineExtractions([page1, page2]);
    expect(combined.items.map((i) => i.description)).toEqual(["A", "B", "D"]);
  });

  it("matches duplicates case-insensitively and ignoring surrounding whitespace", () => {
    const page1 = mkResult({ items: [mkExtractedItem({ description: "Fuel Line", part_number: "SME 1" })] });
    const page2 = mkResult({ items: [mkExtractedItem({ description: "  fuel line ", part_number: "sme 1" })] });
    const combined = combineExtractions([page1, page2]);
    expect(combined.items).toHaveLength(1);
  });

  it("keeps rows that differ only by quantity (not duplicates)", () => {
    const page1 = mkResult({ items: [mkExtractedItem({ description: "A", part_number: "A1", qty: 1, unit_price: 10 })] });
    const page2 = mkResult({ items: [mkExtractedItem({ description: "A", part_number: "A1", qty: 3, unit_price: 10 })] });
    const combined = combineExtractions([page1, page2]);
    expect(combined.items).toHaveLength(2);
  });

  it("fills each vendor field from the first page that has it", () => {
    const page1 = mkResult({
      vendor: { name: "Toro Direct", address: null, line2: null, city_state_zip: null, poc: null, email: null, phone: null },
    });
    const page2 = mkResult({
      vendor: { name: "Ignored Second Name", address: "123 Main St", line2: null, city_state_zip: "Reno, NV 89501", poc: null, email: "sales@toro.com", phone: null },
    });
    const combined = combineExtractions([page1, page2]);
    expect(combined.vendor).toEqual({
      name: "Toro Direct",
      address: "123 Main St",
      line2: null,
      city_state_zip: "Reno, NV 89501",
      poc: null,
      email: "sales@toro.com",
      phone: null,
    });
  });

  it("returns a null vendor when no page identified one", () => {
    const combined = combineExtractions([mkResult(), mkResult()]);
    expect(combined.vendor).toBeNull();
  });

  it("treats empty-string vendor fields as missing", () => {
    const page1 = mkResult({
      vendor: { name: "", address: "", line2: "", city_state_zip: "", poc: "", email: "", phone: "" },
    });
    const page2 = mkResult({
      vendor: { name: "NAPA", address: null, line2: null, city_state_zip: null, poc: null, email: null, phone: null },
    });
    const combined = combineExtractions([page1, page2]);
    expect(combined.vendor?.name).toBe("NAPA");
  });

  it("merges and de-duplicates warnings across pages", () => {
    const page1 = mkResult({ warnings: ["couldn't read PN for row 2", "blurry"] });
    const page2 = mkResult({ warnings: ["blurry", "low light"] });
    const combined = combineExtractions([page1, page2]);
    expect(combined.warnings).toEqual(["couldn't read PN for row 2", "blurry", "low light"]);
  });

  it("concatenates clarifications and de-duplicates by question text", () => {
    const page1 = mkResult({
      clarifications: [{ question: "Which rental period?", options: null, applies_to: null }],
    });
    const page2 = mkResult({
      clarifications: [
        { question: "Which rental period?", options: null, applies_to: null },
        { question: "How many boxes?", options: null, applies_to: null },
      ],
    });
    const combined = combineExtractions([page1, page2]);
    expect((combined.clarifications ?? []).map((c) => c.question)).toEqual([
      "Which rental period?",
      "How many boxes?",
    ]);
  });
});

describe("combineExtractions — warning hygiene across pages", () => {
  // Reproduces the real Menards bug: a totals/summary page and an itemized
  // page were both read. The summary page emitted per-page "this page has no
  // products" notes that became false/contradictory once the other page
  // supplied 23 products. Those notes made a perfect extraction look broken.
  const summaryPage = mkResult({
    items: [
      mkExtractedItem({ description: "Processing Fees", part_number: null, qty: 1, unit: "fee", unit_price: 32.2 }),
      mkExtractedItem({ description: "Delivery Charges (includes Fuel Surcharge of $7.83)", part_number: null, qty: 1, unit: "fee", unit_price: 125.38 }),
    ],
    warnings: [
      "Only an Order Summary totals page was provided — no individual product line items are visible. Captured Processing Fees and Delivery Charges as line items. Please provide the full cart or invoice page to extract individual products.",
      "Merchandise Subtotal of $1,977.87 represents one or more products not shown in this image.",
    ],
  });
  const itemsPage = mkResult({
    vendor: { name: "Menards", address: null, line2: null, city_state_zip: null, poc: null, email: null, phone: null },
    items: [
      mkExtractedItem({ description: "Roundup Weed & Grass Killer", part_number: "2638034", qty: 3, unit_price: 19.98 }),
      mkExtractedItem({ description: "Husqvarna Pressure Washer", part_number: "2611717", qty: 1, unit_price: 199.99 }),
    ],
    warnings: [
      "Estimated Processing Fees of $32.20 shown in Order Summary — not included as a line item; confirm with contracting officer whether this fee should be added to the PR.",
      "Extended Protection Plan upsell ($29.94) for the Wild Badger string trimmer was skipped — add manually if desired.",
    ],
  });

  it("keeps every item and the vendor when combining a summary page with an items page", () => {
    const combined = combineExtractions([summaryPage, itemsPage]);
    expect(combined.items).toHaveLength(4); // 2 fees + 2 products
    expect(combined.items.map((i) => i.description)).toContain("Roundup Weed & Grass Killer");
    expect(combined.vendor?.name).toBe("Menards");
  });

  it("drops page-scope 'no line items / not shown / provide the full cart' noise", () => {
    const w = combineExtractions([summaryPage, itemsPage]).warnings;
    expect(w.some((x) => /no individual product line items/i.test(x))).toBe(false);
    expect(w.some((x) => /not shown in this image/i.test(x))).toBe(false);
    expect(w.some((x) => /only an order summary/i.test(x))).toBe(false);
  });

  it("drops the contradictory 'fee not included as a line item' note (the fee IS included from the other page)", () => {
    const w = combineExtractions([summaryPage, itemsPage]).warnings;
    expect(w.some((x) => /not included as a line item/i.test(x))).toBe(false);
  });

  it("keeps genuinely useful, page-agnostic warnings", () => {
    const w = combineExtractions([summaryPage, itemsPage]).warnings;
    expect(w).toContain(
      "Extended Protection Plan upsell ($29.94) for the Wild Badger string trimmer was skipped — add manually if desired.",
    );
  });

  it("does NOT scrub a real data-quality warning that happens to mention a part number", () => {
    const p1 = mkResult({ items: [mkExtractedItem({ description: "A" })], warnings: ["couldn't read the part number for the Toro switch row"] });
    const p2 = mkResult({ items: [mkExtractedItem({ description: "B" })], warnings: [] });
    const w = combineExtractions([p1, p2]).warnings;
    expect(w).toContain("couldn't read the part number for the Toro switch row");
  });

  it("leaves single-page warnings untouched (a lone summary page should still say 'upload the cart')", () => {
    const lone = mkResult({ items: [], warnings: ["no line items found"] });
    // Single result is returned as-is — that guidance is still helpful.
    expect(combineExtractions([lone]).warnings).toContain("no line items found");
  });
});

describe("combineExtractions — sales tax", () => {
  it("keeps a single sales-tax line from a summary page", () => {
    const itemsPage = mkResult({ items: [mkExtractedItem({ description: "Widget", part_number: "W1", qty: 1, unit_price: 100 })] });
    const summary = mkResult({ items: [mkExtractedItem({ description: "Sales Tax", part_number: null, qty: 1, unit: null, unit_price: 8.13 })] });
    const combined = combineExtractions([itemsPage, summary]);
    const tax = combined.items.filter((i) => /sales tax/i.test(i.description));
    expect(tax).toHaveLength(1);
    expect(tax[0].unit_price).toBe(8.13);
  });

  it("collapses tax lines from multiple pages into one, keeping the largest (final) amount", () => {
    // A cart page shows an early estimate; the order-summary page shows the
    // final tax. Both reads emit a tax line — the PR must not be taxed twice.
    const cartPage = mkResult({
      items: [
        mkExtractedItem({ description: "A", part_number: "A1", qty: 1, unit_price: 50 }),
        mkExtractedItem({ description: "Estimated Tax", part_number: null, qty: 1, unit: null, unit_price: 3.9 }),
      ],
    });
    const summaryPage = mkResult({
      items: [mkExtractedItem({ description: "Sales Tax", part_number: null, qty: 1, unit: null, unit_price: 4.07 })],
    });
    const combined = combineExtractions([cartPage, summaryPage]);
    const tax = combined.items.filter((i) => /\btax\b/i.test(i.description));
    expect(tax).toHaveLength(1);
    expect(tax[0].unit_price).toBe(4.07);
    expect(combined.items.some((i) => i.description === "A")).toBe(true);
  });
});

describe("hasRealItems", () => {
  it("is false for an empty list", () => {
    expect(hasRealItems([])).toBe(false);
  });

  it("is false for a single blank default item", () => {
    expect(hasRealItems([mkPrItem()])).toBe(false);
  });

  it("is true when an item has a description", () => {
    expect(hasRealItems([mkPrItem({ description: "Toro blade" })])).toBe(true);
  });

  it("is true when an item has a part number", () => {
    expect(hasRealItems([mkPrItem({ part_number: "100-1234" })])).toBe(true);
  });

  it("is true when an item has a positive quantity", () => {
    expect(hasRealItems([mkPrItem({ qty: 2 })])).toBe(true);
  });

  it("is true when an item has a positive unit price", () => {
    expect(hasRealItems([mkPrItem({ unit_price: 9.99 })])).toBe(true);
  });

  it("counts the auto-managed credit-card fee row as real (matches existing replace/append behavior)", () => {
    expect(hasRealItems([mkPrItem({ description: "3% Credit Card Fee", qty: 1, unit_price: 0 })])).toBe(true);
  });
});
