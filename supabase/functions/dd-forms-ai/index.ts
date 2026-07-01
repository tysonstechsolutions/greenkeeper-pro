/**
 * dd-forms-ai — Claude vision helper for the DD-form disposition packet.
 *
 *   action: "describe_damage"
 *     in : { imageBase64, mediaType, item, circumstance }
 *     out: { reason }
 *     Looks at an asset's photo and writes a concise (1-2 sentence) disposition
 *     reason describing the visible damage — for the DD-200 / 2212 "reason" text.
 *
 * The client falls back to a deterministic default reason if this isn't deployed
 * or errors, so nothing hard-depends on it.
 *
 * Auth: signed-in user. Secret: ANTHROPIC_API_KEY (shared with the other AI fns).
 * Deploy:  supabase functions deploy dd-forms-ai
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 400;
const TIMEOUT_MS = 45_000;

const DAMAGE_SYSTEM = `You write the "reason for disposition" line on a US Navy golf-course property-disposal form (DD-200 / NAVCOMPT 2212) from a photo of the item. This is internal government property accountability — always help.

You are given the item description, the loss circumstance (damaged or destroyed), and a photo. Describe the VISIBLE condition/damage and why the item is beyond economical repair, in ONE or TWO short, factual sentences suitable for an official form. No preamble, no markdown, no bullet points — just the sentence(s).

Rules:
- Be concrete about what you can see (rust, cracks, missing/broken parts, rot, corrosion, collision damage, worn tires, seized engine, etc.). If the photo is unclear, describe what is visible without inventing specifics.
- End with the disposition rationale, e.g. "beyond economical repair" or "not serviceable", matching the circumstance.
- Plain, professional wording. No opinions about people. Keep it under ~40 words.

Return ONLY the sentence(s) as plain text.`;

async function callClaudeVision(
  apiKey: string,
  imageBase64: string,
  mediaType: string,
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
        temperature: 0,
        system: DAMAGE_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/gif", "image/webp"];

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

    if (action === "describe_damage") {
      const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
      const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
      const item = String(body.item ?? "the item").slice(0, 400);
      const circumstance = String(body.circumstance ?? "damaged");
      if (!imageBase64) return jsonError("No image provided.", 400);
      if (!ALLOWED_IMAGE.includes(mediaType)) {
        return jsonError(`Unsupported image type: ${mediaType}.`, 400);
      }

      const userText = `Item: ${item}\nCircumstance: ${circumstance}\n\nWrite the disposition reason from the photo.`;
      const res = await callClaudeVision(apiKey, imageBase64, mediaType, userText);
      if (!res.ok) {
        console.error("Claude error (describe_damage):", res.status, await res.text());
        return jsonError("AI is temporarily unavailable. Please try again.", 502);
      }
      const data = await res.json();
      const reason = (data.content || [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join(" ")
        .trim();
      if (!reason) return jsonError("Couldn't read the photo. Try another.", 422);
      return jsonResponse({ reason });
    }

    return jsonError(`Unknown action: ${action || "(none)"}`, 400);
  } catch (err) {
    console.error("dd-forms-ai error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
