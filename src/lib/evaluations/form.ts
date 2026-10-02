/**
 * The evaluation FORM — CNIC 5300 "CNIC Non-Appropriated Fund Employee
 * Performance Rating Form" (Rev. 9 Sept 2025) and its Individual Development
 * Plan page. Element names, rating levels, and what each level means come
 * straight from the form and its instructions. The fillable-PDF field names
 * live in pdf.ts.
 */
import type { AwardKey, RatingReason, RatingValue } from "./types";

/** Stored on every evaluation so older rows are never misread. */
export const FORM_VERSION = "cnic-5300-rev-2025-09";

export const FORM_TITLE = "NAF Performance Rating Form (CNIC 5300)";

/** The blank official form, served from /public. */
export const FORM_TEMPLATE_URL = "/templates/naf-performance-appraisal-cnic-5300.pdf";

/** Item 4 — Name and Location of NAF Activity. */
export const NAF_ACTIVITY = "MWR N9, Naval Station Great Lakes, IL - Veterans Memorial Golf Course";

/** IDP item 3 — Organization (a one-line box, so keep it short). */
export const IDP_ORGANIZATION = "Veterans Memorial Golf Course";

export interface PerformanceElement {
  key: string;
  /** Letter on the form, e.g. "a". */
  letter: string;
  label: string;
  /** "Consider…" guidance from the form's instructions. */
  description: string;
  /** f–h are rated for supervisors only. */
  supervisoryOnly: boolean;
  /** What each level looks like, from the instructions page (a–f only). */
  levels?: Record<RatingValue, string>;
}

export const PERFORMANCE_ELEMENTS: PerformanceElement[] = [
  {
    key: "quality",
    letter: "a",
    label: "Quality of Work",
    description: "Thoroughness, accuracy, and effectiveness; completes goals; follows policy.",
    supervisoryOnly: false,
    levels: {
      5: "Ahead of plan with little supervision. Exceptionally thorough and accurate. Identifies improvements.",
      4: "On plan with little supervision. Thorough and accurate. Identifies improvements.",
      3: "On or nearly on plan with moderate supervision. Generally accurate. Follows policy.",
      2: "Meets standards after feedback and corrections. Requires supervision.",
      1: "Often late and below standard even after feedback. Does not follow policy.",
    },
  },
  {
    key: "productivity",
    letter: "b",
    label: "Productivity",
    description: "Completes assignments; volume of work; meets or beats deadlines.",
    supervisoryOnly: false,
    levels: {
      5: "Handles an extraordinary volume of work. Highly efficient.",
      4: "Above-average volume of work. Efficient.",
      3: "Work volume meets all standards and may exceed some.",
      2: "Volume meets minimal standards. Improvement desired.",
      1: "Work volume does not meet minimal standards.",
    },
  },
  {
    key: "dependability",
    letter: "c",
    label: "Dependability",
    description: "Reliability, timeliness, competency, and conscientiousness.",
    supervisoryOnly: false,
    levels: {
      5: "Handles difficult assignments well without direct supervision. Solution oriented.",
      4: "Exceeds expectations in critical areas. Works with minimal supervision.",
      3: "Good, sound performance that meets goals. Responsive to supervision.",
      2: "Meets goals with written direction and supervision. Needs help prioritizing.",
      1: "Regularly late or inaccurate. Needs constant supervision and counseling.",
    },
  },
  {
    key: "working_relationships",
    letter: "d",
    label: "Working Relationships",
    description: "With peers and supervisor: teamwork, attitude, flexibility, cooperation.",
    supervisoryOnly: false,
    levels: {
      5: "Recognized problem solver and a major positive influence. Highly respected.",
      4: "Constructive problem-solver who builds trust and often takes the lead.",
      3: "Polite and respectful; works well with others and takes assignments when asked.",
      2: "Goes along to get along; attitude can get in the way. May lack motivation.",
      1: "Blames others, withholds help, spreads rumors. Not a team player.",
    },
  },
  {
    key: "customer_relations",
    letter: "e",
    label: "Customer / Patron Relations",
    description: "Responsive, attentive, and courteous; knows the products, services, and policies.",
    supervisoryOnly: false,
    levels: {
      5: "Works through complicated or controversial issues with customers.",
      4: "Actions and attitude greatly enhance their area on a regular basis.",
      3: "Actions and attitude contribute to positive feedback.",
      2: "Sometimes contributes to positive feedback; room for improvement.",
      1: "Actions and attitude harm relationships and generate complaints.",
    },
  },
  {
    key: "leadership",
    letter: "f",
    label: "Leadership",
    description: "Sets and meets team goals, leads subordinates, manages their area.",
    supervisoryOnly: true,
    levels: {
      5: "Sets and completes team goals; heads off problems before they occur. Revered as a leader.",
      4: "Completes team goals; pro-active with problems. Seen as an effective leader.",
      3: "Completes team goals with coaching; handles problems as they occur.",
      2: "Completes assignments with direct supervision; passes problems to others.",
      1: "Avoids assignments; ignores problems and lets them grow.",
    },
  },
  {
    key: "management_coaching",
    letter: "g",
    label: "Management/Coaching Effectiveness/EEO Commitment",
    description:
      "Gets work done through subordinates; fairness, motivation, team building, development; EEO and Merit System compliance.",
    supervisoryOnly: true,
  },
  {
    key: "internal_controls",
    letter: "h",
    label: "Management Internal Controls",
    description: "Safeguards assets, promotes efficiency and compliance, and addresses risk.",
    supervisoryOnly: true,
  },
];

