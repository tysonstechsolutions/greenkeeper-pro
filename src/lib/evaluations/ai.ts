/**
 * Draft item 9 (Supervisor's Remarks) and the IDP. Tries the AI first;
 * anything the AI leaves out (or the whole draft, if the AI is unavailable)
 * comes from the built-in writer, so the GM always gets a complete draft.
 */
import { callApi } from "@/lib/api/client";
import { composeNarrative } from "./compose";
import { IDP_LINES, NARRATIVE_SECTIONS, RATING_LABELS, elementsFor } from "./form";
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
  supervisory: boolean;
  overall: RatingValue | null;
  answers: EvaluationAnswers;
  facts: EvaluationFacts | null;
}

interface AiDraftResponse {
  summary?: string;
  strengths?: string;
  improvement?: string;
  goals?: string;
  idp?: { learning?: unknown; conferences?: unknown; remarks?: unknown };
}

/** The request body sent to the staff-evaluation-draft edge function. */
export function buildDraftRequest(input: DraftInput) {
  return {
    employee: { name: input.employeeName, position: input.position ?? "" },
    period_label: input.periodLabel,
    supervisory: input.supervisory,
    overall: input.overall ? { value: input.overall, label: RATING_LABELS[input.overall] } : null,
    elements: elementsFor(input.supervisory)
      .filter((e) => isRatingValue(input.ratings[e.key]))
      .map((e) => {
        const rating = input.ratings[e.key];
        return {
          key: e.key,
          label: `${e.letter}. ${e.label}`,
          description: e.description,
          rating,
          rating_label: RATING_LABELS[rating],
          level_description: e.levels?.[rating] ?? "",
          note: (input.answers[elementNoteId(e.key)] ?? "").trim(),
        };
      }),
    answers: WRITTEN_QUESTIONS.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      answer: (input.answers[q.id] ?? "").trim(),
    })).filter((qa) => qa.answer),
    facts: input.facts ?? {},
  };
}

function cleanList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
}

/** Fill any gaps in the AI's draft from the built-in writer. */
export function mergeDraft(ai: AiDraftResponse | null, fallback: EvaluationNarrative): EvaluationNarrative {
  if (!ai) return fallback;
  const pick = (v: unknown, fb: string | undefined) =>
    typeof v === "string" && v.trim() ? v.trim() : fb ?? "";
  const merged: EvaluationNarrative = { source: "ai" };
  for (const s of NARRATIVE_SECTIONS) {
    // An optional section the AI deliberately left empty stays empty.
    merged[s.key] =
      !s.required && typeof ai[s.key] === "string" ? (ai[s.key] as string).trim() : pick(ai[s.key], fallback[s.key]);
  }
  const fb = fallback.idp ?? { learning: [], conferences: [], remarks: "" };
  merged.idp = {
    learning: cleanList(ai.idp?.learning, IDP_LINES) ?? fb.learning,
    conferences: cleanList(ai.idp?.conferences, IDP_LINES) ?? fb.conferences,
    remarks: pick(ai.idp?.remarks, fb.remarks),
  };
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
    supervisory: input.supervisory,
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
