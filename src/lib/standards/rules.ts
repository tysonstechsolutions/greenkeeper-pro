/**
 * Gap-to-action rules — deterministic, pure, auditable.
 *
 * These turn EXISTING operational data into standard evaluations + proposed
 * corrective actions. No AI: every proposal here is traceable to a specific
 * record and a specific rule. AI may later draft prose, but it must never
 * silently move an official score.
 *
 * Each rule returns PROPOSALS. Nothing is written by this module — the caller
 * persists, and the DB's partial unique index
 * (standard_id, rule_key, source_id) makes repeated runs idempotent.
 */
import type { StandardStatus } from "./types";

export type RuleKey =
  | "equipment_down"
  | "duty_unassigned"
  | "obligation_overdue"
  | "observation_severe";

export interface EvaluationProposal {
  standardCode: string;
  status: StandardStatus;
  detail: string;
  sourceKind: string;
  sourceId: string | null;
  sourceRef: string | null;
}

export interface ActionProposal {
  standardCode: string;
  ruleKey: RuleKey;
  sourceKind: string;
  sourceId: string | null;
  gapDetail: string;
  whyItMatters: string;
  definitionOfDone: string;
  priority: "critical" | "high" | "normal" | "low";
  /** Suggested assignee. NULL means "management must decide" — never guess. */
  assigneeProfileId: string | null;
  /** TRUE when this needs a human decision rather than field work. */
  isManagementAction: boolean;
  title: string;
}

export interface RuleResult {
  evaluations: EvaluationProposal[];
  actions: ActionProposal[];
}

function empty(): RuleResult {
  return { evaluations: [], actions: [] };
}

// ── Rule 1: Equipment readiness ────────────────────────────────────────────

export interface EquipmentInput {
  id: string;
  name: string;
  status: string;
  is_critical?: boolean | null;
  down_since?: string | null;
  /** An already-open repair/work order, if one exists. */
  openRepairId?: string | null;
}

const DOWN_STATUSES = new Set(["out_of_service", "in_repair"]);

/**
 * Critical equipment down → readiness standard below target.
 *
 * If a repair already exists we still mark the standard down (the gap is real
 * regardless) but do NOT propose duplicate work — we link the existing repair.
 */
export function evaluateEquipmentReadiness(
  units: EquipmentInput[],
  standardCode: string,
): RuleResult {
  const down = units.filter((u) => DOWN_STATUSES.has(u.status));
  if (units.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "insufficient_data",
          detail: "No equipment records available to evaluate readiness.",
          sourceKind: "equipment",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }
  if (down.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "meets_standard",
          detail: `All ${units.length} tracked units are operational.`,
          sourceKind: "equipment",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }

  const criticalDown = down.filter((u) => u.is_critical);
  const result: RuleResult = {
    evaluations: [
      {
        standardCode,
        status: criticalDown.length > 0 ? "critical" : "below_standard",
        detail:
          `${down.length} unit${down.length === 1 ? "" : "s"} down` +
          (criticalDown.length > 0
            ? ` (${criticalDown.length} critical: ${criticalDown.map((u) => u.name).join(", ")})`
            : ""),
        sourceKind: "equipment",
        sourceId: null,
        sourceRef: null,
      },
    ],
    actions: [],
  };

  for (const unit of down) {
    // Already being worked — the gap is tracked, don't duplicate the work.
    if (unit.openRepairId) continue;
    result.actions.push({
      standardCode,
      ruleKey: "equipment_down",
      sourceKind: "equipment",
      sourceId: unit.id,
      title: `Get ${unit.name} back in service`,
      gapDetail: `${unit.name} is ${unit.status.replace(/_/g, " ")} with no open repair.`,
      whyItMatters: unit.is_critical
        ? `${unit.name} is critical equipment. While it's down the course can't be maintained to standard.`
        : `${unit.name} is out of service, so the work it does isn't getting done.`,
      definitionOfDone:
        "Unit is back in service, or a repair/parts order is open with an expected date.",
      priority: unit.is_critical ? "critical" : "high",
      assigneeProfileId: null,
      isManagementAction: false,
    });
  }
  return result;
}

// ── Rule 2: Unassigned recurring duty ──────────────────────────────────────

export interface DutyInput {
  id: string;
  title: string;
  is_active: boolean;
  assigneeType: "employee" | "contractor" | "unassigned" | null;
  primaryProfileId: string | null;
}

/**
 * An active required duty with no owner → ownership standard below target.
 *
 * Deliberately proposes a MANAGEMENT action ("decide who owns this") and never
 * assigns anyone. Auto-assigning would invent accountability that nobody agreed
 * to. Today's audit showed these occurrences currently appear in NOBODY's list.
 */
export function evaluateDutyOwnership(
  duties: DutyInput[],
  standardCode: string,
): RuleResult {
  const active = duties.filter((d) => d.is_active);
  if (active.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "insufficient_data",
          detail: "No active duties recorded.",
          sourceKind: "duty",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }

  const unowned = active.filter(
    (d) => d.assigneeType === "unassigned" || (!d.primaryProfileId && d.assigneeType !== "contractor"),
  );
  if (unowned.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "meets_standard",
          detail: `All ${active.length} active duties have an owner.`,
          sourceKind: "duty",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }

  return {
    evaluations: [
      {
        standardCode,
        status: "below_standard",
        detail: `${unowned.length} of ${active.length} active duties have no owner. Their work is generated but shown to no one.`,
        sourceKind: "duty",
        sourceId: null,
        sourceRef: null,
      },
    ],
    actions: unowned.map((d) => ({
      standardCode,
      ruleKey: "duty_unassigned" as RuleKey,
      sourceKind: "duty",
      sourceId: d.id,
      title: `Decide who owns: ${d.title}`,
      gapDetail: `"${d.title}" is active and generating work, but has no primary owner.`,
      whyItMatters:
        "Work with no owner lands in nobody's day. It looks scheduled but never gets done.",
      definitionOfDone: "A primary owner (and backup, if needed) is assigned to this duty.",
      priority: "high" as const,
      assigneeProfileId: null,
      isManagementAction: true,
    })),
  };
}

