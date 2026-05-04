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

const EXTRACTION_PROMPT = `You extract line items from any kind of vendor purchase document so a Non-Appropriated Fund Purchase Request can be filled out.

The user shoots whatever the vendor sends them, which could be ANY of:

  • Traditional quote / invoice with a tabular Item / Qty / Price grid
  • Sales-order or pro-forma PDF
  • E-commerce shopping-cart screenshot (Amazon, Toro Direct, NAPA, etc.)
  • Email body listing the items
  • Hand-typed item list
  • Catalog page with prices

Your job is to find the items in WHATEVER layout shows up.

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

DESCRIPTION
- The product name and any size/color/spec text. NEVER include the part number.
- Strip "Part #:", "PN:", "SKU:", "Item #:", "Mfr #:" labels — those go in part_number.
- Keep brand names ("Toro", "MILWAUKEE TOOL", "John Deere", "Honda").
- Keep size/spec inline ('1/4" ID, 3/8" OD, 50 ft', 'Tinted Anti-Scratch').
- The product TITLE often contains the part number embedded — STRIP IT into part_number, leave only the descriptive part.

  Layout examples — the SAME item could come from any of these vendors, learn each pattern:

    [Traditional invoice / quote]
    "Fuel Line, ID 1/4\\", OD 3/8\\", 50' Part #: SME 188152"
    → description: 'Fuel Line, ID 1/4", OD 3/8", 50\\''
    → part_number: "SME 188152"

    [Invoice with PN prefix]
    "PN: 360-1120 NSE DISPOSABLE GLOVES"
    → description: "NSE DISPOSABLE GLOVES"
    → part_number: "360-1120"

    [Combined title + Part # suffix]
    "MILWAUKEE TOOL Safety Glasses - Tinted Anti-Scratch Lenses Part #: MIL 48732015"
    → description: "MILWAUKEE TOOL Safety Glasses - Tinted Anti-Scratch Lenses"
    → part_number: "MIL 48732015"

    ────────────────────────────────────────────────────────────
    E-COMMERCE CART PATTERNS — these are the bulk of what the user uploads.
    Most golf-course / NAF-PC vendors use one of these layouts:
    ────────────────────────────────────────────────────────────

    [Toro Direct / Toro Parts Online — title has brand + PN baked in]
    Title:  "Toro 161-7350 Ignition Switch"
    SKU:    "161-7350"
    Price:  "$96.99"
    Qty:    "1"
    Line total on right: "$96.99"
    → description: "Toro Ignition Switch"
    → part_number: "161-7350"
    → unit_price: 96.99
    → qty: 1
    → unit: "Each"

    [Toro Direct, qty > 1 — distinguish per-unit vs line total]
    Title:  "Toro 120-4820 Light Tail Brake"
    SKU:    "120-4820"
    Price:  "$211.99"   ← per-unit (the one to use)
    Qty:    "2"
    Line total: "$423.98"
    → unit_price: 211.99 (NOT 423.98)
    → qty: 2

    [NAPA Auto Parts / NAPA Online — descriptive title + separate "Part Number" or "NAPA Part Number"]
    Title: "Battery Cable - 4 Gauge - 25 ft Roll"
    NAPA Part Number: "NMP 705141"
    or sometimes: "Mfr Part: BK 7100123"
    Price: $42.99 ea
    Qty: 1
    → description: "Battery Cable - 4 Gauge - 25 ft Roll"
    → part_number: "NMP 705141"  (prefer the NAPA part number; if "Mfr Part" also shown, use the manufacturer one)

    [Russo Power Equipment / Russo Hardware — green-industry distributor, uses dealer SKUs]
    Title: "Stihl FS 91 R Trimmer Head Spool"
    Item #: "RP-12345"
    Mfr #: "STHL 4180-007-2911"
    Price: $18.50
    Qty: 4
    → description: "Stihl FS 91 R Trimmer Head Spool"
    → part_number: "STHL 4180-007-2911" (prefer manufacturer over dealer SKU when both shown)

    [R&R Products — turf parts catalog, "Item Number" is primary, often has cross-reference manufacturer PN]
    Title: "Bedknife - Heavy Duty - Toro Greensmaster 3150"
    Item Number: "R8014"
    Mfr Cross-Ref: "Toro 110-1006"
    Price: $32.99
    Qty: 2
    → description: "Bedknife - Heavy Duty - Toro Greensmaster 3150"
    → part_number: "R8014" (R&R's catalog number is the orderable one — the cross-ref is for searching only)

    [John Deere Parts — title with manufacturer PN, sometimes "Genuine OEM Part" tag]
    Title: "John Deere AM135627 Mower Spindle Assembly"
    Part Number: "AM135627"
    Price: $189.99
    Qty: 1
    → description: "John Deere Mower Spindle Assembly"
    → part_number: "AM135627"

    [Amazon Business — long marketing title, ASIN at bottom or under "Product Information"]
    Title: "Briggs & Stratton 5081K Air Filter Cartridge for 18-26 HP Intek Engines (Replaces 794422)"
    Manufacturer Part Number: "5081K"
    ASIN: "B003L0YBPC"
    Price: $9.47
    Qty: 6
    → description: "Briggs & Stratton Air Filter Cartridge for 18-26 HP Intek Engines"
    → part_number: "5081K" (prefer Mfr Part over ASIN — purchasing wants the OEM number)

    [Home Depot Pro / homedepot.com — has "Internet #" AND "Model #" — Model # is the orderable one]
    Title: "DEWALT 20V MAX Cordless 4-Tool Combo Kit"
    Internet #: "300161398"
    Model #: "DCK485D2"
    Store SKU #: "1003 612 354"
    Price: $399.00
    Qty: 1
    → description: "DEWALT 20V MAX Cordless 4-Tool Combo Kit"
    → part_number: "DCK485D2" (prefer Model # over Internet #)

    [Grainger — "Item #" is Grainger's, "Mfr Model #" is the OEM — use Mfr]
    Title: "GOJO Hand Soap, 1 gal"
    Item #: "1ABC2"
    Mfr Model #: "9622-04"
    Price: $24.50 ea
    Qty: 4
    → description: "GOJO Hand Soap, 1 gal"
    → part_number: "9622-04"

    [McMaster-Carr — "Catalog Number" with mixed numbers + letters]
    Title: "Steel Square Tubing, 1\\" x 1\\" x 1/8\\" Wall, 6 ft Length"
    Catalog Number: "6527K28"
    Price: $14.32 ea
    Qty: 8
    → description: 'Steel Square Tubing, 1" x 1" x 1/8" Wall, 6 ft Length'
    → part_number: "6527K28"

    [Northern Tool / Tractor Supply — simple title + Item #]
    Title: "NorthStar Pressure Washer 4000 PSI Belt Drive"
    Item #: "157130"
    Price: $1,499.99
    Qty: 1
    → description: "NorthStar Pressure Washer 4000 PSI Belt Drive"
    → part_number: "157130"

    [SiteOne / Lesco — landscape supply, "Product Number" + price]
    Title: "Lesco 24-2-11 Fertilizer w/ Iron, 50 lb bag"
    Product Number: "081127"
    Price: $36.99 / bag
    Qty: 25
    → description: "Lesco 24-2-11 Fertilizer w/ Iron, 50 lb bag"
    → part_number: "081127"
    → unit: "bag"

    GENERAL RULE: when you see ANY token shaped like a part number near
    the price/title and labeled "SKU / Item # / Part # / Model # / Mfr # /
    Catalog # / Internet # / Product # / Stock # / Reference / ASIN / OEM #",
    that's the part_number. Prefer the manufacturer/OEM number over the
    vendor-specific dealer number when BOTH are shown — except R&R Products
    which uses their own catalog number as the orderable PN.

PART_NUMBER
- Look in ANY of these spots, in priority order:
    1. A label like "SKU:", "Part #:", "PN:", "Item #:", "Mfr #:", "MFG #:", "Model:".
    2. A part-number-shaped token embedded in the product title (e.g. "Toro 161-7350 Ignition Switch" — "161-7350" is the PN).
    3. A separate column / cell labeled "Item Number", "Part Number", "Stock #".
- Part-number shape clues: digits + dashes + letters mixed (e.g. "161-7350", "SME 188152", "MIL 48732015", "100-1234"); 5-10+ chars; usually NOT a price, qty, or SKU prefix.
- Preserve original formatting (dashes, spaces, mixed case).
- Prefer manufacturer PN when both manufacturer and vendor SKU are shown.
- null only if the line truly has nothing identifying.

QTY
- Look for "Qty", "Quantity", "Qty:" label, or a stepper widget showing a number between – and + buttons.
- Whole or fractional. Convert "01", "02", "10" to 1, 2, 10.
- Default to 1 if not visible.

UNIT
- "Each" / "ea" / "case" / "pair" / "lot" / "bag" / "box" — keep the vendor's wording.
- E-commerce sites usually don't print a unit; default to "Each" when each row's price is per-piece (the typical case).
- null only when the document genuinely doesn't imply a unit.

UNIT_PRICE
- Strip currency symbols, commas, spaces. "$10.49" → 10.49.
- E-commerce carts often show TWO prices per row: the per-unit "Price" near the title, and the line total on the far right. The per-unit price is what you want.
- If only the line total + qty is visible, divide: line_total / qty.
- 0 only if the doc actually says zero. Never null — use best-effort number.

VENDOR
- Pull the vendor's company name from the letterhead, "From", "Bill From", store header, or domain in the URL/branding (e.g. "Toro Direct", "NAPA", "Amazon Business").
- For e-commerce screenshots without a clear logo, the brand name in the item titles is often the manufacturer, NOT the seller — use null for vendor name in that case rather than guessing.
- address / line2 / city_state_zip — split US addresses normally.
- POC = quote contact / sales rep name (not the buyer / not "ship to" name).
- email + phone for the vendor contact.
- null any field you can't read confidently. Returning vendor: null is fine.

THINGS TO SKIP
- Header rows ("Item / Description / Qty / Price")
- Subtotal / Tax / Shipping / Handling / Discount / Total / Grand Total rows
- Notes, terms, signatures, page numbers
- Availability / lead-time blurbs ("Typically available in 5-10 business days")
- "Save for Later", "Remove", or icon-only buttons

WARNINGS
- One short string per low-confidence field. e.g. "couldn't read PN for Toro switch row".

If the document genuinely has no extractable items, return:
  { "vendor": null, "items": [], "warnings": ["no line items found"] }

Do not invent values. Empty string is not allowed — use null.`;

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
