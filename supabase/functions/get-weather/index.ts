/**
 * get-weather — Deno edge function that proxies WeatherAPI.com.
 *
 * Why proxy instead of calling WeatherAPI directly from the browser?
 *   1. The Capacitor build is fully static (next.config.ts has output:"export"),
 *      so any "server" must live as a Supabase Edge Function.
 *   2. Calling WeatherAPI from the browser exposes the API key in the bundle.
 *   3. Browser-side calls to third-party domains are unreliable — extensions,
 *      privacy/ad blockers, and corporate networks frequently block them with
 *      a generic "TypeError: Failed to fetch" that the app can't recover from.
 *
 * Returns the raw WeatherAPI forecast.json payload so existing client code
 * (useWeather.ts, weather utils) can transform it without changes.
 *
 * Auth: requires a signed-in user.
 * Secrets needed: WEATHER_API_KEY (or legacy NEXT_PUBLIC_WEATHER_API_KEY)
 *
 * Deploy:  supabase functions deploy get-weather
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const WEATHER_API_BASE = "https://api.weatherapi.com/v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — current conditions move slowly

// Inlined from src/lib/constants.ts (Veterans Memorial GC, Great Lakes, IL).
const COURSE = { lat: 42.3095, lng: -87.8475 };

interface CacheKey {
  days: number;
  alerts: "yes" | "no";
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

// Per-isolate cache keyed by `${days}|${alerts}`.
const cache = new Map<string, CacheEntry>();

function cacheKey(k: CacheKey): string {
  return `${k.days}|${k.alerts}`;
}

interface RequestPayload {
  query?: Record<string, string | number | boolean | undefined>;
  days?: number | string;
  alerts?: "yes" | "no" | string;
}

async function readPayload(req: Request): Promise<RequestPayload> {
  if (req.method === "GET") {
    const url = new URL(req.url);
    return {
      query: Object.fromEntries(url.searchParams.entries()),
    };
  }
  try {
    const body = await req.json();
    return (body ?? {}) as RequestPayload;
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const payload = await readPayload(req);
    const queryBag = payload.query ?? {};

    const rawDays = payload.days ?? queryBag.days ?? 1;
    const parsedDays = typeof rawDays === "number"
      ? rawDays
      : parseInt(String(rawDays), 10);
    const days = Math.min(
      Math.max(Number.isFinite(parsedDays) ? parsedDays : 1, 1),
      14,
    );

    const rawAlerts = payload.alerts ?? queryBag.alerts ?? "no";
    const alerts: "yes" | "no" = String(rawAlerts) === "yes" ? "yes" : "no";

    const key = cacheKey({ days, alerts });
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return jsonResponse(cached.data);
    }

    const apiKey = Deno.env.get("WEATHER_API_KEY") ??
      Deno.env.get("NEXT_PUBLIC_WEATHER_API_KEY");
    if (!apiKey) {
      return jsonError("Weather API key not configured", 500);
    }

    const upstreamUrl =
      `${WEATHER_API_BASE}/forecast.json?key=${encodeURIComponent(apiKey)}` +
      `&q=${COURSE.lat},${COURSE.lng}&days=${days}&aqi=no&alerts=${alerts}`;

    const upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("WeatherAPI upstream failed:", upstream.status, detail);
      return jsonError(
        `Weather API error: ${upstream.status}`,
        upstream.status >= 500 ? 502 : upstream.status,
      );
    }

    const data = await upstream.json();
    cache.set(key, { data, timestamp: Date.now() });
    return jsonResponse(data);
  } catch (err) {
    console.error("get-weather error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch weather";
    return jsonError(message, 502);
  }
});
