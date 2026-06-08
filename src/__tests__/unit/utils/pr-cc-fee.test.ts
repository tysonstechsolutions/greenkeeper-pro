/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  CC_FEE_DESCRIPTION,
  CC_FEE_RATE,
  isCcFeeItem,
  isSalesTaxItem,
  isChargeItem,
  feeCategory,
  orderPurchaseItems,
  computeCcFeeAmount,
  rebalanceWithCcFee,
  formatCcFeePct,
  ccFeeDescription,
  parseCcFeeRate,
} from "@/lib/pr-cc-fee";
import type { PurchaseRequestItem } from "@/types/database";

function mkItem(overrides: Partial<PurchaseRequestItem> = {}): PurchaseRequestItem {
  return {
    item: 1,
    site: "",
    cost_ctr: "",
    gl_acct: "",
    description: "Toro mower blade",
    part_number: "100-1234",
    qty: 1,
    unit: "EA",
    unit_price: 0,
    ...overrides,
  };
}

describe("isCcFeeItem", () => {
  it("matches the canonical description exactly", () => {
    expect(isCcFeeItem({ description: CC_FEE_DESCRIPTION })).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isCcFeeItem({ description: `  ${CC_FEE_DESCRIPTION}  ` })).toBe(true);
  });

  it("rejects regular items", () => {
    expect(isCcFeeItem({ description: "Toro mower blade" })).toBe(false);
    expect(isCcFeeItem({ description: "Freight" })).toBe(false);
    expect(isCcFeeItem({ description: "" })).toBe(false);
    expect(isCcFeeItem({ description: null })).toBe(false);
  });
});

describe("computeCcFeeAmount", () => {
  it("returns 0 for an empty list", () => {
    expect(computeCcFeeAmount([])).toBe(0);
  });

  it("returns 0 when only the fee line is present", () => {
    expect(
      computeCcFeeAmount([
        mkItem({ description: CC_FEE_DESCRIPTION, unit_price: 5 }),
      ]),
    ).toBe(0);
  });

  it("computes 3% of the extended subtotal", () => {
    // 2 * 50 = 100 → 3
    expect(
      computeCcFeeAmount([mkItem({ qty: 2, unit_price: 50 })]),
    ).toBe(3);
  });

  it("ignores the fee row when computing the base subtotal", () => {
    // Real items: 2 * 50 = 100 → fee should be 3, not 3.something
    expect(
      computeCcFeeAmount([
        mkItem({ qty: 2, unit_price: 50 }),
        mkItem({ description: CC_FEE_DESCRIPTION, qty: 1, unit_price: 999 }),
      ]),
    ).toBe(3);
  });

  it("rounds to the nearest cent", () => {
    // 33.33 * 0.03 = 0.9999 → rounds to 1.00
    expect(
      computeCcFeeAmount([mkItem({ qty: 1, unit_price: 33.33 })]),
    ).toBe(1.0);
    // 10 * 0.03 = 0.30
    expect(
      computeCcFeeAmount([mkItem({ qty: 1, unit_price: 10 })]),
    ).toBe(0.3);
  });
});

