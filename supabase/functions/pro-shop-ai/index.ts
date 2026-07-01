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
 *   action: "schedule_update"
 *     in : { text, today, roster[] }
 *     out: { summary, timeOff:[{staffName,start,end,reason}],
 *            availability:[{staffName,weekly,note}], unresolved:[] }
 *     Turns a plain-English change ("Aniya out till Jul 25", "Devin to 30 hrs/wk")
 *     into time-off + availability edits the client applies, then regenerates.
 *
 * All have manual fallbacks in the UI, so nothing hard-depends on this function.
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

You are given a date, the person dropping out, the shifts already on that day, and the roster. Each roster entry has: homeArea (inside/outside), flex (true = can cover ANY area, not just their home area), usualAvailability, and whether they're already working that day. Propose who should cover the dropped shift's hours.

Return ONLY a JSON object, no prose:
{
  "explanation": "1-3 sentences on your reasoning",
  "additions": [
    {"staffName": "Exact Name From Roster", "group": "outside", "start": "13:00", "end": "20:00", "note": "Covering for <offName>"}
  ]
}

Rules:
- The dropped shift's area (group) must stay covered. First look for someone whose homeArea matches that group.
- If no good match in that area, a FLEX employee (flex:true) can cover it even if it's not their home area — flex staff cross-cover between inside and outside. Set the addition's "group" to the area being covered (the dropped shift's area), not their home area.
- Prefer people whose usual pattern shows they work near those hours / that day.
- Don't double-book someone already working overlapping hours that day; pick someone else, or add a non-overlapping shift for a flex person.
- Non-flex employees should only cover their home area.
- Use exact names from the roster. Times are 24-hour "HH:MM".
- If nobody is a good fit, return an empty additions array and say so in the explanation.`;

const SCHEDULE_UPDATE_SYSTEM = `You apply a golf course manager's plain-English scheduling change to the pro-shop roster. This is internal scheduling — always help.

You are given TODAY's date and the roster (each: name, position, home group, flex, and their current weekly pattern). Turn the manager's instruction into structured changes. There are two kinds:

1. TIME OFF — someone is out for a date range (vacation, sick, etc.). This is TEMPORARY and does NOT change their weekly pattern.
2. AVAILABILITY — a lasting change to how many hours / which days / which times a person normally works.

Return ONLY a JSON object, no prose:
{
  "summary": "one or two plain sentences describing every change you made",
  "timeOff": [
    {"staffName": "Exact Name", "start": "2026-07-21", "end": "2026-07-25", "reason": "vacation"}
  ],
  "availability": [
    {"staffName": "Exact Name", "weekly": {"sun": {"works": false}, "mon": {"works": true, "group": "outside", "start": "08:00", "end": "14:00"}, "tue": {...}, "wed": {...}, "thu": {...}, "fri": {...}, "sat": {...}}, "note": "what changed"}
  ],
  "unresolved": ["anything you could not map, e.g. a name not on the roster"]
}

Rules:
- Use TODAY's date to resolve relative/partial dates. "until July 25th" -> end 2026-07-25 (pick the year that puts the date on/after today). Dates are "YYYY-MM-DD"; end is inclusive.
- "on vacation", "out", "off", "sick" for a period -> timeOff (NOT an availability change).
- A change to normal hours/days ("30 hours a week", "no longer works Mondays", "starts at 7 now") -> availability. Return the person's FULL updated weekly with all seven keys sun..sat, STARTING FROM their current pattern and changing only what the instruction says. For an hours target, keep their existing working days and area and adjust start/end to total about that many hours (trim evenly; drop a day only if needed). Times are 24-hour "HH:MM"; the shop runs ~05:30-20:00. group is "inside" or "outside".
- Only include people the instruction actually affects. Use EXACT names from the roster. If a named person isn't on the roster, put a short note in "unresolved" and do not guess.
- Empty arrays are fine. If you truly can't do anything, return empty arrays and explain in summary.`;

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

    if (action === "schedule_update") {
      const text = String(body.text ?? "").slice(0, 2000);
      const today = String(body.today ?? "");
      const roster = Array.isArray(body.roster) ? body.roster : [];
      if (!text.trim()) return jsonError("Type what you'd like to change.", 400);

      const userText = `TODAY: ${today}\n\nRoster (name, position, home group, flex, current weekly pattern):\n${JSON.stringify(roster, null, 2)}\n\nManager's instruction:\n"""${text}"""\n\nProduce the structured changes.`;
      const res = await callClaude(apiKey, SCHEDULE_UPDATE_SYSTEM, userText);
      if (!res.ok) {
        console.error("Claude error (schedule_update):", res.status, await res.text());
        return jsonError("AI is temporarily unavailable. Please try again.", 502);
      }
      const data = await res.json();
      const replyText = (data.content || [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");
      const parsed = extractJson(replyText);
      if (!parsed) return jsonError("Couldn't read a change from that. Try rephrasing.", 422);
      if (!Array.isArray(parsed.timeOff)) parsed.timeOff = [];
      if (!Array.isArray(parsed.availability)) parsed.availability = [];
      if (!Array.isArray(parsed.unresolved)) parsed.unresolved = [];
      return jsonResponse(parsed);
    }

    return jsonError(`Unknown action: ${action || "(none)"}`, 400);
  } catch (err) {
    console.error("pro-shop-ai error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
