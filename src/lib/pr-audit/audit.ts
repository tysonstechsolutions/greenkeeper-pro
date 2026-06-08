/**
 * Deterministic Purchase-Request audit engine.
 *
 * Given the structured contents of a filled-out NAVMIDLANT NAF Purchase
 * Request (extracted by AI and/or corrected by the reviewer), this produces a
 * list of findings — each a concrete problem with a suggested fix — plus the
 * real computed total and a per-cost-center amount breakdown.
 *
 * There is NO AI in here: every check is pure arithmetic / list-membership, so
 * the result is 100% repeatable and unit-testable. It deliberately reuses the
 * SAME code lists (pr-accounting-codes) and the SAME credit-card-fee math
 * (pr-cc-fee) the PR *builder* uses, so an audited PR and a built PR can never
 * disagree about what "correct" means.
 *
 * Rules enforced (each maps to one or more AuditCode):
 *   1. Site / Cost Center / G/L on every line are valid, known codes.
 *   2. Each line's printed extended price equals qty × unit price.
 *   3. Exactly one 3% credit-card fee line, last, equal to 3% of the pre-tax
 *      (non-fee, non-tax) subtotal.
 *   4. Sales tax (when present) is a single line and is excluded from the fee
 *      base — surfaced for visibility.
 *   5. The "Other" attachment box is labeled "Vendor Quote".
 *   6. The grand total printed on the PR matches the sum of the line items.
 *   7. (Info) the PR doesn't unexpectedly span multiple cost centers.
 */
import {
  PR_SITES,
  PR_COST_CENTERS,
  PR_GL_ACCOUNTS,
} from "@/lib/pr-accounting-codes";
import {
  isCcFeeItem,
  isSalesTaxItem,
  computeCcFeeAmount,
  parseCcFeeRate,
  ccFeeDescription,
  formatCcFeePct,
  CC_FEE_RATE,
} from "@/lib/pr-cc-fee";
import type { PurchaseRequestItem } from "@/types/database";

// ── Inputs ────────────────────────────────────────────────────────────────

/** One line item as extracted from a PR (codes may be missing/invalid). */
export interface ExtractedPrItem {
  description: string;
  part_number: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
  site: string | null;
  cost_ctr: string | null;
  gl_acct: string | null;
  /** Extended/line total as PRINTED on the document, for a math cross-check. */
  extended_price?: number | null;
}

/** The structured contents of a single uploaded PR. */
export interface ExtractedPr {
  date_prepared: string | null;
  vendor_name: string | null;
  requestor_name: string | null;
  internal_order: string | null;
  items: ExtractedPrItem[];
  /** Text written in the form's "Other" attachment box. */
  attached_other: string | null;
  /** Grand total printed on the PR (for cross-check). Null if not read. */
  printed_total: number | null;
  /** Low-confidence notes from the extractor (passed through, not audited). */
  warnings?: string[];
}

// ── Outputs ───────────────────────────────────────────────────────────────

export type AuditSeverity = "error" | "warning" | "info";

export type AuditCode =
  | "invalid_site"
  | "invalid_cost_center"
  | "invalid_gl_account"
  | "line_math"
  | "cc_fee_missing"
  | "cc_fee_duplicate"
  | "cc_fee_amount"
  | "cc_fee_rate"
  | "cc_fee_not_last"
  | "sales_tax_present"
  | "sales_tax_duplicate"
  | "other_not_vendor_quote"
  | "grand_total_mismatch"
  | "multiple_cost_centers"
  | "no_items";

export type AuditField =
  | "site"
  | "cost_ctr"
  | "gl_acct"
  | "unit_price"
  | "qty"
  | "description"
  | null;

export interface AuditFinding {
  code: AuditCode;
  severity: AuditSeverity;
  /** Short headline shown in the findings list. */
  title: string;
  /** One-sentence explanation of what's wrong. */
  detail: string;
  /** The concrete correct value / action, or null when self-evident. */
  suggestion: string | null;
  /** 0-based line index the finding is about, or null for PR-level findings. */
  itemIndex: number | null;
  /** The specific field at fault, when applicable. */
  field: AuditField;
}

export interface CostCenterAmount {
  cost_ctr: string;
  label: string;
  amount: number;
}

