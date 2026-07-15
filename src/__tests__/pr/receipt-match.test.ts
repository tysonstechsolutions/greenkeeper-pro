import { describe, it, expect } from "vitest";
import { prAutoCompletes, prIsComplete } from "@/lib/pr-reconciliation";
import type { PurchaseRequest } from "@/types/database";
import { matchReceiptToPr, matchSummary } from "@/lib/pr/receipt-match";
import type { ExtractedReceipt } from "@/lib/pr/receipt-extract";
import type { PurchaseRequestItem } from "@/types/database";

function prItem(
  description: string,
  qty: number,
  unit_price: number,
): PurchaseRequestItem {
  return {
    item: 1,
    site: "SITE_1",
    cost_ctr: "",
    gl_acct: "",
    description,
    qty,
    unit: "EA",
    unit_price,
  } satisfies PurchaseRequestItem;
}

function receipt(
  items: { description: string; qty: number; unit_price: number }[],
  total: number | null = null,
): ExtractedReceipt {
  return {
    vendor: "Test Vendor",
    purchase_date: "2026-07-14",
    subtotal: null,
    tax: null,
    total,
    items: items.map((i) => ({
      ...i,
      line_total: Math.round(i.qty * i.unit_price * 100) / 100,
    })),
    warnings: [],
  };
}

describe("prAutoCompletes", () => {
  it("completes when the receipt is under the submitted total", () => {
    expect(prAutoCompletes(46.35, 40.0)).toBe(true);
  });

  it("completes when the receipt matches exactly", () => {
    expect(prAutoCompletes(46.35, 46.35)).toBe(true);
  });

  it("does NOT complete when the receipt is over — even by a penny", () => {
    expect(prAutoCompletes(46.35, 46.36)).toBe(false);
  });

  it("compares in whole cents so float drift can't wrongly reject a match", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754; must still count as equal.
    expect(prAutoCompletes(0.1 + 0.2, 0.3)).toBe(true);
    expect(prAutoCompletes(46.35, 15.45 + 30.9)).toBe(true);
  });

  it("completes a $0 receipt against any total", () => {
    expect(prAutoCompletes(46.35, 0)).toBe(true);
  });
});

describe("prIsComplete", () => {
  it("is false until completed_at is set", () => {
    expect(prIsComplete({ completed_at: null } as PurchaseRequest)).toBe(false);
    expect(prIsComplete({} as PurchaseRequest)).toBe(false);
  });

  it("is true once completed_at is set", () => {
    expect(
      prIsComplete({ completed_at: "2026-07-15T12:00:00Z" } as PurchaseRequest),
    ).toBe(true);
  });
});

describe("matchReceiptToPr", () => {
  it("reports a clean match when quantities and prices line up", () => {
    const pr = [prItem("Bag of grass seed", 2, 25), prItem("Fertilizer 50lb", 1, 40)];
    const r = receipt(
      [
        { description: "Grass seed bag", qty: 2, unit_price: 25 },
        { description: "50lb fertilizer", qty: 1, unit_price: 40 },
      ],
      90,
    );
    const m = matchReceiptToPr(pr, r);
    expect(m.differences).toBe(0);
    expect(m.lines.every((l) => l.status === "match")).toBe(true);
    expect(m.receiptTotal).toBe(90);
    expect(matchSummary(m)).toMatch(/matches/i);
  });

  it("flags a unit-price difference", () => {
    const pr = [prItem("Fertilizer 50lb", 1, 40)];
    const r = receipt([{ description: "50lb fertilizer", qty: 1, unit_price: 48 }]);
    const m = matchReceiptToPr(pr, r);
    expect(m.differences).toBe(1);
    expect(m.lines[0].status).toBe("price_diff");
  });

  it("flags a PR item missing from the receipt", () => {
    const pr = [prItem("Grass seed", 1, 25), prItem("Hand rake", 1, 15)];
    const r = receipt([{ description: "Grass seed", qty: 1, unit_price: 25 }]);
    const m = matchReceiptToPr(pr, r);
    const missing = m.lines.find((l) => l.status === "missing_on_receipt");
    expect(missing?.description).toMatch(/rake/i);
  });

  it("flags an extra charge on the receipt (e.g. shipping)", () => {
    const pr = [prItem("Grass seed", 1, 25)];
    const r = receipt([
      { description: "Grass seed", qty: 1, unit_price: 25 },
      { description: "Shipping", qty: 1, unit_price: 9.99 },
    ]);
    const m = matchReceiptToPr(pr, r);
    const extra = m.lines.find((l) => l.status === "extra_on_receipt");
    expect(extra?.description).toMatch(/shipping/i);
  });

  // Mirrors a real PR (belt + 3% card fee) reconciled against a NAPA receipt
  // that came back higher — the exact shape extract-receipt returns.
  it("flags both lines when the vendor charged more than quoted", () => {
    const pr = [prItem("Pump Belt 1/2x56", 1, 45), prItem("3% Credit Card Fee", 1, 1.35)];
    const r = receipt(
      [
        { description: "Pump Belt 1/2x56", qty: 1, unit_price: 49 },
        { description: "3% Credit Card Fee", qty: 1, unit_price: 1.47 },
      ],
      50.47,
    );
    const m = matchReceiptToPr(pr, r);
    expect(m.differences).toBe(2);
    expect(m.lines.every((l) => l.status === "price_diff")).toBe(true);
    expect(m.receiptTotal).toBe(50.47);
  });

  it("flags a quantity difference when price is unchanged", () => {
    const pr = [prItem("Golf tees box", 3, 5)];
    const r = receipt([{ description: "Golf tees box", qty: 5, unit_price: 5 }]);
    const m = matchReceiptToPr(pr, r);
    expect(m.lines[0].status).toBe("qty_diff");
  });
});
