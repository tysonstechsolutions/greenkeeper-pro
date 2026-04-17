/**
 * translate — Deno edge function port of /api/translate.
 *
 * Cache-first Claude call that translates short workplace notes between
 * English and Spanish. Input is hashed and stored in translation_cache so
 * repeat strings (common task templates, etc.) never hit Anthropic twice.
 *
 * Auth: requires a signed-in user. Returns 401 otherwise.
 * Secrets needed: ANTHROPIC_API_KEY
 *
 * Deploy:  supabase functions deploy translate
 * Local:   supabase functions serve translate
 */
import { corsHeaders, handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_INPUT_LENGTH = 2000;
const REQUEST_TIMEOUT_MS = 20000;

type Locale = "en" | "es";

function isValidLocale(v: unknown): v is Locale {
  return v === "en" || v === "es";
}

/** sha256(text||from||to) as a hex string. Web Crypto in Deno. */
async function hashKey(
  text: string,
  from: Locale,
  to: Locale,
): Promise<string> {
  const data = new TextEncoder().encode(`${text}||${from}||${to}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  // Health check
  if (req.method === "GET") {
    const hasKey = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    return jsonResponse({ healthy: hasKey, model: ANTHROPIC_MODEL });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      from?: unknown;
      to?: unknown;
    };

    const text = typeof body.text === "string" ? body.text : "";
    const from = body.from;
    const to = body.to;

    if (!isValidLocale(from) || !isValidLocale(to)) {
      return jsonError("from/to must be 'en' or 'es'", 400);
    }
    if (!text || text.trim().length === 0) {
      return jsonResponse({ translated: text });
    }
    if (from === to) {
      return jsonResponse({ translated: text });
    }
    if (text.length > MAX_INPUT_LENGTH) {
      return jsonError(`Text exceeds ${MAX_INPUT_LENGTH} characters`, 413);
    }

    const keyHash = await hashKey(text, from, to);
    const supabase = getUserClient(req);

    // Cache lookup — failures are non-fatal (still translate, just slower)
    try {
      const { data: cached } = await supabase
        .from("translation_cache")
        .select("target_text")
        .eq("key_hash", keyHash)
        .maybeSingle();
      if (cached?.target_text && typeof cached.target_text === "string") {
        return jsonResponse({ translated: cached.target_text, cached: true });
      }
    } catch (cacheErr) {
      console.error("translation_cache read failed:", cacheErr);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return jsonError("Translation not configured", 500);

    const sourceName = from === "en" ? "English" : "Spanish";
    const targetName = to === "es" ? "Spanish" : "English";
    const prompt = `Translate the following ${sourceName} text into ${targetName}. This is a short workplace note for a golf course grounds crew — preserve meaning, use clear simple language, and keep any numbers, units, or proper nouns unchanged. Respond with ONLY the translation, no quotes, no preamble, no explanation.

Text:
${text}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let translated = "";
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("translate_api_failure", {
          status: response.status,
          from,
          to,
          text_len: text.length,
          error: errBody,
        });
        return jsonError("Translation service error", 502);
      }

      const data = await response.json();
      const content = data?.content?.[0];
      translated =
        content?.type === "text" ? String(content.text || "").trim() : "";
    } catch (err) {
      console.error("translate_api_failure", {
        error: err instanceof Error ? err.message : String(err),
      });
      return jsonError("Translation service error", 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!translated) return jsonError("Empty translation", 502);

    // Cache write — best-effort
    try {
      await supabase.from("translation_cache").insert({
        key_hash: keyHash,
        source_lang: from,
        target_lang: to,
        source_text: text,
        target_text: translated,
      });
    } catch (writeErr) {
      console.error("translation_cache write failed:", writeErr);
    }

    return jsonResponse({ translated });
  } catch (err) {
    console.error("Translate function error:", err);
    return jsonError("Failed to translate", 500);
  }

  // Silence lint - CORS headers are returned via helpers
  void corsHeaders;
});
