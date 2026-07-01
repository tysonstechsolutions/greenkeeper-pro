/**
 * task-breakdown — Deno edge function for My Day.
 *
 * Breaks a GM's task into a handful of small, concrete steps. Returns step
 * TITLES only ({ steps: string[] }) — the app schedules them across days. No
 * tools, no writes; the My Day client falls back to a single step if this
 * isn't reachable, so the feature works without it.
 *
 * Auth: requires a signed-in user.
 * Secrets needed: ANTHROPIC_API_KEY
 *
 * Deploy:  supabase functions deploy task-breakdown
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 700;
const TIMEOUT_MS = 30_000;
const MAX_TITLE_LENGTH = 500;
const MAX_DETAIL_LENGTH = 2_000;

const SYSTEM_PROMPT = `You break a golf-course General Manager's task into a short, ordered checklist of small steps he can actually do.

Context: this is Veterans Memorial Golf Course (a small Navy course). The GM also runs day-to-day admin and has a tiny crew, so keep it realistic — a handful of concrete, bite-size steps, not an exhaustive project plan.

Rules:
- Output 3 to 8 steps. Fewer is fine for a small task.
- Each step is one short, concrete action (a few words), in the order he'd do them.
- Do NOT assign dates or durations — the app schedules them.
- Stay on golf-course operations/admin. If the task is unclear, make reasonable assumptions for a golf course.
- Output ONLY valid JSON, no markdown, no commentary: {"steps": ["step one", "step two", ...]}`;

async function callClaude(apiKey: string, userText: string): Promise<Response> {
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
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseSteps(text: string): string[] {
  // The model may wrap JSON in stray text; grab the first {...} block.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    if (!Array.isArray(obj.steps)) return [];
    return obj.steps
      .filter((s: unknown): s is string => typeof s === "string")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

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

    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      detail?: unknown;
      deadline?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    const deadline = typeof body.deadline === "string" ? body.deadline : "";

    if (!title) return jsonError("A task title is required", 400);
    if (title.length > MAX_TITLE_LENGTH) {
      return jsonError(`Title too long (max ${MAX_TITLE_LENGTH})`, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonError(
        "Task breakdown is not configured. Please set the ANTHROPIC_API_KEY secret.",
        503,
      );
    }

    const userText =
      `Task: ${title}` +
      (detail ? `\nDetails: ${detail.slice(0, MAX_DETAIL_LENGTH)}` : "") +
      (deadline ? `\nDeadline: ${deadline}` : "");

    const claudeResponse = await callClaude(apiKey, userText);
    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error(`Claude API error ${claudeResponse.status}:`, errText);
      return jsonError("Task breakdown is temporarily unavailable.", 502);
    }

    const data = await claudeResponse.json();
    const text = (data.content || [])
      // deno-lint-ignore no-explicit-any
      .filter((b: any) => b.type === "text")
      // deno-lint-ignore no-explicit-any
      .map((b: any) => b.text)
      .join("\n");

    return jsonResponse({ steps: parseSteps(text) });
  } catch (err) {
    console.error("task-breakdown error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
