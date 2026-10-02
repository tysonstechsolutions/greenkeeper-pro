/**
 * Yearly performance evaluations.
 *
 * The GM answers a short interview per employee — one tap rating per
 * performance element plus a few short notes — and the app fills out the
 * paperwork. Everything about the paper form itself (its elements, rating
 * labels, and written sections) lives in `form.ts`, so swapping in the
 * official sheet only means changing that one file.
 */

/** A rating on the 1–5 scale (5 = best). */
export type RatingValue = 1 | 2 | 3 | 4 | 5;

export const RATING_VALUES: RatingValue[] = [5, 4, 3, 2, 1];

export function isRatingValue(value: unknown): value is RatingValue {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** The interview answers, keyed by question id (see questions.ts). */
export type EvaluationAnswers = Record<string, string>;

/** Element ratings, keyed by element key (see form.ts). */
export type EvaluationRatings = Record<string, RatingValue>;

/** The written sections of the evaluation, ready to print. */
export interface EvaluationNarrative {
  /** Overall performance summary. */
  summary?: string;
  /** Strengths and accomplishments this period. */
  strengths?: string;
  /** Areas for improvement. */
  improvement?: string;
  /** Goals and development plan for the next period. */
  goals?: string;
  /** One short comment per rated element, keyed by element key. */
  elements?: Record<string, string>;
  /** Where the draft came from — the AI, or the built-in writer. */
  source?: "ai" | "template";
}

/** Facts the app already knows about the employee for the rating period. */
export interface EvaluationFacts {
  hire_date: string | null;
  position_title: string | null;
  pay_plan_grade: string | null;
  call_outs: { count: number; hours: number };
  sick_time: { count: number; hours: number };
  /** Disciplinary record titles in the period (shown to the GM; the draft
   *  only mentions conduct if the GM's own notes bring it up). */
  disciplinary: { date: string; title: string }[];
  one_on_ones: { count: number; summaries: { date: string; summary: string }[] };
  follow_ups: { opened: number; reconciled: number; open_titles: string[] };
  certifications: { name: string; expiry_date: string | null }[];
}

export type EvaluationStatus = "draft" | "final";

export interface StaffEvaluation {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  period_label: string;
  status: EvaluationStatus;
  ratings: EvaluationRatings;
  overall_rating: RatingValue | null;
  answers: EvaluationAnswers;
  narrative: EvaluationNarrative;
  facts: EvaluationFacts | Record<string, never>;
  form_version: string;
  finalized_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A rating period, e.g. FY2026 = 2025-10-01 → 2026-09-30. */
export interface EvaluationPeriod {
  start: string;
  end: string;
  label: string;
}

/** Where an employee is in this period's evaluation. */
export type EvaluationProgress = "not_started" | "in_progress" | "ready" | "final";

export const PROGRESS_LABELS: Record<EvaluationProgress, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  ready: "Ready to finalize",
  final: "Final",
};

export const PROGRESS_COLORS: Record<EvaluationProgress, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  ready: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  final: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};
