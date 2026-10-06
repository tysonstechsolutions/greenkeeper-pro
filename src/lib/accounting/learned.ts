/**
 * Codes learned from past purchase requests: when a new line reads like
 * something bought before, suggest the Site / Cost Center / G/L that line
 * carried. Past choices beat the keyword rules, because they're what this
 * operation actually used (and what got approved).
 *
 * Pure. The PR form passes its part history (lib/hooks/usePartHistory).
 */
import { isOfficialCode, type CodeSuggestion } from "./recommend";

export interface PastLine {
  description: string;
  part_number: string;
  vendor: string | null;
  last_used: string;
  site?: string;
  cost_ctr?: string;
  gl_acct?: string;
}

const STOP = new Set([
  "the", "and", "for", "with", "per", "each", "case", "box", "pack", "pkg", "new", "set", "of", "in", "to",
  "a", "an", "x", "ea", "cs", "pk", "bx", "lb", "lbs", "oz", "gal", "qt", "ct",
]);

/** Meaningful words: lowercase, no units or bare numbers. */
export function descriptionWords(text: string | null | undefined): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
      .map((w) => w.replace(/(?<=..)s$/, "")),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

/** How alike two lines must be (word overlap) to reuse the earlier codes. */
export const LEARNED_MIN_SCORE = 0.5;

export interface LearnedCodes {
  site: CodeSuggestion | null;
  costCenter: CodeSuggestion | null;
  glAccount: CodeSuggestion | null;
  /** The earlier line it came from. */
  from: PastLine;
}

/**
 * The codes from the most similar earlier line, or null when nothing earlier
 * is close enough. Same part number is a sure match; otherwise the words in
 * the description have to overlap, with a nudge for the same vendor.
 */
export function learnedLineCodes(
  description: string | null | undefined,
  partNumber: string | null | undefined,
  vendor: string | null | undefined,
  history: PastLine[],
): LearnedCodes | null {
  const words = descriptionWords(description);
  const pn = (partNumber ?? "").trim().toLowerCase();
  const v = (vendor ?? "").trim().toLowerCase();
  let best: { line: PastLine; score: number } | null = null;
  for (const line of history) {
    if (!line.cost_ctr && !line.gl_acct && !line.site) continue;
    let score = pn && line.part_number.trim().toLowerCase() === pn ? 1 : overlap(words, descriptionWords(line.description));
    if (score > 0 && v && (line.vendor ?? "").trim().toLowerCase() === v) score += 0.1;
    if (
      score >= LEARNED_MIN_SCORE &&
      (!best || score > best.score || (score === best.score && line.last_used > best.line.last_used))
    ) {
      best = { line, score };
    }
  }
  if (!best) return null;
  const from = best.line;
  const when = from.last_used ? ` (${from.last_used.slice(0, 10)})` : "";
  const reason = `Used before for "${from.description}"${when}`;
  const pick = (kind: "site" | "cost_center" | "gl_account", code: string | undefined): CodeSuggestion | null =>
    code && isOfficialCode(kind, code) ? { code, reason } : null;
  const out = {
    site: pick("site", from.site),
    costCenter: pick("cost_center", from.cost_ctr),
    glAccount: pick("gl_account", from.gl_acct),
    from,
  };
  return out.site || out.costCenter || out.glAccount ? out : null;
}
