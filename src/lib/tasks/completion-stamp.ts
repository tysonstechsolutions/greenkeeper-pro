/**
 * Completion stamping for tasks and duty occurrences.
 *
 * `transition_task_status` (and therefore the command center's
 * `transition_operational_work`) moves `tasks.status` to completed/verified but
 * never writes `completed_at`, `completed_by`, `verified_at` or `verified_by`.
 * Every task row in the database has a null `completed_at`, so "what got done
 * this week, and who did it" had nothing to read.
 *
 * Changing the SQL function would mean a production schema change; the task
 * RLS update policy already lets an operations manager write these columns, so
 * the app stamps them itself immediately after the transition succeeds.
 *
 * Pure helper so the column mapping is testable without a database.
 */

export type CompletionAction = "complete" | "verify" | "reopen" | "start" | "mark_blocked";

export interface CompletionStamp extends Record<string, string | null | undefined> {
  completed_at?: string | null;
  completed_by?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
}

/**
 * The columns to write after a status transition, or null when the action
 * does not affect completion history.
 *
 * - `complete` stamps who finished it and exactly when, but never overwrites
 *   an earlier completion — re-completing an already-done item keeps the
 *   original record.
 * - `verify` stamps the verifier and leaves the completion record alone.
 * - `reopen` clears both, because the work is no longer done.
 */
export function completionStampFor(
  action: CompletionAction,
  actorId: string | null,
  now: Date,
  alreadyCompletedAt: string | null = null,
): CompletionStamp | null {
  const at = now.toISOString();
  switch (action) {
    case "complete":
      if (alreadyCompletedAt) return null;
      return { completed_at: at, completed_by: actorId };
    case "verify":
      return { verified_at: at, verified_by: actorId };
    case "reopen":
      return { completed_at: null, completed_by: null, verified_at: null, verified_by: null };
    default:
      return null;
  }
}

/**
 * Work keys in the command center are `<kind>:<uuid>`. Only task and duty
 * occurrences live in `tasks`; obligations, steps and standards keep their own
 * completion records and must not be patched here.
 */
export function taskIdFromWorkKey(workKey: string): string | null {
  const [kind, id] = workKey.split(":");
  if (kind !== "task" && kind !== "duty") return null;
  return id || null;
}
