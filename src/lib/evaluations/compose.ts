/**
 * The built-in writer: turns the GM's ratings and short notes into item 9
 * (Supervisor's Remarks) and the IDP without any AI, so the paperwork can
 * always be finished (offline, or if the AI is unavailable). The AI draft,
 * when it works, reads better — but this never invents anything either way.
 */
import { IDP_LINES, NARRATIVE_SECTIONS, RATING_LABELS, elementsFor } from "./form";
import {
  applicableRatings,
  elementNoteId,
  interviewComplete,
  missingAwardAmounts,
  splitLines,
} from "./questions";
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
 * Suggested overall rating (item 7): the average of the applicable element
 * ratings, rounded (x.5 rounds up). Per the form, an Unsatisfactory in any
 * element makes the overall Unsatisfactory. The GM can pick a different
 * overall otherwise.
 */
export function suggestOverall(ratings: EvaluationRatings, supervisory: boolean): RatingValue | null {
  const values = Object.values(applicableRatings(ratings, supervisory));
  if (values.length === 0) return null;
  if (values.includes(1)) return 1;
  const mean = values.reduce<number>((a, b) => a + b, 0) / values.length;
  return Math.min(5, Math.max(1, Math.floor(mean + 0.5))) as RatingValue;
}

/** The form's rule, as a message — or null when the overall is allowed. */
export function overallRuleProblem(
  ratings: EvaluationRatings,
  overall: RatingValue | null,
  supervisory: boolean,
): string | null {
  const hasUnsat = Object.values(applicableRatings(ratings, supervisory)).includes(1);
  if (hasUnsat && overall !== null && overall !== 1) {
    return "An element is rated Unsatisfactory, so the overall rating must be Unsatisfactory.";
  }
  return null;
}

/** True when any applicable element (or the overall) is Unsatisfactory. */
export function hasUnsatisfactory(
  ratings: EvaluationRatings,
  overall: RatingValue | null,
  supervisory: boolean,
): boolean {
  return overall === 1 || Object.values(applicableRatings(ratings, supervisory)).includes(1);
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

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim() || "The employee";
}

export interface ComposeInput {
  employeeName: string;
  periodLabel: string;
  ratings: EvaluationRatings;
  supervisory: boolean;
  overall: RatingValue | null;
  answers: EvaluationAnswers;
}

export function composeNarrative(input: ComposeInput): EvaluationNarrative {
  const name = firstName(input.employeeName);
  const a = (id: string) => (input.answers[id] ?? "").trim();

  const strong: string[] = [];
  const weak: string[] = [];
  const strongNotes: string[] = [];
  const weakNotes: string[] = [];
  const otherNotes: string[] = [];

  for (const el of elementsFor(input.supervisory)) {
    const rating = input.ratings[el.key];
    const note = a(elementNoteId(el.key));
    if (!isRatingValue(rating)) continue;
    const label = el.label.toLowerCase();
    if (rating >= 4) {
      strong.push(label);
      if (note) strongNotes.push(note);
    } else if (rating <= 2) {
      weak.push(label);
      if (note) weakNotes.push(note);
    } else if (note) {
      otherNotes.push(note);
    }
  }

  const summary = joinSentences([
    input.overall
      ? `${name}'s overall performance for ${input.periodLabel} is rated ${RATING_LABELS[input.overall]}`
      : null,
    strong.length ? `${name} was strongest in ${listPhrase(strong)}` : null,
    weak.length ? `Improvement is needed in ${listPhrase(weak)}` : null,
    ...otherNotes,
    a("extra"),
  ]);

  const strengths =
    joinSentences([a("highlights"), ...strongNotes]) ||
    asSentence(`${name} met the expectations of the position this period`);

  const improvement = joinSentences([a("improve"), ...weakNotes]);

  const goals =
    asSentence(a("goals")) ||
    asSentence("Maintain current performance and continue to build job knowledge and skills");

  return {
    summary,
    strengths,
    improvement,
    goals,
    idp: {
      learning: splitLines(a("training"), IDP_LINES),
      conferences: splitLines(a("conferences"), IDP_LINES),
      remarks: asSentence(a("goals")),
    },
    source: "template",
  };
}

/** Item 9 as printed: the paragraphs with their lead-ins, blank line between. */
export function remarksText(narrative: EvaluationNarrative | null | undefined): string {
  if (!narrative) return "";
  return NARRATIVE_SECTIONS.map((s) => {
    const text = (narrative[s.key] ?? "").trim();
    return text ? `${s.lead}${text}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/** True when every required written section has text. */
export function narrativeComplete(narrative: EvaluationNarrative | null | undefined): boolean {
  if (!narrative) return false;
  return NARRATIVE_SECTIONS.every((s) => !s.required || (narrative[s.key] ?? "").trim().length > 0);
}

/** Where an employee is in the evaluation for a period. */
export function evaluationProgress(evaluation: StaffEvaluation | null | undefined): EvaluationProgress {
  if (!evaluation) return "not_started";
  if (evaluation.status === "final") return "final";
  const supervisory = !!evaluation.supervisory;
  const ratings = evaluation.ratings ?? {};
  const overall = isRatingValue(evaluation.overall_rating) ? evaluation.overall_rating : null;
  if (
    interviewComplete(ratings, evaluation.answers ?? {}, supervisory) &&
    overall !== null &&
    !overallRuleProblem(ratings, overall, supervisory) &&
    missingAwardAmounts(evaluation.awards ?? {}).length === 0 &&
    narrativeComplete(evaluation.narrative)
  ) {
    return "ready";
  }
  return "in_progress";
}
