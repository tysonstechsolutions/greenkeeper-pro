/**
 * task-directions — AI work plan for a one-off task / project, grounded in the
 * course's verified-present equipment.
 *
 * Given a task title (plus optional notes / location / category), pulls every
 * asset marked `verified_present` from fy26_assets and asks Claude to write
 * start-to-finish crew directions that only call for equipment we actually
 * have. Returns the directions plus the list of assets it referenced (used to
 * auto-fill the task's equipment list).
 *
 * Auth: requires a signed-in user.
 * Secrets needed: ANTHROPIC_API_KEY
 *
 * Deploy:  supabase functions deploy task-directions
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 45000;

interface AssetRow {
  description: string | null;
  manufacturer: string | null;
  model_text: string | null;
}

/** Pull a JSON object out of a model response that may wrap it in fences/prose. */
function extractJsonObject(text: string): string {
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "GET") {
    const hasKey = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    return jsonResponse({ healthy: hasKey, model: MODEL });
  }

  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return jsonError("AI not configured. Add ANTHROPIC_API_KEY.", 500);

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      description?: unknown;
      category?: unknown;
      location?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category = typeof body.category === "string" ? body.category : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";

    if (!title) return jsonError("title is required", 400);

    // Verified-present equipment only — so the AI can't call for gear we don't
    // have. RLS lets any signed-in user read the asset list.
    const supabase = getUserClient(req);
    const { data: assets, error: assetErr } = await supabase
      .from("fy26_assets")
      .select("description, manufacturer, model_text")
      .eq("status", "verified_present")
      .limit(400);

    if (assetErr) {
      console.error("task_directions_asset_query_failure", assetErr.message);
    }

    const equipmentList = Array.from(
      new Set(
        ((assets ?? []) as AssetRow[])
          .map((a) => {
            const name = (a.description ?? "").trim();
            if (!name) return "";
            const make = [a.manufacturer, a.model_text].filter(Boolean).join(" ").trim();
            return make ? `${name} (${make})` : name;
          })
          .filter(Boolean),
      ),
    );

    const equipmentText = equipmentList.length
      ? equipmentList.map((e) => `- ${e}`).join("\n")
      : "(nothing is currently marked verified & present)";

    const prompt = `You are the assistant superintendent for Veterans Memorial Golf Course at Naval Station Great Lakes, IL (USDA Zone 5b-6a). Write the crew a clear, start-to-finish work plan for the following job at our course.

Job: ${title}
${location ? `Location: ${location}\n` : ""}${description ? `Notes: ${description}\n` : ""}${category ? `Category: ${category}\n` : ""}
Equipment that is currently VERIFIED and PRESENT on our asset list — you may only call for equipment from this list:
${equipmentText}

Write numbered, sequential steps a crew member can follow on a phone. Be specific about technique, sequence, and safety. When a step needs a machine or tool, name the exact item from the list above. If the job genuinely needs a piece of equipment that is NOT on the list, add a step that clearly flags it (for example, "NEEDED — not on our asset list: rent a vibratory plate compactor") so the superintendent can rent or buy it. Do not invent equipment we do not have.

Respond with ONLY a JSON object and nothing else:
{"directions": "<the numbered steps as a single markdown string>", "equipment_used": ["<exact names, copied from the list above, of the assets your plan uses>"]}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1800,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("task_directions_api_failure", {
          status: response.status,
          error: errBody.slice(0, 200),
        });
        return jsonError("AI service error", 502);
      }

      const data = await response.json();
      const content = data?.content?.[0];
      const text = content?.type === "text" ? String(content.text || "").trim() : "";
      if (!text) return jsonError("Empty response from AI", 502);

      // The model is asked for a JSON object; parse it, but degrade gracefully
      // to using the raw text as the directions if it didn't comply.
      let directions = text;
      let equipmentUsed: string[] = [];
      try {
        const parsed = JSON.parse(extractJsonObject(text)) as {
          directions?: unknown;
          equipment_used?: unknown;
        };
        if (typeof parsed.directions === "string" && parsed.directions.trim()) {
          directions = parsed.directions.trim();
        }
        if (Array.isArray(parsed.equipment_used)) {
          equipmentUsed = parsed.equipment_used
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim());
        }
      } catch {
        // Not valid JSON — keep the raw text as directions.
      }

      return jsonResponse({ directions, equipment_used: equipmentUsed });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("task directions generation error:", err);
    return jsonError("Failed to generate directions", 500);
  }
});
