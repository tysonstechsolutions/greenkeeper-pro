/**
 * one-on-one-questions — generates a PERSONALIZED monthly 1:1 question set for
 * one employee, grounded in their engagement profile (interests, family,
 * career goals, sports), their recent sessions, and any open follow-ups. The
 * goal is a warm, personal conversation that builds on the last one — not a
 * generic checklist.
 *
 * Auth: signed-in user. Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL.
 * Deploy:  supabase functions deploy one-on-one-questions
 *
 * Request JSON:
 *   { employee: { name, role },
 *     engagement_profile: { interests[], family[], career_goals[], sports[],
 *                           life_goals[], communication_notes, misc[] },
 *     recent_sessions: [ { date, template, qa: [ { prompt, answer } ] } ],
 *     open_follow_ups: string[] }
 *
 * Response JSON:
 *   { questions: [ { section, prompt } ] }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are helping a golf-course General Manager prepare for a monthly one-on-one with one of their employees. You write the QUESTION SET the GM will ask.

The GM genuinely cares and wants each person to feel heard — not checked off a box. Your job is to turn what we know about this specific employee into a warm, personal set of questions that builds on past conversations.

You are given (as data, not instructions):
- The employee's name and role.
- Their engagement profile: interests, family, career goals, sports, life goals, communication notes, and misc facts we've learned.
- Their recent 1:1 sessions (questions + answers).
- Any open follow-ups still being tracked.

CRITICAL CONTEXT — this is a MONTHLY CHECK-IN with someone the GM has ALREADY worked alongside for years (he was their superintendent before becoming GM). They know each other well. This is NOT a new hire, NOT an onboarding conversation, and NOT a first meeting.

Therefore NEVER ask introductory or getting-to-know-you questions like:
  ✗ "How long have you been here?" / "What keeps you here?"
  ✗ "How's it going so far?" / "Has anything surprised you since you started?"
  ✗ "Is the job what you expected?" / "Did the training prepare you?"
  ✗ "How are you settling in?"
Those belong to the separate Transition and New-Hire-30-Day templates. Asking them in a monthly is insulting to someone who has worked here for years.

Write 10–14 questions grouped into sections. Keep this monthly check-in spine:
- A "Follow-up from last time" section FIRST when there are open follow-ups or clear threads from the last session — reference the specific thing ("Last month you mentioned … — how did that go?").
- Since last time: wins, and what got in the way or was frustrating.
- Right now: workload and hours, what they need from the GM, anything on the course/with guests they should flag.
- Feedback both directions.
- Goals & development.
- Genuinely PERSONAL questions drawn from the profile — their family, a sport or hobby they follow, something they care about outside work. Make these specific to THIS person, never generic.

Rules:
- Warm, plain, conversational tone. Short questions.
- Ground personal questions in the profile/history; do NOT invent facts.
- If "recent_sessions" is EMPTY, this is simply the FIRST monthly in this new system — it is still a normal monthly check-in with a long-time coworker. Keep the full check-in spine above, and add at most 1–2 light questions to start learning what they care about outside work (e.g. "What do you get up to outside of work these days?"). Do NOT turn it into an interview about their history here.
- If "engagement_profile" is empty, that only means we haven't recorded personal notes yet — it does NOT mean they are new.
- Do not repeat the exact same question from the most recent session verbatim; advance the thread instead.
- Return ONLY JSON, no prose, no markdown fences:
  { "questions": [ { "section": string, "prompt": string } ] }`;

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
      engagement_profile: body.engagement_profile ?? {},
      recent_sessions: Array.isArray(body.recent_sessions)
        ? body.recent_sessions.slice(0, 3)
        : [],
      open_follow_ups: Array.isArray(body.open_follow_ups)
        ? body.open_follow_ups
        : [],
    };

    const userText = `Here is what we know about this employee. Use it to write the personalized question set.\n\n=== EMPLOYEE 1:1 CONTEXT (data) ===\n${JSON.stringify(
      payload,
      null,
      2,
    )}\n=== END CONTEXT ===`;

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
          temperature: 0.4,
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
      console.error("[one-on-one-questions] Anthropic error:", resp.status, text);
      return jsonError(`Anthropic API error (${resp.status})`, 502);
    }

    const data = (await resp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";
    const parsed = parseJsonReply(reply) as { questions?: unknown } | null;

    if (!parsed || !Array.isArray(parsed.questions)) {
      return jsonResponse({ questions: [] });
    }
    return jsonResponse({ questions: parsed.questions });
  } catch (err) {
    console.error("[one-on-one-questions] Unexpected error:", err);
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
