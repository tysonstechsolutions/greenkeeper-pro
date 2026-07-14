/**
 * Client wrappers for the 1:1 AI edge functions. Each is best-effort: the
 * caller falls back gracefully (static questions, save-without-digest) if the
 * function isn't deployed or the AI is unavailable.
 */
import { callApi } from "@/lib/api/client";
import type {
  DigestResult,
  EngagementProfile,
  OneOnOneQuestion,
  OneOnOneSession,
} from "./types";
import type { QuestionSpec } from "./templates";

/** Generate a personalized monthly question set for one employee. */
export async function generateMonthlyQuestions(input: {
  employee: { name: string; role: string };
  engagement_profile: EngagementProfile;
  recent_sessions: {
    date: string;
    template: string;
    qa: { prompt: string; answer: string }[];
  }[];
  open_follow_ups: string[];
}): Promise<QuestionSpec[]> {
  const res = await callApi<{ questions?: { section?: string; prompt?: string }[] }>(
    "one-on-one-questions",
    { method: "POST", body: input },
  );
  const questions = Array.isArray(res.questions) ? res.questions : [];
  return questions
    .filter((q) => q && typeof q.prompt === "string" && q.prompt.trim())
    .map((q) => ({
      section: (q.section || "Check-in").trim(),
      prompt: (q.prompt as string).trim(),
    }));
}

/** Turn recent sessions into the compact shape the questions fn expects. */
export function recentSessionsPayload(sessions: OneOnOneSession[]) {
  return sessions.slice(0, 3).map((s) => ({
    date: s.session_date,
    template: s.template,
    qa: s.questions
      .filter((q) => q.answer.trim())
      .map((q) => ({ prompt: q.prompt, answer: q.answer })),
  }));
}

/** Read a completed session: summary + profile facts + proposed actions. */
export async function digestSession(input: {
  employee: { name: string; role: string };
  template: string;
  session_date: string;
  today: string;
  qa: { prompt: string; answer: string }[];
}): Promise<DigestResult> {
  const res = await callApi<DigestResult>("one-on-one-digest", {
    method: "POST",
    body: input,
  });
  return {
    summary: res.summary ?? "",
    profile_updates: res.profile_updates ?? {},
    actions: Array.isArray(res.actions) ? res.actions : [],
  };
}

export interface InsightsTheme {
  theme: string;
  count: number;
  employees: string[];
  detail: string;
  suggested_action: string;
}

export interface InsightsResult {
  summary: string;
  themes: InsightsTheme[];
}

/** Crew-wide theme report across everyone's recent 1:1s. */
export async function generateInsights(input: {
  period_label: string;
  employees: {
    name: string;
    role: string;
    sessions: { date: string; template: string; summary: string; answers: string[] }[];
    open_follow_ups: string[];
  }[];
}): Promise<InsightsResult> {
  const res = await callApi<InsightsResult>("one-on-one-report", {
    method: "POST",
    body: input,
  });
  return {
    summary: res.summary ?? "",
    themes: Array.isArray(res.themes) ? res.themes : [],
  };
}

/** Only questions that actually got an answer (for digest input). */
export function answeredQa(questions: OneOnOneQuestion[]) {
  return questions
    .filter((q) => q.answer.trim())
    .map((q) => ({ prompt: q.prompt, answer: q.answer }));
}
