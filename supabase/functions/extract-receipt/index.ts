/**
 * extract-receipt — Claude vision endpoint that reads a paid RECEIPT or
 * INVOICE (image or PDF) and returns the actual amounts so a Purchase Request
 * can be reconciled against what was really paid. Modeled on extract-quote.
 *
 * Auth: signed-in user (RLS applies — no DB writes happen here).
 * Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (shared with the other AI fns).
 *
 * Deploy:  supabase functions deploy extract-receipt
 *
 * Request (multipart/form-data OR application/json):
 *   form-data:  field "file" (image/* or application/pdf) — preferred
 *   json:       { image_base64: string, media_type: "image/jpeg" | ... }
 *
 * Response:
 *   { vendor: string | null,
 *     purchase_date: string | null,   // ISO YYYY-MM-DD if legible
 *     subtotal: number | null,
 *     tax: number | null,
 *     total: number | null,           // the grand total actually paid
 *     items: [ { description, qty, unit_price, line_total } ],
 *     warnings: string[] }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `You read a paid RECEIPT or INVOICE and extract the actual amounts, so a purchase can be reconciled against what was ordered.

Return ONLY a JSON object — no prose, no markdown fences — with exactly this shape:
{
  "vendor": string | null,            // store / vendor name printed on the receipt
  "purchase_date": string | null,     // the transaction date as ISO "YYYY-MM-DD" if legible, else null
  "subtotal": number | null,          // pre-tax subtotal if shown, else null
  "tax": number | null,               // sales tax charged if shown, else null
  "total": number | null,             // the GRAND TOTAL actually paid (the single most important number)
  "items": [
    {
      "description": string,          // the line item as printed
      "qty": number,                  // quantity; default 1 if not shown
      "unit_price": number,           // price per unit
      "line_total": number            // extended amount for the line (qty * unit_price, or as printed)
    }
  ],
  "warnings": string[]                // anything unclear, unreadable, or worth flagging
}

Rules:
- Numbers must be plain numbers (12.34), never strings, never with "$" or commas.
- "total" is the amount the customer actually paid — the bottom-line grand total including tax. If both a "Total" and an "Amount Due"/"Balance"/"Paid" are shown and differ, prefer the amount actually paid and add a warning.
- Include EVERY purchased line item. Do NOT invent items. Skip pure subtotal/tax/total summary rows from the items array — those belong in subtotal/tax/total.
- If a shipping or fee line appears as its own charge, include it as an item with a clear description (e.g. "Shipping").
- If the image is blurry or a value is unreadable, put null and add a warning rather than guessing.
- If this does not look like a receipt or invoice at all, return nulls/empty items and a warning saying so.`;

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

    // ── Read the upload ──────────────────────────────────────────────────
    let imageBase64: string | null = null;
    let mediaType: string | null = null;

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError("Missing 'file' field in form-data", 400);
      }
      mediaType = file.type;
      const buf = new Uint8Array(await file.arrayBuffer());
      imageBase64 = base64Encode(buf);
    } else if (ct.includes("application/json")) {
      const body = await req.json();
      imageBase64 = body.image_base64 || null;
      mediaType = body.media_type || null;
    } else {
      return jsonError("Expected multipart/form-data or application/json", 400);
    }

    if (!imageBase64 || !mediaType) {
      return jsonError("Missing image data or media_type", 400);
    }

    const isPdf = mediaType === "application/pdf";
    const allowedImage = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!isPdf && !allowedImage.includes(mediaType)) {
      return jsonError(
        `Unsupported file type: ${mediaType}. Use JPEG, PNG, GIF, WebP, or PDF.`,
        400,
      );
    }

    // ── Call Claude ──────────────────────────────────────────────────────
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
          temperature: 0,
          system: EXTRACTION_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                userBlock,
                {
                  type: "text",
                  text: "Extract the actual amounts and line items from this receipt.",
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
      console.error("[extract-receipt] Anthropic error:", claudeResp.status, text);
      return jsonError(`Anthropic API error (${claudeResp.status})`, 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";

    const parsed = parseJsonReply(reply);
    if (!parsed) {
      return jsonResponse({
        vendor: null,
        purchase_date: null,
        subtotal: null,
        tax: null,
        total: null,
        items: [],
        warnings: ["Couldn't parse model output as JSON. Try a clearer photo."],
      });
    }

    return jsonResponse(parsed);
  } catch (err) {
    console.error("[extract-receipt] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

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
