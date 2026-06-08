/**
 * extract-pr — Claude vision endpoint that reads a FILLED-OUT NAVMIDLANT NAF
 * Purchase Request (the one-page form, as a PDF or photo) into the structured
 * fields the PR Audit screen needs: header, vendor, every line item WITH its
 * Site / Cost Center / G/L codes, the "Other" attachment label, and the grand
 * total. The actual auditing (code validity, 3% fee math, totals, etc.) is done
 * deterministically on the client — this function only does the reading.
 *
 * This is distinct from `extract-quote`, which reads a VENDOR quote (which has
 * no cost-center codes). Here we must capture the codes the team wrote on the
 * form EXACTLY as printed — including wrong ones — so the audit can catch them.
 *
 * Auth: signed-in user (RLS applies — no DB writes happen here).
 * Secrets: ANTHROPIC_API_KEY (already configured for the other AI functions).
 *
 * Deploy:  supabase functions deploy extract-pr
 *
 * Request body (multipart/form-data OR application/json):
 *   form-data:  field "file" (image/* or application/pdf)
 *   json:       { image_base64: string, media_type: "image/jpeg" | "application/pdf" | ... }
 *
 * Response: see EXTRACTION_PROMPT's JSON shape.
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `You read a FILLED-OUT Non-Appropriated Fund (NAF) Purchase Request form and return its contents as JSON so it can be audited. The document is the NAVMIDLANT NAF Purchase Request — a one-page form (sometimes with a second page when there are many line items). It may arrive as a clean PDF or as a phone photo / scan.

Your ONLY job is to TRANSCRIBE what is on the form. Do NOT fix, correct, normalize, or "improve" any code or number. If a Cost Center is wrong or blank, report it wrong or blank — a separate auditor checks correctness. Copy codes digit-for-digit.

═══════════════════════════════════════════════════════════════════════════
THE LINE-ITEM TABLE — the most important part
═══════════════════════════════════════════════════════════════════════════

The form has a line-item table. Each row carries accounting codes BEFORE the
description. The columns, left to right, are typically:

  Item | Site | Cost Ctr | G/L Acct | Description | Part No | Qty | Unit | Unit Price | Extended

  • site         — a 4-digit Site code (e.g. "7009", "7010"). Copy exactly.
  • cost_ctr     — a 5-digit Cost Center (e.g. "25581", "20087"). Copy exactly.
  • gl_acct      — a 6-digit G/L Account (e.g. "701000", "684000"). Copy exactly.
  • description  — the item name / what was purchased.
  • part_number  — vendor part / SKU, if present (else null).
  • qty          — quantity (number; default 1 if a row clearly has one item but no qty printed).
  • unit         — "EA", "bag", "case", etc. (else null).
  • unit_price   — price per unit, a plain number (strip "$" and commas).
  • extended_price — the row's line total as PRINTED (qty × unit price), if the
                     form shows an Extended/Amount/Total column. null if not shown.

RULES for the table:
  • Capture EVERY row, including special lines such as "Sales Tax" and
    "3% Credit Card Fee" / "Credit Card Fee" — these ARE line items on this
    form and the audit needs them. Give them whatever Site/Cost Ctr/G/L codes
    are printed on their row (often the same as the item rows; null if blank).
  • For a Sales Tax or Credit Card Fee row, qty is usually 1 and the amount is
    the unit_price; copy the printed extended_price too if shown.
  • If a code cell is blank, use null for that field — do NOT guess or carry a
    value down from the row above.
  • Do not include the table header row or any Subtotal/Grand Total summary row
    as a line item (the grand total goes in the separate "printed_total" field).

═══════════════════════════════════════════════════════════════════════════
HEADER FIELDS
═══════════════════════════════════════════════════════════════════════════

  • date_prepared — the "Date Prepared" on the form, as ISO "YYYY-MM-DD". null if absent.
  • vendor_name   — the Vendor 1 name (the chosen/primary vendor). null if absent.
  • requestor_name— the person who prepared/requested it. null if absent.
  • internal_order— the Internal Order ID if printed (e.g. "FY26-GC-0007"). null if absent.

═══════════════════════════════════════════════════════════════════════════
ATTACHMENTS — the "Other" box
═══════════════════════════════════════════════════════════════════════════

Near the bottom the form has an "Attached" / "Attachments" area with checkboxes
(SSJ, BNJ, PWS, ITPR, Section 889, Other). For the "Other" box:
  • If it is checked and has text next to it, return that text in attached_other
    (e.g. "Vendor Quote").
  • If it is checked but blank, return "" (empty string).
  • If it is NOT checked, return null.

═══════════════════════════════════════════════════════════════════════════
GRAND TOTAL
═══════════════════════════════════════════════════════════════════════════

  • printed_total — the overall total / IGE amount printed on the form (the sum
    of all line items including tax and the credit-card fee), as a plain number.
    null if the form doesn't print one.

═══════════════════════════════════════════════════════════════════════════
OUTPUT — ONLY valid JSON in this exact shape, no commentary, no markdown fences:
═══════════════════════════════════════════════════════════════════════════

{
  "date_prepared": string | null,
  "vendor_name": string | null,
  "requestor_name": string | null,
  "internal_order": string | null,
  "items": [
    {
      "description": string,
      "part_number": string | null,
      "qty": number,
      "unit": string | null,
      "unit_price": number,
      "site": string | null,
      "cost_ctr": string | null,
      "gl_acct": string | null,
      "extended_price": number | null
    }
  ],
  "attached_other": string | null,
  "printed_total": number | null,
  "warnings": string[]
}

WARNINGS — one short string per low-confidence read (e.g. "cost center on line 3 is smudged"). Empty array if all clear.

Do not invent values. Empty string is only for an explicitly-blank checked "Other" box; use null everywhere else you can't read a value. If there are no line items, return items: [] and a warning.`;

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
                  text: "Transcribe this Purchase Request form into the JSON shape.",
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
      console.error("[extract-pr] Anthropic error:", claudeResp.status, text);
      return jsonError(`Anthropic API error (${claudeResp.status})`, 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";

    const parsed = parseJsonReply(reply);
    if (!parsed) {
      return jsonResponse({
        date_prepared: null,
        vendor_name: null,
        requestor_name: null,
        internal_order: null,
        items: [],
        attached_other: null,
        printed_total: null,
        warnings: ["Couldn't parse model output as JSON. Try a clearer scan."],
      });
    }

    return jsonResponse(parsed);
  } catch (err) {
    console.error("[extract-pr] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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
