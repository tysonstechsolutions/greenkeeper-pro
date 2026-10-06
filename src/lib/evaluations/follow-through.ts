/**
 * After an evaluation is final, three things still have to happen: the
 * approving official signs it, the supervisor goes over it with the
 * employee, and the employee gets a copy. They're due within two weeks of
 * finalizing. Pure, for the editor, the roster, and My Day.
 */
import { addDays } from "./period";
import type { StaffEvaluation } from "./types";

export const FOLLOW_THROUGH_DAYS = 14;

export type FollowThroughKey = "approved_on" | "discussed_on" | "copy_given_on";

export const FOLLOW_THROUGH_STEPS: { key: FollowThroughKey; label: string; short: string }[] = [
  { key: "approved_on", label: "Approving official signed", short: "signed" },
  { key: "discussed_on", label: "Gone over with the employee", short: "discussed" },
  { key: "copy_given_on", label: "Copy given to the employee", short: "copy given" },
];

export interface FollowThrough {
  done: number;
  total: number;
  /** Steps still open, in order. */
  missing: { key: FollowThroughKey; label: string; short: string }[];
  /** Finalized date + 14 days. */
  dueDate: string;
  overdue: boolean;
  complete: boolean;
}

type FollowThroughRow = Pick<StaffEvaluation, "status" | "finalized_at"> &
  Partial<Pick<StaffEvaluation, FollowThroughKey>>;

/** Where a final evaluation's follow-through stands. Null until it's final. */
export function followThrough(ev: FollowThroughRow | null | undefined, todayIso: string): FollowThrough | null {
  if (!ev || ev.status !== "final" || !ev.finalized_at) return null;
  const missing = FOLLOW_THROUGH_STEPS.filter((s) => !ev[s.key]);
  const dueDate = addDays(ev.finalized_at.slice(0, 10), FOLLOW_THROUGH_DAYS);
  return {
    done: FOLLOW_THROUGH_STEPS.length - missing.length,
    total: FOLLOW_THROUGH_STEPS.length,
    missing,
    dueDate,
    overdue: missing.length > 0 && todayIso > dueDate,
    complete: missing.length === 0,
  };
}

/** "Follow-through: needs discussed, copy given · due Oct 20" style summary. */
export function followThroughText(ft: FollowThrough): string {
  if (ft.complete) return "Signed, discussed, and copy given";
  const due = new Date(`${ft.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Still needs: ${ft.missing.map((m) => m.short).join(", ")} · ${ft.overdue ? "overdue since" : "due"} ${due}`;
}
