/**
 * The purchase-request lifecycle as an ordered list of stages, shared by the
 * list, the detail page, and anywhere that wants to show "where in the process"
 * a PR is. Short labels are tuned to fit a 5-step tracker on a phone.
 *
 * Kept separate from the list page's `STATUS_FLOW` (which also carries the
 * per-status icons + next/prev action metadata) so the tracker has one small,
 * testable source of truth for stage ORDER.
 */
import type { PurchaseRequest } from "@/types/database";

export type PrStatus = PurchaseRequest["status"];

export interface PrStage {
  status: PrStatus;
  /** Short label for the step tracker. */
  short: string;
}

/** Draft → Not Sent → Sent → Approved → Received, in order. */
export const PR_STAGES: PrStage[] = [
  { status: "draft", short: "Draft" },
  { status: "submitted", short: "Not Sent" },
  { status: "sent", short: "Sent" },
  { status: "approved", short: "Approved" },
  { status: "received", short: "Received" },
];

export const PR_STAGE_COUNT = PR_STAGES.length;

/**
 * The tracker shows one step past the status lifecycle: "Complete", reached
 * when the receipt is in and settled (purchase_requests.completed_at). It's
 * not a `status` value — see prIsComplete() in pr-reconciliation.ts for why —
 * so it lives here as a label the tracker appends.
 */
export const PR_COMPLETE_LABEL = "Complete";

/** Every step label the tracker renders, in order. */
export const PR_TRACKER_LABELS: string[] = [
  ...PR_STAGES.map((s) => s.short),
  PR_COMPLETE_LABEL,
];

/** 0-based position of a status in the lifecycle, or -1 if unrecognized. */
export function prStageIndex(status: PrStatus): number {
  return PR_STAGES.findIndex((s) => s.status === status);
}

/** Position in PR_TRACKER_LABELS: the Complete step once settled. */
export function prTrackerIndex(status: PrStatus, completed: boolean): number {
  if (completed) return PR_TRACKER_LABELS.length - 1;
  return prStageIndex(status);
}
