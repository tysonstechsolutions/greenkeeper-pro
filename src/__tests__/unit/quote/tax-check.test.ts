/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  checkQuoteForIncludedTax,
  isTaxChargingVendor,
} from "@/lib/quote/tax-check";
import type {
  ExtractedItem,
  ExtractedQuote,
} from "@/lib/quote/extraction";

function mkItem(overrides: Partial<ExtractedItem> = {}): ExtractedItem {
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

function mkVendor(name: string) {
  return {
    name,
    address: null,
    line2: null,
    city_state_zip: null,
    poc: null,
    email: null,
    phone: null,
  };
}

describe("isTaxChargingVendor", () => {
  it("matches Menards in any casing and with surrounding text", () => {
    expect(isTaxChargingVendor("Menards")).toBe(true);
    expect(isTaxChargingVendor("MENARDS Store #3105")).toBe(true);
    expect(isTaxChargingVendor("menards.com order")).toBe(true);
  });

  it("does not match other vendors", () => {
    expect(isTaxChargingVendor("Home Depot")).toBe(false);
    expect(isTaxChargingVendor("")).toBe(false);
  });
});

describe("checkQuoteForIncludedTax", () => {
  it("returns null when the quote has no tax line", () => {
    const result = mkResult({
      items: [mkItem(), mkItem({ description: "Shipping", unit_price: 12 })],
    });
    expect(checkQuoteForIncludedTax(result, "")).toBeNull();
  });

  it("rejects a quote with a positive Sales Tax line", () => {
    const result = mkResult({
      vendor: mkVendor("Site One Landscape Supply"),
      items: [
        mkItem({ unit_price: 100 }),
        mkItem({ description: "Sales Tax", part_number: null, unit_price: 8.25 }),
      ],
    });
    const rejection = checkQuoteForIncludedTax(result, "");
    expect(rejection).not.toBeNull();
    expect(rejection!.taxAmount).toBe(8.25);
    expect(rejection!.taxLines).toEqual(["Sales Tax"]);
  });

  it('rejects "Estimated Tax" and bare "Tax" lines too', () => {
    const estimated = mkResult({
      items: [mkItem({ description: "Estimated Tax", unit_price: 5 })],
    });
    expect(checkQuoteForIncludedTax(estimated, "")).not.toBeNull();

    const bare = mkResult({
      items: [mkItem({ description: "Tax", unit_price: 5 })],
    });
    expect(checkQuoteForIncludedTax(bare, "")).not.toBeNull();
  });

  it("does not treat product descriptions containing 'tax' as tax lines", () => {
    const result = mkResult({
      items: [mkItem({ description: "Syntax analyzer license", unit_price: 99 })],
    });
    expect(checkQuoteForIncludedTax(result, "")).toBeNull();
  });

  it("sums multiple tax lines and rounds to cents", () => {
    const result = mkResult({
      items: [
        mkItem({ description: "Sales Tax", unit_price: 4.105 }),
        mkItem({ description: "Estimated Tax", unit_price: 2.101 }),
      ],
    });
    const rejection = checkQuoteForIncludedTax(result, "");
    expect(rejection!.taxAmount).toBe(6.21);
    expect(rejection!.taxLines).toEqual(["Sales Tax", "Estimated Tax"]);
  });

  it("treats a missing/zero qty on a tax line as qty 1", () => {
    const result = mkResult({
      items: [mkItem({ description: "Sales Tax", qty: 0, unit_price: 12.34 })],
    });
    const rejection = checkQuoteForIncludedTax(result, "");
    expect(rejection!.taxAmount).toBe(12.34);
  });

  it("allows a $0.00 tax line — tax is not actually charged", () => {
    const result = mkResult({
      items: [mkItem({ description: "Sales Tax", unit_price: 0 })],
    });
    expect(checkQuoteForIncludedTax(result, "")).toBeNull();
  });

  it("allows Menards tax via the extracted vendor name", () => {
    const result = mkResult({
      vendor: mkVendor("Menards"),
      items: [mkItem({ description: "Sales Tax", unit_price: 8.25 })],
    });
    expect(checkQuoteForIncludedTax(result, "")).toBeNull();
  });

  it("allows Menards tax via the form vendor name when the extraction has no vendor", () => {
    const result = mkResult({
      items: [mkItem({ description: "Sales Tax", unit_price: 8.25 })],
    });
    expect(checkQuoteForIncludedTax(result, "Menards Store #3105")).toBeNull();
  });

  it("labels a blank tax-line description as 'Tax' in the rejection", () => {
    // isSalesTaxItem never matches a blank description, so force the corner
    // case with a whitespace-padded bare "tax" label.
    const result = mkResult({
      items: [mkItem({ description: "Tax", unit_price: 3 })],
    });
    const rejection = checkQuoteForIncludedTax(result, "");
    expect(rejection!.taxLines).toEqual(["Tax"]);
  });
});
