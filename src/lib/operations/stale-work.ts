// Stale-work triage for the Operations Command Center.
//
// The duty materializer keeps a year of occurrences on hand, so anything the
// crew misses accumulates as a permanent "Overdue" pile — 269 items and
// climbing. The master directive is explicit that this is the wrong shape:
// small recurring work that gets missed should quietly reappear on its next
// scheduled day, and big or seasonal work should be one tap to reschedule or
// delete.
//
// This module is the deterministic half: given the loaded work and today's
// date, decide what each stale item IS, so the UI can offer the right single
// action. It never decides on its own to write anything.

import type { OperationalWorkItem } from "@/lib/operational-work/types";
import { daysFrom } from "@/lib/operational-work/priority";

/** Work is only "stale" once it is at least this far past its due date. */
export const STALE_AFTER_DAYS = 1;

export type StaleKind =
  /** A recurring duty that already has a later occurrence scheduled. The work
   *  itself is not lost — today's or next week's copy still exists — so the
   *  missed one is noise and can be cleared in bulk. */
  | "recurring_miss"
  /** Everything else that is overdue: one-offs, seasonal projects whose window
   *  has passed, obligations. These need a real decision from the GM. */
  | "needs_decision";

export interface StaleWorkItem {
  item: OperationalWorkItem;
  kind: StaleKind;
  daysOverdue: number;
  /** For a recurring miss, the next date the same duty is already scheduled. */
  nextOccurrence: string | null;
}

export interface StaleWorkSummary {
  recurringMisses: StaleWorkItem[];
  needsDecision: StaleWorkItem[];
  total: number;
  oldestDays: number;
}

const OPEN_STATUSES = new Set(["pending", "in_progress", "awaiting_acceptance", "postponed", "blocked"]);

/**
 * Group every open item by the duty it came from, so a missed occurrence can
 * be checked against the rest of its own series.
 */
function nextOccurrenceByDuty(
  items: OperationalWorkItem[],
  todayYmd: string,
): Map<string, string> {
  const next = new Map<string, string>();
  for (const item of items) {
    if (item.sourceType !== "duty") continue;
    const duty = item.dutySeriesKey;
    if (!duty || !item.dueDate || item.dueDate < todayYmd) continue;
    if (!OPEN_STATUSES.has(item.status)) continue;
    const current = next.get(duty);
    if (!current || item.dueDate < current) next.set(duty, item.dueDate);
  }
  return next;
}

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Classify every overdue item.
 *
 * A duty occurrence counts as a recurring miss only when the SAME duty already
 * has an open occurrence dated today or later. That is the honest test for
 * "the work will come around again" — a seasonal duty whose window has closed
 * has no next occurrence, so it lands in needs_decision where the GM sees it.
 */
export function classifyStaleWork(
  items: OperationalWorkItem[],
  today: Date,
  staleAfterDays = STALE_AFTER_DAYS,
): StaleWorkSummary {
  const todayYmd = ymd(today);
  const upcoming = nextOccurrenceByDuty(items, todayYmd);

  const recurringMisses: StaleWorkItem[] = [];
  const needsDecision: StaleWorkItem[] = [];
  let oldestDays = 0;

  for (const item of items) {
    if (!OPEN_STATUSES.has(item.status)) continue;
    if (!item.dueDate) continue;
    const daysOverdue = -daysFrom(today, item.dueDate);
    if (daysOverdue < staleAfterDays) continue;

    // Equipment alerts and Program Standards are not scheduled work; they are
    // handled in their own workspaces and must not be offered for deletion here.
    if (item.sourceType === "equipment" || item.sourceType === "standard") continue;

    oldestDays = Math.max(oldestDays, daysOverdue);
    const duty = item.sourceType === "duty" ? item.dutySeriesKey : null;
    const nextOccurrence = duty ? upcoming.get(duty) ?? null : null;

    const row: StaleWorkItem = {
      item,
      kind: nextOccurrence ? "recurring_miss" : "needs_decision",
      daysOverdue,
      nextOccurrence,
    };
    (nextOccurrence ? recurringMisses : needsDecision).push(row);
  }

  const byAge = (a: StaleWorkItem, b: StaleWorkItem) =>
    b.daysOverdue - a.daysOverdue || a.item.title.localeCompare(b.item.title);
  recurringMisses.sort(byAge);
  needsDecision.sort(byAge);

  return {
    recurringMisses,
    needsDecision,
    total: recurringMisses.length + needsDecision.length,
    oldestDays,
  };
}

/**
 * Plain-English explanation of what clearing the recurring misses will do.
 * Shown before the GM confirms, so the bulk action is never a mystery.
 */
export function describeRecurringClear(rows: StaleWorkItem[]): string {
  if (rows.length === 0) return "Nothing to clear.";
  const dates = rows.map((row) => row.nextOccurrence).filter(Boolean).sort();
  const soonest = dates[0];
  const titles = [...new Set(rows.map((row) => row.item.title))];
  const shown = titles.slice(0, 3).join(", ");
  const rest = titles.length > 3 ? ` and ${titles.length - 3} more` : "";
  return `Clears ${rows.length} missed occurrence${rows.length === 1 ? "" : "s"} of ${shown}${rest}. `
    + `These duties stay active${soonest ? ` — the next one is already scheduled for ${soonest}` : ""}.`;
}
