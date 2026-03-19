import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// System prompt for the AI agronomist
const SYSTEM_PROMPT = `You are an expert golf course superintendent and agronomist. You specialize in cool-season turf management for the Northern Illinois / Great Lakes region (USDA Zone 5b-6a).

Course details:
- Location: Naval Station Great Lakes, North Chicago, IL
- Greens: Creeping Bentgrass
- Tees: Bentgrass or Bluegrass/Rye blend
- Fairways: Kentucky Bluegrass / Perennial Ryegrass
- Rough: Kentucky Bluegrass / Tall Fescue
- Soil: Clay-loam native, sand-based greens

Current weather: {WEATHER_DATA}

Available chemical inventory: {INVENTORY_DATA}

Zone info: {ZONE_INFO}

When analyzing, respond ONLY with valid JSON matching this structure:
{
  "diagnosis": {
    "condition": "Disease/issue name",
    "scientific_name": "If applicable",
    "confidence": "high|medium|low",
    "confidence_reason": "Why this confidence level",
    "severity": 1-5,
    "severity_label": "Cosmetic|Minor|Moderate|Severe|Critical",
    "category": "turf_disease|turf_insect|turf_weed|turf_nutrient|turf_abiotic|turf_mechanical|tree|equipment|infrastructure|other",
    "description": "Detailed description of what was identified",
    "differential": ["Other possible conditions and how to distinguish"]
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
      "timing": "When to apply (time of day, conditions)",
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
      "rain_buffer": "No rain for 24 hours after",
      "avoid": "Conditions to avoid"
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
  "lab_test_recommended": boolean,
  "extension_contact": "University of Illinois Extension if applicable"
}

Be EXTREMELY specific with rates, timing, and products. Superintendents need exact numbers. Check the provided inventory and mark products as in_inventory: true/false. Suggest alternatives if primary product is not in stock.
Always recommend lab confirmation for disease identification.`;

// Follow-up system prompt
const FOLLOW_UP_SYSTEM_PROMPT = `You are an expert golf course superintendent continuing a diagnostic conversation. Review the previous diagnosis and conversation history, then answer the follow-up question.

Respond ONLY with valid JSON:
{
  "follow_up_response": "Your detailed response to the question"
}

Be specific and actionable. Reference the original diagnosis when relevant.`;

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface DiagnosticsRequest {
  image: string;
  description?: string;
  category?: string;
  zoneId?: string;
  conversationHistory?: ConversationMessage[];
  followUpQuestion?: string;
  originalDiagnosis?: unknown;
}

// Fetch current weather from WeatherAPI
async function fetchWeather(): Promise<string> {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
      return "Weather data unavailable";
    }

    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=North Chicago,IL&days=7&aqi=no`,
      { next: { revalidate: 1800 } }
    );

    if (!response.ok) {
      return "Weather data unavailable";
    }

    const data = await response.json();
    const current = data.current;
    const forecast = data.forecast?.forecastday || [];

    let weatherStr = `Current: ${current.temp_f}°F, ${current.condition.text}, `;
    weatherStr += `Humidity: ${current.humidity}%, Wind: ${current.wind_mph} mph ${current.wind_dir}, `;
    weatherStr += `Precip: ${current.precip_in}" today. `;

    weatherStr += "7-day forecast: ";
    forecast.forEach((day: { date: string; day: { maxtemp_f: number; mintemp_f: number; daily_chance_of_rain: number; maxwind_mph: number; condition: { text: string } } }) => {
      weatherStr += `${day.date}: High ${day.day.maxtemp_f}°F/Low ${day.day.mintemp_f}°F, `;
      weatherStr += `${day.day.condition.text}, ${day.day.daily_chance_of_rain}% rain chance, `;
      weatherStr += `Wind up to ${day.day.maxwind_mph} mph. `;
    });

    return weatherStr;
  } catch (error) {
    console.error("Error fetching weather:", error);
    return "Weather data unavailable";
  }
}

// Fetch chemical inventory
async function fetchInventory(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: products, error } = await supabase
      .from("chemical_products")
      .select("product_name, product_type, current_inventory, unit_of_measure, active_ingredient")
      .not("current_inventory", "is", null)
      .gt("current_inventory", 0)
      .order("product_type")
      .order("product_name");

    if (error || !products || products.length === 0) {
      return "No inventory data available";
    }

    let inventoryStr = "Available products: ";
    (products as Array<{
      product_name: string;
      product_type: string | null;
      current_inventory: number | null;
      unit_of_measure: string | null;
      active_ingredient: string | null;
    }>).forEach((p) => {
      inventoryStr += `${p.product_name} (${p.active_ingredient || p.product_type || "unknown"}) - ${p.current_inventory} ${p.unit_of_measure || "units"} in stock; `;
    });

    return inventoryStr;
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return "Inventory data unavailable";
  }
}

