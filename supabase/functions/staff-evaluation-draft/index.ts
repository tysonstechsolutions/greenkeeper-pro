/**
 * staff-evaluation-draft — writes the narrative parts of a CNIC 5300 NAF
 * Performance Rating Form from the GM's interview answers: item 9
 * (Supervisor's Remarks: a summary that supports the ratings, special
 * accomplishments, areas to develop, goals for the next period) and the
 * Individual Development Plan (learning opportunities, conferences/courses,
 * remarks).
 *
 * It only writes — nothing is saved by this function. The GM reviews and
 * edits every word before the evaluation is finalized.
 *
 * Auth: signed-in user. Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL.
 * Deploy:  supabase functions deploy staff-evaluation-draft
 *
 * Request JSON:
 *   { employee: { name, position }, period_label, supervisory,
 *     overall: { value, label },
 *     elements: [ { key, label, description, rating, rating_label,
 *                   level_description, note } ],
 *     answers: [ { id, prompt, answer } ],
 *     facts: { ...period facts... } }
 *
 * Response JSON:
 *   { summary, strengths, improvement, goals,
 *     idp: { learning: string[], conferences: string[], remarks } }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2500;
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You write the narrative parts of a CNIC 5300 NAF Employee Performance Rating Form for a General Manager at a Navy MWR golf course (Naval Station Great Lakes). The GM has already rated each element on the form's scale (Outstanding, Highly Satisfactory, Satisfactory, Minimally Satisfactory, Unsatisfactory) and jotted short notes. You turn those into clear, professional language the GM can sign.

Your ONLY sources are the GM's ratings, the GM's notes and answers, the level descriptions provided for each rating, and the "facts" block. Never invent accomplishments, numbers, incidents, projects, courses, dates, costs, or quotes. If the GM gave nothing for a part, write a brief, neutral sentence that matches the ratings — no made-up specifics.

Voice and style:
- Third person. Refer to the employee by first name. If you need a pronoun, use "they/them" — never guess he/she.
- Plain, professional, specific. Short sentences. No buzzwords, no flowery praise, no exclamation points.
- Every sentence must agree with the ratings: do not call an element excellent if it is rated Minimally Satisfactory, and do not criticize an element rated Outstanding. You may borrow wording from an element's level_description.
- Development language is constructive and behavior-focused (what to do), never personal.

Item 9 has to fit one box on the form, so keep ALL FOUR remarks parts together to about 180 words:
- "summary": 2-3 sentences supporting the overall rating and the element ratings.
- "strengths": special accomplishments, 1-3 sentences, from the GM's notes.
- "improvement": 1-2 sentences, or "" if the GM named nothing to work on and no element is below Satisfactory.
- "goals": goals for the next rating period, 1-2 sentences.

The Individual Development Plan:
- "idp.learning": up to 3 short items (each under 90 characters) for skills to refresh or acquire, taken ONLY from the GM's training answer and goals. Do not include Navy-required training. [] if the GM gave none.
- "idp.conferences": up to 3 short items (each under 90 characters) ONLY from the GM's classes/conferences answer, keeping any date and cost the GM gave. [] if none.
- "idp.remarks": 1-2 sentences tying the employee's goals to their development, or "".

Using the facts block:
- Attendance numbers (call-outs, sick time) may be mentioned only in support of the Dependability rating, and only if they agree with the GM's rating or notes. Never mention medical details.
- Do NOT mention disciplinary records, follow-ups, or anything personal unless the GM's own notes bring it up.
- 1:1 summaries may support a strength or goal the GM already named; do not introduce new topics from them.
- Certifications may be mentioned as accomplishments.

Produce ONLY JSON, no prose, no markdown fences:
{
  "summary": string,
  "strengths": string,
  "improvement": string,
  "goals": string,
  "idp": { "learning": string[], "conferences": string[], "remarks": string }
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
      supervisory: body.supervisory === true,
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
    const list = (v: unknown) =>
      Array.isArray(v) ? v.map(text).filter(Boolean).slice(0, 3) : [];
    const idp = (parsed.idp && typeof parsed.idp === "object" ? parsed.idp : {}) as Record<string, unknown>;

    return jsonResponse({
      summary: text(parsed.summary),
      strengths: text(parsed.strengths),
      improvement: text(parsed.improvement),
      goals: text(parsed.goals),
      idp: {
        learning: list(idp.learning),
        conferences: list(idp.conferences),
        remarks: text(idp.remarks),
      },
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
