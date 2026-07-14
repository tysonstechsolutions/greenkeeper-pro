/**
 * one-on-one-digest — reads a COMPLETED 1:1 (questions + the GM's captured
 * answers) and returns: a short summary, personal facts to fold into the
 * employee's engagement profile, and a list of PROPOSED ACTIONS to route
 * (to-do items, hours preference, time-off, follow-ups, calendar events).
 *
 * Nothing is written by this function — it only proposes. The GM approves each
 * action in the app before anything is committed.
 *
 * Auth: signed-in user. Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL.
 * Deploy:  supabase functions deploy one-on-one-digest
 *
 * Request JSON:
 *   { employee: { name, role }, template, session_date, today,
 *     qa: [ { prompt, answer } ] }
 *
 * Response JSON: see SYSTEM_PROMPT schema.
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You help a golf-course General Manager act on what an employee said in a one-on-one. You read the questions and the GM's notes of the employee's answers, then produce a structured digest.

The answers below are your ONLY source. Never invent things the employee did not say. If an answer is blank or vague, skip it — do not guess.

Produce ONLY JSON, no prose, no markdown fences:
{
  "summary": string,                 // 2-4 sentence recap of the conversation
  "profile_updates": {               // personal facts to remember; omit empty arrays
    "interests": string[],
    "family": string[],
    "career_goals": string[],
    "sports": string[],
    "life_goals": string[],
    "communication_notes": string,   // how they like to communicate/get feedback, if stated
    "misc": string[]
  },
  "actions": [                       // concrete things to route; [] if none clearly warranted
    {
      "type": "task" | "hours_pref" | "time_off" | "follow_up" | "profile" | "calendar",
      "label": string,               // one-line human summary the GM will approve

      // type "task" — something for the GM to do:
      "title": string,
      "detail": string | null,
      "due_date": string | null,     // ISO YYYY-MM-DD only if a clear deadline was stated

      // type "hours_pref" — they want more/fewer hours or a schedule change:
      "preference": string,          // e.g. "Wants more hours — up to ~40/week"

      // type "time_off" — a specific day off / vacation they requested:
      "start_date": string,          // ISO YYYY-MM-DD
      "end_date": string,            // ISO YYYY-MM-DD (same as start for a single day)
      "request_type": "vacation" | "sick" | "personal" | "military" | "other",
      "reason": string,

      // type "follow_up" — something to revisit next time (personal or an issue):
      "follow_up_title": string,     // short, in their words
      "follow_up_note": string,      // the context

      // type "calendar" — a dated event worth putting on the calendar:
      "event_title": string,
      "event_date": string,          // ISO YYYY-MM-DD
      "event_category": "fb_event" | "appointment" | "meeting" | "deadline" | "other"
    }
  ]
}

Rules for actions — be conservative and only include an action the answers clearly support:
- "task": only when the employee asked for something the GM should do, or an action item for the GM emerged.
- "hours_pref": only when they mention wanting more/fewer hours or a scheduling change.
- "time_off": only when they name a specific date or range they want off. Use the provided "today" to resolve relative dates ("next Friday"); if you cannot pin an exact date, use a "follow_up" instead of guessing.
- "follow_up": for anything worth asking about next time — a personal thread ("ask how his son's season went") OR an unresolved concern (pay, friction, frustration). Prefer a follow_up over inventing a hard action.
- "profile": OPTIONAL — you may add a profile-type action for a notable personal fact, but personal facts should mainly go in "profile_updates". Do not duplicate the same fact as both.
- Keep every "label" short and plain so the GM can approve at a glance.`;

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
    const payload = {
      employee: body.employee ?? {},
      template: body.template ?? "monthly",
      session_date: body.session_date ?? null,
      today: body.today ?? null,
      qa: Array.isArray(body.qa) ? body.qa : [],
    };

    const userText = `Read this 1:1 and produce the digest.\n\n=== 1:1 SESSION (data) ===\n${JSON.stringify(
      payload,
      null,
      2,
    )}\n=== END SESSION ===`;

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
          temperature: 0,
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
      console.error("[one-on-one-digest] Anthropic error:", resp.status, text);
      return jsonError(`Anthropic API error (${resp.status})`, 502);
    }

    const data = (await resp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";
    const parsed = parseJsonReply(reply) as Record<string, unknown> | null;

    if (!parsed) {
      return jsonResponse({ summary: "", profile_updates: {}, actions: [] });
    }
    return jsonResponse({
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      profile_updates:
        parsed.profile_updates && typeof parsed.profile_updates === "object"
          ? parsed.profile_updates
          : {},
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    });
  } catch (err) {
    console.error("[one-on-one-digest] Unexpected error:", err);
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
