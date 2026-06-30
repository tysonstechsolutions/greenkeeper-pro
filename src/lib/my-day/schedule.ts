/**
 * My Day — pure scheduling + rollover logic.
 *
 * scheduleSteps: lay an AI/manual breakdown across days. With a deadline the
 * work starts TODAY and runs one step per day, finishing by (deadline - buffer)
 * so it lands a couple days early and never rushes the final day; it only packs
 * multiple steps into a day if there isn't room one-per-day. No deadline -> the
 * steps go to a date-less backlog you pull from when you have time.
 *
 * partitionDayView: "today's list" is simply every NOT-done step due today or
 * earlier (overdue rolls in), so undone work carries forward with no nightly
 * job — that's the rollover.
 */
import { addDaysLocal } from "@/lib/utils/date";

export interface ScheduledStep {
  title: string;
  target_date: string | null; // YYYY-MM-DD, or null for the backlog
  sort_order: number;
}

export interface ScheduleOptions {
  today: string; // YYYY-MM-DD
  deadline: string | null; // YYYY-MM-DD, or null
  bufferDays: number;
}

/** Whole days from `a` to `b` (noon-anchored to dodge DST). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`);
  return Math.round(ms / 86_400_000);
}

export function scheduleSteps(
  titles: string[],
  opts: ScheduleOptions,
): ScheduledStep[] {
  const n = titles.length;
  if (n === 0) return [];

  // No deadline -> rolling backlog (no fixed day).
  if (!opts.deadline) {
    return titles.map((title, i) => ({ title, target_date: null, sort_order: i }));
  }

  // Finish by (deadline - buffer), but never before today.
  const buffered = addDaysLocal(opts.deadline, -Math.max(0, opts.bufferDays));
  const finishBy = daysBetween(opts.today, buffered) < 0 ? opts.today : buffered;
  const availableDays = daysBetween(opts.today, finishBy) + 1; // inclusive

  return titles.map((title, i) => {
    const offset =
      n <= availableDays
        ? i // one per day, starting today (ASAP + spaced)
        : Math.floor((i * availableDays) / n); // compress to fit the window
    return { title, target_date: addDaysLocal(opts.today, offset), sort_order: i };
  });
}

export interface DayView<T> {
  overdue: T[];
  today: T[];
  backlog: T[];
  upcoming: T[];
}

/** Partition steps into today's working buckets. Done steps are excluded. */
export function partitionDayView<
  T extends { target_date: string | null; done: boolean },
>(steps: T[], today: string): DayView<T> {
  const view: DayView<T> = { overdue: [], today: [], backlog: [], upcoming: [] };
  for (const s of steps) {
    if (s.done) continue;
    if (s.target_date === null) view.backlog.push(s);
    else if (s.target_date < today) view.overdue.push(s);
    else if (s.target_date === today) view.today.push(s);
    else view.upcoming.push(s);
  }
  return view;
}
