import { addDaysLocal } from "@/lib/utils/date";
import type {
  DutyAssignment,
  DutyCadence,
  DutyDepartment,
  DutyRecurrenceRule,
  DutyRoleGroup,
  DutyTaskOccurrence,
  OperationDuty,
} from "./types";

export const DUTY_DEPARTMENT_LABELS: Record<DutyDepartment, string> = {
  golf_operations: "Golf Operations",
  maintenance: "Maintenance",
  food_and_beverage: "Food & Beverage",
  pro_shop: "Pro Shop",
  administration: "Administration",
  external: "External",
};

/**
 * Role groups that no longer stand on their own, and what they fold into.
 *
 * `pro_shop_staff` and `golf_operations_assistant` described one job. Nobody
 * was ever recorded as pro-shop staff — the people who work inside are golf
 * ops assistants on their profile and on the schedule — yet the split printed
 * two duty sheets for one person to work from. The 2026-07-29 migration
 * rewrote the stored rows; this map keeps any straggler (an old draft, a
 * hand-edited import) landing on the merged sheet instead of a ghost one.
 */
const MERGED_ROLE_GROUPS: Partial<Record<DutyRoleGroup, DutyRoleGroup>> = {
  pro_shop_staff: "golf_operations_assistant",
};

/** The surviving role group for a stored value. */
export function normalizeDutyRoleGroup(
  roleGroup: DutyRoleGroup | null | undefined,
): DutyRoleGroup | null {
  if (!roleGroup) return null;
  return MERGED_ROLE_GROUPS[roleGroup] ?? roleGroup;
}

export const DUTY_ROLE_GROUP_LABELS: Record<DutyRoleGroup, string> = {
  recreation_aide: "Recreation Aides",
  golf_operations_assistant: "Golf Ops / Pro Shop",
  maintenance_staff: "Maintenance Staff",
  restaurant_staff: "Restaurant Staff",
  // Retired — kept so a stale stored value still reads as the merged position
  // rather than rendering blank. Not offered anywhere in the UI.
  pro_shop_staff: "Golf Ops / Pro Shop",
  general_manager: "General Manager",
  contractor: "Contractors",
  unassigned: "Unassigned Work",
};

/** Selectable, printable role groups. Merged-away values are absent by design. */
export const DUTY_ROLE_GROUP_ORDER: DutyRoleGroup[] = [
  "recreation_aide",
  "golf_operations_assistant",
  "maintenance_staff",
  "restaurant_staff",
  "general_manager",
  "contractor",
  "unassigned",
];

export const DUTY_CADENCE_LABELS: Record<DutyCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function daysBetween(anchor: string, value: string): number {
  const [anchorYear, anchorMonth, anchorDay] = anchor.split("-").map(Number);
  const [valueYear, valueMonth, valueDay] = value.split("-").map(Number);
  return Math.round(
    (Date.UTC(valueYear, valueMonth - 1, valueDay)
      - Date.UTC(anchorYear, anchorMonth - 1, anchorDay)) / 86_400_000,
  );
}