/** Roles that usually supervise someone — the default for rating f–h. */
export const SUPERVISORY_ROLES = ["super", "asst_super", "director", "foreman", "gm", "pro"];

/** The elements rated for this employee (a–e, plus f–h for supervisors). */
export function elementsFor(supervisory: boolean): PerformanceElement[] {
  return PERFORMANCE_ELEMENTS.filter((e) => supervisory || !e.supervisoryOnly);
}

export const RATING_LABELS: Record<RatingValue, string> = {
  5: "Outstanding",
  4: "Highly Satisfactory",
  3: "Satisfactory",
  2: "Minimally Satisfactory",
  1: "Unsatisfactory",
};

/** Short labels for the tap buttons on a phone. */
export const RATING_SHORT_LABELS: Record<RatingValue, string> = {
  5: "Outstanding",
  4: "Highly Sat.",
  3: "Satisfactory",
  2: "Min. Sat.",
  1: "Unsat.",
};

export const RATING_BUTTON_COLORS: Record<RatingValue, string> = {
  5: "border-emerald-600 bg-emerald-600 text-white",
  4: "border-green-500 bg-green-500 text-white",
  3: "border-sky-600 bg-sky-600 text-white",
  2: "border-amber-500 bg-amber-500 text-white",
  1: "border-red-600 bg-red-600 text-white",
};

/** From the form's instructions — shown whenever anything is Unsatisfactory. */
export const UNSATISFACTORY_NOTE =
  "Per the form: an Unsatisfactory rating must be delayed and a Letter of Caution must be issued. Any Unsatisfactory element makes the overall rating Unsatisfactory.";

export const RATING_REASON_LABELS: Record<RatingReason, string> = {
  ninety_day: "90 Day",
  interim: "Interim",
  annual: "Annual",
  separation: "Separation/Close Out",
};

export const AWARD_KEYS: AwardKey[] = ["pay_increase", "performance_award", "time_off_award"];

export const AWARD_LABELS: Record<AwardKey, string> = {
  pay_increase: "Pay increase",
  performance_award: "Performance award",
  time_off_award: "Time off award",
};

export const AWARD_AMOUNT_HINTS: Record<AwardKey, string> = {
  pay_increase: "e.g. 3% or $0.50/hr",
  performance_award: "e.g. 500",
  time_off_award: "e.g. 8 hrs",
};

export type NarrativeSectionKey = "summary" | "strengths" | "improvement" | "goals";

export interface NarrativeSection {
  key: NarrativeSectionKey;
  title: string;
  /** Lead-in printed before the paragraph in item 9 ("" = none). */
  lead: string;
  required: boolean;
}

/**
 * Item 9, Supervisor's Remarks: "a brief narrative that supports the ratings,
 * note special accomplishments and provide goals for the next rating
 * period." These are the paragraphs, in print order.
 */
export const NARRATIVE_SECTIONS: NarrativeSection[] = [
  { key: "summary", title: "Summary that supports the ratings", lead: "", required: true },
  { key: "strengths", title: "Special accomplishments", lead: "Accomplishments: ", required: true },
  { key: "improvement", title: "Areas to develop", lead: "Areas to develop: ", required: false },
  { key: "goals", title: "Goals for the next rating period", lead: "Goals for next period: ", required: true },
];

/** IDP item 6 — Naval Station Great Lakes MWR goals (pre-printed on the form). */
export const IDP_MISSION_GOALS = [
  "Take Care of Our People",
  "Support Fleet Mission Through Innovative Programming",
  "Streamline Processes and Procedures",
  "Measure What Matters",
  "Share the QOL Story Effectively",
];

/** Lines available on the IDP for learning opportunities and conferences. */
export const IDP_LINES = 3;

/** Next steps from the form's instructions, shown after finalizing. */
export const SIGNING_STEPS = [
  "Go over the rating and any pay/award with your Approving Official before you sign (item 10).",
  "Approving Official reviews, may change, and signs (item 11).",
  "Then discuss it with the employee; they sign item 12a. Pay/awards start the first full pay period after approval.",
  "Give the employee a copy within two weeks and date item 12b.",
];
