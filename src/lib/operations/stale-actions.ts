// Which table a stale item actually lives in, and which columns express
// "move it", "it's done" and "remove it" there.
//
// The command center flattens eight different sources into one shape, and
// `sourceRecordId` means a different table for each. A cleanup screen that
// assumed everything was a task would PATCH `tasks` with a purchase-request id
// — a silent no-op at best. This map keeps every write pointed at the right
// row, and refuses to guess for sources that have no safe generic action.

import type { OperationalWorkItem } from "@/lib/operational-work/types";

export interface StaleActionPlan {
  table: string;
  /** Column holding the scheduled date, for "reschedule". */
  dateColumn: string;
  /** Patch that marks the row finished. */
  donePatch: (nowIso: string, actorId: string | null) => Record<string, unknown>;
  /** Whether deleting the row outright is a safe, expected action here. */
  deletable: boolean;
}

/**
 * Returns the plan for an item, or null when the item must be handled in its
 * own workspace instead. Null is not a failure — it means "link there, don't
 * invent an action".
 *
 * Purchase requests are deliberately excluded: a PR past its delivery date is
 * a procurement matter with money attached, not stale housekeeping, and
 * deleting one from a cleanup screen would destroy an audit record.
 */
export function stalePlanFor(item: OperationalWorkItem): StaleActionPlan | null {
  switch (item.sourceType) {
    case "task":
    case "duty":
      return {
        table: "tasks",
        dateColumn: "due_date",
        donePatch: (nowIso, actorId) => ({
          status: "completed",
          completed_at: nowIso,
          completed_by: actorId,
        }),
        deletable: true,
      };
    case "step":
      return {
        table: "daily_steps",
        dateColumn: "target_date",
        donePatch: (nowIso) => ({ done: true, done_at: nowIso }),
        deletable: true,
      };
    case "goal":
      return {
        table: "daily_goals",
        dateColumn: "deadline",
        donePatch: () => ({ status: "done" }),
        deletable: true,
      };
    default:
      // obligation, standard, equipment, calendar, purchase_request, inspection
      return null;
  }
}

/** True when the cleanup screen can offer write actions for this item. */
export function isActionableStaleItem(item: OperationalWorkItem): boolean {
  return stalePlanFor(item) !== null;
}
