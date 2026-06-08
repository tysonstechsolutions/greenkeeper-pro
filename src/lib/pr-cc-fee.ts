/**
 * Credit-card-fee line-item helpers for Purchase Requests.
 *
 * Procurement convention at VMGC: every PR adds a credit-card surcharge line
 * so the request total matches what the card actually gets charged. The rate
 * defaults to 3% but is editable per-PR — some vendors charge a different
 * surcharge (e.g. 3.5%). This module owns the rate math and the invariant
 * that the fee line is always present, always last, and always equal to
 * `rate × the extended subtotal of every OTHER non-tax line item on the PR`
 * (sales tax is a line item but is excluded from the surcharge base).
 *
 * The fee line is identified by its description ("<rate>% Credit Card Fee"),
 * so `isCcFeeItem` matches any rate and `parseCcFeeRate` recovers the rate
 * from a saved PR.
 */
import type { PurchaseRequestItem } from "@/types/database";

/** Default fee rate as a decimal — multiply the non-fee subtotal by this. */
export const CC_FEE_RATE = 0.03;

/** Matches any "…% Credit Card Fee" (or bare "Credit Card Fee") description. */
const CC_FEE_RE = /credit card fee\s*$/i;

/** Format a decimal rate as a percent string with no trailing zeros: 0.03 → "3", 0.035 → "3.5". */
export function formatCcFeePct(rate: number): string {
  return Number((rate * 100).toFixed(2)).toString();
}

/** Description string for a fee line at `rate`, e.g. "3% Credit Card Fee". */
export function ccFeeDescription(rate: number = CC_FEE_RATE): string {
  return `${formatCcFeePct(rate)}% Credit Card Fee`;
}

/** Default fee description (3%). Kept for back-compat / display. */
export const CC_FEE_DESCRIPTION = ccFeeDescription(CC_FEE_RATE);

/** True when the item is the auto-managed credit-card fee line (any rate). */
export function isCcFeeItem(it: { description?: string | null }): boolean {
  return CC_FEE_RE.test((it.description || "").trim());
}

/** Patterns for a sales-tax line ("Sales Tax", "Estimated Tax", bare "Tax"). */
const SALES_TAX_PATTERNS: readonly RegExp[] = [
  /\bsales tax\b/i,
  /\bestimated tax\b/i,
  /^tax$/i,
];

/**
 * True when the item is a sales-tax line. Sales tax is a real line item (the
 * card is charged it on online orders that can't apply the exemption), but it
 * is EXCLUDED from the credit-card-fee base — the surcharge applies to the
 * pre-tax amount only.
 */
export function isSalesTaxItem(it: { description?: string | null }): boolean {
  const d = (it.description || "").trim();
  return SALES_TAX_PATTERNS.some((re) => re.test(d));
}

/**
 * Recover the fee rate (decimal) from a fee line's description.
 * "3.5% Credit Card Fee" → 0.035. Falls back to the default rate.
 */
export function parseCcFeeRate(description?: string | null): number {
  const m = (description || "").trim().match(/^(\d+(?:\.\d+)?)\s*%/);
  if (!m) return CC_FEE_RATE;
  const pct = parseFloat(m[1]);
  return Number.isFinite(pct) && pct >= 0 ? pct / 100 : CC_FEE_RATE;
}

/** `rate` × the extended subtotal of every non-fee item, rounded to cents. */
export function computeCcFeeAmount(
  items: PurchaseRequestItem[],
  rate: number = CC_FEE_RATE,
): number {
  const subtotal = items
    .filter((it) => !isCcFeeItem(it) && !isSalesTaxItem(it))
    .reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
      0,
    );
  return Math.round(subtotal * rate * 100) / 100;
}

function itemsShallowEqual(
  a: PurchaseRequestItem,
  b: PurchaseRequestItem,
): boolean {
  return (
    a.item === b.item &&
    a.site === b.site &&
    a.cost_ctr === b.cost_ctr &&
    a.gl_acct === b.gl_acct &&
    (a.description || "") === (b.description || "") &&
    (a.part_number || "") === (b.part_number || "") &&
    (Number(a.qty) || 0) === (Number(b.qty) || 0) &&
    (a.unit || "") === (b.unit || "") &&
    (Number(a.unit_price) || 0) === (Number(b.unit_price) || 0)
  );
}

/**
 * Ensure exactly one CC-fee line item exists as the LAST entry in `items`,
 * with `unit_price` equal to `rate` × every other NON-TAX line's extended
 * subtotal and its description reflecting that rate ("3% Credit Card Fee").
 * Sales-tax lines stay in the list but are excluded from the fee base.
 *
 * Non-fee items keep their order and have their `item` numbers renumbered
 * 1..N. The fee line gets number N+1.
 *
 * If a fee line already exists, its accounting fields (site/cost_ctr/
 * gl_acct/part_number) are preserved so the user's Apply-to-All picks
 * survive recalculation. If no fee exists yet, those fields are inherited
 * from the first non-fee item, so the fee lands in the same site/GL bucket
 * as the rest of the PR.
 *
 * Returns the SAME ARRAY REFERENCE when nothing changed — callers (a
 * useEffect that calls setItems with this function) rely on that to
 * short-circuit re-renders and avoid an infinite loop.
 */
export function rebalanceWithCcFee(
  items: PurchaseRequestItem[],
  rate: number = CC_FEE_RATE,
): PurchaseRequestItem[] {
  const nonFee = items.filter((it) => !isCcFeeItem(it));
  const existingFee = items.find(isCcFeeItem);
  // Sales tax stays a normal line item but is NOT part of the fee base —
  // the credit-card surcharge applies to the pre-tax amount only.
  const subtotal = nonFee
    .filter((it) => !isSalesTaxItem(it))
    .reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
      0,
    );
  const feePrice = Math.round(subtotal * rate * 100) / 100;

  const renumbered = nonFee.map((it, i) => ({ ...it, item: i + 1 }));
  const sample = renumbered[0];
  const feeItem: PurchaseRequestItem = {
    item: renumbered.length + 1,
    site: existingFee?.site || sample?.site || "",
    cost_ctr: existingFee?.cost_ctr || sample?.cost_ctr || "",
    gl_acct: existingFee?.gl_acct || sample?.gl_acct || "",
    description: ccFeeDescription(rate),
    part_number: existingFee?.part_number || "",
    qty: 1,
    unit: "EA",
    unit_price: feePrice,
  };
  const next = [...renumbered, feeItem];

  if (
    items.length === next.length &&
    items.every((it, i) => itemsShallowEqual(it, next[i]))
  ) {
    return items;
  }
  return next;
}
