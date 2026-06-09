/**
 * The PR Audit review lifecycle, shared by the list (badges + advance/revert)
 * and the detail page (date-stamped stepper).
 *
 *   pending(uploaded) → sent_up → approved → ordered → received → receipt_signed
 *                                                                   (+ sent_back)
 *
 * "Spent"/committed for the budget = ordered + received + receipt_signed (the
 * card is charged at purchase, so approved-but-not-ordered is NOT spent yet).
 */
import type { PrAuditReviewStatus } from "@/types/database";

/** The pr_audits date column that records when a PR entered a stage. */
export type StageDateField =
  | "sent_up_date"
  | "approved_date"
  | "ordered_date"
  | "received_date"
  | "receipt_signed_date"
  | "sent_back_date";

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
  /** Date column stamped when a PR enters this stage. null for pending, which
   *  uses created_at ("uploaded"). */
  dateField: StageDateField | null;
}

/** The linear forward chain (sent_back is a side branch, not in here). */
export const REVIEW_ORDER: PrAuditReviewStatus[] = [
  "pending",
  "sent_up",
  "approved",
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
    hint: "Uploaded and received from your team — needs your review.",
    dateField: null,
  },
  sent_up: {
    value: "sent_up",
    label: "Sent Up for Approval",
    short: "Sent Up",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    hint: "Sent up to your boss for approval.",
    dateField: "sent_up_date",
  },
  approved: {
    value: "approved",
    label: "Approved",
    short: "Approved",
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    hint: "Approved by your boss — not purchased yet.",
    dateField: "approved_date",
  },
  ordered: {
    value: "ordered",
    label: "Ordered / Purchased",
    short: "Ordered",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    hint: "The order is placed and the card is charged — waiting for it to come in.",
    dateField: "ordered_date",
  },
  received: {
    value: "received",
    label: "Received",
    short: "Received",
    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
    hint: "The order came in — sign the receipt and send it to Building 1.",
    dateField: "received_date",
  },
  receipt_signed: {
    value: "receipt_signed",
    label: "Sent to Bldg 1",
    short: "Signed",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    hint: "Done — receipt signed and sent back to Building 1.",
    dateField: "receipt_signed_date",
  },
  sent_back: {
    value: "sent_back",
    label: "Sent Back",
    short: "Sent Back",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
    hint: "Returned to the requester to fix and resubmit.",
    dateField: "sent_back_date",
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
  "approved",
  "ordered",
  "received",
  "receipt_signed",
]);

/** True once the PR is sent up or further along — hide the audit flags. */
export function flagsAccepted(status: PrAuditReviewStatus): boolean {
  return FLAGS_ACCEPTED_STATUSES.has(status);
}

/** The date column for a stage, or null for pending (uploaded = created_at). */
export function stageDateField(status: PrAuditReviewStatus): StageDateField | null {
  return REVIEW_META[status].dateField;
}

/**
 * Advancing a PR to `status` stamps that stage's date with `todayIso` — but only
 * if it isn't already set, so an edited/back-dated value is never overwritten.
 * Returns the (possibly empty) patch to merge into the status update.
 */
export function stageDatePatch(
  audit: Partial<Record<StageDateField, string | null>>,
  status: PrAuditReviewStatus,
  todayIso: string,
): Partial<Record<StageDateField, string>> {
  const field = stageDateField(status);
  if (!field || audit[field]) return {};
  return { [field]: todayIso };
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
