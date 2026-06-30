/**
 * bulk-tasks — Claude endpoint that turns a to-do list into structured tasks
 * for My Day. The list can be a PHOTO/scan of handwriting, a PDF, or pasted
 * text (e.g. dumped from a spreadsheet). Returns { tasks: [{title, deadline,
 * detail}] }; the My Day client reviews them before adding, and falls back to a
 * plain line-split parser for text if this isn't deployed.
 *
 * Auth: signed-in user. Secret: ANTHROPIC_API_KEY (shared with the other AI fns).
 * Deploy:  supabase functions deploy bulk-tasks
 *
 * Request (application/json): { image_base64?, media_type?, text?, today? }
 *          (multipart/form-data): field "file" (+ optional "today")
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;
const MAX_TEXT_LENGTH = 12_000;

const EXTRACTION_PROMPT = `You read a to-do / task list and return the tasks as JSON. The input may be a photo or scan of a HANDWRITTEN or printed list, a PDF, or pasted text (possibly copied from a spreadsheet).

Transcribe each distinct task as its own item. Keep titles short and actionable (a few words). Only include a deadline when one is clearly written next to a task — convert it to ISO "YYYY-MM-DD". If a relative date is given (e.g. "Friday", "next week", "by the 15th"), resolve it against the provided current date. Never invent tasks or deadlines; if a line isn't a task (a header, a note), skip it.

Return ONLY valid JSON (no markdown fences, no commentary), in EXACTLY this shape:

{
  "tasks": [
    { "title": string, "deadline": "YYYY-MM-DD" | null, "detail": string | null }
  ]
}`;

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicMessageResponse {
  content: AnthropicTextBlock[];
  stop_reason: string;
}

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

// deno-lint-ignore no-explicit-any
function cleanTasks(parsed: any): { title: string; deadline: string | null; detail: string | null }[] {
  const arr = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  const out: { title: string; deadline: string | null; detail: string | null }[] = [];
  for (const t of arr) {
    const title = typeof t?.title === "string" ? t.title.trim() : "";
    if (!title) continue;
    const deadline =
      typeof t?.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline)
        ? t.deadline
        : null;
    const detail = typeof t?.detail === "string" && t.detail.trim() ? t.detail.trim() : null;
    out.push({ title: title.slice(0, 300), deadline, detail });
    if (out.length >= 100) break;
  }
  return out;
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
    if (!ANTHROPIC_API_KEY) return jsonError("ANTHROPIC_API_KEY not configured", 500);

    let imageBase64: string | null = null;
    let mediaType: string | null = null;
    let text = "";
    let today = "";

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        mediaType = file.type;
        imageBase64 = base64Encode(new Uint8Array(await file.arrayBuffer()));
      }
      today = (form.get("today") as string) || "";
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        image_base64?: unknown;
        media_type?: unknown;
        text?: unknown;
        today?: unknown;
      };
      imageBase64 = typeof body.image_base64 === "string" ? body.image_base64 : null;
      mediaType = typeof body.media_type === "string" ? body.media_type : null;
      text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT_LENGTH) : "";
      today = typeof body.today === "string" ? body.today : "";
    }

    const dateLine = `Current date: ${today || new Date().toISOString().slice(0, 10)}.`;

    // deno-lint-ignore no-explicit-any
    let content: any;
    if (imageBase64) {
      const isPdf = mediaType === "application/pdf";
      const allowedImage = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!isPdf && !(mediaType && allowedImage.includes(mediaType))) {
        return jsonError(`Unsupported file type: ${mediaType}. Use JPEG, PNG, GIF, WebP, or PDF.`, 400);
      }
      const block = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
        : { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } };
      content = [block, { type: "text", text: `${dateLine} Read this to-do list into the JSON shape.` }];
    } else if (text.trim()) {
      content = `${dateLine} Extract the tasks from this list into the JSON shape:\n\n${text}`;
    } else {
      return jsonError("Provide an image or text to read.", 400);
    }

    const isPdf = mediaType === "application/pdf";
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
          messages: [{ role: "user", content }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error(`Claude API error ${claudeResp.status}:`, errText);
      return jsonError("Couldn't read the list right now. Try again.", 502);
    }

    const data = (await claudeResp.json()) as AnthropicMessageResponse;
    const reply = data.content?.find((c) => c.type === "text")?.text || "";
    const parsed = parseJsonReply(reply);
    return jsonResponse({ tasks: cleanTasks(parsed) });
  } catch (err) {
    console.error("bulk-tasks error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
