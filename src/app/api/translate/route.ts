import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";

// POST /api/translate
// Body: { text: string, from: 'en' | 'es', to: 'en' | 'es' }
// Returns: { translated: string }
//
// Cache-first: looks up sha256(text||from||to) in translation_cache before
// hitting Claude. Stores successful translations in the cache. Uses Claude
// Haiku via the same fetch pattern as analyze-observation-photo.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_INPUT_LENGTH = 2000;
const REQUEST_TIMEOUT_MS = 20000;

type Locale = "en" | "es";

function isValidLocale(v: unknown): v is Locale {
  return v === "en" || v === "es";
}

function hashKey(text: string, from: Locale, to: Locale): string {
  return createHash("sha256").update(`${text}||${from}||${to}`).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      from?: unknown;
      to?: unknown;
    };

    const text = typeof body.text === "string" ? body.text : "";
    const from = body.from;
    const to = body.to;

    if (!isValidLocale(from) || !isValidLocale(to)) {
      return NextResponse.json(
        { error: "from/to must be 'en' or 'es'" },
        { status: 400 }
      );
    }

    // Empty / whitespace — nothing to translate. Skip the round-trip.
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ translated: text });
    }

    // Same source and target — echo.
    if (from === to) {
      return NextResponse.json({ translated: text });
    }

    if (text.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        { error: `Text exceeds ${MAX_INPUT_LENGTH} characters` },
        { status: 413 }
      );
    }

    const keyHash = hashKey(text, from, to);

    // Cache lookup
    try {
      const { data: cached } = await supabase
        .from("translation_cache")
        .select("target_text")
        .eq("key_hash", keyHash)
        .maybeSingle();
      if (cached && typeof (cached as { target_text?: unknown }).target_text === "string") {
        return NextResponse.json({
          translated: (cached as { target_text: string }).target_text,
          cached: true,
        });
      }
    } catch (cacheErr) {
      // Cache read failures shouldn't block a translation — log and continue.
      console.error("translation_cache read failed:", cacheErr);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Translation not configured" },
        { status: 500 }
      );
    }

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
        console.error("Claude translate error:", response.status, errBody);
        return NextResponse.json(
          { error: "Translation service error" },
          { status: 502 }
        );
      }

      const data = await response.json();
      const content = data?.content?.[0];
      translated = content?.type === "text" ? (content.text as string) : "";
      translated = (translated || "").trim();
    } finally {
      clearTimeout(timeout);
    }

    if (!translated) {
      return NextResponse.json(
        { error: "Empty translation" },
        { status: 502 }
      );
    }

    // Cache write (best-effort)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("translation_cache").insert({
        key_hash: keyHash,
        source_lang: from,
        target_lang: to,
        source_text: text,
        target_text: translated,
      });
    } catch (writeErr) {
      console.error("translation_cache write failed:", writeErr);
    }

    return NextResponse.json({ translated });
  } catch (err) {
    console.error("Translate route error:", err);
    return NextResponse.json(
      { error: "Failed to translate" },
      { status: 500 }
    );
  }
}
