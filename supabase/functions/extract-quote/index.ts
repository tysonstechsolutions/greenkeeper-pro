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
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
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

═══════════════════════════════════════════════════════════════════════════
CRITICAL RULE — MULTI-COLUMN PRICE GRIDS (read this BEFORE anything else)
═══════════════════════════════════════════════════════════════════════════

Vendor printed quotes / invoices commonly show MULTIPLE money columns per
line item — for example NAPA AUTO PARTS, parts-store dealer invoices, R&R
Products quotes, John Deere Parts ADVISOR printouts, dealer DMS systems.

Typical column header layout:

  Part Number | Line | Description | Quantity | Price | Net | Total | Taxable

When you see TWO OR MORE money columns per row, you MUST use the column that
represents the customer's actual per-unit price — NOT the list/MSRP price.

  • "Price" / "List" / "MSRP" / "Retail" / "Reg" / "Std"   → list price, IGNORE for unit_price
  • "Net" / "Your Price" / "Customer Price" / "Sale" /
    "Discount Price" / "Member Price" / "Net Price"        → THIS is unit_price
  • "Total" / "Extended" / "Line Total" / "Amount" /
    "Net Amount" / "Sub-Total"                             → line subtotal (qty × unit_price)

VALIDATION (do this for every multi-column row):
  qty × unit_price MUST equal the Total to within $0.05.
  If 3 × 10.49 = 31.47 matches the Total column, "10.49" was the Net — correct.
  If 3 × 17.00 = 51.00 does NOT match the Total of 31.47, you grabbed the
  list price by mistake — back up and use the other column.

If only ONE money column is visible, use that. If only Qty + Total are
visible, divide: unit_price = Total / Qty.

═══════════════════════════════════════════════════════════════════════════
NAPA AUTO PARTS PAPER QUOTE — frequent, has its own quirks
═══════════════════════════════════════════════════════════════════════════

NAPA's printed quote (header reads "NAPA AUTO PARTS … QUOTE", letterhead
shows the local store address) uses this exact 8-column layout:

  Part Number | Line | Description | Quantity | Price | Net | Total | Taxable

  • Part Number — the orderable PN (e.g. "360-1120", "48-73-2015", "ES5000",
    "7-073811"). Use as part_number verbatim.
  • Line — a 2-3 letter NAPA brand-line code (NSE, SME, MIL, NPP, SOR, BK,
    NCB, NCR, BAL, ATM, NHP, …). DROP this from description — do not
    prepend it; do not include it in part_number.
  • Description — the actual item name. Often ends in empty parens "()"
    or has cross-reference codes like "(220-11,221-2,4)". Strip empty "()".
    Keep meaningful parens; drop noise.
  • Price — LIST price per unit. IGNORE for unit_price.
  • Net  — NET price per unit (what the customer pays). USE for unit_price.
  • Total — qty × Net. Use to validate your unit_price choice.

Sub-rows beneath an item ("Above Item on Sale", "Item on Sale") are
annotations — skip them, they are NOT separate line items.

Worked example — single NAPA row:

  Part Number: 360-1120
  Line:        NSE
  Description: "DISPOSABLE GLOVES ()"
  Quantity:    3.00
  Price:       17.00
  Net:         10.4900
  Total:       31.47
  Taxable:     T

  → description: "DISPOSABLE GLOVES"        (drop "NSE", drop empty "()")
  → part_number: "360-1120"
  → qty: 3
  → unit_price: 10.49                       (Net column, NOT Price)
  → unit: "Each"

  Math check: 3 × 10.49 = 31.47 ✓  matches Total — correct column chosen.

═══════════════════════════════════════════════════════════════════════════
SALES TAX — INCLUDE IT WHEN THE DOCUMENT CHARGES IT
═══════════════════════════════════════════════════════════════════════════

