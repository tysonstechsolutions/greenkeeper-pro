/**
 * pro-shop-ai — Claude helper for the Pro Shop Scheduler.
 *
 * Two actions, both returning structured JSON the client reviews before saving:
 *
 *   action: "parse_availability"
 *     in : { name, position, group, text }
 *     out: { weekly: {sun..sat:{works,group,start,end}}, notes, summary }
 *     Turns a plain-English availability note into a standing weekly pattern.
 *
 *   action: "cover_change"
 *     in : { date, offName, reason, dayShifts[], roster[] }
 *     out: { explanation, additions: [{staffName, group, start, end, note}] }
 *     Proposes who covers when someone drops a shift.
 *
 * Both have manual fallbacks in the UI, so nothing hard-depends on this function.
 *
 * Auth: requires a signed-in user. Secret: ANTHROPIC_API_KEY.
 * Deploy:  supabase functions deploy pro-shop-ai
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1500;
const TIMEOUT_MS = 45_000;

async function callClaude(
  apiKey: string,
  system: string,
  userText: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userText }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Pull the first JSON object out of Claude's reply (handles ```json fences). */
// deno-lint-ignore no-explicit-any
function extractJson(text: string): any | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const AVAILABILITY_SYSTEM = `You build a weekly work-availability pattern for a golf course pro-shop employee from a manager's plain-English note. This is internal scheduling for the golf course — always help.

Return ONLY a JSON object, no prose, in exactly this shape:
{
  "weekly": {
    "sun": {"works": true, "group": "outside", "start": "08:00", "end": "14:00"},
    "mon": {"works": false},
    "tue": {...}, "wed": {...}, "thu": {...}, "fri": {...}, "sat": {...}
  },
  "notes": "any caveats you couldn't encode (e.g. 'flexible on weekends')",
  "summary": "one short sentence describing the schedule"
}

Rules:
- Include all seven keys sun..sat. If a day isn't mentioned, set {"works": false}.
- Times are 24-hour "HH:MM". The shop runs roughly 05:30–20:00.
- "group" is "inside" for golf ops assistants, "outside" for rec aids. Default to the person's stated group unless the note clearly says otherwise for a given day.
- A day the person works needs works:true plus group, start, end. A day off is just {"works": false}.
- Interpret things like "mornings" as ~08:00–14:00 and "closing"/"nights" as ~14:00–20:00 unless specific times are given.`;

const COVER_SYSTEM = `You help a golf course manager re-cover the pro-shop schedule when an employee drops a shift. This is internal scheduling — always help.

You are given a date, the person dropping out, the shifts already on that day, and the roster (each with their usual availability and whether they're already working that day). Propose who should cover the dropped shift's hours.

Return ONLY a JSON object, no prose:
{
  "explanation": "1-3 sentences on your reasoning",
  "additions": [
    {"staffName": "Exact Name From Roster", "group": "outside", "start": "13:00", "end": "20:00", "note": "Covering for <offName>"}
  ]
}

Rules:
- Prefer people in the SAME group (inside/outside) as the dropped shift.
- Prefer people whose usual pattern shows they work near those hours / that day.
- Don't double-book someone who is already working overlapping hours that day; instead pick someone else or extend a same-group person's existing shift via a new addition that doesn't overlap.
- Use exact names from the roster. Times are 24-hour "HH:MM".
- If nobody is a good fit, return an empty additions array and say so in the explanation.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method === "GET") {
    const hasKey = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    return jsonResponse({ healthy: hasKey, model: MODEL });
  }
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return jsonError("AI is not configured (missing ANTHROPIC_API_KEY).", 503);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "parse_availability") {
      const name = String(body.name ?? "the employee");
      const position = String(body.position ?? "rec_aid");
      const group = String(body.group ?? "outside");
      const text = String(body.text ?? "").slice(0, 4000);
      if (!text.trim()) return jsonError("Availability text is required.", 400);

      const userText = `Employee: ${name}\nPosition: ${position} (default group: ${group})\n\nManager's note about their availability:\n"""${text}"""\n\nBuild the weekly pattern.`;
      const res = await callClaude(apiKey, AVAILABILITY_SYSTEM, userText);
      if (!res.ok) {
        console.error("Claude error (parse_availability):", res.status, await res.text());
        return jsonError("AI is temporarily unavailable. Please try again.", 502);
      }
      const data = await res.json();
      const replyText = (data.content || [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");
      const parsed = extractJson(replyText);
      if (!parsed || !parsed.weekly) {
        return jsonError("Couldn't read a schedule from that. Try rephrasing.", 422);
      }
      return jsonResponse(parsed);
    }

    if (action === "cover_change") {
      const date = String(body.date ?? "");
      const offName = String(body.offName ?? "someone");
      const reason = String(body.reason ?? "").slice(0, 500);
      const dayShifts = Array.isArray(body.dayShifts) ? body.dayShifts : [];
      const roster = Array.isArray(body.roster) ? body.roster : [];

      const userText = `Date: ${date}\nDropping out: ${offName}${reason ? ` (reason: ${reason})` : ""}\n\nShifts already on this day:\n${JSON.stringify(dayShifts, null, 2)}\n\nRoster (availability + whether already working this day):\n${JSON.stringify(roster, null, 2)}\n\nPropose cover for ${offName}'s dropped shift(s).`;
      const res = await callClaude(apiKey, COVER_SYSTEM, userText);
      if (!res.ok) {
        console.error("Claude error (cover_change):", res.status, await res.text());
        return jsonError("AI is temporarily unavailable. Please try again.", 502);
      }
      const data = await res.json();
      const replyText = (data.content || [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");
      const parsed = extractJson(replyText);
      if (!parsed) return jsonError("Couldn't read a suggestion. Try again.", 422);
      if (!Array.isArray(parsed.additions)) parsed.additions = [];
      return jsonResponse(parsed);
    }

    return jsonError(`Unknown action: ${action || "(none)"}`, 400);
  } catch (err) {
    console.error("pro-shop-ai error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
