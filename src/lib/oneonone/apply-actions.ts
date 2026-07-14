/**
 * Executes an approved ProposedAction by writing to the right existing system
 * (My Day, time-off, calendar, follow-ups, scheduling preference). Employee-
 * scoped writes that need the employee's current row (follow-ups, scheduling
 * preference) are delegated back to the caller via ApplyContext so the profile
 * page stays the single owner of that data.
 *
 * Profile-fact actions are informational here — personal facts are merged into
 * the engagement profile separately via useOneOnOne.applyProfileUpdates.
 */
import {
  directInsertRow,
  directInsertRows,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { ProposedAction } from "./types";

export interface ApplyContext {
  employeeId: string;
  /** Create a follow-up (staff_concerns row). */
  addFollowUp: (title: string, note?: string) => Promise<void>;
  /** Persist a scheduling preference onto the employee's profile. */
  saveSchedulingPreference: (pref: string) => Promise<void>;
}

export async function applyAction(
  action: ProposedAction,
  ctx: ApplyContext,
): Promise<void> {
  switch (action.type) {
    case "task":
      await directInsertRows(
        "daily_steps",
        [
          {
            title: action.title || action.label,
            target_date: action.due_date ?? null,
            done: false,
            sort_order: 0,
            source: "one_on_one",
            created_by: getCachedUserId(),
          },
        ],
        "oneonone.apply.task",
      );
      break;

    case "time_off":
      if (action.start_date && action.end_date) {
        await directInsertRow(
          "time_off_requests",
          {
            user_id: ctx.employeeId,
            start_date: action.start_date,
            end_date: action.end_date,
            request_type: action.request_type || "vacation",
            reason: action.reason ?? null,
            // The GM entered and approved it in the review, so it lands
            // approved and shows on the schedule board immediately.
            status: "approved",
            reviewed_by: getCachedUserId(),
            reviewed_at: new Date().toISOString(),
          },
          "oneonone.apply.timeoff",
        );
      }
      break;

    case "calendar":
      if (action.event_date) {
        await directInsertRow(
          "calendar_events",
          {
            title: action.event_title || action.label,
            category: action.event_category || "other",
            event_date: action.event_date,
            all_day: true,
            created_by: getCachedUserId(),
          },
          "oneonone.apply.calendar",
        );
      }
      break;

    case "follow_up":
      await ctx.addFollowUp(
        action.follow_up_title || action.label,
        action.follow_up_note,
      );
      break;

    case "hours_pref":
      if (action.preference) {
        await ctx.saveSchedulingPreference(action.preference);
      }
      break;

    case "profile":
      // Informational — personal facts are merged via applyProfileUpdates.
      break;
  }
}
