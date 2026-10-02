/**
 * Draft the written sections of an evaluation. Tries the AI first; anything
 * the AI leaves out (or the whole draft, if the AI is unavailable) comes from
 * the built-in writer, so the GM always gets a complete draft.
 */
import { callApi } from "@/lib/api/client";
import { composeNarrative } from "./compose";
import { PERFORMANCE_ELEMENTS, RATING_LABELS, NARRATIVE_SECTIONS } from "./form";
import { WRITTEN_QUESTIONS, elementNoteId } from "./questions";
import {
  isRatingValue,
  type EvaluationAnswers,
  type EvaluationFacts,
  type EvaluationNarrative,
  type EvaluationRatings,
  type RatingValue,
} from "./types";

export interface DraftInput {
  employeeName: string;
  position: string | null;
  periodLabel: string;
  ratings: EvaluationRatings;
  overall: RatingValue | null;
  answers: EvaluationAnswers;
  facts: EvaluationFacts | null;
}

interface AiDraftResponse {
  summary?: string;
  strengths?: string;
  improvement?: string;
  goals?: string;
  elements?: Record<string, string>;
}

/** The request body sent to the staff-evaluation-draft edge function. */
export function buildDraftRequest(input: DraftInput) {
  return {
    employee: { name: input.employeeName, position: input.position ?? "" },
    period_label: input.periodLabel,
    overall: input.overall ? { value: input.overall, label: RATING_LABELS[input.overall] } : null,
    elements: PERFORMANCE_ELEMENTS.filter((e) => isRatingValue(input.ratings[e.key])).map((e) => {
      const rating = input.ratings[e.key];
      return {
        key: e.key,
        label: e.label,
        description: e.description,
        rating,
        rating_label: RATING_LABELS[rating],
        note: (input.answers[elementNoteId(e.key)] ?? "").trim(),
      };
    }),
    answers: WRITTEN_QUESTIONS.map((q) => ({
      prompt: q.prompt,
      answer: (input.answers[q.id] ?? "").trim(),
    })).filter((qa) => qa.answer),
    facts: input.facts ?? {},
  };
}

/** Fill any gaps in the AI's draft from the built-in writer. */
export function mergeDraft(
  ai: AiDraftResponse | null,
  fallback: EvaluationNarrative,
): EvaluationNarrative {
  if (!ai) return fallback;
  const pick = (v: unknown, fb: string | undefined) =>
    typeof v === "string" && v.trim() ? v.trim() : fb ?? "";
  const elements: Record<string, string> = {};
  for (const key of Object.keys(fallback.elements ?? {})) {
    elements[key] = pick(ai.elements?.[key], fallback.elements?.[key]);
  }
  const merged: EvaluationNarrative = { elements, source: "ai" };
  for (const s of NARRATIVE_SECTIONS) merged[s.key] = pick(ai[s.key], fallback[s.key]);
  return merged;
}

/**
 * Draft the narrative. Never throws: if the AI call fails, returns the
 * built-in draft and the reason, so the UI can say "AI unavailable" quietly.
 */
export async function draftNarrative(
  input: DraftInput,
): Promise<{ narrative: EvaluationNarrative; aiError: string | null }> {
  const fallback = composeNarrative({
    employeeName: input.employeeName,
    periodLabel: input.periodLabel,
    ratings: input.ratings,
    overall: input.overall,
    answers: input.answers,
  });
  try {
    const res = await callApi<AiDraftResponse>("staff-evaluation-draft", {
      method: "POST",
      body: buildDraftRequest(input),
    });
    return { narrative: mergeDraft(res, fallback), aiError: null };
  } catch (e) {
    return {
      narrative: fallback,
      aiError: e instanceof Error ? e.message : "AI draft unavailable",
    };
  }
}
