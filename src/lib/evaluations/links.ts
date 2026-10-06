/**
 * Links into the evaluation screens. A yearly evaluation is addressed by
 * fiscal year; a 90-day evaluation by the start of its period (the hire date).
 */
export type EvaluationTarget = { fy: number } | { ninetyDayStart: string };

export function evaluationListHref(target: EvaluationTarget): string {
  return "fy" in target ? `/staff/evaluations?fy=${target.fy}` : "/staff/evaluations?tab=90day";
}

export function evaluationEditHref(employeeId: string, target: EvaluationTarget): string {
  return "fy" in target
    ? `/staff/evaluations/edit?employee=${employeeId}&fy=${target.fy}`
    : `/staff/evaluations/edit?employee=${employeeId}&kind=90day&start=${target.ninetyDayStart}`;
}
