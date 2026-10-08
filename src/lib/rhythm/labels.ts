// Short, plain due-date wording for the My Duties rows.

function parse(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Mon, Oct 5" */
export function shortDueDate(ymd: string): string {
  return parse(ymd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * When it's due, relative to today: "Due today", "Due tomorrow", "Due Friday"
 * within the week, "Due Oct 15" beyond it, "3 days late" once it has passed.
 */
export function dueText(daysUntil: number, ymd: string): string {
  if (daysUntil < -1) return `${-daysUntil} days late`;
  if (daysUntil === -1) return "1 day late";
  if (daysUntil === 0) return "Due today";
  if (daysUntil === 1) return "Due tomorrow";
  const date = parse(ymd);
  if (daysUntil < 7) return `Due ${date.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
