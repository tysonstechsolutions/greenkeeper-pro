/**
 * The interview the GM answers for each employee. Ratings come from the
 * performance elements in form.ts (one tap each, with an optional example);
 * these are the short written questions that follow. A few words per answer
 * is enough — the draft turns them into full sentences.
 */
import { PERFORMANCE_ELEMENTS } from "./form";
import { isRatingValue, type EvaluationAnswers, type EvaluationRatings } from "./types";

export interface EvaluationQuestion {
  id: string;
  prompt: string;
  hint: string;
  /** The interview can't move to the draft without an answer. */
  required: boolean;
}

export const WRITTEN_QUESTIONS: EvaluationQuestion[] = [
  {
    id: "highlights",
    prompt: "What did they do well this year?",
    hint: "Wins, projects, things you'd brag about. A few words is fine.",
    required: true,
  },
  {
    id: "improve",
    prompt: "What should they work on?",
    hint: "Leave blank if nothing comes to mind.",
    required: false,
  },
  {
    id: "goals",
    prompt: "What are their goals for next year?",
    hint: "Something they want to learn, take on, or get better at.",
    required: false,
  },
  {
    id: "training",
    prompt: "Any training or certifications they need?",
    hint: "e.g. pesticide license, mower training, CPR.",
    required: false,
  },
  {
    id: "extra",
    prompt: "Anything else to put on the form?",
    hint: "Award recommendation, conduct, schedule, anything.",
    required: false,
  },
];

/** Answer key for a performance element's optional example note. */
export function elementNoteId(elementKey: string): string {
  return `element:${elementKey}`;
}

/** Elements that still need a rating. */
export function missingRatings(ratings: EvaluationRatings): string[] {
  return PERFORMANCE_ELEMENTS.filter((e) => !isRatingValue(ratings[e.key])).map((e) => e.key);
}

/** Required written questions that are still blank. */
export function missingAnswers(answers: EvaluationAnswers): string[] {
  return WRITTEN_QUESTIONS.filter((q) => q.required && !(answers[q.id] ?? "").trim()).map(
    (q) => q.id,
  );
}

/** True once every element is rated and every required question answered. */
export function interviewComplete(ratings: EvaluationRatings, answers: EvaluationAnswers): boolean {
  return missingRatings(ratings).length === 0 && missingAnswers(answers).length === 0;
}