// Fetch zone info
async function fetchZoneInfo(zoneId: string): Promise<string> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("course_zones")
      .select("name, zone_type, hole_number, turf_type, acreage")
      .eq("id", zoneId)
      .single();

    if (error || !data) {
      return "";
    }

    const zone = data as {
      name: string;
      zone_type: string;
      hole_number: number | null;
      turf_type: string | null;
      acreage: number | null;
    };

    return `Zone: ${zone.name} (${zone.zone_type}), Hole ${zone.hole_number || "N/A"}, ` +
      `Grass type: ${zone.turf_type || "Not specified"}, ` +
      `Area: ${zone.acreage ? `${zone.acreage} acres` : "Unknown"}`;
  } catch (error) {
    console.error("Error fetching zone:", error);
    return "";
  }
}

// Build messages array for Claude API
function buildMessages(
  image: string,
  description: string | undefined,
  conversationHistory: ConversationMessage[] | undefined,
  isFollowUp: boolean,
  followUpQuestion?: string,
  originalDiagnosis?: unknown
): Array<{ role: "user" | "assistant"; content: unknown }> {
  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  if (isFollowUp && conversationHistory && conversationHistory.length > 0) {
    // For follow-up questions, include the original diagnosis context
    const contextMessage = {
      role: "user" as const,
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: image.replace(/^data:image\/\w+;base64,/, ""),
          },
        },
        {
          type: "text",
          text: `Original diagnosis: ${JSON.stringify(originalDiagnosis)}\n\nPrevious conversation:\n${conversationHistory.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nNew question: ${followUpQuestion}`,
        },
      ],
    };
    messages.push(contextMessage);
  } else {
    // Initial diagnosis request
    const userContent: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: image.replace(/^data:image\/\w+;base64,/, ""),
        },
      },
    ];

    let textPrompt = "Analyze this image and provide a diagnosis with treatment plan.";
    if (description) {
      textPrompt += ` User notes: ${description}`;
    }

    userContent.push({ type: "text", text: textPrompt });
    messages.push({ role: "user", content: userContent });
  }

  return messages;
}

// Parse JSON from Claude response, handling markdown fences
function parseJSONResponse(text: string): unknown {
  // Remove markdown code fences if present
  let cleaned = text.trim();

  // Handle ```json ... ``` format
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  // Try to find JSON object boundaries
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    console.error("Raw text:", text);
    throw new Error("Failed to parse AI response as JSON");
  }
}

// Call Claude API with retry
async function callClaudeAPI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: unknown }>,
  retryCount = 0
): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
        max_tokens: 4000,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);

      // Retry once on 5xx errors
      if (response.status >= 500 && retryCount < 1) {
        console.log("Retrying Claude API call...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return callClaudeAPI(systemPrompt, messages, retryCount + 1);
      }

      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error("Invalid response format from Claude API");
    }

    return parseJSONResponse(data.content[0].text);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out after 30 seconds");
    }

    // Retry once on network errors
    if (retryCount < 1 && error instanceof Error && error.message.includes("fetch")) {
      console.log("Retrying Claude API call after network error...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return callClaudeAPI(systemPrompt, messages, retryCount + 1);
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: DiagnosticsRequest = await request.json();
    const { image, description, category, zoneId, conversationHistory, followUpQuestion, originalDiagnosis } = body;

    if (!image) {
      return NextResponse.json(
        { error: "Image is required" },
        { status: 400 }
      );
    }

    // Determine if this is a follow-up question
    const isFollowUp = !!followUpQuestion && !!originalDiagnosis;

    // Fetch contextual data in parallel
    const [weatherData, inventoryData, zoneInfo] = await Promise.all([
      fetchWeather(),
      fetchInventory(),
      zoneId ? fetchZoneInfo(zoneId) : Promise.resolve(""),
    ]);

    // Build system prompt with injected data
    let systemPrompt = isFollowUp
      ? FOLLOW_UP_SYSTEM_PROMPT
      : SYSTEM_PROMPT
          .replace("{WEATHER_DATA}", weatherData)
          .replace("{INVENTORY_DATA}", inventoryData)
          .replace("{ZONE_INFO}", zoneInfo || "No specific zone selected");

    // Add category hint if provided
    if (category && category !== "auto" && !isFollowUp) {
      systemPrompt += `\n\nUser has indicated this may be related to: ${category}. Focus analysis accordingly but consider all possibilities.`;
    }

    // Build messages
    const messages = buildMessages(
      image,
      description,
      conversationHistory,
      isFollowUp,
      followUpQuestion,
      originalDiagnosis
    );

    // Call Claude API
    const result = await callClaudeAPI(systemPrompt, messages);

    // Validate response structure for initial diagnosis
    if (!isFollowUp) {
      const diagnosis = result as { diagnosis?: unknown; treatment?: unknown };
      if (!diagnosis.diagnosis || !diagnosis.treatment) {
        throw new Error("Invalid diagnosis response structure");
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      isFollowUp,
    });
  } catch (error) {
    console.error("Diagnostics API error:", error);

    const message = error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