describe("rebalanceWithCcFee", () => {
  it("adds a fee line when none exists", () => {
    const before = [mkItem({ item: 1, qty: 2, unit_price: 50 })];
    const after = rebalanceWithCcFee(before);
    expect(after).toHaveLength(2);
    expect(isCcFeeItem(after[1])).toBe(true);
    expect(after[1].unit_price).toBe(3);
    expect(after[1].qty).toBe(1);
    expect(after[1].unit).toBe("Each");
    expect(after[1].item).toBe(2);
  });

  it("renumbers non-fee items 1..N", () => {
    const before = [
      mkItem({ item: 17, description: "A" }),
      mkItem({ item: 42, description: "B" }),
    ];
    const after = rebalanceWithCcFee(before);
    expect(after.map((i) => i.item)).toEqual([1, 2, 3]);
  });

  it("places the fee at the end even if it was elsewhere", () => {
    const before = [
      mkItem({ description: CC_FEE_DESCRIPTION, unit_price: 99 }),
      mkItem({ description: "Toro blade", qty: 1, unit_price: 100 }),
    ];
    const after = rebalanceWithCcFee(before);
    expect(after).toHaveLength(2);
    expect(isCcFeeItem(after[0])).toBe(false);
    expect(isCcFeeItem(after[1])).toBe(true);
    // Recomputed to 3% of 100 = 3, not the stale 99.
    expect(after[1].unit_price).toBe(3);
  });

  it("collapses duplicate fee rows into one", () => {
    const before = [
      mkItem({ description: "Toro blade", qty: 1, unit_price: 100 }),
      mkItem({ description: CC_FEE_DESCRIPTION, unit_price: 3 }),
      mkItem({ description: CC_FEE_DESCRIPTION, unit_price: 3 }),
    ];
    const after = rebalanceWithCcFee(before);
    expect(after.filter(isCcFeeItem)).toHaveLength(1);
  });

  it("preserves the existing fee's accounting fields", () => {
    const before = [
      mkItem({ description: "X", qty: 1, unit_price: 100, site: "Foo" }),
      mkItem({
        description: CC_FEE_DESCRIPTION,
        site: "VMGC",
        cost_ctr: "12345",
        gl_acct: "67890",
        unit_price: 0,
      }),
    ];
    const after = rebalanceWithCcFee(before);
    const fee = after.find(isCcFeeItem)!;
    expect(fee.site).toBe("VMGC");
    expect(fee.cost_ctr).toBe("12345");
    expect(fee.gl_acct).toBe("67890");
    expect(fee.unit_price).toBe(3);
  });

  it("inherits accounting fields from the first non-fee item when no fee exists yet", () => {
    const before = [
      mkItem({ description: "X", site: "VMGC", cost_ctr: "1", gl_acct: "2" }),
    ];
    const after = rebalanceWithCcFee(before);
    const fee = after.find(isCcFeeItem)!;
    expect(fee.site).toBe("VMGC");
    expect(fee.cost_ctr).toBe("1");
    expect(fee.gl_acct).toBe("2");
  });

  it("returns the same reference when nothing needs to change", () => {
    const before = rebalanceWithCcFee([
      mkItem({ description: "X", qty: 1, unit_price: 100 }),
    ]);
    const after = rebalanceWithCcFee(before);
    // Same reference -> React would bail out of re-rendering.
    expect(after).toBe(before);
  });

  it("returns a new reference when the fee value must change", () => {
    const before = rebalanceWithCcFee([
      mkItem({ description: "X", qty: 1, unit_price: 100 }),
    ]);
    // Mutate a non-fee item's price -> fee should change.
    const mutated = [...before];
    mutated[0] = { ...mutated[0], unit_price: 200 };
    const after = rebalanceWithCcFee(mutated);
    expect(after).not.toBe(mutated);
    expect(after.find(isCcFeeItem)!.unit_price).toBe(6);
  });

  it("handles empty input by producing a fee at $0", () => {
    const after = rebalanceWithCcFee([]);
    expect(after).toHaveLength(1);
    expect(isCcFeeItem(after[0])).toBe(true);
    expect(after[0].unit_price).toBe(0);
    expect(after[0].item).toBe(1);
  });

  it("uses the documented 3% rate", () => {
    expect(CC_FEE_RATE).toBe(0.03);
  });
});

describe("custom fee rate", () => {
  it("formats percentages without trailing zeros", () => {
    expect(formatCcFeePct(0.03)).toBe("3");
    expect(formatCcFeePct(0.035)).toBe("3.5");
    expect(formatCcFeePct(0.0325)).toBe("3.25");
  });

  it("builds a rate-specific description", () => {
    expect(ccFeeDescription(0.03)).toBe("3% Credit Card Fee");
    expect(ccFeeDescription(0.035)).toBe("3.5% Credit Card Fee");
  });

  it("recognizes any-rate fee descriptions", () => {
    expect(isCcFeeItem({ description: "3.5% Credit Card Fee" })).toBe(true);
    expect(isCcFeeItem({ description: "10% Credit Card Fee" })).toBe(true);
  });

  it("parses the rate back out of a description", () => {
    expect(parseCcFeeRate("3% Credit Card Fee")).toBe(0.03);
    expect(parseCcFeeRate("3.5% Credit Card Fee")).toBe(0.035);
    expect(parseCcFeeRate("Toro blade")).toBe(CC_FEE_RATE);
    expect(parseCcFeeRate(null)).toBe(CC_FEE_RATE);
  });

  it("computes the fee at a custom rate", () => {
    expect(computeCcFeeAmount([mkItem({ qty: 1, unit_price: 100 })], 0.035)).toBe(3.5);
  });

  it("rebalances at a custom rate and labels the line", () => {
    const after = rebalanceWithCcFee([mkItem({ qty: 1, unit_price: 100 })], 0.035);
    const fee = after.find(isCcFeeItem)!;
    expect(fee.unit_price).toBe(3.5);
    expect(fee.description).toBe("3.5% Credit Card Fee");
  });

  it("recomputes and relabels a stale 3% fee line when the rate changes", () => {
    const before = [
      mkItem({ description: "X", qty: 1, unit_price: 100 }),
      mkItem({ description: "3% Credit Card Fee", unit_price: 3 }),
    ];
    const after = rebalanceWithCcFee(before, 0.035);
    const fee = after.find(isCcFeeItem)!;
    expect(fee.unit_price).toBe(3.5);
    expect(fee.description).toBe("3.5% Credit Card Fee");
  });
});

