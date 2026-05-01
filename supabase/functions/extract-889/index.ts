/**
 * extract-889 — pull structured data from a SAM.gov "Record of Section 889
 * Representations" PDF (or photo of one) so the vendors page can create
 * a vendor record automatically.
 *
 * The form is a one-page summary printed by the SmartPay 889 tool; every
 * VMGC vendor we work with submits one. Field positions are predictable.
 *
 * Auth: signed-in user. Secrets: ANTHROPIC_API_KEY.
 *
 * Deploy:  supabase functions deploy extract-889
 *
 * Request body (JSON):
 *   { image_base64: string, media_type: "application/pdf" | "image/jpeg" | ... }
 *
 * Response:
 *   {
 *     name, dba, uei, cage,
 *     address, city_state_zip,
 *     activation_date, expiration_date,   // YYYY-MM-DD
 *     compliant: boolean,
 *     warnings: string[]
 *   }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `You are reading a "Summary of SAM.gov Data" PDF that summarizes a vendor's
Section 889 Representations. The user is registering this vendor in our
purchasing app and needs the following fields extracted EXACTLY as printed.

Return ONLY valid JSON in this exact shape — no commentary, no markdown:

{
  "name": string | null,
  "dba": string | null,
  "uei": string | null,
  "cage": string | null,
  "address": string | null,
  "city_state_zip": string | null,
  "activation_date": string | null,
  "expiration_date": string | null,
  "compliant": boolean,
  "warnings": string[]
}

Field rules:

- name: the legal entity name printed under "Summary for:" / "Entity
  Registration Summary". Title-case as printed. e.g. "RUSSO HARDWARE INC".
- dba: any "doing business as" name, often shown in parentheses below the
  legal name. e.g. "RUSSO POWER EQUIPMENT". null if not present.
- uei: the SAM.gov UEI (12-character alphanumeric). e.g. "UAN4WNA6JEB5".
- cage: the CAGE code (5-character). e.g. "43NK8".
- address: street address, e.g. "9525 IRVING PARK RD". Do NOT include the
  city/state/zip line.
- city_state_zip: combined "CITY, STATE ZIP" line, e.g.
  "SCHILLER PARK, IL 60176+1923". Drop the country if it's just "USA".
- activation_date: ISO YYYY-MM-DD. The PDF prints it as MM-DD-YYYY (e.g.
  "08-08-2025"). Convert.
- expiration_date: ISO YYYY-MM-DD. Same conversion. CRITICAL — this is the
  date our app uses to gate purchase requests, so be precise.
- compliant: true if the "889 Representations Summary:" line says
  "COMPLIANT" (or anything similar like "NOT EXCLUDED"). false otherwise
  (e.g. "NON-COMPLIANT", "EXCLUDED").
- warnings: any field you couldn't read with high confidence — describe
  briefly. Empty array [] if everything was clear.

If the document doesn't look like a SAM.gov 889 summary, return all
nulls and add "doesn't appear to be a SAM.gov 889 form" to warnings.

Empty string is not allowed — use null. Do not invent values.`;

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicMessageResponse {
  content: AnthropicTextBlock[];
  stop_reason: string;
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
    const imageBase64: string | undefined = body.image_base64;
    const mediaType: string | undefined = body.media_type;
    if (!imageBase64 || !mediaType) {
      return jsonError("Missing image_base64 or media_type", 400);
    }

    const isPdf = mediaType === "application/pdf";
    const allowedImage = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!isPdf && !allowedImage.includes(mediaType)) {
      return jsonError(
        `Unsupported file type: ${mediaType}. Use PDF, JPEG, PNG, GIF, or WebP.`,
        400,
      );
    }

    const userBlock = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: imageBase64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType,
            data: imageBase64,
          },
        };

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
          ...(isPdf ? { "anthropic-beta": "pdfs-2024-09-25" } : {}),
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: EXTRACTION_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                userBlock,
                {
                  type: "text",
                  text: "Extract the vendor record from this 889 summary.",
                },
              ],
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
      console.error("[extract-889] Anthropic error:", claudeResp.status, text);
      return jsonError(`Anthropic API error (${claudeResp.status})`, 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";

    const parsed = parseJsonReply(reply);
    if (!parsed) {
      return jsonResponse({
        name: null,
        dba: null,
        uei: null,
        cage: null,
        address: null,
        city_state_zip: null,
        activation_date: null,
        expiration_date: null,
        compliant: false,
        warnings: ["Couldn't parse model output as JSON. Try a clearer image."],
      });
    }

    return jsonResponse(parsed);
  } catch (err) {
    console.error("[extract-889] Unexpected error:", err);
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
