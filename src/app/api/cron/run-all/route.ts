import { NextRequest, NextResponse } from "next/server";
import { validateCronRequest } from "@/lib/cron-auth";

/**
 * GET /api/cron/run-all
 *
 * Convenience endpoint that sequentially triggers every cron job and returns
 * combined results.  Useful for a single Vercel / external cron entry or for
 * manually kicking off all automations from one URL.
 *
 * Protected via the shared `validateCronRequest` helper.
 */
export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Build base URL from the incoming request so it works in any environment
  const { origin } = new URL(request.url);
  const cronSecret = request.headers.get("x-cron-secret");
  const headers: HeadersInit = {};
  if (cronSecret) {
    headers["x-cron-secret"] = cronSecret;
  }

  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  // ── Equipment alerts ───────────────────────────────────────────────
  try {
    const eqRes = await fetch(`${origin}/api/cron/equipment-alerts`, { headers });
    results.equipmentAlerts = await eqRes.json();
  } catch (err) {
    errors.equipmentAlerts =
      err instanceof Error ? err.message : "Unknown error";
  }

  // ── Weather automation ─────────────────────────────────────────────
  try {
    const wxRes = await fetch(`${origin}/api/cron/weather-automation`, { headers });
    results.weatherAutomation = await wxRes.json();
  } catch (err) {
    errors.weatherAutomation =
      err instanceof Error ? err.message : "Unknown error";
  }

  return NextResponse.json({
    message: "All cron jobs executed",
    results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  });
}
