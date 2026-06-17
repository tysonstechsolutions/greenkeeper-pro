/**
 * green-fix-instructions — Deno edge function port of /api/green-fix-instructions.
 *
 * Generates step-by-step fix instructions for a putting-green observation,
 * tailored to bentgrass greens at low height of cut.
 *
 * Auth: requires a signed-in user.
 * Secrets needed: ANTHROPIC_API_KEY
 *
 * Deploy:  supabase functions deploy green-fix-instructions
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser } from "../_shared/supabase.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 30000;

// Inlined from src/lib/green-constants.ts so this function has no app deps.
const greenIssueTypeLabels: Record<string, string> = {
  fungus_disease: "Fungus / Disease",
  dry_spot: "Dry Spot",
  wet_area: "Wet Area",
  bare_spot: "Bare Spot",
  weed_pressure: "Weed Pressure",
  pest_damage: "Pest Damage",
  mechanical_damage: "Mechanical Damage",
  irrigation_issue: "Irrigation Issue",
  algae: "Algae",
  frost_damage: "Frost Damage",
  ball_marks: "Ball Marks",
  scalping: "Scalping",
  compaction: "Compaction",
  thatch_buildup: "Thatch Buildup",
  aeration_needed: "Aeration Needed",
  topdressing_needed: "Topdressing Needed",
  moss: "Moss",
  shade_stress: "Shade Stress",
  traffic_wear: "Traffic Wear",
  chemical_burn: "Chemical Burn",
  poor_drainage: "Poor Drainage",
  uneven_surface: "Uneven Surface",
  other: "Other",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "GET") {
    const hasKey = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    return jsonResponse({ healthy: hasKey, model: MODEL });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonError("AI not configured. Add ANTHROPIC_API_KEY.", 500);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      issue_type?: unknown;
      priority?: unknown;
      description?: unknown;
      hole_number?: unknown;
    };

    const title = typeof body.title === "string" ? body.title : "";
    const issue_type = typeof body.issue_type === "string" ? body.issue_type : "";
    const priority = typeof body.priority === "string" ? body.priority : "normal";
    const description = typeof body.description === "string" ? body.description : "";
    const hole_number = typeof body.hole_number === "number" || typeof body.hole_number === "string"
      ? String(body.hole_number)
      : "?";

    if (!title || !issue_type) {
      return jsonError("title and issue_type are required", 400);
    }

    const issueLabel = greenIssueTypeLabels[issue_type] || issue_type;

    const prompt = `You are the putting green specialist for Veterans Memorial Golf Course at Naval Station Great Lakes, IL (USDA Zone 5b-6a). The greens are Creeping Bentgrass (Penncross/A-4 blend) maintained at a height of cut between 0.110" - 0.135".

A ${priority} priority issue has been reported on Green #${hole_number}:
- Issue: ${title}
- Type: ${issueLabel}
${description ? `- Details: ${description}` : ""}
- Current date: ${new Date().toLocaleDateString()}

Write clear, step-by-step fix instructions that a crew member can follow. Be specific about:
1. What products/chemicals to use (with application rates per 1000 sq ft if applicable)
2. Equipment needed (walk mowers, aerators, topdresser, etc.)
3. Step-by-step process specific to putting green maintenance
4. Timeline/frequency of treatment
5. What to monitor after treatment (green speed, moisture levels, color)
6. Any areas to rope off or mark for golfer traffic management

Keep it practical and concise — this will be read on a phone screen. Use numbered steps. Don't include a title or header, just the instructions.`;

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
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("green_fix_instructions_api_failure", {
          status: response.status,
          error: errBody,
        });
        return jsonError("AI service error", 502);
      }

      const data = await response.json();
      const content = data?.content?.[0];
      const text = content?.type === "text" ? String(content.text || "").trim() : "";

      if (!text) return jsonError("Empty response from AI", 502);

      return jsonResponse({ fix_instructions: text });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Green fix instructions generation error:", err);
    return jsonError("Failed to generate fix instructions", 500);
  }
});
