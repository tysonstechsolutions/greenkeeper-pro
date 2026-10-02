/**
 * staff-evaluation-draft — writes the narrative sections of a yearly
 * performance evaluation from the GM's interview answers.
 *
 * The GM rates each performance element and jots a few words; this turns
 * that into the written sections of the form (overall summary, strengths,
 * areas for improvement, goals, and a short comment per element). It only
 * writes — nothing is saved by this function. The GM reviews and edits every
 * word before the evaluation is finalized.
 *
 * Auth: signed-in user. Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL.
 * Deploy:  supabase functions deploy staff-evaluation-draft
 *
 * Request JSON:
 *   { employee: { name, position }, period_label,
 *     overall: { value, label },
 *     elements: [ { key, label, description, rating, rating_label, note } ],
 *     answers: [ { prompt, answer } ],
 *     facts: { ...period facts... } }
 *
 * Response JSON:
 *   { summary, strengths, improvement, goals, elements: { [key]: string } }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 3000;
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You write the narrative sections of a yearly employee performance evaluation for a General Manager at a Navy MWR golf course (federal NAF employees). The GM has already rated each performance element and jotted short notes. You turn those into clear, professional evaluation language the GM can sign.

Your ONLY sources are the GM's ratings, the GM's notes, and the "facts" block. Never invent accomplishments, numbers, incidents, projects, or quotes. If the GM's notes for a section are blank, write a brief, neutral sentence that matches the ratings — do not make up specifics.

Voice and style:
- Third person. Refer to the employee by first name. If you need a pronoun, use "they/them" — never guess he/she.
- Plain, professional, and specific. Short sentences. No buzzwords, no flowery praise, no exclamation points.
- Every sentence must agree with the ratings: do not call an element excellent if it is rated "Needs Improvement", and do not criticize an element rated "Outstanding".
- Improvement language is constructive and behavior-focused (what to do), never personal.

Using the facts block:
- Attendance numbers (call-outs, sick time) may be mentioned only in the context of the Dependability & Attendance element, and only if they support the GM's rating or notes. Never mention medical details.
- Do NOT mention disciplinary records, follow-ups, or anything personal unless the GM's own notes bring it up.
- 1:1 summaries may be used to support a strength or goal the GM already named; do not introduce new topics from them.
- Certifications may be mentioned as accomplishments or in the development plan.

Lengths: "summary" 3-5 sentences; "strengths", "improvement", "goals" 2-5 sentences each; each element comment 1-2 sentences.

Produce ONLY JSON, no prose, no markdown fences:
{
  "summary": string,
  "strengths": string,
  "improvement": string,
  "goals": string,
  "elements": { "<element key>": string }   // one entry for EVERY element key provided
}`;

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicMessageResponse {
  content: AnthropicTextBlock[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY not configured", 500);
    }

    const body = await req.json();
    const elements = Array.isArray(body.elements) ? body.elements : [];
    if (elements.length === 0) return jsonError("No rated elements provided", 400);

    const payload = {
      employee: body.employee ?? {},
      period_label: body.period_label ?? "",
      overall: body.overall ?? null,
      elements,
      answers: Array.isArray(body.answers) ? body.answers : [],
      facts: body.facts ?? {},
    };

    const userText = `Write the evaluation narrative from this data.\n\n=== EVALUATION INPUT (data) ===\n${JSON.stringify(
      payload,
      null,
      2,
    )}\n=== END INPUT ===`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.3,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userText }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[staff-evaluation-draft] Anthropic error:", resp.status, text);
      return jsonError(`Anthropic API error (${resp.status})`, 502);
    }

    const data = (await resp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";
    const parsed = parseJsonReply(reply) as Record<string, unknown> | null;
    if (!parsed) return jsonError("The AI reply could not be read", 502);

    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const elementOut: Record<string, string> = {};
    if (parsed.elements && typeof parsed.elements === "object") {
      for (const [key, value] of Object.entries(parsed.elements as Record<string, unknown>)) {
        const t = text(value);
        if (t) elementOut[key] = t;
      }
    }

    return jsonResponse({
      summary: text(parsed.summary),
      strengths: text(parsed.strengths),
      improvement: text(parsed.improvement),
      goals: text(parsed.goals),
      elements: elementOut,
    });
  } catch (err) {
    console.error("[staff-evaluation-draft] Unexpected error:", err);
    return jsonError(err instanceof Error ? err.message : "Unknown error", 500);
  }
});

function parseJsonReply(reply: string): unknown | null {
  const trimmed = reply.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fence ? fence[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const m = candidate.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
