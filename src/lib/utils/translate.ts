/**
 * Client-side translation helper.
 *
 * Calls the server-side `/api/translate` route which checks a DB cache and
 * falls back to Claude Haiku. This module must NEVER import or reference the
 * Anthropic API key — that stays server-side.
 *
 * Failure policy: callers wrap this in try/catch and treat failures as
 * "no translation available". The write (task/message/observation insert)
 * should still succeed even if translation fails.
 *
 * In-memory cache: for the duration of a single tab/session, repeat calls
 * for the same (text, from, to) tuple are served from a Map. This reduces
 * latency for repeat writes like "Mow greens" that supers type constantly.
 */

export type TranslateLocale = "en" | "es";

interface TranslateArgs {
  text: string;
  from: TranslateLocale;
  to: TranslateLocale;
}

const memCache = new Map<string, string>();

function memKey({ text, from, to }: TranslateArgs): string {
  return `${from}|${to}|${text}`;
}

export async function translate(args: TranslateArgs): Promise<string> {
  const { text, from, to } = args;
  if (!text || !text.trim()) return text;
  if (from === to) return text;

  const cacheKey = memKey(args);
  const hit = memCache.get(cacheKey);
  if (hit !== undefined) return hit;

  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, from, to }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Translate failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { translated?: string };
  const translated = data.translated || "";
  if (translated) {
    memCache.set(cacheKey, translated);
  }
  return translated;
}

/**
 * Convenience wrapper that never throws — returns null on failure. Use this
 * from hooks where translation is a "nice to have" and must not block the
 * primary write.
 */
export async function translateSafe(
  args: TranslateArgs
): Promise<string | null> {
  try {
    const out = await translate(args);
    return out || null;
  } catch (err) {
    console.error("Translation failed (non-blocking):", err);
    return null;
  }
}
