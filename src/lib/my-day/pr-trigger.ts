import {
  directInsertRows,
  directPatchByFilter,
  getCachedUserId,
} from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import type { PrAudit } from "@/types/database";

/**
 * Bridge the PR Audit lifecycle into My Day.
 *
 * When a PR is marked "received" (delivered), drop a time-sensitive task on
 * today's list: take the receipt paperwork to Building 1 / guard mail within
 * 24h. Idempotent — the unique (source, source_ref) index means a repeat
 * insert just no-ops. When the PR later hits "receipt_signed", that task is
 * auto-completed so the loop closes without double-tracking.
 *
 * Best-effort: never throws into the PR status flow.
 */
export async function syncPrReceivedTask(
  audit: Pick<PrAudit, "id" | "vendor_name">,
  newStatus: string,
): Promise<void> {
  const sourceRef = audit.id;

  if (newStatus === "received") {
    const vendor = audit.vendor_name?.trim();
    const title = `Take ${vendor ? `${vendor} ` : ""}PR receipt to Building 1 (or guard mail)`;
    try {
      await directInsertRows(
        "daily_steps",
        [
          {
            title,
            target_date: todayLocal(),
            done: false,
            sort_order: 0,
            urgent: true,
            source: "pr_received",
            source_ref: sourceRef,
            created_by: getCachedUserId(),
          },
        ],
        "my-day.prReceived",
      );
    } catch (err) {
      // Duplicate (source, source_ref) violates the unique index — that's the
      // idempotency guard, not a real failure.
      console.warn("[my-day] pr-received task already exists or insert skipped:", err);
    }
    return;
  }

  if (newStatus === "receipt_signed") {
    try {
      await directPatchByFilter(
        "daily_steps",
        ["source=eq.pr_received", `source_ref=eq.${sourceRef}`, "done=eq.false"],
        { done: true, done_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        "my-day.prReceiptSigned",
      );
    } catch (err) {
      console.warn("[my-day] pr receipt-signed sync skipped:", err);
    }
  }
}