The user's organization is tax-exempt IN STORE, but on ONLINE / e-commerce
orders the exemption can't be applied at checkout, so the card IS charged
sales tax up front (they reclaim it from the vendor afterward). The Purchase
Request must therefore match what the card is actually charged:
  • If the document shows a sales-tax amount being charged ("Sales Tax",
    "Tax", "Estimated Tax", "Tax Estimated Using …", or a tax line in an
    Order Summary), INCLUDE it as a SINGLE line item:
       description: "Sales Tax"
       part_number: null
       qty: 1
       unit: null
       unit_price: the tax dollar amount (a plain number, e.g. 160.81)
  • Emit only ONE sales-tax line per document — the final total tax, never
    per-item tax.
  • If tax is shown as $0 / "TBD" / "included" / "exempt", or is not shown at
    all, do NOT add a tax line — an in-store tax-exempt quote simply won't
    have one.
  • Keep using PRE-tax figures for the products themselves, and still SKIP
    the Subtotal / Total / Grand Total summary rows — the Sales Tax line is
    the only summary-area value that becomes a line item.

═══════════════════════════════════════════════════════════════════════════
RENTAL QUOTE FEES — INCLUDE THEM AS LINE ITEMS
═══════════════════════════════════════════════════════════════════════════

Equipment-rental quotes typically itemize fees alongside the equipment.
INCLUDE these as separate line items on the PR (not as warnings):

  • Loss Damage Waiver / LDW / Damage Waiver (typically 14% of equipment
    subtotal — usually mandatory unless the user provides a Certificate of
    Insurance). Description: "Loss Damage Waiver (NN%)". qty: 1, unit_price:
    the calculated dollar amount that matches the FINAL chosen rental tier.
  • Pickup & Delivery / P/U & DEL / Trip Charge (often a flat per-direction
    fee, qty 2 for round-trip). Already covered in earlier examples — keep
    using qty=2 / unit_price=<one-way fee> when the quote shows "$X each
    way" with a 2x multiplier.
  • Environmental / Fuel / Surcharge fees if itemized as a fixed dollar
    amount on the quote.
  • Optional add-ons (cleaning fee, attachment fee) ONLY when explicitly
    on the line. If the quote says "subject to $90/hr cleaning if not
    returned clean", that's a conditional warning, not a line item.

When LDW is rental-tier-dependent, include it under the chosen tier in the
default items[], AND include LDW in each clarification option's
item_overrides so clicking a different tier updates the LDW too.

Worked example — Burris-style 4-week default:
  Equipment subtotal at 4-week: $3,969.00
  LDW @ 14%: $555.66  →  items: [{ description: "Loss Damage Waiver (14%)",
                                    qty: 1, unit_price: 555.66, unit: "fee" }]
  Then clarifications.options[k].item_overrides should include:
    { match_description: "Loss Damage Waiver", unit_price: <14% of that tier> }

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
  "warnings": string[],
  "clarifications": [
    {
      "question": string,
      "options": [
        {
          "label": string,
          "item_overrides": [
            {
              "match_description": string,
              "unit_price": number,
              "qty": number | null,
              "unit": string | null
            }
          ]
        }
      ] | null,
      "applies_to": string[] | null
    }
  ]
}

