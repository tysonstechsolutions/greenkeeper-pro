/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  CC_FEE_DESCRIPTION,
  CC_FEE_RATE,
  isCcFeeItem,
  computeCcFeeAmount,
  rebalanceWithCcFee,
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
    expect(after[1].unit).toBe("EA");
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
