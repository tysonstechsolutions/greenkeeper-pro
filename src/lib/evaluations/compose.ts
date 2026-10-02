/**
 * The built-in writer: turns the GM's ratings and short notes into the
 * written sections without any AI, so the paperwork can always be finished
 * (offline, or if the AI is unavailable). The AI draft, when it works, reads
 * better — but this never invents anything either way.
 */
import { NARRATIVE_SECTIONS, PERFORMANCE_ELEMENTS, RATING_LABELS } from "./form";
import { elementNoteId, interviewComplete } from "./questions";
import {
  isRatingValue,
  type EvaluationAnswers,
  type EvaluationNarrative,
  type EvaluationProgress,
  type EvaluationRatings,
  type RatingValue,
  type StaffEvaluation,
} from "./types";

/**
 * Suggested overall rating: the average of the element ratings, rounded
 * (x.5 rounds up). Any Unacceptable element caps the overall at Needs
 * Improvement, so one serious problem can't be averaged away. The GM can
 * always pick a different overall rating.
 */
export function suggestOverall(ratings: EvaluationRatings): RatingValue | null {
  const values = PERFORMANCE_ELEMENTS.map((e) => ratings[e.key]).filter(isRatingValue);
  if (values.length === 0) return null;
  const mean = values.reduce<number>((a, b) => a + b, 0) / values.length;
  let overall = Math.min(5, Math.max(1, Math.floor(mean + 0.5)));
  if (values.includes(1)) overall = Math.min(overall, 2);
  return overall as RatingValue;
}

/** Trim, capitalize, and end with punctuation. "" stays "". */
export function asSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]["')\]]?$/.test(capped) ? capped : `${capped}.`;
}

function joinSentences(parts: (string | null | undefined)[]): string {
  return parts.map(asSentence).filter(Boolean).join(" ");
}

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Standard comment for an element when the GM didn't give an example. */
const ELEMENT_DEFAULTS: Record<RatingValue, (label: string) => string> = {
  5: (l) => `Consistently far exceeds the standard for ${l}`,
  4: (l) => `Regularly goes beyond what is expected for ${l}`,
  3: (l) => `Meets the standard for ${l}`,
  2: (l) => `Does not consistently meet the standard for ${l}; improvement is needed`,
  1: (l) => `Falls well short of the standard for ${l}; immediate improvement is required`,
};

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim() || "The employee";
}

export function composeNarrative(input: {
  employeeName: string;
  periodLabel: string;
  ratings: EvaluationRatings;
  overall: RatingValue | null;
  answers: EvaluationAnswers;
}): EvaluationNarrative {
  const name = firstName(input.employeeName);
  const a = (id: string) => (input.answers[id] ?? "").trim();

  const elements: Record<string, string> = {};
  const strong: string[] = [];
  const weak: string[] = [];
  const strongNotes: string[] = [];
  const weakNotes: string[] = [];

  for (const el of PERFORMANCE_ELEMENTS) {
    const rating = input.ratings[el.key];
    const note = a(elementNoteId(el.key));
    if (!isRatingValue(rating)) continue;
    elements[el.key] = note
      ? asSentence(note)
      : asSentence(ELEMENT_DEFAULTS[rating](el.label.toLowerCase()));
    if (rating >= 4) {
      strong.push(el.label.toLowerCase());
      if (note) strongNotes.push(note);
    }
    if (rating <= 2) {
      weak.push(el.label.toLowerCase());
      if (note) weakNotes.push(note);
    }
  }

  const summary = joinSentences([
    input.overall
      ? `${name}'s overall performance for ${input.periodLabel} is rated ${RATING_LABELS[input.overall]}`
      : null,
    strong.length ? `Strongest areas this period were ${listPhrase(strong)}` : null,
    weak.length ? `Improvement is needed in ${listPhrase(weak)}` : null,
    a("extra"),
  ]);

  const strengths =
    joinSentences([a("highlights"), ...strongNotes]) ||
    asSentence(`${name} met the expectations of the position this period`);

  const improvement =
    joinSentences([a("improve"), ...weakNotes]) ||
    asSentence("No significant areas for improvement were identified this period; continue current performance");

  const training = a("training");
  const goals =
    joinSentences([a("goals"), training ? `Training and certifications: ${training}` : null]) ||
    asSentence("Maintain current performance and continue to build job knowledge and skills");

  return { summary, strengths, improvement, goals, elements, source: "template" };
}

/** True when every written section has text. */
export function narrativeComplete(narrative: EvaluationNarrative | null | undefined): boolean {
  if (!narrative) return false;
  return NARRATIVE_SECTIONS.every((s) => (narrative[s.key] ?? "").trim().length > 0);
}

/** Where an employee is in the evaluation for a period. */
export function evaluationProgress(evaluation: StaffEvaluation | null | undefined): EvaluationProgress {
  if (!evaluation) return "not_started";
  if (evaluation.status === "final") return "final";
  if (
    interviewComplete(evaluation.ratings ?? {}, evaluation.answers ?? {}) &&
    isRatingValue(evaluation.overall_rating) &&
    narrativeComplete(evaluation.narrative)
  ) {
    return "ready";
  }
  return "in_progress";
}
