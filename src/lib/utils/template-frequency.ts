/**
 * Heuristic classifier for task-template "frequency" — how often the work
 * recurs. Replaces priority as the primary categorization on the schedule
 * backlog because supers think in cadence, not urgency: "what's a daily
 * vs weekly vs seasonal job?"
 *
 * The classifier is name-pattern based for now (no DB column). When the
 * user creates new templates and the name doesn't match, defaults to
 * "weekly" — they can add an explicit prefix to relabel.
 *
 * To add an explicit override later, add a `frequency` column to
 * task_templates and update this function to read it first.
 */
import type { TaskTemplate } from "@/types/database";

export type TemplateFrequency = "daily" | "weekly" | "monthly" | "seasonal" | "projects";

const SEASONAL_PATTERNS = [
  /\bspring\b/i,
  /\bsummer\b/i,
  /\bfall\b/i,
  /\bwinter(?:ization)?\b/i,
  /\bannual\b/i,
  /\baerification\b/i,
  /\bsnow\s*mold\b/i,
  /\bovers?eed\b/i,
  /\bend[\s-]of[\s-]season\b/i,
  /\bstart[\s-]of[\s-]season\b/i,
];

const MONTHLY_PATTERNS = [
  /\bmonthly\b/i,
  /\bfertilit(?:y|ies)\b/i,
  /\bfertilizer\b/i,
  /\bgrowth regulator\b/i,
  /\bfungicide rotation\b/i,
  /\bwetting agent\b/i,
  /\bgrub prevention\b/i,
  /\btopdressing\b/i,
  /\bpre[\s-]?emergent\b/i,
];

const WEEKLY_PATTERNS = [
  /\bweekly\b/i,
  /\bdisease scouting\b/i,
  /\bgrounds & appearance\b/i,
  /\bgrounds and appearance\b/i,
  /\bdeep clean\b/i,
];

const DAILY_PATTERNS = [
  /\bdaily\b/i,
  /\bmorning\b/i,
  /\bcourse setup\b/i,
  /\bpre[\s-]?operation\b/i,
  /\b(?:roll|mow|rake)\b/i,
  /\bpin\b/i,
  /\bball washer\b/i,
  /\bcup\b/i,
  /\binspection\b/i,
];

/**
 * Classify a template's recurrence cadence from its name. Returns the
 * highest-specificity match, in seasonal → monthly → weekly → daily order
 * (so "Spring Aerification" beats "monthly fertility" if both somehow
 * matched).
 */
export function classifyTemplateFrequency(
  template: Pick<TaskTemplate, "name">,
): TemplateFrequency {
  const name = template.name ?? "";
  if (SEASONAL_PATTERNS.some((re) => re.test(name))) return "seasonal";
  if (MONTHLY_PATTERNS.some((re) => re.test(name))) return "monthly";
  if (WEEKLY_PATTERNS.some((re) => re.test(name))) return "weekly";
  if (DAILY_PATTERNS.some((re) => re.test(name))) return "daily";
  // Default to weekly — a sensible bucket for ad-hoc tasks that aren't
  // obvious one-shots and aren't tied to a season.
  return "weekly";
}

/**
 * Resolve a template's frequency tier. The explicit `frequency` column wins;
 * templates created before that column existed (frequency = null) fall back
 * to the name heuristic so their chips look unchanged.
 */
export function getTemplateFrequency(
  template: Pick<TaskTemplate, "name" | "frequency">,
): TemplateFrequency {
  if (template.frequency) return template.frequency;
  return classifyTemplateFrequency(template);
}

export const FREQUENCY_LABELS: Record<TemplateFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  seasonal: "Seasonal",
  projects: "Projects",
};

/**
 * Color palette for chip borders + filter pills. Tuned for at-a-glance
 * differentiation; the daily/weekly distinction is the one used most.
 */
export const FREQUENCY_COLORS: Record<
  TemplateFrequency,
  { border: string; chip: string; pill: string }
> = {
  daily: {
    border: "border-l-blue-500",
    chip: "text-blue-700 dark:text-blue-300",
    pill: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  weekly: {
    border: "border-l-emerald-500",
    chip: "text-emerald-700 dark:text-emerald-300",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  monthly: {
    border: "border-l-amber-500",
    chip: "text-amber-700 dark:text-amber-300",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  seasonal: {
    border: "border-l-purple-500",
    chip: "text-purple-700 dark:text-purple-300",
    pill: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
  },
  projects: {
    border: "border-l-rose-500",
    chip: "text-rose-700 dark:text-rose-300",
    pill: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  },
};