CLARIFICATIONS
- Use this array when the quote is genuinely AMBIGUOUS and you had to make a
  choice between multiple valid prices/quantities for the same item. Examples:
    • RENTAL QUOTES with multiple duration tiers ("Day rate / Week rate /
      4-week rate" — you can't know which tier the user wants).
    • Bulk discount tiers ("1-9 units: $5.00, 10+ units: $4.50" — without
      knowing the order qty, you can't pick).
    • Package / service levels ("Standard / Premium / Pro" — same item,
      different prices).
    • Configurations or option packages ("with bagger +$200, mulching kit +$150").
    • Quotes where the line shows BOTH a one-time and recurring price.
    • Any case where two columns COULD plausibly be the unit_price (and the
      math check from earlier doesn't disambiguate).
- DO NOT clarify for:
    • Cases the multi-column-grid rule already handles (Net vs List).
    • Just unclear handwriting/OCR — that's a "warning", not a clarification.
    • Standard items with one price.

- Each clarification has:
    • question: a plain-English question the user can answer in seconds.
    • options: array of choice objects (or null for open-ended). Each option:
        ◦ label: short human-readable choice ("1 Week", "10+ boxes", "with bagger").
                 KEEP IT SHORT — the price impact is captured separately.
        ◦ item_overrides: array of price/qty changes to apply if the user
                 picks this option. Each override:
            · match_description: a SHORT distinctive substring of the
              affected item's description that uniquely identifies it within
              the items[] array (e.g. "Tractor", "Rotary Cutter", "Latex
              Gloves"). The client does a case-insensitive substring match.
            · unit_price: the new per-unit price for this option (always
              required when the price changes).
            · qty: optional; only set if the option implies a qty change.
            · unit: optional; only set if the unit label changes
              ("rental" vs "month").
    • applies_to: array of part numbers or short item names affected, or
      null if global. Used as a label only — the actual matching is done
      via match_description on each override.

- When you DO add a clarification, STILL fill items with your best guess.
  CRITICAL CONSISTENCY RULE: the default items[] MUST be the per-item
  prices for ONE specific option (the one you defaulted to — typically
  the longest rental tier). NEVER put a subtotal, grand total, or summed
  value into a single item's unit_price. Each item gets its own per-unit
  price for the chosen tier:
    • Tractor 4-week: $2,146.50  ← this is the unit_price, NOT $3,969 (sub)
    • Cutter 4-week:  $1,822.50  ← this is the unit_price
  And exactly one of the options' item_overrides MUST match those default
  unit_prices (so toggling that option is a no-op).

Worked examples:

  Burris-style rental quote:
    "Skid Steer Loader  Day: $250  Week: $850  4-Week: $2,400"
    → Pick the 4-week tier as default
    → items: [{ description: "Skid Steer Loader", qty: 1, unit_price: 2400, unit: "rental" }]
    → clarifications: [{
         "question": "Which rental period is this PR for?",
         "options": [
           {
             "label": "1 Day",
             "item_overrides": [
               { "match_description": "Skid Steer", "unit_price": 250 }
             ]
           },
           {
             "label": "1 Week",
             "item_overrides": [
               { "match_description": "Skid Steer", "unit_price": 850 }
             ]
           },
           {
             "label": "4 Weeks",
             "item_overrides": [
               { "match_description": "Skid Steer", "unit_price": 2400 }
             ]
           }
         ],
         "applies_to": ["Skid Steer Loader"]
       }]

  Bulk-discount quote:
    "Latex Gloves Box of 100  1-9 boxes: $12.99  10+ boxes: $10.49"
    → Pick the higher per-unit price (assumes <10 unless qty is shown)
    → items: [{ qty: 1, unit_price: 12.99, ... }]
    → clarifications: [{
         "question": "How many boxes of latex gloves are you ordering?",
         "options": [
           { "label": "1–9 boxes",
             "item_overrides": [{ "match_description": "Latex Gloves", "unit_price": 12.99 }]
           },
           { "label": "10+ boxes",
             "item_overrides": [{ "match_description": "Latex Gloves", "unit_price": 10.49 }]
           }
         ],
         "applies_to": ["Latex Gloves"]
       }]

If the quote is unambiguous, return clarifications: [] (empty array).

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
- Subtotal / Discount / Total / Grand Total summary rows (but DO capture
  Sales Tax as a line item — see the SALES TAX section above)
- Notes, terms, signatures, page numbers
- Availability / lead-time blurbs ("Typically available in 5-10 business days")
- "Save for Later", "Remove", or icon-only buttons

EXTRACT AS LINE ITEMS (do NOT skip these)
- Shipping / Handling / Freight / Delivery charges. The PR total has to
  include them so the superintendent isn't surprised at receiving.
  - description: use exactly "Shipping", "Handling", "Freight", or
    "Delivery" matching what the quote calls it. If the quote just says
    "S&H" or "Shipping & Handling", use "Shipping & Handling".
  - part_number: null
  - qty: 1
  - unit: null
  - unit_price: the charge amount (a single number, not "$10.00" or "10 USD")
  - If the quote shows shipping as TBD/$0/"included", skip it (no row).
  - Only emit one shipping/freight row per quote — pick the one labeled
    as the final/total shipping charge (not per-item shipping).

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
          temperature: 0,
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
