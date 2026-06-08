/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  auditPr,
  normalizePrItems,
  costCenterBreakdown,
  type ExtractedPr,
  type ExtractedPrItem,
  type AuditCode,
} from "@/lib/pr-audit/audit";

// ── Builders ────────────────────────────────────────────────────────────────

function mk(overrides: Partial<ExtractedPrItem> = {}): ExtractedPrItem {
  return {
    description: "Fertilizer 50lb",
    part_number: "FERT-50",
    qty: 1,
    unit: "bag",
    unit_price: 100,
    site: "7009",
    cost_ctr: "25581",
    gl_acct: "701000",
    extended_price: null,
    ...overrides,
  };
}

/** A clean, fully-correct PR: $200 of product + a correct $6 (3%) fee. */
function validPr(overrides: Partial<ExtractedPr> = {}): ExtractedPr {
  return {
    date_prepared: "2026-05-01",
    vendor_name: "SiteOne",
    requestor_name: "Joe Super",
    internal_order: "FY26-GC-0007",
    items: [
      mk({ description: "Fertilizer 50lb", qty: 2, unit_price: 100 }), // 200
      mk({
        description: "3% Credit Card Fee",
        part_number: null,
        qty: 1,
        unit: "EA",
        unit_price: 6, // 3% of 200
      }),
    ],
    attached_other: "Vendor Quote",
    printed_total: 206,
    ...overrides,
  };
}

/** Pull the set of finding codes from an audit. */
function codes(pr: ExtractedPr): AuditCode[] {
  return auditPr(pr).findings.map((f) => f.code);
}

// ── A clean PR passes ─────────────────────────────────────────────────────────

describe("auditPr — a correct PR", () => {
  it("produces no errors, warnings, or info", () => {
    const r = auditPr(validPr());
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
    expect(r.infoCount).toBe(0);
    expect(r.findings).toHaveLength(0);
  });

  it("computes the real total and expected 3% fee", () => {
    const r = auditPr(validPr());
    expect(r.computedTotal).toBe(206);
    expect(r.expectedCcFee).toBe(6);
  });
});

// ── Code validity ──────────────────────────────────────────────────────────────

describe("auditPr — accounting codes", () => {
  it("flags an invalid cost center with the valid list", () => {
    const pr = validPr();
    pr.items[0].cost_ctr = "99999";
    const r = auditPr(pr);
    const f = r.findings.find((x) => x.code === "invalid_cost_center");
    expect(f).toBeTruthy();
    expect(f?.severity).toBe("error");
    expect(f?.itemIndex).toBe(0);
    expect(f?.field).toBe("cost_ctr");
    expect(f?.suggestion).toContain("25581");
  });

  it("flags a missing site", () => {
    const pr = validPr();
    pr.items[0].site = "";
    expect(codes(pr)).toContain("invalid_site");
  });

  it("flags an invalid G/L account", () => {
    const pr = validPr();
    pr.items[0].gl_acct = "123456";
    const f = auditPr(pr).findings.find((x) => x.code === "invalid_gl_account");
    expect(f?.severity).toBe("error");
  });

  it("accepts every approved code without complaint", () => {
    const pr = validPr();
    pr.items[0].site = "7010";
    pr.items[0].cost_ctr = "20087";
    pr.items[0].gl_acct = "684000";
    pr.items[1].site = "7010";
    pr.items[1].cost_ctr = "20087";
    pr.items[1].gl_acct = "684000";
    const r = auditPr(pr);
    expect(
      r.findings.filter((f) =>
        ["invalid_site", "invalid_cost_center", "invalid_gl_account"].includes(
          f.code,
        ),
      ),
    ).toHaveLength(0);
  });
});

// ── Credit-card fee ────────────────────────────────────────────────────────────