// ── Rule 3: Overdue compliance obligation ──────────────────────────────────

export interface ObligationInput {
  id: string;
  slug: string;
  title: string;
  status: "overdue" | "due_soon" | "upcoming" | "done";
  dueOn: string | null;
  daysOverdue: number;
  ownerProfileId?: string | null;
}

/**
 * An overdue obligation → compliance standard below target (critical past 30
 * days). Assigns to the obligation's owner when one is recorded; otherwise it
 * becomes a management action rather than being dumped on someone arbitrary.
 */
export function evaluateComplianceObligations(
  obligations: ObligationInput[],
  standardCode: string,
): RuleResult {
  if (obligations.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "insufficient_data",
          detail: "No compliance obligations recorded.",
          sourceKind: "obligation",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }

  const overdue = obligations.filter((o) => o.status === "overdue");
  if (overdue.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "meets_standard",
          detail: `All ${obligations.length} obligations are current.`,
          sourceKind: "obligation",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }

  const badlyOverdue = overdue.some((o) => o.daysOverdue > 30);
  return {
    evaluations: [
      {
        standardCode,
        status: badlyOverdue ? "critical" : "below_standard",
        detail: `${overdue.length} overdue: ${overdue.map((o) => o.title).join(", ")}.`,
        sourceKind: "obligation",
        sourceId: null,
        sourceRef: null,
      },
    ],
    actions: overdue.map((o) => ({
      standardCode,
      ruleKey: "obligation_overdue" as RuleKey,
      sourceKind: "obligation",
      sourceId: o.id,
      title: `Overdue: ${o.title}`,
      gapDetail: `${o.title} is ${o.daysOverdue} day${o.daysOverdue === 1 ? "" : "s"} overdue${o.dueOn ? ` (was due ${o.dueOn})` : ""}.`,
      whyItMatters:
        "This is a required recurring obligation. Missing it is a compliance finding, not just a late chore.",
      definitionOfDone: "The obligation is completed for this period and the record is filed.",
      priority: o.daysOverdue > 30 ? ("critical" as const) : ("high" as const),
      assigneeProfileId: o.ownerProfileId ?? null,
      isManagementAction: !o.ownerProfileId,
    })),
  };
}

// ── Rule 4: Course observation requiring action ────────────────────────────

export interface ObservationInput {
  id: string;
  title: string;
  hole_number: number | null;
  priority: string;
  status: string;
  task_id: string | null;
  issue_type?: string | null;
}

const SEVERE = new Set(["critical", "high"]);
const CLOSED = new Set(["resolved"]);

/**
 * A severe/unsafe open observation → the related condition standard drops, and
 * a corrective action is proposed unless the observation already has work.
 *
 * The observation stays the source record — this never mutates it. Resolution
 * requires verification, so completing the task alone won't clear the standard.
 */
export function evaluateCourseObservations(
  observations: ObservationInput[],
  standardCode: string,
): RuleResult {
  const open = observations.filter((o) => !CLOSED.has(o.status));
  const severe = open.filter((o) => SEVERE.has(o.priority));

  if (observations.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "insufficient_data",
          detail: "No course observations recorded for this period.",
          sourceKind: "observation",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }
  if (severe.length === 0) {
    return {
      evaluations: [
        {
          standardCode,
          status: "meets_standard",
          detail: `No severe open observations (${open.length} open, none critical/high).`,
          sourceKind: "observation",
          sourceId: null,
          sourceRef: null,
        },
      ],
      actions: [],
    };
  }

  const anyCritical = severe.some((o) => o.priority === "critical");
  const result: RuleResult = {
    evaluations: [
      {
        standardCode,
        status: anyCritical ? "critical" : "below_standard",
        detail: `${severe.length} severe open observation${severe.length === 1 ? "" : "s"}: ${severe
          .map((o) => (o.hole_number ? `#${o.hole_number} ${o.title}` : o.title))
          .join("; ")}.`,
        sourceKind: "observation",
        sourceId: null,
        sourceRef: null,
      },
    ],
    actions: [],
  };

  for (const o of severe) {
    if (o.task_id) continue; // already has work — don't duplicate
    const where = o.hole_number ? `Hole ${o.hole_number}` : "Course";
    result.actions.push({
      standardCode,
      ruleKey: "observation_severe",
      sourceKind: "observation",
      sourceId: o.id,
      title: `${where}: ${o.title}`,
      gapDetail: `${o.priority === "critical" ? "Critical" : "High-priority"} observation at ${where.toLowerCase()} with no work assigned: ${o.title}.`,
      whyItMatters:
        o.priority === "critical"
          ? "A critical course condition is open and unassigned. It affects playability or safety right now."
          : "A high-priority course condition is open with nobody working it.",
      definitionOfDone:
        "The condition is corrected, photo evidence is uploaded, and a manager verifies the fix.",
      priority: o.priority === "critical" ? "critical" : "high",
      assigneeProfileId: null,
      isManagementAction: false,
    });
  }
  return result;
}

/** Merge rule results, preserving order. */
export function mergeRuleResults(results: RuleResult[]): RuleResult {
  return results.reduce<RuleResult>(
    (acc, r) => ({
      evaluations: [...acc.evaluations, ...r.evaluations],
      actions: [...acc.actions, ...r.actions],
    }),
    empty(),
  );
}
