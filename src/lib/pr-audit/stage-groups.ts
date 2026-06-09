/**
 * Group audited PRs by their lifecycle stage for the dashboard list, in
 * forward order (Needs review → … → Receipt signed) with Sent back last.
 * Pure + generic so it's cheap to unit-test.
 */
import type { PrAuditReviewStatus } from "@/types/database";
import { REVIEW_ORDER } from "@/lib/pr-audit/lifecycle";

const STAGE_ORDER: PrAuditReviewStatus[] = [...REVIEW_ORDER, "sent_back"];

export interface StageGroup<T> {
  status: PrAuditReviewStatus;
  audits: T[];
}

export function groupAuditsByStage<T extends { review_status: PrAuditReviewStatus }>(
  audits: readonly T[],
): StageGroup<T>[] {
  const byStatus = new Map<PrAuditReviewStatus, T[]>();
  for (const a of audits) {
    const list = byStatus.get(a.review_status);
    if (list) list.push(a);
    else byStatus.set(a.review_status, [a]);
  }
  return STAGE_ORDER.filter((s) => byStatus.has(s)).map((s) => ({
    status: s,
    audits: byStatus.get(s) as T[],
  }));
}
