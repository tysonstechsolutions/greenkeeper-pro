/**
 * Equipment triage — Phase B (data-incomplete mode).
 *
 * A human-driven workflow for classifying DOWN equipment. It is supplementary to
 * `equipment.status` (operational/needs_service/in_repair/out_of_service/retired),
 * which remains the source of truth. Triage NEVER infers a state from status or a
 * photo — every value is set by a person. Pure module: no I/O.
 */

import type { EquipmentTriageStatus } from "@/types/database";

/** Canonical triage union lives in the DB types; re-exported here for convenience. */
export type TriageStatus = EquipmentTriageStatus;

export interface TriageStateMeta {
  status: TriageStatus;
  label: string;
  description: string;
  /** Whether this state should surface as needing attention (e.g. on Today). */
  attention: boolean;
  /** Display/sort order (lower = earlier in the repair journey). */
  order: number;
  /** True once a diagnosis has been established (used by completeness). */
  diagnosed: boolean;
}

export const TRIAGE_STATES: readonly TriageStateMeta[] = [
  { status: "unknown_problem",      label: "Unknown problem",      description: "Down; cause not yet identified.",                 attention: true,  order: 0, diagnosed: false },
  { status: "needs_inspection",     label: "Needs inspection",     description: "Awaiting a hands-on look.",                       attention: true,  order: 1, diagnosed: false },
  { status: "diagnosed",            label: "Diagnosed",            description: "Problem identified; repair not yet started.",     attention: true,  order: 2, diagnosed: true  },
  { status: "waiting_on_parts",     label: "Waiting on parts",     description: "Parts required/ordered before repair can finish.", attention: true,  order: 3, diagnosed: true  },
  { status: "waiting_on_vendor",    label: "Waiting on vendor",    description: "Needs outside service (e.g. diesel work).",        attention: true,  order: 4, diagnosed: true  },
  { status: "repair_in_progress",   label: "Repair in progress",   description: "Actively being worked on.",                       attention: true,  order: 5, diagnosed: true  },
  { status: "ready_for_testing",    label: "Ready for testing",    description: "Repair done; needs a test run before release.",    attention: true,  order: 6, diagnosed: true  },
  { status: "returned_to_service",  label: "Returned to service",  description: "Back in service (confirm status is operational).", attention: false, order: 7, diagnosed: true  },
  { status: "replacement_candidate",label: "Replacement candidate",description: "Manually flagged as likely beyond economical repair.", attention: true, order: 8, diagnosed: true },
] as const;

const BY_STATUS = new Map<TriageStatus, TriageStateMeta>(
  TRIAGE_STATES.map((s) => [s.status, s]),
);

/**
 * The state a newly-down unit STARTS in when a person marks it down. This is a
 * UI convenience default for a human action — NOT an inference from status or
 * any other signal. Callers may override.
 */
export const SUGGESTED_INITIAL_TRIAGE: TriageStatus = "needs_inspection";

export function triageMeta(status: TriageStatus | null | undefined): TriageStateMeta | null {
  if (!status) return null;
  return BY_STATUS.get(status) ?? null;
}

export function triageLabel(status: TriageStatus | null | undefined): string {
  return triageMeta(status)?.label ?? "Not triaged";
}

export function isTriageAttention(status: TriageStatus | null | undefined): boolean {
  return triageMeta(status)?.attention ?? false;
}

export function isDiagnosed(status: TriageStatus | null | undefined): boolean {
  return triageMeta(status)?.diagnosed ?? false;
}

export function triageOrder(status: TriageStatus | null | undefined): number {
  // Untriaged sorts after every explicit state.
  return triageMeta(status)?.order ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Whole-day downtime for the current (or a completed) down episode.
 * Returns null when there is no confirmed `down_since` — downtime is NEVER
 * estimated or inferred. `asOf`/`returnedOn` are ISO date strings (YYYY-MM-DD).
 */
export function downtimeDays(
  downSince: string | null | undefined,
  returnedOn: string | null | undefined,
  asOf: string,
): number | null {
  if (!downSince) return null;
  const end = returnedOn ?? asOf;
  const start = Date.parse(`${downSince}T00:00:00Z`);
  const finish = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(finish)) return null;
  const days = Math.floor((finish - start) / 86_400_000);
  return days < 0 ? 0 : days;
}
