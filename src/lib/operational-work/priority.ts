import type {
  OperationalPriorityBand,
  OperationalSectionKey,
  OperationalWorkItem,
} from "./types";

const DAY_MS = 86_400_000;

function localDay(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysFrom(today: Date, date: string): number {
  return Math.round((localDay(date).getTime() - localDay(today).getTime()) / DAY_MS);
}

export interface PriorityInput {
  dueDate: string | null;
  estimatedMinutes: number | null;
  sourcePriority: OperationalPriorityBand;
  managerPriorityOverride: number | null;
  safetyFlag: boolean;
  complianceFlag: boolean;
  payrollDeadlineFlag: boolean;
  financialDeadlineFlag: boolean;
  dependentCount: number;
  sourceType: OperationalWorkItem["sourceType"];
  impactLevel: OperationalWorkItem["impactLevel"];
  status: OperationalWorkItem["status"];
}

const SOURCE_PRIORITY: Record<OperationalPriorityBand, number> = {
  critical: 300,
  high: 200,
  normal: 100,
  low: 0,
};

const IMPACT_SCORE = { critical: 360, high: 260, medium: 150, low: 70 } as const;

/** Deterministic, explainable priority. No AI or hidden weights. */
export function scoreOperationalPriority(
  input: PriorityInput,
  today: Date,
): { score: number; explanation: string[] } {
  if (["completed", "verified", "cancelled"].includes(input.status)) {
    return { score: -1000, explanation: ["Completed work is kept for recent history."] };
  }

  let score = SOURCE_PRIORITY[input.sourcePriority];
  const explanation: string[] = [];
  const dueDays = input.dueDate ? daysFrom(today, input.dueDate) : null;

  if (dueDays !== null && dueDays < 0) {
    const overdueDays = Math.abs(dueDays);
    score += 1000 + Math.min(overdueDays, 30) * 10;
    explanation.push(`Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}.`);
  } else if (dueDays === 0) {
    score += 800;
    explanation.push("Due today.");
  } else if (dueDays !== null && dueDays <= 3) {
    score += 620 - dueDays * 40;
    explanation.push(`Due in ${dueDays} day${dueDays === 1 ? "" : "s"}.`);
  } else if (dueDays !== null && dueDays <= 7) {
    score += 360 - dueDays * 20;
    explanation.push(`Due this week in ${dueDays} days.`);
  } else if (dueDays !== null) {
    score += Math.max(20, 160 - dueDays);
    explanation.push(`Due ${input.dueDate}.`);
  }

  if (input.safetyFlag) {
    score += 350;
    explanation.push("Safety-sensitive work.");
  }
  if (input.complianceFlag) {
    score += 300;
    explanation.push("Compliance-sensitive work.");
  }
  if (input.payrollDeadlineFlag) {
    score += 260;
    explanation.push("Payroll deadline.");
  }
  if (input.financialDeadlineFlag) {
    score += 240;
    explanation.push("Financial deadline.");
  }
  if (input.dependentCount > 0) {
    score += Math.min(input.dependentCount, 10) * 55;
    explanation.push(
      `Blocks ${input.dependentCount} other task${input.dependentCount === 1 ? "" : "s"}.`,
    );
  }

  if (input.estimatedMinutes !== null && input.estimatedMinutes <= 15) {
    score += 95;
    explanation.push(`Estimated at ${input.estimatedMinutes} minutes.`);
  } else if (input.estimatedMinutes !== null && input.estimatedMinutes <= 30) {
    score += 60;
    explanation.push(`Estimated at ${input.estimatedMinutes} minutes.`);
  } else if (input.estimatedMinutes !== null) {
    explanation.push(`Estimated at ${input.estimatedMinutes} minutes.`);
  }

  if (input.sourceType === "standard" && dueDays === null && input.impactLevel) {
    score += IMPACT_SCORE[input.impactLevel];
    const quick = input.estimatedMinutes !== null && input.estimatedMinutes <= 30;
    explanation.push(
      `Program Standard with no fixed deadline; ranked as a ${input.impactLevel}-impact${quick ? " quick win" : " improvement"}.`,
    );
  }

  if (input.managerPriorityOverride !== null) {
    score += input.managerPriorityOverride;
    explanation.push("Manager priority override.");
  }

  if (explanation.length === 0) explanation.push("Normal operational priority.");
  return { score, explanation };
}

export function priorityBandForScore(score: number): OperationalPriorityBand {
  if (score >= 900) return "critical";
  if (score >= 500) return "high";
  if (score < 100) return "low";
  return "normal";
}

export function compareOperationalWork(a: OperationalWorkItem, b: OperationalWorkItem): number {
  return (
    b.priorityScore - a.priorityScore ||
    (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
    a.stableId.localeCompare(b.stableId)
  );
}

const WAITING_ON_SOMEONE = new Set([
  "waiting_on_employee",
  "waiting_on_vendor",
  "waiting_on_contractor",
  "waiting_on_parts",
  "waiting_on_funding",
  "waiting_on_approval",
]);

/** Assign exactly one primary section; secondary states render as badges. */
export function primarySectionFor(
  item: OperationalWorkItem,
  today: Date,
  currentUserId: string | null,
): OperationalSectionKey {
  if (["completed", "verified"].includes(item.status)) return "completed_recently";
  if (item.leadershipState.active || item.status === "waiting_leadership") {
    return "waiting_on_leadership";
  }
  if (item.blockedState.blocked || item.status === "blocked") return "blocked";
  if (item.verificationState === "needs_verification" || item.status === "needs_verification") {
    return "needs_verification";
  }
  if (item.waitingReason && WAITING_ON_SOMEONE.has(item.waitingReason)) {
    return "waiting_on_someone";
  }

  const dueDays = item.dueDate ? daysFrom(today, item.dueDate) : null;
  const criticalSignal = item.safetyFlag || item.complianceFlag
    || item.payrollDeadlineFlag || item.financialDeadlineFlag
    || item.priorityBand === "critical";
  if (criticalSignal && (dueDays === null || dueDays <= 1)) return "critical_now";
  if (dueDays !== null && dueDays < 0) return "overdue";
  if (dueDays === 0) return "due_today";
  if (dueDays !== null && dueDays <= 7) return "due_soon";
  if (item.estimatedMinutes !== null && item.estimatedMinutes <= 30) return "quick_wins";
  if (item.responsibleEmployee?.id === currentUserId) return "my_work";
  if (item.delegated) return "delegated";
  if (item.sourceType === "standard") return "program_improvements";
  return "upcoming";
}

export function partitionOperationalWork(
  items: OperationalWorkItem[],
  today: Date,
  currentUserId: string | null,
): Map<OperationalSectionKey, OperationalWorkItem[]> {
  const sections = new Map<OperationalSectionKey, OperationalWorkItem[]>();
  for (const item of [...items].sort(compareOperationalWork)) {
    const key = primarySectionFor(item, today, currentUserId);
    const rows = sections.get(key) ?? [];
    rows.push(item);
    sections.set(key, rows);
  }
  return sections;
}
