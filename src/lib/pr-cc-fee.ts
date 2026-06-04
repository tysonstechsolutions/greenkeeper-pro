/**
 * Credit-card-fee line-item helpers for Purchase Requests.
 *
 * Procurement convention at VMGC: every PR adds a 3% credit-card surcharge
 * line so the request total matches what the card actually gets charged.
 * This module owns the constant, the rate, and the invariant that the fee
 * line is always present, always last, and always equal to 3% of the
 * extended subtotal of every OTHER line item on the PR.
 *
 * Tested implicitly via the new-PR page — the rebalance function is called
 * on every items-state change and returns the same array reference when no
 * change is needed, so React bails out and we don't infinite-loop.
 */
import type { PurchaseRequestItem } from "@/types/database";

/** Exact description string used to identify the fee line. */
export const CC_FEE_DESCRIPTION = "3% Credit Card Fee";

/** Fee rate as a decimal — multiply the non-fee subtotal by this. */
export const CC_FEE_RATE = 0.03;

/** True when the item is the auto-managed credit-card fee line. */
export function isCcFeeItem(it: { description?: string | null }): boolean {
  return (it.description || "").trim() === CC_FEE_DESCRIPTION;
}

/** 3% of the extended subtotal of every non-fee item, rounded to cents. */
export function computeCcFeeAmount(items: PurchaseRequestItem[]): number {
  const subtotal = items
    .filter((it) => !isCcFeeItem(it))
    .reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
      0,
    );
  return Math.round(subtotal * CC_FEE_RATE * 100) / 100;
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
 * with `unit_price` equal to 3% of every other line's extended subtotal.
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
): PurchaseRequestItem[] {
  const nonFee = items.filter((it) => !isCcFeeItem(it));
  const existingFee = items.find(isCcFeeItem);
  const subtotal = nonFee.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
    0,
  );
  const feePrice = Math.round(subtotal * CC_FEE_RATE * 100) / 100;

  const renumbered = nonFee.map((it, i) => ({ ...it, item: i + 1 }));
  const sample = renumbered[0];
  const feeItem: PurchaseRequestItem = {
    item: renumbered.length + 1,
    site: existingFee?.site || sample?.site || "",
    cost_ctr: existingFee?.cost_ctr || sample?.cost_ctr || "",
    gl_acct: existingFee?.gl_acct || sample?.gl_acct || "",
    description: CC_FEE_DESCRIPTION,
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
