/**
 * Suggestions from the GM's own 1:1 notes, so evaluation answers start from
 * what was already said during the year instead of a blank box.
 *
 * Pure and deterministic — no AI. It only lifts answers the GM already
 * recorded in 1:1s (and career goals already in the engagement profile),
 * matched to an evaluation question by what the 1:1 question asked. Nothing
 * is rewritten or invented; the GM picks which ones to use.
 */
import type { EngagementProfile, OneOnOneSession } from "@/lib/oneonone/types";
import { inPeriod } from "./period";
import type { EvaluationPeriod } from "./types";

export type SuggestionTarget = "highlights" | "improve" | "goals" | "training";

export interface Suggestion {
  text: string;
  /** "2026-05-01" for a 1:1 answer, null for the engagement profile. */
  date: string | null;
  /** Short label for where it came from, e.g. "1:1 May 1" or "Career goals". */
  source: string;
}

export type EvaluationSuggestions = Record<SuggestionTarget, Suggestion[]>;

/** Which 1:1 prompts feed which evaluation question. */
// First match wins, so goals is checked before highlights ("what would you
// like to accomplish in the next 60–90 days" is a goal, not a win). Checked
// against the 1:1 templates in src/lib/oneonone/templates.ts.
const PROMPT_RULES: { target: SuggestionTarget; pattern: RegExp }[] = [
  // Not "course" — here that's usually the golf course.
  { target: "training", pattern: /more training|training (on|in|for)|certif|class(es)?\b/i },
  { target: "goals", pattern: /\bgoals?\b|like to learn|want to learn|take on|grow into|next \d+[–-]?\d* days|couple of years/i },
  { target: "improve", pattern: /keep working on|do differently|focus on or adjust/i },
  { target: "highlights", pattern: /went well|any wins|\bwins?\b|proud|doing well|recogni[sz]e/i },
];

/** 1:1 questions about the GM ("what do you hope I do differently as GM?")
 *  are feedback for the GM, never evidence about the employee. */
const ABOUT_THE_GM = /\b(hope|want|need) (I|me)\b|\bas GM\b|from me\b|for me\b|feedback for/i;

/** Answers that don't say anything worth carrying into an evaluation. */
const EMPTY_ANSWER = /^(n\/?a|no|none|nothing|nope|not really|idk|-+|\.+|ok|good|fine)\.?$/i;

/** Most suggestions offered per question. */
export const MAX_SUGGESTIONS = 6;

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function emptySuggestions(): EvaluationSuggestions {
  return { highlights: [], improve: [], goals: [], training: [] };
}

export function buildSuggestions(input: {
  period: Pick<EvaluationPeriod, "start" | "end">;
  sessions: OneOnOneSession[];
  engagement?: Partial<EngagementProfile> | null;
}): EvaluationSuggestions {
  const out = emptySuggestions();
  const seen = new Set<string>();
  const add = (target: SuggestionTarget, s: Suggestion) => {
    const text = s.text.trim().replace(/\s+/g, " ");
    const key = `${target}|${text.toLowerCase()}`;
    if (!text || EMPTY_ANSWER.test(text) || seen.has(key) || out[target].length >= MAX_SUGGESTIONS) return;
    seen.add(key);
    out[target].push({ ...s, text });
  };

  // Newest 1:1s first, so the most recent notes lead.
  const sessions = input.sessions
    .filter((s) => s.status === "completed" && inPeriod(s.session_date, input.period))
    .sort((a, b) => b.session_date.localeCompare(a.session_date));

  for (const session of sessions) {
    for (const q of session.questions ?? []) {
      const answer = (q.answer ?? "").trim();
      if (!answer) continue;
      if (ABOUT_THE_GM.test(q.prompt)) continue;
      const rule = PROMPT_RULES.find((r) => r.pattern.test(q.prompt));
      if (!rule) continue;
      add(rule.target, {
        text: answer,
        date: session.session_date,
        source: `1:1 ${shortDate(session.session_date)}`,
      });
    }
  }

  for (const goal of input.engagement?.career_goals ?? []) {
    add("goals", { text: goal, date: null, source: "Career goals" });
  }

  return out;
}

/** Append picked suggestions to an answer, one per line, skipping repeats. */
export function appendSuggestions(current: string, picked: string[]): string {
  const lines = current
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const have = new Set(lines.map((l) => l.toLowerCase()));
  for (const p of picked) {
    const t = p.trim();
    if (t && !have.has(t.toLowerCase())) {
      lines.push(t);
      have.add(t.toLowerCase());
    }
  }
  return lines.join("\n");
}
