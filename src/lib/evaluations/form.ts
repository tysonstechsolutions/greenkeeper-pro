/**
 * The evaluation FORM — the one place that describes the paper.
 *
 * This is a generic NAF-style annual appraisal layout: a handful of
 * performance elements each rated on a 5-level scale, an overall summary
 * rating, and four written sections. When the official sheet is uploaded,
 * change the elements, rating labels, and section titles here (and bump
 * FORM_VERSION); the interview, drafting, saving, and printing all read from
 * this file.
 */
import type { RatingValue } from "./types";

/** Stored on every evaluation so older rows are never misread. */
export const FORM_VERSION = "generic-v1";

export const FORM_TITLE = "Annual Performance Evaluation";

export interface PerformanceElement {
  key: string;
  label: string;
  /** What "good" looks like — shown under the rating buttons and on the form. */
  description: string;
}

export const PERFORMANCE_ELEMENTS: PerformanceElement[] = [
  {
    key: "quality",
    label: "Quality of Work",
    description: "Work is accurate, thorough, and meets the course's standards.",
  },
  {
    key: "productivity",
    label: "Productivity",
    description: "Gets the assigned work done on time; uses the day well.",
  },
  {
    key: "job_knowledge",
    label: "Job Knowledge & Skills",
    description: "Knows the job, the equipment, and the procedures; keeps learning.",
  },
  {
    key: "dependability",
    label: "Dependability & Attendance",
    description: "Shows up on time, follows through, and can be counted on.",
  },
  {
    key: "safety",
    label: "Safety & Care of Equipment",
    description: "Works safely, wears PPE, and takes care of tools and equipment.",
  },
  {
    key: "teamwork",
    label: "Teamwork & Customer Service",
    description: "Works well with the crew and treats golfers and guests well.",
  },
  {
    key: "communication",
    label: "Communication",
    description: "Keeps the supervisor informed; listens and speaks up when needed.",
  },
  {
    key: "initiative",
    label: "Initiative & Adaptability",
    description: "Sees what needs doing, handles change, and solves problems.",
  },
];

export const RATING_LABELS: Record<RatingValue, string> = {
  5: "Outstanding",
  4: "Exceeds Expectations",
  3: "Fully Successful",
  2: "Needs Improvement",
  1: "Unacceptable",
};

/** Short labels for the tap buttons on a phone. */
export const RATING_SHORT_LABELS: Record<RatingValue, string> = {
  5: "Outstanding",
  4: "Exceeds",
  3: "Fully Successful",
  2: "Needs Work",
  1: "Unacceptable",
};

export const RATING_BUTTON_COLORS: Record<RatingValue, string> = {
  5: "border-emerald-600 bg-emerald-600 text-white",
  4: "border-green-500 bg-green-500 text-white",
  3: "border-sky-600 bg-sky-600 text-white",
  2: "border-amber-500 bg-amber-500 text-white",
  1: "border-red-600 bg-red-600 text-white",
};

export type NarrativeSectionKey = "summary" | "strengths" | "improvement" | "goals";

export interface NarrativeSection {
  key: NarrativeSectionKey;
  title: string;
}

/** The written sections, in the order they print. */
export const NARRATIVE_SECTIONS: NarrativeSection[] = [
  { key: "summary", title: "Overall Performance Summary" },
  { key: "strengths", title: "Strengths & Accomplishments" },
  { key: "improvement", title: "Areas for Improvement" },
  { key: "goals", title: "Goals & Development Plan for Next Period" },
];

/** Signature blocks printed at the bottom of the form. */
export const SIGNATURE_LINES = ["Employee", "Rating Supervisor", "Reviewing Official"];

/** Printed above the employee signature line. */
export const EMPLOYEE_ACKNOWLEDGEMENT =
  "My signature means I have received and discussed this evaluation. It does not mean I agree with it.";
