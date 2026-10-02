/**
 * The interview the GM answers for each employee. Ratings come from the
 * rating elements in form.ts (one tap each, with an optional example); these
 * are the short written questions that follow. A few words per answer is
 * enough — the draft turns them into full sentences.
 */
import { AWARD_KEYS, elementsFor } from "./form";
import {
  isRatingValue,
  type EvaluationAnswers,
  type EvaluationAwards,
  type EvaluationRatings,
} from "./types";

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
    hint: "Wins, projects, special accomplishments. A few words is fine.",
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
    prompt: "What could they learn or get trained on?",
    hint: "One per line, up to 3 (goes on the IDP). Not Navy-required training.",
    required: false,
  },
  {
    id: "conferences",
    prompt: "Any classes, conferences, or courses to request?",
    hint: "One per line, up to 3. Include the date and cost if you know them.",
    required: false,
  },
  {
    id: "extra",
    prompt: "Anything else to put in the remarks?",
    hint: "Conduct, schedule, anything.",
    required: false,
  },
];

/** Answer key for a rating element's optional example note. */
export function elementNoteId(elementKey: string): string {
  return `element:${elementKey}`;
}

/** Elements that still need a rating (only the ones that apply to them). */
export function missingRatings(ratings: EvaluationRatings, supervisory: boolean): string[] {
  return elementsFor(supervisory)
    .filter((e) => !isRatingValue(ratings[e.key]))
    .map((e) => e.key);
}

/** Required written questions that are still blank. */
export function missingAnswers(answers: EvaluationAnswers): string[] {
  return WRITTEN_QUESTIONS.filter((q) => q.required && !(answers[q.id] ?? "").trim()).map(
    (q) => q.id,
  );
}

/** Award lines marked Yes but missing an amount. */
export function missingAwardAmounts(awards: EvaluationAwards): string[] {
  return AWARD_KEYS.filter((k) => awards[k]?.granted && !awards[k]?.amount.trim());
}

/** True once every element is rated and every required question answered. */
export function interviewComplete(
  ratings: EvaluationRatings,
  answers: EvaluationAnswers,
  supervisory: boolean,
): boolean {
  return missingRatings(ratings, supervisory).length === 0 && missingAnswers(answers).length === 0;
}

/** Ratings for elements that apply (drops f–h when not supervisory). */
export function applicableRatings(ratings: EvaluationRatings, supervisory: boolean): EvaluationRatings {
  const out: EvaluationRatings = {};
  for (const e of elementsFor(supervisory)) {
    const r = ratings[e.key];
    if (isRatingValue(r)) out[e.key] = r;
  }
  return out;
}

/** Split a "one per line" answer into at most `max` items (extras fold into the last). */
export function splitLines(text: string | null | undefined, max: number): string[] {
  const items = (text ?? "")
    .split(/\r?\n|;/)
    // Drop list markers ("- ", "1. ", "2) ") but not a leading number like "40-hour".
    .map((s) => s.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  if (items.length <= max) return items;
  return [...items.slice(0, max - 1), items.slice(max - 1).join("; ")];
}
