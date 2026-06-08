/**
 * audit-pr-fit — Claude endpoint that judges whether the COST CENTER chosen on
 * each Purchase Request line is the right one for what was bought, using the
 * boss-maintained cost-center reference (description + example items).
 *
 * This is the AI half of the PR audit. The deterministic half (code validity,
 * 3% fee, totals) runs on the client; this only adds advisory "this looks like
 * the wrong cost center → use X" suggestions.
 *
 * Auth: signed-in user. Secret: ANTHROPIC_API_KEY (shared with the other AI fns).
 * Deploy: supabase functions deploy audit-pr-fit
 *
 * Request JSON:
 *   { items: [{ index, description, cost_ctr }],
 *     cost_centers: [{ code, label, description, examples }] }
 * Response JSON:
 *   { findings: [{ itemIndex, currentCode, suggestedCode, reason }] }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You check whether the COST CENTER chosen on each line of a golf-course/NAF Purchase Request is the correct one for the item, so the bookkeeping is right.

You are given:
  • cost_centers: the approved cost centers, each with a code, label, a description of what it's for, and example items that belong in it.
  • items: the PR's line items, each with an index, a description (what was bought), and the cost_ctr code chosen on the PR.

For EACH item, decide if the chosen cost_ctr is appropriate given the cost-center descriptions/examples. Flag ONLY clear mismatches where a DIFFERENT listed cost center clearly fits better.

Rules:
  • Only suggest a code that exists in cost_centers. Never invent codes.
  • Be conservative: if it's plausible the chosen cost center is fine, or you're unsure, DO NOT flag it. Better to stay silent than nag.
  • Skip non-product lines: ignore any item whose description is a credit-card fee ("3% Credit Card Fee", "Credit Card Fee") or a sales-tax line ("Sales Tax", "Tax"). Never flag those.
  • If an item has no cost_ctr, you may suggest the best-fitting one (currentCode = null).
  • Ignore cost centers that have no description AND no examples — you have nothing to judge them by.
  • Keep "reason" short and concrete (one sentence), naming the item and why the suggested center fits.

Output ONLY valid JSON in this exact shape, no markdown, no commentary:

{
  "findings": [
    { "itemIndex": number, "currentCode": string | null, "suggestedCode": string, "reason": string }
  ]
}

If every line looks correctly assigned, return { "findings": [] }.`;

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

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return jsonError("Expected application/json", 400);
    }
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const costCenters = Array.isArray(body.cost_centers) ? body.cost_centers : [];

    // Nothing to judge against, or nothing to judge → no findings (no API call).
    const usableRef = costCenters.filter(
      (c: { description?: string; examples?: string }) =>
        (c?.description || "").trim() || (c?.examples || "").trim(),
    );
    if (usableRef.length === 0 || items.length === 0) {
      return jsonResponse({ findings: [] });
    }

    const userText = JSON.stringify({ cost_centers: costCenters, items });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let claudeResp: Response;
    try {
      claudeResp = await fetch(ANTHROPIC_API_URL, {
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
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: userText }],
            },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!claudeResp.ok) {
      const text = await claudeResp.text();
      console.error("[audit-pr-fit] Anthropic error:", claudeResp.status, text);
      return jsonError(`Anthropic API error (${claudeResp.status})`, 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";
    const parsed = parseJsonReply(reply);
    if (!parsed || !Array.isArray((parsed as { findings?: unknown }).findings)) {
      return jsonResponse({ findings: [] });
    }
    return jsonResponse(parsed);
  } catch (err) {
    console.error("[audit-pr-fit] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 500);
  }
});

function parseJsonReply(reply: string): unknown | null {
  const trimmed = reply.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
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
