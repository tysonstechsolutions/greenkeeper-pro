/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  buildCostCenterRollup,
  rollupTotals,
  monthFor,
  rollupMonthTotals,
  type RollupCostCenter,
} from "@/lib/pr-audit/rollup";
import type {
  PrAudit,
  PrAuditReviewStatus,
  PurchaseRequestItem,
  CostCenterBudget,
} from "@/types/database";

function mkItem(overrides: Partial<PurchaseRequestItem> = {}): PurchaseRequestItem {
  return {
    item: 1,
    site: "7009",
    cost_ctr: "25581",
    gl_acct: "701000",
    description: "Item",
    part_number: undefined,
    qty: 1,
    unit: "EA",
    unit_price: 100,
    ...overrides,
  };
}

function mkAudit(
  pr_date: string,
  review_status: PrAuditReviewStatus,
  items: PurchaseRequestItem[],
): PrAudit {
  return {
    id: `id-${Math.abs(hash(pr_date + review_status + items.length))}`,
    file_path: null,
    file_name: null,
    file_uploaded_at: null,
    pr_date,
    vendor_name: null,
    requestor_name: null,
    internal_order: null,
    items,
    attached_other: "Vendor Quote",
    printed_total: null,
    audit_findings: [],
    audit_error_count: 0,
    audit_warning_count: 0,
    computed_total: 0,
    review_status,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    viewed_at: null,
    fit_findings: [],
    fit_suggestion_count: 0,
    fit_checked_at: null,
    quote_path: null,
    quote_filename: null,
    quote_total: null,
    section_889_path: null,
    section_889_filename: null,
    section_889_expiration_date: null,
    section_889_compliant: null,
    bundle_findings: [],
    bundle_checked_at: null,
    revision: 1,
    purchase_request_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function mkBudget(
  fiscal_year: number,
  cost_ctr: string,
  annual_amount: number,
  month: number | null = null,
): CostCenterBudget {
  return {
    id: `b-${fiscal_year}-${cost_ctr}-${month ?? "y"}`,
    fiscal_year,
    cost_ctr,
    month,
    annual_amount,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function row(rows: ReturnType<typeof buildCostCenterRollup>, cc: string) {
  return rows.find((r) => r.cost_ctr === cc);
}

describe("buildCostCenterRollup", () => {
  it("always includes the five built-in cost centers (default seed)", () => {
    const rows = buildCostCenterRollup([], [], 2026);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.cost_ctr)).toEqual([
      "20086",
      "20087",
      "25224",
      "25229",
      "25581",
    ]);
  });

  it("counts committed (ordered+) as spent and pending+sent_up as pipeline", () => {
    const audits = [
      mkAudit("2026-05-01", "ordered", [mkItem({ unit_price: 100 })]),
      mkAudit("2026-05-02", "received", [mkItem({ unit_price: 50 })]),
      mkAudit("2026-05-03", "receipt_signed", [mkItem({ unit_price: 25 })]),
      mkAudit("2026-05-04", "pending", [mkItem({ unit_price: 7 })]),
      mkAudit("2026-05-05", "sent_up", [mkItem({ unit_price: 3 })]),
      mkAudit("2026-05-06", "sent_back", [mkItem({ unit_price: 999 })]),
    ];
    const r = row(buildCostCenterRollup(audits, [], 2026), "25581");
    expect(r?.spent).toBe(175); // 100 + 50 + 25
    expect(r?.pending).toBe(10); // 7 + 3
  });

  it("computes remaining and percentUsed against the budget", () => {
    const audits = [
      mkAudit("2026-05-01", "ordered", [mkItem({ unit_price: 250 })]),
    ];
    const budgets = [mkBudget(2026, "25581", 1000)];
    const r = row(buildCostCenterRollup(audits, budgets, 2026), "25581");
    expect(r?.budget).toBe(1000);
    expect(r?.spent).toBe(250);
    expect(r?.remaining).toBe(750);
    expect(r?.percentUsed).toBe(25);
  });

  it("splits a multi-cost-center PR across accounts per line", () => {
    const audits = [
      mkAudit("2026-05-01", "ordered", [
        mkItem({ cost_ctr: "25581", unit_price: 100 }),
        mkItem({ cost_ctr: "20087", unit_price: 60 }),
      ]),
    ];
    const rows = buildCostCenterRollup(audits, [], 2026);
    expect(row(rows, "25581")?.spent).toBe(100);
    expect(row(rows, "20087")?.spent).toBe(60);
  });

  it("respects the federal fiscal-year boundary (Oct→Sep)", () => {
    const audits = [
      mkAudit("2025-10-01", "ordered", [mkItem({ unit_price: 10 })]), // FY2026
      mkAudit("2025-09-30", "ordered", [mkItem({ unit_price: 99 })]), // FY2025
    ];
    expect(row(buildCostCenterRollup(audits, [], 2026), "25581")?.spent).toBe(10);
    expect(row(buildCostCenterRollup(audits, [], 2025), "25581")?.spent).toBe(99);
  });

  it("buckets spend into the right fiscal month (Oct=0 … Sep=11)", () => {
    const audits = [
      mkAudit("2025-10-15", "ordered", [mkItem({ unit_price: 10 })]), // Oct → 0
      mkAudit("2026-09-15", "pending", [mkItem({ unit_price: 20 })]), // Sep → 11 (pipeline)
    ];
    const r = row(buildCostCenterRollup(audits, [], 2026), "25581");
    expect(r?.byMonth[0].spent).toBe(10);
    expect(r?.byMonth[0].label).toBe("Oct");
    expect(r?.byMonth[11].pipeline).toBe(20);
    expect(r?.byMonth[11].label).toBe("Sep");
  });

  it("uses qty × unit price for line amounts", () => {
    const audits = [
      mkAudit("2026-05-01", "ordered", [mkItem({ qty: 3, unit_price: 12.5 })]),
    ];
    expect(row(buildCostCenterRollup(audits, [], 2026), "25581")?.spent).toBe(37.5);
  });

  it("surfaces an unknown cost center as a straggler row", () => {
    const audits = [
      mkAudit("2026-05-01", "ordered", [mkItem({ cost_ctr: "88888", unit_price: 5 })]),
    ];
    const rows = buildCostCenterRollup(audits, [], 2026);
    const straggler = rows.find((r) => r.cost_ctr === "88888");
    expect(straggler?.known).toBe(false);
    expect(straggler?.spent).toBe(5);
  });

  it("seeds from a supplied (DB) cost-center list with categories", () => {
    const cc: RollupCostCenter[] = [
      { code: "30001", label: "Zapper Repairs", categoryId: "z", category: "Zappers" },
      { code: "25581", label: "GC Maintenance", categoryId: "g", category: "Golf Course" },
    ];
    const audits = [
      mkAudit("2026-05-01", "ordered", [mkItem({ cost_ctr: "30001", unit_price: 80 })]),
    ];
    const rows = buildCostCenterRollup(audits, [], 2026, cc);
    expect(rows.map((r) => r.cost_ctr)).toEqual(["30001", "25581"]);
    const z = row(rows, "30001");
    expect(z?.category).toBe("Zappers");
    expect(z?.spent).toBe(80);
  });
});

describe("monthly budgets", () => {
  it("maps a calendar-month budget to the right fiscal index, annual = sum", () => {
    // May (cal 5) → fiscal index 7; Oct (cal 10) → index 0.
    const budgets = [
      mkBudget(2026, "25581", 500, 5),
      mkBudget(2026, "25581", 100, 10),
    ];
    const r = row(buildCostCenterRollup([], budgets, 2026), "25581");
    expect(r?.monthlyBudget[7]).toBe(500);
    expect(r?.monthlyBudget[0]).toBe(100);
    expect(r?.budget).toBe(600); // annual = sum of the months
  });

  it("compares a month's spend to that month's budget", () => {
    const audits = [
      mkAudit("2026-05-15", "ordered", [mkItem({ unit_price: 300 })]),
    ];
    const budgets = [mkBudget(2026, "25581", 500, 5)]; // May budget
    const rows = buildCostCenterRollup(audits, budgets, 2026);
    const r = row(rows, "25581")!;
    const mt = monthFor(r, 7); // May
    expect(mt.budget).toBe(500);
    expect(mt.spent).toBe(300);
    expect(mt.remaining).toBe(200);
    const tot = rollupMonthTotals(rows, 7);
    expect(tot.budget).toBe(500);
    expect(tot.spent).toBe(300);
  });

  it("spreads a legacy whole-year amount evenly across months", () => {
    const budgets = [mkBudget(2026, "25581", 1200)]; // month = null (legacy)
    const r = row(buildCostCenterRollup([], budgets, 2026), "25581");
    expect(r?.budget).toBe(1200);
    expect(r?.monthlyBudget.every((m) => m === 100)).toBe(true);
  });
});

describe("rollupTotals", () => {
  it("sums budget, spent, pending and derives remaining/percent", () => {
    const audits = [
      mkAudit("2026-05-01", "ordered", [
        mkItem({ cost_ctr: "25581", unit_price: 300 }),
        mkItem({ cost_ctr: "20087", unit_price: 200 }),
      ]),
      mkAudit("2026-05-02", "sent_up", [mkItem({ cost_ctr: "25581", unit_price: 50 })]),
    ];
    const budgets = [mkBudget(2026, "25581", 1000), mkBudget(2026, "20087", 1000)];
    const totals = rollupTotals(buildCostCenterRollup(audits, budgets, 2026));
    expect(totals.budget).toBe(2000);
    expect(totals.spent).toBe(500);
    expect(totals.pending).toBe(50);
    expect(totals.remaining).toBe(1500);
    expect(totals.percentUsed).toBe(25);
  });
});
