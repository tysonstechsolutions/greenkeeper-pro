/**
 * extract-staff-doc — Claude vision endpoint that reads an employee's
 * onboarding/HR document (offer letter, application, ID, I-9/W-4, a phone
 * photo or PDF) into the basic fields needed to pre-fill a staff profile.
 *
 * The user always reviews + confirms before anything is saved, and can type
 * the fields by hand if the AI is unavailable (manual fallback on the client).
 *
 * Auth: signed-in user. Secret: ANTHROPIC_API_KEY (shared with the other AI fns).
 * Deploy:  supabase functions deploy extract-staff-doc
 *
 * Request (application/json): { image_base64: string, media_type: string }
 *          (multipart/form-data): field "file"
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 60_000;

const EXTRACTION_PROMPT = `You read an employee's onboarding or HR document (offer letter, job application, driver's license/ID, I-9/W-4, or similar — it may be a clean PDF or a phone photo/scan) and return the person's basic information as JSON so it can pre-fill a golf-course staff profile.

Only transcribe what is clearly written on the document. Never invent or guess a value — if a field is not present, return null. The user will review everything before saving.

Return ONLY valid JSON (no markdown fences, no commentary), in EXACTLY this shape:

{
  "full_name": string | null,
  "phone": string | null,
  "email": string | null,
  "address": string | null,
  "hire_date": string | null,
  "emergency_contact": { "name": string | null, "phone": string | null, "relationship": string | null } | null,
  "warnings": string[]
}

Rules:
  • full_name — the employee's full name.
  • phone / email — the employee's own contact info (not the employer's).
  • address — home/mailing address as one line, if present.
  • hire_date — any hire/start/employment date, converted to ISO "YYYY-MM-DD". null if absent.
  • emergency_contact — only if the document lists one; otherwise null.
  • If the document is clearly NOT about a person (e.g. an invoice, a quote), return all fields null and add a warning saying what it looks like.
  • Add one short warning per low-confidence read; empty array if all clear.`;

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

    let imageBase64: string | null = null;
    let mediaType: string | null = null;

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("Missing 'file' field in form-data", 400);
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

    if (!imageBase64 || !mediaType) return jsonError("Missing image data or media_type", 400);

    const isPdf = mediaType === "application/pdf";
    const allowedImage = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!isPdf && !allowedImage.includes(mediaType)) {
      return jsonError(
        `Unsupported file type: ${mediaType}. Use JPEG, PNG, GIF, WebP, or PDF.`,
        400,
      );
    }

    const userBlock = isPdf
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: imageBase64 },
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data: imageBase64 },
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
                { type: "text", text: "Read this employee document into the JSON shape." },
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
      console.error("[extract-staff-doc] Anthropic error:", claudeResp.status, text);
      return jsonError(`Anthropic API error (${claudeResp.status})`, 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";
    const parsed = parseJsonReply(reply);
    if (!parsed) {
      return jsonResponse({
        full_name: null,
        phone: null,
        email: null,
        address: null,
        hire_date: null,
        emergency_contact: null,
        warnings: ["Couldn't read the document. Enter the details by hand."],
      });
    }
    return jsonResponse(parsed);
  } catch (err) {
    console.error("[extract-staff-doc] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(message, 500);
  }
});

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
