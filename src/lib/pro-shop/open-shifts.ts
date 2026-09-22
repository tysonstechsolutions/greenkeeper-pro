/**
 * The shifts a day still needs somebody in — one answer for the grid, the day
 * editor and the printout, so they can never disagree.
 *
 * An area with coverage rules asks the rules (with the standard week's
 * operating hours folded in). An area without rules — the maintenance crew —
 * has no "day requires" to ask, so its open shifts are the standard-week slots
 * nobody is on today.
 *
 * Kept apart from week-template.ts because it needs coverage.ts, which already
 * reaches week-template through day-overrides; importing it there would loop.
 */
import { openSlotsForDay, type OpenSlot } from "./coverage";
import { effectiveRulesForDay, type DayOverrides } from "./day-overrides";
import { missingSlots } from "./week-template";
import type { CoverageRule, ShiftGroup, WeekTemplate } from "./types";

export function openShiftsForDay(
  date: string,
  shiftsForDay: { staff_id: string; group: ShiftGroup; start_time: string; end_time: string; slot_id?: string | null }[],
  rules: CoverageRule[],
  overrides: DayOverrides,
  templates: WeekTemplate[] = [],
): OpenSlot[] {
  const dayRules = effectiveRulesForDay(date, rules, overrides, templates);
  if (dayRules.length > 0) {
    return openSlotsForDay(
      shiftsForDay.map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time })),
      dayRules,
    );
  }
  if (rules.length > 0) return []; // rules exist, just none for this weekday
  return missingSlots(date, templates, shiftsForDay, overrides).map((slot) => ({
    group: slot.group,
    start: slot.start,
    end: slot.end,
    kind: "gap" as const,
    slot_id: slot.id,
  }));
}
