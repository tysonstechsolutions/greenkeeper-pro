/**
 * extract-quote — Claude vision endpoint that turns a vendor quote
 * (image or PDF page rendered to image) into structured PR fields the
 * client can drop into the form.
 *
 * Auth: signed-in user (RLS applies — but no DB writes happen here).
 * Secrets: ANTHROPIC_API_KEY (already configured for ai-assistant).
 *
 * Deploy:  supabase functions deploy extract-quote
 *
 * Request body (multipart/form-data OR application/json):
 *   form-data:  field "file" (image/* or application/pdf) — preferred
 *   json:       { image_base64: string, media_type: "image/jpeg" | ... }
 *
 * Response:
 *   { vendor: { name, address, ... } | null,
 *     items: [ { description, part_number, qty, unit, unit_price } ],
 *     warnings: string[] }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `You extract line items from a vendor purchase quote, invoice, or order form so a Non-Appropriated Fund Purchase Request can be filled out.

PRIMARY GOAL: pull every product line item with these four fields per row:
  1. description  — the item NAME, no part number, no SKU
  2. part_number  — the vendor part / SKU / Item # / PN, separate from description
  3. qty          — quantity ordered (number, default 1)
  4. unit_price   — price per unit in USD as a plain number

Output ONLY valid JSON in this exact shape — no commentary, no markdown fences:

{
  "vendor": {
    "name": string | null,
    "address": string | null,
    "line2": string | null,
    "city_state_zip": string | null,
    "poc": string | null,
    "email": string | null,
    "phone": string | null
  } | null,
  "items": [
    {
      "description": string,
      "part_number": string | null,
      "qty": number,
      "unit": string | null,
      "unit_price": number
    }
  ],
  "warnings": string[]
}

Detail rules:

DESCRIPTION
- The product name and any size/color/spec text. NO part number embedded.
- Strip "Part #:", "PN:", "SKU:", "Item #:" labels — those go in part_number.
- Keep brand names ("Toro", "MILWAUKEE TOOL", "John Deere").
- Keep size/spec inline ('1/4" ID, 3/8" OD, 50 ft', 'Tinted Anti-Scratch').
- Examples:
    Quote: "Fuel Line, ID 1/4\\", OD 3/8\\", 50' Part #: SME 188152"
    → description: 'Fuel Line, ID 1/4", OD 3/8", 50\\''
    → part_number: "SME 188152"

    Quote: "PN: 360-1120 NSE DISPOSABLE GLOVES"
    → description: "NSE DISPOSABLE GLOVES"
    → part_number: "360-1120"

    Quote: "MILWAUKEE TOOL Safety Glasses - Tinted Anti-Scratch Lenses Part #: MIL 48732015"
    → description: "MILWAUKEE TOOL Safety Glasses - Tinted Anti-Scratch Lenses"
    → part_number: "MIL 48732015"

PART_NUMBER
- The string immediately following "Part #:", "PN:", "SKU:", "Item #:", "Mfr #:", "MFG #:", "Model:". Take whatever the vendor uses.
- Preserve original formatting (dashes, spaces, mixed case).
- If the quote has BOTH a vendor SKU and a manufacturer PN, prefer the manufacturer PN.
- null only if the line truly has no part / SKU.

QTY
- Whole or fractional number. If "01", "02", "10" → 1, 2, 10.
- Default to 1 if unreadable.

UNIT
- "Each" / "ea" / "case" / "pair" / "lot" / "bag" / "box" — keep the vendor's wording when shown. null if absent.

UNIT_PRICE
- Strip currency symbols, commas, spaces. "$10.49" → 10.49.
- If the row shows only the extended (line) price, divide by qty.
- 0 only if the quote actually says zero. null is not allowed for this field — use the best-effort number.

VENDOR
- Pull the vendor's company name from the letterhead / "From" / "Bill From" / quote header.
- address / line2 / city_state_zip — split US addresses normally; "9525 IRVING PARK RD" / null / "SCHILLER PARK, IL 60176".
- POC = quote contact / sales rep name (not the buyer).
- email + phone for the vendor contact.
- null any field you can't read confidently.

THINGS TO SKIP
- Header rows ("Item / Description / Qty / Price")
- Subtotal / Tax / Shipping / Total / Grand Total rows
- Notes, terms, signatures, page numbers

WARNINGS
- Add a short string per low-confidence field. e.g. "row 3 unit price was hard to read".

If the document is not a quote/invoice/order at all, return:
  { "vendor": null, "items": [], "warnings": ["doesn't appear to be a vendor quote"] }

Do not invent any values. Empty string is not allowed — use null.`;

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

    // Anthropic accepts image/jpeg, image/png, image/gif, image/webp.
    // PDFs are sent as document type, not image.
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
          // PDF support requires the beta header for some models.
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
                  text: "Extract the vendor and line items from this quote.",
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
      console.error("[extract-quote] Anthropic error:", claudeResp.status, text);
      return jsonError(
        `Anthropic API error (${claudeResp.status})`,
        502,
      );
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";

    // ── Parse JSON out of the reply ──────────────────────────────────────
    const parsed = parseJsonReply(reply);
    if (!parsed) {
      return jsonResponse({
        vendor: null,
        items: [],
        warnings: ["Couldn't parse model output as JSON. Try a clearer photo."],
      });
    }

    return jsonResponse(parsed);
  } catch (err) {
    console.error("[extract-quote] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Base64-encode a binary buffer.
 *
 * Deno's `btoa` handles strings only and `TextDecoder` mangles non-text bytes,
 * so we walk the array manually.
 */
function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Try to parse the model's reply as JSON. The system prompt forbids markdown
 * fences but defends in case the model leaks one (```json ... ```).
 */
function parseJsonReply(reply: string): unknown | null {
  const trimmed = reply.trim();
  // Strip markdown fence if present.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Sometimes the model wraps JSON in commentary; grab the first {...} block.
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
