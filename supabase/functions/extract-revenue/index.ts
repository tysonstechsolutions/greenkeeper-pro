/**
 * extract-revenue — Claude vision endpoint that transcribes a POS / register
 * report (RecTrac/GolfTrac end-of-day, GolfNow summary, cash-register Z tape,
 * or a plain photo/screenshot of any sales report) into categorized revenue
 * lines for the app's revenue log.
 *
 * TRANSCRIBE-ONLY: the model copies numbers that are printed on the report.
 * The client shows every extracted line for human review before anything is
 * saved (verify-then-commit) — this endpoint never writes to the database.
 *
 * Auth: signed-in user. Secrets: ANTHROPIC_API_KEY (+ optional ANTHROPIC_MODEL).
 *
 * Deploy:  supabase functions deploy extract-revenue
 *
 * Request body (multipart/form-data OR application/json):
 *   form-data:  field "file" (image/* or application/pdf) — preferred
 *   json:       { image_base64: string, media_type: "image/jpeg" | ... }
 *
 * Response:
 *   { report_date, period_start, period_end,
 *     lines: [ { category, label, amount, rounds_count } ],
 *     report_total, warnings: string[] }
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
// Long multi-department reports can run past 3k output tokens; 4096 matches
// extract-quote. stop_reason is checked below so truncation is never silent.
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `You transcribe golf-course sales/revenue reports into structured JSON.

The user photographs or uploads WHATEVER their point-of-sale produces:
  • RecTrac / GolfTrac end-of-day or period revenue reports (department totals)
  • GolfNow / tee-sheet revenue summaries
  • Cash register Z/X tapes
  • Spreadsheet screenshots or hand-written daily sheets

ABSOLUTE RULE — TRANSCRIBE ONLY. Copy numbers exactly as printed. Never
compute, estimate, or invent a figure. If a value is unreadable, leave it
out and add a warning. A human reviews every line before anything is saved.

Map each revenue line on the report to ONE of these categories:
  greens_fees    — green fees, daily play, 9/18-hole fees, member play
  cart_rentals   — cart/club/trolley/rental fees ("CART", "CLUB RENTAL")
  driving_range  — range balls, range program ("RANGE")
  pro_shop       — merchandise/retail/resale ("MERCH", "RETAIL", "GOLF MDSE")
  food_beverage  — restaurant/snack bar/beverage/concessions ("F&B", "SNACK")
  events         — tournaments, outings, party/room rentals, league fees
  memberships    — membership/annual pass/punch card sales
  other          — anything that doesn't fit (deposits, tax collected,
                   gift cards, over/short). Keep the report's own wording
                   in "label" so the human can re-categorize.

For each line output:
  category      — one of the 8 keys above
  label         — the report's OWN wording for the line ("GREEN FEES 18 HOLE",
                  "DEPT 40 - MERCHANDISE"), verbatim
  amount        — the dollar amount as a plain number (strip $ and commas).
                  Use the line's NET/total revenue column if several money
                  columns exist (gross vs net: prefer the column that sums to
                  the report's printed grand total).
  rounds_count  — ONLY for greens-fee lines that print a round/player count;
                  otherwise null

DATES:
  report_date   — if the report covers a single day (YYYY-MM-DD), else null
  period_start / period_end — for multi-day reports (YYYY-MM-DD), else null
  If no date is printed anywhere, leave all three null and add a warning.

report_total — the report's printed grand total if one is shown, else null.
  Do NOT compute one yourself.

VALIDATION: if your transcribed lines obviously don't sum to the printed
grand total (off by more than a dollar), add a warning saying so — do NOT
adjust any number to force agreement.

SKIP: payment-method breakdowns (cash/check/credit tender totals), voids,
page headers/footers, signatures. Tax: if the report prints a separate
"tax collected" line, include it as category "other", label as printed,
with a warning that it may not belong in revenue.

Output ONLY valid JSON in this exact shape — no commentary, no markdown fences:

{
  "report_date": "YYYY-MM-DD" | null,
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "lines": [
    { "category": string, "label": string, "amount": number, "rounds_count": number | null }
  ],
  "report_total": number | null,
  "warnings": string[]
}

If the document has no readable revenue lines, return:
  { "report_date": null, "period_start": null, "period_end": null,
    "lines": [], "report_total": null, "warnings": ["no revenue lines found"] }`;

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
  if (req.method === "GET") {
    return jsonResponse({ healthy: Boolean(Deno.env.get("ANTHROPIC_API_KEY")), model: MODEL });
  }
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
                  text: "Transcribe the revenue lines from this sales report.",
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
      console.error("[extract-revenue] Anthropic error:", claudeResp.status, text);
      return jsonError(`Anthropic API error (${claudeResp.status})`, 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";

    // A max_tokens stop means the JSON was cut off mid-stream — tell the
    // user the real reason instead of blaming their photo.
    if (data.stop_reason === "max_tokens") {
      return jsonResponse({
        report_date: null,
        period_start: null,
        period_end: null,
        lines: [],
        report_total: null,
        warnings: [
          "The report is too long to read in one pass — upload it a page at a time.",
        ],
      });
    }

    const parsed = parseJsonReply(reply);
    if (!parsed) {
      return jsonResponse({
        report_date: null,
        period_start: null,
        period_end: null,
        lines: [],
        report_total: null,
        warnings: ["Couldn't parse model output as JSON. Try a clearer photo."],
      });
    }

    return jsonResponse(normalizeExtraction(parsed));
  } catch (err) {
    console.error("[extract-revenue] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (same as extract-quote)
// ──────────────────────────────────────────────────────────────────────────────

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Coerce the model's parsed JSON into the exact response contract so shape
 * drift can never crash the client or silently drop lines: every line keeps
 * a string label + finite amount, everything else degrades to null + a
 * warning rather than disappearing.
 */
function normalizeExtraction(raw: unknown): {
  report_date: string | null;
  period_start: string | null;
  period_end: string | null;
  lines: { category: string; label: string; amount: number; rounds_count: number | null }[];
  report_total: number | null;
  warnings: string[];
} {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ymd = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string")
    : [];

  const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
  const lines: { category: string; label: string; amount: number; rounds_count: number | null }[] = [];
  let dropped = 0;
  for (const l of rawLines) {
    const line = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    const amount = num(line.amount);
    if (amount === null) {
      dropped++;
      continue;
    }
    lines.push({
      category: typeof line.category === "string" ? line.category : "other",
      label: typeof line.label === "string" ? line.label : "",
      amount,
      rounds_count: num(line.rounds_count),
    });
  }
  if (dropped > 0) {
    warnings.push(`${dropped} line(s) had no readable amount and were skipped.`);
  }

  return {
    report_date: ymd(obj.report_date),
    period_start: ymd(obj.period_start),
    period_end: ymd(obj.period_end),
    lines,
    report_total: num(obj.report_total),
    warnings,
  };
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
