/**
 * PR reconciliation helpers — the superintendent submits a PR at one total,
 * but the business office's receipt often shows a DIFFERENT actual cost.
 * These helpers compute the variance (dollar + %) and pick a severity tone,
 * shared by the PR detail card and the list badges so the thresholds and
 * money math live in exactly one place.
 */
import type { PurchaseRequest } from "@/types/database";

export interface PrVariance {
  submitted: number;
  actual: number;
  /** actual − submitted: positive means it cost more than requested. */
  dollars: number;
  /** Variance as a percent of the submitted total; null when submitted is $0. */
  percent: number | null;
  /** ok = within $1 · warn = within 5% of submitted · over = beyond that. */
  tone: "ok" | "warn" | "over";
}

export function prVariance(submitted: number, actual: number): PrVariance {
  const dollars = actual - submitted;
  const percent = submitted !== 0 ? (dollars / submitted) * 100 : null;
  const tone: PrVariance["tone"] =
    Math.abs(dollars) <= 1
      ? "ok"
      : percent !== null && Math.abs(percent) <= 5
        ? "warn"
        : "over";
  return { submitted, actual, dollars, percent, tone };
}

/** Token-styled badge classes per tone (same pattern as obligation-row). */
export const VARIANCE_BADGE_CLASSES: Record<PrVariance["tone"], string> = {
  ok: "bg-success/10 text-success border-success/30",
  warn: "bg-warning/15 text-warning-foreground border-warning/40",
  over: "bg-destructive/10 text-destructive border-destructive/30",
};

/** Compact signed variance, e.g. "+$12.34 (+2.3%)" or "−$5.00 (−1.2%)". */
export function formatVariance(v: PrVariance): string {
  const sign = v.dollars > 0 ? "+" : v.dollars < 0 ? "−" : "";
  const dollars = Math.abs(v.dollars).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
  const pct =
    v.percent === null ? "" : ` (${sign}${Math.abs(v.percent).toFixed(1)}%)`;
  return `${sign}${dollars}${pct}`;
}

/** True when a received PR is still waiting on its receipt's actual cost. */
export function prNeedsReceipt(pr: PurchaseRequest): boolean {
  return pr.status === "received" && pr.actual_amount == null && !prIsComplete(pr);
}

/**
 * A purchase is COMPLETE once its receipt is in and settled. Tracked with its
 * own `completed_at` timestamp rather than a 6th `status` value on purpose:
 * the spend rollup view (20260702_money_rollups.sql) sums PRs
 * `WHERE status IN ('sent','approved','received')`, so a new status would
 * silently drop completed purchases out of budget/P&L. Completion is a
 * separate axis; the PR stays `received` and keeps counting as spend.
 */
export function prIsComplete(pr: PurchaseRequest): boolean {
  return pr.completed_at != null;
}

/** Compare money in whole cents — avoids 46.35 !== 46.349999 float drift. */
function cents(n: number): number {
  return Math.round(n * 100);
}

/**
 * Should saving this receipt auto-complete the purchase?
 *
 * Rule (Tyson's call): complete when the receipt total came in AT or UNDER the
 * submitted total, to the penny. Even a one-cent overage stays active so it
 * lands in front of him. Line-level differences do NOT block completion —
 * they're recorded in receipt_data, but the money is what decides.
 */
export function prAutoCompletes(submitted: number, actual: number): boolean {
  return cents(actual) <= cents(submitted);
}

/**
 * The ONE "submitted total" used everywhere variance is computed. Prefers
 * the stored ige_amount (what was actually printed on the PR); falls back
 * to a live line-item sum only when the stored value is missing/zero. The
 * list badge and the detail card must both use this so a PR never shows
 * two different variances.
 */
export function prSubmittedTotal(pr: PurchaseRequest): number {
  const stored = Number(pr.ige_amount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const items = Array.isArray(pr.items) ? pr.items : [];
  return items.reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
    0,
  );
}
