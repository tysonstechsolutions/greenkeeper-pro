import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import { issueTypeLabels } from "@/lib/hole-constants";
import type { GreenIssueType, HoleIssueType } from "@/types/database";

export const maxDuration = 60;

// Fetch current weather from WeatherAPI
async function fetchWeather(): Promise<string> {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) return "Weather data unavailable";

    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=North Chicago,IL&days=7&aqi=no`,
      { next: { revalidate: 1800 } }
    );

    if (!response.ok) return "Weather data unavailable";

    const data = await response.json();
    const current = data.current;
    const forecast = data.forecast?.forecastday || [];

    let weatherStr = `Current: ${current.temp_f}°F, ${current.condition.text}, `;
    weatherStr += `Humidity: ${current.humidity}%, Wind: ${current.wind_mph} mph ${current.wind_dir}, `;
    weatherStr += `Precip: ${current.precip_in}" today. `;
    weatherStr += "7-day forecast: ";
    forecast.forEach(
      (day: {
        date: string;
        day: {
          maxtemp_f: number;
          mintemp_f: number;
          daily_chance_of_rain: number;
          maxwind_mph: number;
          condition: { text: string };
        };
      }) => {
        weatherStr += `${day.date}: High ${day.day.maxtemp_f}°F/Low ${day.day.mintemp_f}°F, `;
        weatherStr += `${day.day.condition.text}, ${day.day.daily_chance_of_rain}% rain, `;
        weatherStr += `Wind up to ${day.day.maxwind_mph} mph. `;
      }
    );
    return weatherStr;
  } catch {
    return "Weather data unavailable";
  }
}

// Fetch chemical inventory
async function fetchInventory(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: products, error } = await supabase
      .from("chemical_products")
      .select(
        "product_name, product_type, current_inventory, unit_of_measure, active_ingredient"
      )
      .not("current_inventory", "is", null)
      .gt("current_inventory", 0)
      .order("product_type")
      .order("product_name");

    if (error || !products || products.length === 0) return "No inventory data available";

    let str = "Available products: ";
    (
      products as Array<{
        product_name: string;
        product_type: string | null;
        current_inventory: number | null;
        unit_of_measure: string | null;
        active_ingredient: string | null;
      }>
    ).forEach((p) => {
      str += `${p.product_name} (${p.active_ingredient || p.product_type || "unknown"}) - ${p.current_inventory} ${p.unit_of_measure || "units"} in stock; `;
    });
    return str;
  } catch {
    return "Inventory data unavailable";
  }
}

