/**
 * The PR Audit review lifecycle, shared by the list (inline advance/revert
 * buttons + badges) and the detail page.
 *
 *   pending → sent_up → ordered → received → receipt_signed   (+ sent_back branch)
 *
 * "Spent"/committed for the budget = ordered + received + receipt_signed.
 */
import type { PrAuditReviewStatus } from "@/types/database";

export interface ReviewMeta {
  value: PrAuditReviewStatus;
  /** Full label for badges/headers. */
  label: string;
  /** Short label for tight chips. */
  short: string;
  /** Tailwind classes for the badge. */
  badge: string;
  /** One-liner shown on the detail page. */
  hint: string;
}

/** The linear forward chain (sent_back is a side branch, not in here). */
export const REVIEW_ORDER: PrAuditReviewStatus[] = [
  "pending",
  "sent_up",
  "ordered",
  "received",
  "receipt_signed",
];

export const REVIEW_META: Record<PrAuditReviewStatus, ReviewMeta> = {
  pending: {
    value: "pending",
    label: "Pending Review",
    short: "Pending",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    hint: "Received from your team — needs your review.",
  },
  sent_up: {
    value: "sent_up",
    label: "Sent Up for Approval",
    short: "Sent Up",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    hint: "Sent up to your boss for approval.",
  },
  ordered: {
    value: "ordered",
    label: "Approved & Ordered",
    short: "Ordered",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    hint: "Approved and the order is placed — waiting for it to come in.",
  },
  received: {
    value: "received",
    label: "Received",
    short: "Received",
    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
    hint: "The order came in — sign the receipt and send it to Building 1.",
  },
  receipt_signed: {
    value: "receipt_signed",
    label: "Receipt Signed → Bldg 1",
    short: "Receipt Signed",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    hint: "Done — receipt signed and sent back to Building 1.",
  },
  sent_back: {
    value: "sent_back",
    label: "Sent Back",
    short: "Sent Back",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
    hint: "Returned to the requester to fix and resubmit.",
  },
};

/** Statuses whose dollars count as committed/spent in the budget. */
export const SPENT_STATUSES: ReadonlySet<PrAuditReviewStatus> = new Set([
  "ordered",
  "received",
  "receipt_signed",
]);

/**
 * Statuses where the reviewer has sent the PR up (or beyond). At that point any
 * AI audit flags were accepted — they no longer matter — so the list + detail
 * stop showing them as problems.
 */
export const FLAGS_ACCEPTED_STATUSES: ReadonlySet<PrAuditReviewStatus> = new Set([
  "sent_up",
  "ordered",
  "received",
  "receipt_signed",
]);

/** True once the PR is sent up or further along — hide the audit flags. */
export function flagsAccepted(status: PrAuditReviewStatus): boolean {
  return FLAGS_ACCEPTED_STATUSES.has(status);
}

/** Next status in the forward chain, or null at the end / off-chain. */
export function nextStatus(s: PrAuditReviewStatus): PrAuditReviewStatus | null {
  if (s === "sent_back") return "pending"; // bring a bounced PR back into the flow
  const i = REVIEW_ORDER.indexOf(s);
  if (i < 0 || i >= REVIEW_ORDER.length - 1) return null;
  return REVIEW_ORDER[i + 1];
}

/** Previous status in the forward chain, or null at the start / off-chain. */
export function prevStatus(s: PrAuditReviewStatus): PrAuditReviewStatus | null {
  const i = REVIEW_ORDER.indexOf(s);
  if (i <= 0) return null;
  return REVIEW_ORDER[i - 1];
}
