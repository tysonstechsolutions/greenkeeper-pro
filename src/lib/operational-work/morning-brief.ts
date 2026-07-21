import { partitionOperationalWork } from "./priority";
import type { OperationalWorkItem } from "./types";

export interface MorningBrief {
  dateLabel: string;
  headline: string;
  lines: string[];
  topActions: OperationalWorkItem[];
}

const FINISHED = new Set(["completed", "verified", "cancelled"]);

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Deterministic "here's your day" summary for the top of the command center.
 * Every number is counted from the real work list — nothing is guessed, and
 * an empty day is stated plainly rather than dressed up.
 */
export function buildMorningBrief(items: OperationalWorkItem[], today: Date): MorningBrief {
  const sections = partitionOperationalWork(items, today, null);
  const count = (key: Parameters<typeof sections.get>[0]) => sections.get(key)?.length ?? 0;

  const overdue = count("overdue");
  const criticalNow = count("critical_now");
  const dueToday = count("due_today");
  const dueSoon = count("due_soon");

  const open = items.filter((item) => !FINISHED.has(item.status));
  const safety = open.filter((item) => item.safetyFlag).length;
  const compliance = open.filter((item) => item.complianceFlag && !item.safetyFlag).length;
  const money = open.filter((item) => item.financialDeadlineFlag).length;
  const equipmentDown = open.filter((item) => item.sourceType === "equipment" && item.priorityBand === "critical").length;

  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const lines: string[] = [];
  if (overdue > 0) lines.push(`${plural(overdue, "item")} overdue — clear or reschedule the big ones.`);
  if (dueToday > 0) lines.push(`${plural(dueToday, "item")} due today.`);
  if (criticalNow > 0) lines.push(`${plural(criticalNow, "item")} flagged critical right now.`);
  if (safety > 0) lines.push(`${plural(safety, "safety item")} to keep an eye on.`);
  if (compliance > 0) lines.push(`${plural(compliance, "compliance item")} (inspection, cert, report).`);
  if (equipmentDown > 0) lines.push(`${plural(equipmentDown, "piece")} of equipment down or in repair.`);
  if (money > 0) lines.push(`${plural(money, "money item")} (purchase requests / budget) waiting.`);
  if (dueSoon > 0) lines.push(`${plural(dueSoon, "item")} coming due this week.`);

  const headline = overdue + dueToday + criticalNow === 0
    ? "Nothing overdue or due today — you're caught up. Good time to get ahead."
    : `${plural(overdue, "overdue item")}, ${dueToday} due today, ${criticalNow} critical. Here's where to start.`;

  const topActions = open
    .filter((item) =>
      !item.blockedState.blocked
      && !item.leadershipState.active
      && item.status !== "needs_verification"
      && item.status !== "waiting_leadership")
    .sort((a, b) => b.priorityScore - a.priorityScore || a.stableId.localeCompare(b.stableId))
    .slice(0, 3);

  return { dateLabel, headline, lines, topActions };
}