// POST /api/analyze-and-diagnose
// Combined: identifies issue from photo + generates full diagnosis with treatment plan
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Add ANTHROPIC_API_KEY." },
      { status: 500 }
    );
  }

  try {
    const { image_base64, context, hole_number } = await req.json();

    if (!image_base64) {
      return NextResponse.json({ error: "image_base64 is required" }, { status: 400 });
    }

    const isGreen = context === "green";
    const issueTypes = isGreen ? greenIssueTypeLabels : issueTypeLabels;
    const issueTypeList = Object.entries(issueTypes)
      .map(([key, label]) => `- "${key}": ${label}`)
      .join("\n");

    const surfaceType = isGreen
      ? "putting green (Creeping Bentgrass, Penncross/A-4 blend, HOC 0.110\"-0.135\")"
      : "fairway/tee/rough area (Kentucky Bluegrass / Perennial Ryegrass blend)";

    // Fetch weather and inventory in parallel
    const [weatherData, inventoryData] = await Promise.all([
      fetchWeather(),
      fetchInventory(),
    ]);

    const systemPrompt = `You are an expert golf course superintendent and agronomist at Veterans Memorial Golf Course, Naval Station Great Lakes, North Chicago, IL (USDA Zone 5b-6a).

Course details:
- Greens: Creeping Bentgrass (Penncross/A-4 blend), HOC 0.110"-0.135"
- Tees: Bentgrass or Bluegrass/Rye blend
- Fairways: Kentucky Bluegrass / Perennial Ryegrass
- Rough: Kentucky Bluegrass / Tall Fescue
- Soil: Clay-loam native, sand-based greens

Current weather: ${weatherData}

Available chemical inventory: ${inventoryData}

You are analyzing a photo of a ${surfaceType} on ${isGreen ? "Green" : "Hole"} #${hole_number || "?"}.

Respond ONLY with valid JSON matching this EXACT structure:
{
  "identification": {
    "title": "Short 5-10 word issue title",
    "description": "2-4 sentence description of what you observe",
    "issue_type": "one of the valid issue types listed below"
  },
  "diagnosis": {
    "condition": "Disease/issue name",
    "scientific_name": "If applicable",
    "confidence": "high|medium|low",
    "confidence_reason": "Why this confidence level",
    "severity": 1-5,
    "severity_label": "Cosmetic|Minor|Moderate|Severe|Critical",
    "category": "turf_disease|turf_insect|turf_weed|turf_nutrient|turf_abiotic|turf_mechanical|tree|equipment|infrastructure|other",
    "description": "Detailed technical description",
    "differential": ["Other possible conditions"]
  },
  "treatment": {
    "immediate_actions": ["Step 1...", "Step 2..."],
    "products": [{
      "name": "Product brand name",
      "active_ingredient": "Chemical name",
      "type": "fungicide|herbicide|insecticide|fertilizer|other",
      "application_rate": "X oz per 1,000 sq ft",
      "rate_per_acre": "X oz per acre",
      "water_volume": "X gallons per 1,000 sq ft",
      "method": "spray|granular|injection|drench",
      "timing": "When to apply",
      "rei_hours": number,
      "precautions": ["Safety notes"],
      "in_inventory": boolean,
      "alternative_products": ["If primary not available"]
    }],
    "application_window": {
      "best_date": "Based on weather forecast",
      "best_time": "Early morning before heat",
      "ideal_temp_range": "60-80°F",
      "max_wind": "< 10 mph",
      "rain_buffer": "No rain for 24 hours after"
    },
    "follow_up": [{
      "days_after": number,
      "action": "What to do",
      "what_to_look_for": "Expected observations",
      "if_no_improvement": "Alternative action"
    }]
  },
  "prevention": ["Long-term cultural practices"],
  "additional_notes": "Any other important information",
  "lab_test_recommended": true/false,
  "extension_contact": "University of Illinois Extension if applicable"
}

Valid issue types for this ${isGreen ? "green" : "hole"}:
${issueTypeList}

Be EXTREMELY specific with rates, timing, and products. Check the inventory and mark in_inventory accordingly. Suggest alternatives if not in stock.`;

    // Strip data URL prefix if present
    let base64Data = image_base64;
    let mediaType = "image/jpeg";
    const dataUrlMatch = image_base64.match(
      /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/
    );
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
                {
                  type: "text",
                  text: "Analyze this image. Identify the issue and provide a complete diagnosis with treatment plan.",
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Claude API error:", response.status, errBody);
        return NextResponse.json({ error: "AI service error" }, { status: 502 });
      }

      const data = await response.json();
      const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

      // Parse JSON response
      let parsed: Record<string, unknown> = {};
      try {
        // Handle markdown fences
        let cleaned = text.trim();
        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) cleaned = fenceMatch[1].trim();

        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
        }

        try {
          parsed = JSON.parse(cleaned);
        } catch {
          // Fix common JSON issues
          const fixed = cleaned
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/[\u201C\u201D]/g, '"');
          parsed = JSON.parse(fixed);
        }
      } catch (parseErr) {
        console.error("Failed to parse AI response:", parseErr, text.substring(0, 500));
        return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
      }

      // Extract identification
      const identification = parsed.identification as {
        title?: string;
        description?: string;
        issue_type?: string;
      } | undefined;

      // Validate issue_type
      const validIssueTypes = Object.keys(issueTypes);
      const issueType = validIssueTypes.includes(identification?.issue_type || "")
        ? identification?.issue_type
        : "other";

      // Build fix_instructions from immediate_actions
      const treatment = parsed.treatment as {
        immediate_actions?: string[];
      } | undefined;
      const fixInstructions = treatment?.immediate_actions
        ? treatment.immediate_actions.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")
        : "";

      // Build diagnosis_result (everything except identification)
      const diagnosisResult = {
        diagnosis: parsed.diagnosis || null,
        treatment: parsed.treatment || null,
        prevention: parsed.prevention || [],
        additional_notes: parsed.additional_notes || "",
        lab_test_recommended: parsed.lab_test_recommended || false,
        extension_contact: parsed.extension_contact || "",
      };

      return NextResponse.json({
        title: (identification?.title || "Turf Issue").slice(0, 100),
        description: (identification?.description || "").slice(0, 1000),
        issue_type: issueType as GreenIssueType | HoleIssueType,
        fix_instructions: fixInstructions,
        diagnosis_result: diagnosisResult,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Analyze and diagnose error:", err);
    return NextResponse.json({ error: "Failed to analyze photo" }, { status: 500 });
  }
}