describe("isSalesTaxItem", () => {
  it("matches sales-tax descriptions (any casing/whitespace)", () => {
    expect(isSalesTaxItem({ description: "Sales Tax" })).toBe(true);
    expect(isSalesTaxItem({ description: "  sales tax " })).toBe(true);
    expect(isSalesTaxItem({ description: "Estimated Tax" })).toBe(true);
    expect(isSalesTaxItem({ description: "Tax" })).toBe(true);
  });

  it("does not match products, fees, or words that merely contain 'tax'", () => {
    expect(isSalesTaxItem({ description: "Toro mower blade" })).toBe(false);
    expect(isSalesTaxItem({ description: CC_FEE_DESCRIPTION })).toBe(false);
    expect(isSalesTaxItem({ description: "Syntax checker" })).toBe(false);
    expect(isSalesTaxItem({ description: "" })).toBe(false);
    expect(isSalesTaxItem({ description: null })).toBe(false);
  });
});

describe("isChargeItem", () => {
  it("matches shipping/handling/freight/delivery/processing/surcharge lines", () => {
    for (const d of [
      "Shipping",
      "Shipping & Handling",
      "Freight",
      "Delivery Charges (includes Fuel Surcharge of $7.83)",
      "Processing Fees",
      "Fuel Surcharge",
    ]) {
      expect(isChargeItem({ description: d })).toBe(true);
    }
  });

  it("does not match products, tax, or the CC-fee line", () => {
    expect(isChargeItem({ description: "Toro mower blade" })).toBe(false);
    expect(isChargeItem({ description: "Sales Tax" })).toBe(false);
    expect(isChargeItem({ description: CC_FEE_DESCRIPTION })).toBe(false);
    expect(isChargeItem({ description: "" })).toBe(false);
  });
});

describe("feeCategory", () => {
  it("maps tax and charge variants to a shared category, null otherwise", () => {
    expect(feeCategory({ description: "Sales Tax" })).toBe("tax");
    expect(feeCategory({ description: "Estimated Tax" })).toBe("tax");
    expect(feeCategory({ description: "Processing Fees" })).toBe("processing");
    expect(feeCategory({ description: "Estimated Processing Fees" })).toBe("processing");
    expect(feeCategory({ description: "Delivery Charges (includes Fuel Surcharge of $7.83)" })).toBe("delivery");
    expect(feeCategory({ description: "Shipping & Handling" })).toBe("shipping");
    expect(feeCategory({ description: "Freight" })).toBe("freight");
    expect(feeCategory({ description: "Toro mower blade" })).toBeNull();
    expect(feeCategory({ description: CC_FEE_DESCRIPTION })).toBeNull();
  });
});

describe("orderPurchaseItems", () => {
  it("orders products, then charges, then tax, then the CC fee", () => {
    const items = [
      mkItem({ description: "Shipping", unit_price: 15 }),
      mkItem({ description: "Widget", unit_price: 100 }),
      mkItem({ description: "Sales Tax", unit_price: 8 }),
      mkItem({ description: CC_FEE_DESCRIPTION, unit_price: 3 }),
      mkItem({ description: "Bracket", unit_price: 10 }),
      mkItem({ description: "Delivery", unit_price: 20 }),
    ];
    expect(orderPurchaseItems(items).map((i) => i.description)).toEqual([
      "Widget",
      "Bracket",
      "Shipping",
      "Delivery",
      "Sales Tax",
      CC_FEE_DESCRIPTION,
    ]);
  });

  it("is stable within a group and neither drops nor duplicates items", () => {
    const items = [
      mkItem({ description: "B" }),
      mkItem({ description: "A" }),
      mkItem({ description: "Freight" }),
    ];
    const ordered = orderPurchaseItems(items);
    expect(ordered).toHaveLength(3);
    expect(ordered.map((i) => i.description)).toEqual(["B", "A", "Freight"]);
  });
});

describe("sales tax is excluded from the 3% fee base", () => {
  it("computeCcFeeAmount ignores a Sales Tax line", () => {
    // products = 100, tax = 8.13 → fee = 3% of 100 = 3, NOT 3% of 108.13.
    expect(
      computeCcFeeAmount([
        mkItem({ qty: 1, unit_price: 100 }),
        mkItem({ description: "Sales Tax", qty: 1, unit_price: 8.13 }),
      ]),
    ).toBe(3);
  });

  it("rebalanceWithCcFee charges the fee on pre-tax items and keeps the tax line", () => {
    const after = rebalanceWithCcFee([
      mkItem({ description: "Widget", qty: 2, unit_price: 50 }), // 100
      mkItem({ description: "Sales Tax", qty: 1, unit_price: 8.13 }),
    ]);
    // The tax line survives as a normal line item.
    expect(after.some((i) => isSalesTaxItem(i))).toBe(true);
    // Fee is 3% of the pre-tax subtotal (100), not 108.13.
    const fee = after.find(isCcFeeItem)!;
    expect(fee.unit_price).toBe(3);
    // Fee remains the last row.
    expect(isCcFeeItem(after[after.length - 1])).toBe(true);
  });
});