describe("auditPr — credit-card fee", () => {
  it("flags a missing fee and suggests the correct amount", () => {
    const pr = validPr();
    pr.items = [pr.items[0]]; // drop the fee line; $200 product only
    pr.printed_total = 200;
    const f = auditPr(pr).findings.find((x) => x.code === "cc_fee_missing");
    expect(f?.severity).toBe("error");
    expect(f?.suggestion).toContain("$6.00");
  });

  it("flags a wrong fee amount with the right figure", () => {
    const pr = validPr();
    pr.items[1].unit_price = 5; // should be 6
    pr.printed_total = 205;
    const f = auditPr(pr).findings.find((x) => x.code === "cc_fee_amount");
    expect(f?.severity).toBe("error");
    expect(f?.suggestion).toContain("$6.00");
    expect(f?.field).toBe("unit_price");
  });

  it("excludes sales tax from the fee base", () => {
    // $200 product + $16 tax. Correct fee is 3% of 200 = $6, NOT 3% of 216.
    const pr = validPr();
    pr.items = [
      mk({ description: "Fertilizer 50lb", qty: 2, unit_price: 100 }),
      mk({
        description: "Sales Tax",
        part_number: null,
        qty: 1,
        unit: "EA",
        unit_price: 16,
      }),
      mk({
        description: "3% Credit Card Fee",
        part_number: null,
        qty: 1,
        unit: "EA",
        unit_price: 6,
      }),
    ];
    pr.printed_total = 222;
    const r = auditPr(pr);
    expect(r.findings.find((x) => x.code === "cc_fee_amount")).toBeUndefined();
    expect(r.findings.find((x) => x.code === "sales_tax_present")?.severity).toBe(
      "info",
    );
  });

  it("flags a fee that isn't the last line", () => {
    const pr = validPr();
    pr.items = [pr.items[1], pr.items[0]]; // fee first
    expect(codes(pr)).toContain("cc_fee_not_last");
  });

  it("flags duplicate fee lines", () => {
    const pr = validPr();
    pr.items.push(
      mk({ description: "3% Credit Card Fee", qty: 1, unit_price: 6 }),
    );
    expect(codes(pr)).toContain("cc_fee_duplicate");
  });

  it("accepts a non-standard rate when the math matches but warns about it", () => {
    // 3.5% of $200 = $7.00 — amount is internally consistent, but the rate
    // differs from the standard 3%, so it's a warning, not an error.
    const pr = validPr();
    pr.items[1] = mk({
      description: "3.5% Credit Card Fee",
      part_number: null,
      qty: 1,
      unit: "EA",
      unit_price: 7,
    });
    pr.printed_total = 207;
    const r = auditPr(pr);
    expect(r.findings.find((x) => x.code === "cc_fee_amount")).toBeUndefined();
    expect(r.findings.find((x) => x.code === "cc_fee_rate")?.severity).toBe(
      "warning",
    );
  });
});

// ── Other attachment, totals, multi-cost-center, line math ──────────────────────

describe("auditPr — other checks", () => {
  it('flags when "Other" isn\'t "Vendor Quote"', () => {
    const pr = validPr();
    pr.attached_other = "";
    expect(codes(pr)).toContain("other_not_vendor_quote");
  });

  it('accepts "Other" written with different spacing/case', () => {
    const pr = validPr();
    pr.attached_other = "vendor  quote";
    expect(codes(pr)).not.toContain("other_not_vendor_quote");
  });

  it("flags a grand-total mismatch with the computed total", () => {
    const pr = validPr();
    pr.printed_total = 999;
    const f = auditPr(pr).findings.find((x) => x.code === "grand_total_mismatch");
    expect(f?.severity).toBe("error");
    expect(f?.suggestion).toContain("$206.00");
  });

  it("does not check the grand total when none was printed", () => {
    const pr = validPr();
    pr.printed_total = null;
    expect(codes(pr)).not.toContain("grand_total_mismatch");
  });

  it("notes (info) when a PR spans multiple cost centers", () => {
    const pr = validPr();
    pr.items[0].cost_ctr = "20087";
    const f = auditPr(pr).findings.find((x) => x.code === "multiple_cost_centers");
    expect(f?.severity).toBe("info");
  });

  it("flags a line whose printed extended doesn't match qty × price", () => {
    const pr = validPr();
    pr.items[0].extended_price = 999; // 2 × 100 = 200, not 999
    const f = auditPr(pr).findings.find((x) => x.code === "line_math");
    expect(f?.severity).toBe("warning");
    expect(f?.suggestion).toContain("$200.00");
  });

  it("flags a PR with no line items", () => {
    const pr = validPr();
    pr.items = [];
    pr.printed_total = null;
    expect(codes(pr)).toContain("no_items");
  });
});

// ── Breakdown + normalization ──────────────────────────────────────────────────

describe("costCenterBreakdown", () => {
  it("sums extended amounts per cost center", () => {
    const items = [
      mk({ cost_ctr: "25581", qty: 2, unit_price: 100 }), // 200
      mk({ cost_ctr: "20087", qty: 1, unit_price: 50 }), // 50
      mk({ cost_ctr: "25581", qty: 1, unit_price: 25 }), // 25
    ];
    const b = costCenterBreakdown(items);
    expect(b.find((x) => x.cost_ctr === "25581")?.amount).toBe(225);
    expect(b.find((x) => x.cost_ctr === "20087")?.amount).toBe(50);
  });

  it("groups blank/invalid cost centers under Unassigned", () => {
    const items = [mk({ cost_ctr: "", qty: 1, unit_price: 10 })];
    const b = costCenterBreakdown(items);
    expect(b[0].label).toContain("Unassigned");
    expect(b[0].amount).toBe(10);
  });
});

describe("normalizePrItems", () => {
  it("coerces nulls to empty strings, numbers to numbers, and renumbers", () => {
    const out = normalizePrItems([
      mk({ site: null, cost_ctr: null, gl_acct: null, unit: null, part_number: null }),
      mk(),
    ]);
    expect(out[0].item).toBe(1);
    expect(out[1].item).toBe(2);
    expect(out[0].site).toBe("");
    expect(out[0].unit).toBe("");
    expect(out[0].part_number).toBeUndefined();
    expect(typeof out[0].qty).toBe("number");
  });
});
