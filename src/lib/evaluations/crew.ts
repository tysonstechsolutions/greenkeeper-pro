/**
 * Rating the whole crew side by side: one element at a time, everyone on one
 * screen. Comparing people on the same element keeps ratings consistent, and
 * each screen is one small decision per person.
 *
 * Pure helpers here; the saving hook is useCrewRatings in use-evaluations.ts.
 */
import { PERFORMANCE_ELEMENTS, SUPERVISORY_ROLES, type PerformanceElement } from "./form";
import { applicableRatings } from "./questions";
import { isRatingValue, type EvaluationRatings, type RatingValue } from "./types";

/**
 * Rated as a supervisor (elements f–h) by default when their role usually
 * supervises or anyone on the roster reports to them.
 */
export function defaultSupervisory(
  employee: { id: string; role: string },
  roster: { supervisor_id: string | null }[],
): boolean {
  return SUPERVISORY_ROLES.includes(employee.role) || roster.some((p) => p.supervisor_id === employee.id);
}

/** One person's ratings as the crew screen shows and saves them. */
export interface CrewMember {
  ratings: EvaluationRatings;
  supervisory: boolean;
  overall: RatingValue | null;
}

/** Apply one tap. Per the form, an Unsatisfactory element makes the overall Unsatisfactory. */
export function applyCrewRating(member: CrewMember, elementKey: string, value: RatingValue): CrewMember {
  return {
    ...member,
    ratings: { ...member.ratings, [elementKey]: value },
    overall: value === 1 ? 1 : member.overall,
  };
}

/** Change whether someone is rated on f–h; their f–h ratings are dropped when turned off. */
export function applyCrewSupervisory(member: CrewMember, supervisory: boolean): CrewMember {
  return { ...member, supervisory, ratings: applicableRatings(member.ratings, supervisory) };
}

/** The screens of the crew flow: who supervises, then each element anyone is rated on. */
export type CrewStep = { kind: "supervisors" } | { kind: "element"; element: PerformanceElement };

export function crewSteps(anySupervisors: boolean): CrewStep[] {
  return [
    { kind: "supervisors" },
    ...PERFORMANCE_ELEMENTS.filter((e) => anySupervisors || !e.supervisoryOnly).map(
      (element) => ({ kind: "element", element }) as CrewStep,
    ),
  ];
}

/** How many people still need a rating on this element. */
export function unratedCount(
  element: PerformanceElement,
  members: { member: CrewMember }[],
): number {
  return members.filter(
    ({ member }) => (!element.supervisoryOnly || member.supervisory) && !isRatingValue(member.ratings[element.key]),
  ).length;
}
