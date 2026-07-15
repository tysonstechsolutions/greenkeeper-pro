/**
 * Program scoring — pure functions, no I/O, fully testable.
 *
 * HONESTY RULES (these are the whole point):
 *  • A subsection with `possible = 0` was never scored. Its percent is NULL,
 *    not 0. It is excluded from the parent average rather than dragging it down.
 *  • `not_evaluated` / `insufficient_data` are counted separately from failures.
 *    We never report "unknown" as "failing".
 *  • Coverage is reported alongside every score so a high number computed from
 *    two data points can't masquerade as confidence.
 */
import {
  FAILING_STATUSES,
  STATUS_RANK,
  UNKNOWN_STATUSES,
  type StandardSection,
  type StandardStatus,
  type StandardSubsection,
  type StandardWithStatus,
} from "./types";

export interface SectionScore {
  section: string;
  name: string;
  weight: number;
  earned: number;
  possible: number;
  /** NULL when nothing in this section was scored — never 0. */
  percent: number | null;
  standardsTotal: number;
  failing: number;
  unknown: number;
  critical: number;
}

export interface ProgramScore {
  /** Weighted percent across scored sections, or NULL if nothing is scored. */
  percent: number | null;
  /** Share of sections that carry a real score (0..1) — the confidence signal. */
  coverage: number;
  sections: SectionScore[];
  totalStandards: number;
  failing: number;
  unknown: number;
  critical: number;
  unowned: number;
}

function pct(earned: number, possible: number): number | null {
  if (!Number.isFinite(possible) || possible <= 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

/**
 * Roll subsection baselines up to a section score.
 * Subsections with possible = 0 contribute nothing and are not counted against.
 */
export function scoreSection(
  section: StandardSection,
  subsections: StandardSubsection[],
  standards: StandardWithStatus[],
): SectionScore {
  const mine = subsections.filter((s) => s.section === section.section);
  const earned = mine.reduce((sum, s) => sum + (Number(s.earned) || 0), 0);
  const possible = mine.reduce((sum, s) => sum + (Number(s.possible) || 0), 0);
  const inSection = standards.filter((s) => s.standard.section === section.section);

  return {
    section: section.section,
    name: section.name,
    weight: Number(section.weight) || 0,
    earned,
    possible,
    percent: pct(earned, possible),
    standardsTotal: inSection.length,
    failing: inSection.filter((s) => FAILING_STATUSES.has(s.status)).length,
    unknown: inSection.filter((s) => UNKNOWN_STATUSES.has(s.status)).length,
    critical: inSection.filter((s) => s.status === "critical").length,
  };
}

/**
 * Weighted program score. Sections with no scored data are dropped from BOTH
 * the numerator and the denominator — an unscored section must not silently
 * count as a zero.
 */
export function scoreProgram(
  sections: StandardSection[],
  subsections: StandardSubsection[],
  standards: StandardWithStatus[],
): ProgramScore {
  const sectionScores = sections
    .map((s) => scoreSection(s, subsections, standards))
    .sort((a, b) => a.section.localeCompare(b.section));

  const scored = sectionScores.filter((s) => s.percent !== null && s.weight > 0);
  const weightSum = scored.reduce((sum, s) => sum + s.weight, 0);
  const weighted = scored.reduce((sum, s) => sum + s.weight * (s.percent as number), 0);

  return {
    percent: weightSum > 0 ? Math.round((weighted / weightSum) * 10) / 10 : null,
    coverage: sectionScores.length > 0 ? scored.length / sectionScores.length : 0,
    sections: sectionScores,
    totalStandards: standards.length,
    failing: standards.filter((s) => FAILING_STATUSES.has(s.status)).length,
    unknown: standards.filter((s) => UNKNOWN_STATUSES.has(s.status)).length,
    critical: standards.filter((s) => s.status === "critical").length,
    unowned: standards.filter(
      (s) => s.standard.is_active && !s.standard.owner_profile_id,
    ).length,
  };
}

const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/**
 * "What should I deal with first?" — status urgency, then assessment priority,
 * then cheapest-first so ties break toward things that can actually get done.
 */
export function rankStandards(items: StandardWithStatus[]): StandardWithStatus[] {
  return [...items].sort((a, b) => {
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s !== 0) return s;
    const p =
      (PRIORITY_RANK[a.standard.priority ?? "P4"] ?? 9) -
      (PRIORITY_RANK[b.standard.priority ?? "P4"] ?? 9);
    if (p !== 0) return p;
    return a.standard.code.localeCompare(b.standard.code);
  });
}

/** Newest evaluation wins; ties broken deterministically so renders are stable. */
export function currentStatusOf(
  evaluations: { status: StandardStatus; evaluated_at: string }[],
): StandardStatus {
  if (evaluations.length === 0) return "not_evaluated";
  const sorted = [...evaluations].sort((a, b) => {
    const t = b.evaluated_at.localeCompare(a.evaluated_at);
    if (t !== 0) return t;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  });
  return sorted[0].status;
}