export interface AuditResult {
  findings: AuditFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Sum of every line's qty × unit price (incl. fee + tax lines). */
  computedTotal: number;
  /** What the 3% credit-card fee SHOULD be for this PR. */
  expectedCcFee: number;
  /** Per-cost-center totals (blank/invalid grouped under "Unassigned"). */
  byCostCenter: CostCenterAmount[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** The set of valid codes the audit validates against. */
export interface ValidCodes {
  sites: Set<string>;
  costCenters: Set<string>;
  glAccounts: Set<string>;
}

/**
 * Built-in golf-course lists, used as the default when the caller doesn't pass
 * dynamic (DB-loaded) codes — keeps the audit working before the code tables
 * exist and keeps the unit tests stable.
 */
export const DEFAULT_VALID_CODES: ValidCodes = {
  sites: new Set(PR_SITES.map((c) => c.value)),
  costCenters: new Set(PR_COST_CENTERS.map((c) => c.value)),
  glAccounts: new Set(PR_GL_ACCOUNTS.map((c) => c.value)),
};

const COST_CENTER_LABELS = new Map(
  PR_COST_CENTERS.map((c) => [c.value, c.label]),
);

/** Coerce anything numeric-ish to a finite number, else 0. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round to cents. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Extended price for a line = qty × unit price, to the cent. */
function extended(it: ExtractedPrItem): number {
  return r2(num(it.qty) * num(it.unit_price));
}

/** Format a number as USD for human-readable findings. */
export function money(n: number): string {
  return num(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/**
 * Normalize loosely-typed extracted items into the canonical
 * PurchaseRequestItem[] shape (null codes → "", 1-based item numbers). This is
 * BOTH what the fee math runs on and what gets persisted, so the audited PR is
 * stored in exactly the same shape as a built PR.
 */
export function normalizePrItems(items: ExtractedPrItem[]): PurchaseRequestItem[] {
  return items.map((it, i) => ({
    item: i + 1,
    site: (it.site ?? "").trim(),
    cost_ctr: (it.cost_ctr ?? "").trim(),
    gl_acct: (it.gl_acct ?? "").trim(),
    description: (it.description ?? "").trim(),
    part_number: (it.part_number ?? "").trim() || undefined,
    qty: num(it.qty),
    unit: (it.unit ?? "").trim(),
    unit_price: num(it.unit_price),
  }));
}

/**
 * Per-cost-center totals across all lines. Blank/invalid → "Unassigned".
 * Accepts any line shape with cost center + qty + unit price, so it works on
 * both freshly-extracted items and stored PurchaseRequestItem[].
 */
export function costCenterBreakdown(
  items: ReadonlyArray<{
    cost_ctr?: string | null;
    qty: number;
    unit_price: number;
  }>,
): CostCenterAmount[] {
  const map = new Map<string, CostCenterAmount>();
  for (const it of items) {
    const raw = (it.cost_ctr ?? "").trim();
    const key = raw || "__unassigned__";
    const label =
      COST_CENTER_LABELS.get(raw) || (raw ? raw : "Unassigned / invalid");
    const entry = map.get(key) ?? { cost_ctr: raw, label, amount: 0 };
    entry.amount = r2(entry.amount + r2(num(it.qty) * num(it.unit_price)));
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

// ── The audit ────────────────────────────────────────────────────────────────

/** Run every rule against an extracted PR and return the findings + totals. */
export function auditPr(
  pr: ExtractedPr,
  validCodes: ValidCodes = DEFAULT_VALID_CODES,
): AuditResult {
  const items = pr.items ?? [];
  const findings: AuditFinding[] = [];

  const siteValues = validCodes.sites;
  const costCenterValues = validCodes.costCenters;
  const glValues = validCodes.glAccounts;
  const validSiteList =
    [...siteValues].join(" or ") || "an approved Site";
  const validCostCenterList =
    [...costCenterValues].join(", ") || "an approved Cost Center";

  const computedTotal = r2(items.reduce((s, it) => s + extended(it), 0));
  // Fee math reuses the builder's exact routine on the normalized items.
  const feeCalcItems = normalizePrItems(items);
  const expectedCcFee = computeCcFeeAmount(feeCalcItems, CC_FEE_RATE);
  const subtotalBase = r2(
    items
      .filter((it) => !isCcFeeItem(it) && !isSalesTaxItem(it))
      .reduce((s, it) => s + extended(it), 0),
  );

  if (items.length === 0) {
    findings.push({
      code: "no_items",
      severity: "error",
      title: "No line items found",
      detail: "This PR has no line items to audit.",
      suggestion: "Add the line items from the request, then re-run the audit.",
      itemIndex: null,
      field: null,
    });
  }

  // 1. Code validity + 2. line math — per line, in order.
  items.forEach((it, i) => {
    const site = (it.site ?? "").trim();
    const cc = (it.cost_ctr ?? "").trim();
    const gl = (it.gl_acct ?? "").trim();
    const where = describeLine(it, i);

    if (!site) {
      findings.push({
        code: "invalid_site",
        severity: "error",
        title: `Missing Site on ${where}`,
        detail: "Every line needs a Site code.",
        suggestion: `Set Site to ${validSiteList}.`,
        itemIndex: i,
        field: "site",
      });
    } else if (!siteValues.has(site)) {
      findings.push({
        code: "invalid_site",
        severity: "error",
        title: `Invalid Site "${site}" on ${where}`,
        detail: `"${site}" isn't an approved Site code.`,
        suggestion: `Use ${validSiteList}.`,
        itemIndex: i,
        field: "site",
      });
    }

    if (!cc) {
      findings.push({
        code: "invalid_cost_center",
        severity: "error",
        title: `Missing Cost Center on ${where}`,
        detail: "Every line needs a Cost Center.",
        suggestion: `Pick a Cost Center (valid: ${validCostCenterList}).`,
        itemIndex: i,
        field: "cost_ctr",
      });
    } else if (!costCenterValues.has(cc)) {
      findings.push({
        code: "invalid_cost_center",
        severity: "error",
        title: `Invalid Cost Center "${cc}" on ${where}`,
        detail: `"${cc}" isn't on the approved cost-center list.`,
        suggestion: `Use one of: ${validCostCenterList}.`,
        itemIndex: i,
        field: "cost_ctr",
      });
    }

    if (!gl) {
      findings.push({
        code: "invalid_gl_account",
        severity: "error",
        title: `Missing G/L Account on ${where}`,
        detail: "Every line needs a G/L Account.",
        suggestion: "Pick a G/L Account from the approved list (e.g. 701000 — SUPPLIES).",
        itemIndex: i,
        field: "gl_acct",
      });
    } else if (!glValues.has(gl)) {
      findings.push({
        code: "invalid_gl_account",
        severity: "error",
        title: `Invalid G/L Account "${gl}" on ${where}`,
        detail: `"${gl}" isn't an approved G/L Account.`,
        suggestion: "Use a G/L Account from the approved list.",
        itemIndex: i,
        field: "gl_acct",
      });
    }

    // 2. Line math — only when the document printed an extended price.
    if (it.extended_price != null) {
      const printed = r2(num(it.extended_price));
      const calc = extended(it);
      if (Math.abs(printed - calc) > 0.01) {
        findings.push({
          code: "line_math",
          severity: "warning",
          title: `Line total doesn't match qty × price on ${where}`,
          detail: `Printed total ${money(printed)} but ${num(it.qty)} × ${money(
            num(it.unit_price),
          )} = ${money(calc)}.`,
          suggestion: `Correct the line to ${money(calc)} (or fix the qty / unit price).`,
          itemIndex: i,
          field: "unit_price",
        });
      }
    }
  });

  // 3. Credit-card fee.
  const feeItems = items.filter(isCcFeeItem);
  if (items.length > 0) {
    if (feeItems.length === 0) {
      findings.push({
        code: "cc_fee_missing",
        severity: "error",
        title: "Missing 3% credit-card fee",
        detail: `Every PR needs a credit-card fee line equal to ${formatCcFeePct(
          CC_FEE_RATE,
        )}% of the pre-tax subtotal (${money(subtotalBase)}).`,
        suggestion: `Add a "${ccFeeDescription()}" line for ${money(expectedCcFee)}.`,
        itemIndex: null,
        field: null,
      });
    } else if (feeItems.length > 1) {
      findings.push({
        code: "cc_fee_duplicate",
        severity: "error",
        title: "More than one credit-card fee line",
        detail: `Found ${feeItems.length} credit-card fee lines; there should be exactly one.`,
        suggestion: `Keep a single ${ccFeeDescription()} line of ${money(
          expectedCcFee,
        )} and delete the others.`,
        itemIndex: items.indexOf(feeItems[1]),
        field: null,
      });
    } else {
      const fee = feeItems[0];
      const feeIdx = items.indexOf(fee);
      const rate = parseCcFeeRate(fee.description);
      const expectedAtRate = computeCcFeeAmount(feeCalcItems, rate);
      const actualFee = extended(fee);

      if (Math.abs(actualFee - expectedAtRate) > 0.01) {
        findings.push({
          code: "cc_fee_amount",
          severity: "error",
          title: "Credit-card fee amount is wrong",
          detail: `The ${formatCcFeePct(
            rate,
          )}% fee is ${money(actualFee)}, but ${formatCcFeePct(
            rate,
          )}% of the ${money(subtotalBase)} pre-tax subtotal is ${money(
            expectedAtRate,
          )}.`,
          suggestion: `Change the fee line to ${money(expectedAtRate)}.`,
          itemIndex: feeIdx,
          field: "unit_price",
        });
      }

      if (Math.abs(rate - CC_FEE_RATE) > 1e-9) {
        findings.push({
          code: "cc_fee_rate",
          severity: "warning",
          title: `Fee rate is ${formatCcFeePct(rate)}%, not the standard 3%`,
          detail: `The usual credit-card surcharge is ${formatCcFeePct(
            CC_FEE_RATE,
          )}%. This PR uses ${formatCcFeePct(rate)}%.`,
          suggestion: `Confirm the vendor really charges ${formatCcFeePct(
            rate,
          )}%; otherwise use 3% (${money(expectedCcFee)}).`,
          itemIndex: feeIdx,
          field: null,
        });
      }

      if (feeIdx !== items.length - 1) {
        findings.push({
          code: "cc_fee_not_last",
          severity: "warning",
          title: "Credit-card fee isn't the last line",
          detail: "The credit-card fee should be the final line item on the PR.",
          suggestion: "Move the credit-card fee to the bottom of the list.",
          itemIndex: feeIdx,
          field: null,
        });
      }
    }
  }

  // 4. Sales tax — visibility + duplicate guard.
  const taxItems = items.filter(isSalesTaxItem);
  if (taxItems.length > 1) {
    findings.push({
      code: "sales_tax_duplicate",
      severity: "warning",
      title: "Multiple sales-tax lines",
      detail: `Found ${taxItems.length} sales-tax lines; a PR should carry at most one.`,
      suggestion: "Keep only the final total sales-tax line and remove the rest.",
      itemIndex: items.indexOf(taxItems[1]),
      field: null,
    });
  } else if (taxItems.length === 1) {
    const taxAmt = extended(taxItems[0]);
    findings.push({
      code: "sales_tax_present",
      severity: "info",
      title: `Sales tax ${money(taxAmt)} included (online order)`,
      detail:
        "Sales tax is charged on online orders and is correctly excluded from the 3% credit-card-fee base.",
      suggestion: null,
      itemIndex: items.indexOf(taxItems[0]),
      field: null,
    });
  }

  // 5. "Other" attachment must read "Vendor Quote".
  const other = (pr.attached_other ?? "").trim();
  if (!/vendor\s*quote/i.test(other)) {
    findings.push({
      code: "other_not_vendor_quote",
      severity: "warning",
      title: `"Other" attachment isn't marked "Vendor Quote"`,
      detail: other
        ? `The "Other" box reads "${other}".`
        : `The "Other" attachment box is blank.`,
      suggestion: `Check the "Other" box and label it "Vendor Quote".`,
      itemIndex: null,
      field: null,
    });
  }

  // 6. Grand total cross-check.
  if (pr.printed_total != null) {
    const printed = r2(num(pr.printed_total));
    if (Math.abs(printed - computedTotal) > 0.01) {
      findings.push({
        code: "grand_total_mismatch",
        severity: "error",
        title: "Grand total doesn't match the line items",
        detail: `The PR's printed total is ${money(
          printed,
        )} but the line items add up to ${money(computedTotal)}.`,
        suggestion: `Recheck the lines, or correct the total to ${money(
          computedTotal,
        )}.`,
        itemIndex: null,
        field: null,
      });
    }
  }

  // 7. Multiple cost centers — informational.
  const ccUsed = Array.from(
    new Set(
      items
        .map((it) => (it.cost_ctr ?? "").trim())
        .filter((c) => costCenterValues.has(c)),
    ),
  );
  if (ccUsed.length > 1) {
    findings.push({
      code: "multiple_cost_centers",
      severity: "info",
      title: "PR spans multiple cost centers",
      detail: `Charges hit ${ccUsed.length} cost centers (${ccUsed.join(
        ", ",
      )}).`,
      suggestion: "Confirm that's intended — most PRs sit in a single cost center.",
      itemIndex: null,
      field: null,
    });
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const infoCount = findings.filter((f) => f.severity === "info").length;

  return {
    findings,
    errorCount,
    warningCount,
    infoCount,
    computedTotal,
    expectedCcFee,
    byCostCenter: costCenterBreakdown(items),
  };
}

/** A short, human label for a line in a finding ("line 3 — Toro Belt"). */
function describeLine(it: ExtractedPrItem, i: number): string {
  const desc = (it.description ?? "").trim();
  const short = desc.length > 32 ? desc.slice(0, 31) + "…" : desc;
  return short ? `line ${i + 1} — ${short}` : `line ${i + 1}`;
}