function lastDayOfMonth(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

function normalizedRule(duty: OperationDuty): DutyRecurrenceRule {
  return duty.recurrence_rule ?? {
    cadence: duty.cadence ?? "weekly",
    interval: 1,
    weekdays: duty.days,
  };
}

function inRecordedSeason(duty: OperationDuty, date: string): boolean {
  if (duty.season === "year_round") return true;
  const start = duty.seasonal_start_mmdd;
  const end = duty.seasonal_end_mmdd;
  if (!start || !end) return false;
  const monthDay = date.slice(5);
  return start <= end
    ? monthDay >= start && monthDay <= end
    : monthDay >= start || monthDay <= end;
}

/** Pure recurrence matcher shared by previews and unit tests. */
export function dutyRunsOn(duty: OperationDuty, date: string): boolean {
  if (!duty.is_active) return false;
  if (duty.active_from && date < duty.active_from) return false;
  if (duty.active_through && date > duty.active_through) return false;

  const value = parseDate(date);
  if (!inRecordedSeason(duty, date)) return false;

  const rule = normalizedRule(duty);
  const interval = Math.max(1, rule.interval || 1);
  const anchor = duty.active_from ?? date;
  const weekday = WEEKDAYS[value.getDay()];
  const weekdays = rule.weekdays ?? [];

  if (rule.cadence === "daily") {
    return weekdays.length === 0 || weekdays.includes(weekday);
  }

  if (rule.cadence === "weekly") {
    if (weekdays.length > 0 && !weekdays.includes(weekday)) return false;
    return Math.floor(daysBetween(anchor, date) / 7) % interval === 0;
  }

  const requestedDay = rule.day_of_month ?? 1;
  const actualDay = requestedDay === -1
    ? lastDayOfMonth(value)
    : Math.min(requestedDay, lastDayOfMonth(value));
  if (value.getDate() !== actualDay) return false;

  const anchorDate = parseDate(anchor);
  const monthDistance =
    (value.getFullYear() - anchorDate.getFullYear()) * 12
    + value.getMonth()
    - anchorDate.getMonth();

  if (rule.cadence === "monthly") return monthDistance % interval === 0;

  if (rule.cadence === "quarterly") {
    const allowedMonths = rule.months ?? [];
    if (allowedMonths.length > 0 && !allowedMonths.includes(value.getMonth() + 1)) return false;
    return monthDistance % (3 * interval) === 0;
  }

  const allowedMonths = rule.months ?? [anchorDate.getMonth() + 1];
  return (
    allowedMonths.includes(value.getMonth() + 1)
    && monthDistance % (12 * interval) === 0
  );
}

/**
 * Selects executable duties for Today. Duty-backed task occurrences are the
 * source of truth (including a single occurrence moved off its original date);
 * pre-Phase-1A duties keep the legacy schedule fallback during rollout.
 */
export function dutiesForTodayFromOccurrences(
  duties: OperationDuty[],
  occurrences: DutyTaskOccurrence[],
  date: string,
): OperationDuty[] {
  const occurrenceDutyIds = new Set(
    occurrences
      .filter((occurrence) => occurrence.due_date === date && occurrence.status !== "cancelled")
      .map((occurrence) => occurrence.duty_id),
  );

  return duties.filter((duty) => (
    occurrenceDutyIds.has(duty.id)
    || (!duty.recurrence_rule && dutyRunsOn(duty, date))
  ));
}

export function occurrenceDatesForDuty(
  duty: OperationDuty,
  from: string,
  through: string,
): string[] {
  const result: string[] = [];
  for (let date = from; date <= through; date = addDaysLocal(date, 1)) {
    if (dutyRunsOn(duty, date)) result.push(date);
  }
  return result;
}

/**
 * Returns only recurrence slots that have never been materialized. The key is
 * the original scheduled date, not the movable due date, so moving one task
 * cannot cause the old slot to be regenerated.
 */
export function missingDutyOccurrenceKeys(
  duty: OperationDuty,
  from: string,
  through: string,
  existingOccurrenceKeys: ReadonlySet<string>,
): string[] {
  return occurrenceDatesForDuty(duty, from, through).filter(
    (date) => !existingOccurrenceKeys.has(date),
  );
}

export function assignmentForDate(
  assignments: DutyAssignment[],
  dutyId: string,
  date: string,
): DutyAssignment | null {
  return assignments
    .filter((assignment) => (
      assignment.duty_id === dutyId
      && assignment.effective_from <= date
      && (!assignment.effective_through || assignment.effective_through >= date)
    ))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

export interface ReassignmentPreviewItem {
  assignment: DutyAssignment;
  duty: OperationDuty;
  role: "primary" | "backup";
}

export function previewActiveDutyReassignment(
  duties: OperationDuty[],
  assignments: DutyAssignment[],
  sourceProfileId: string,
  effectiveDate: string,
): ReassignmentPreviewItem[] {
  const dutyById = new Map(duties.map((duty) => [duty.id, duty]));
  const result: ReassignmentPreviewItem[] = [];

  for (const assignment of assignments) {
    const duty = dutyById.get(assignment.duty_id);
    if (!duty?.is_active) continue;
    if (assignment.effective_from > effectiveDate) continue;
    if (assignment.effective_through && assignment.effective_through < effectiveDate) continue;
    if (assignment.primary_profile_id === sourceProfileId) {
      result.push({ assignment, duty, role: "primary" });
    } else if (assignment.backup_profile_id === sourceProfileId) {
      result.push({ assignment, duty, role: "backup" });
    }
  }

  return result.sort(
    (a, b) => a.duty.sort_order - b.duty.sort_order || a.duty.title.localeCompare(b.duty.title),
  );
}

export function dutyScheduleLabel(duty: OperationDuty): string {
  const rule = normalizedRule(duty);
  const interval = Math.max(1, rule.interval || 1);
  if (rule.cadence === "daily") {
    return rule.weekdays?.length
      ? rule.weekdays.map((day) => day.slice(0, 1).toUpperCase() + day.slice(1)).join(", ")
      : "Every day";
  }
  if (rule.cadence === "weekly") {
    const days = (rule.weekdays ?? duty.days)
      .map((day) => day.slice(0, 1).toUpperCase() + day.slice(1))
      .join(", ");
    return `${interval > 1 ? `Every ${interval} weeks` : "Weekly"}${days ? ` · ${days}` : ""}`;
  }
  const day = rule.day_of_month === -1 ? "last day" : `day ${rule.day_of_month ?? 1}`;
  if (rule.cadence === "monthly") return `Monthly · ${day}`;
  if (rule.cadence === "quarterly") return `Quarterly · ${day}`;
  return `Annual · ${day}`;
}

/**
 * Role groups that describe a staffed position rather than a placeholder.
 * A duty owned by one of these is fully specified even with nobody named:
 * whoever is working that role does it, which is how the part-time roster
 * actually runs.
 */
const STAFFED_ROLE_GROUPS = new Set<DutyRoleGroup>([
  "recreation_aide",
  "golf_operations_assistant",
  "maintenance_staff",
  "restaurant_staff",
  "general_manager",
]);

/** Crew nouns for the "Any ___ on shift" sentence, where the sheet label reads
 *  as an area rather than a group of people. */
const SHIFT_CREW_LABELS: Partial<Record<DutyRoleGroup, string>> = {
  golf_operations_assistant: "Golf Ops / Pro Shop staff",
};

export interface DutyOwnershipDisplay {
  label: string;
  /** True only when nobody AND no role owns the duty — a real gap to fix. */
  needsAttention: boolean;
}

/**
 * How to describe who owns a duty.
 *
 * Every duty used to read "Primary: Unassigned", including the ~155 that are
 * deliberately owned by a role. That made a correct, complete setup look like
 * 155 outstanding problems. Role ownership is now stated as what it is, and
 * "not assigned" is reserved for duties that genuinely have no owner at all.
 */
export function dutyOwnershipDisplay(
  rawRoleGroup: DutyRoleGroup | null | undefined,
  primaryName?: string | null,
  contractorName?: string | null,
): DutyOwnershipDisplay {
  if (primaryName) return { label: primaryName, needsAttention: false };
  if (contractorName) return { label: contractorName, needsAttention: false };
  const roleGroup = normalizeDutyRoleGroup(rawRoleGroup);
  if (roleGroup && STAFFED_ROLE_GROUPS.has(roleGroup)) {
    // Most labels are already a plural crew noun ("Recreation Aides"); the
    // merged golf ops label names two areas, so it needs its own wording.
    const crew = SHIFT_CREW_LABELS[roleGroup] ?? DUTY_ROLE_GROUP_LABELS[roleGroup];
    return { label: `Any ${crew} on shift`, needsAttention: false };
  }
  if (roleGroup === "contractor") {
    return { label: "Contractor — none chosen yet", needsAttention: true };
  }
  return { label: "Not assigned to anyone or any role", needsAttention: true };
}

/** Split the roster into the people in a duty's role and everyone else, so the
 *  GM can name a specific person within the responsible role at a glance. */
export function splitRosterByRole<T extends { role_group?: string | null }>(
  people: T[],
  rawRoleGroup: DutyRoleGroup | null | undefined,
): { inRole: T[]; others: T[] } {
  const roleGroup = normalizeDutyRoleGroup(rawRoleGroup);
  if (!roleGroup) return { inRole: [], others: people };
  const matches = (person: T) => (
    normalizeDutyRoleGroup(person.role_group as DutyRoleGroup | null) === roleGroup
  );
  return { inRole: people.filter(matches), others: people.filter((p) => !matches(p)) };
}
