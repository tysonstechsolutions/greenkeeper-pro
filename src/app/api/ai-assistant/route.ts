import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWeather, getWeatherRecommendations } from "@/lib/utils/weather";
import { COURSE, APP_CONFIG } from "@/lib/constants";
import { HISTORICAL_QUERY_TOOLS, HISTORICAL_QUERY_IMPLEMENTATIONS } from "@/lib/ai/tools/historical-queries";

// =============================================
// VMGC AI Assistant — API Route
// Uses Claude with tool_use to perform CRUD
// operations across all Supabase tables.
// Enhanced: weather awareness, page context,
// photo diagnostics in chat.
// =============================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are the VMGC AI Assistant for Veterans Memorial Golf Course at Naval Station Great Lakes, IL. You help the superintendent manage every aspect of the course through conversation.

You can perform actions like:
- Adding/editing/viewing equipment, chemical products, staff profiles, tasks, schedules
- Recording expenses and purchases with receipt info
- Creating reports and summaries from the database
- Managing time-off requests, crew assignments, and notifications
- Adding observations and updating improvement plans
- Answering questions about course data, budgets, inventory, and staff
- Fetching current weather conditions and forecasts for the course
- Analyzing photos of turf conditions, diseases, pests, and damage

IMPORTANT RULES:
- Always confirm destructive actions (deletes) before executing them
- When creating records, use reasonable defaults for optional fields
- When listing data, format it clearly with the most important info first
- If a query returns no results, say so plainly
- For financial data, always format as currency
- When asked for reports, query the relevant tables and summarize the data clearly
- The current user's profile ID will be provided — use it for created_by/assigned_by fields
- Today's date: ${new Date().toISOString().split("T")[0]}
- When the user asks about weather, use the get_weather tool — don't query weather_logs unless they ask for historical data
- When the user shares a photo/image, use the analyze_image tool to diagnose it
- You have access to historical query tools that let you search the course's past records:
  * query_chemical_history: Search past chemical/pesticide applications
  * query_observation_history: Search past course observations and issues
  * query_weather_history: Look up historical weather data
  * query_task_history: Search task assignment and completion records
  * query_equipment_history: Look up equipment service and usage logs
  * query_budget_expenses: Search expense records and budget data
  Use these when the user asks about past events, trends, comparisons, or "when did we last..." questions.
- You are PAGE-AWARE: the current page path is provided. Use it to be contextually helpful.
  For example, if the user is on /equipment/abc-123 and asks "what's the status?", query that specific equipment record.

Course details:
- Location: Naval Station Great Lakes, North Chicago, IL (USDA Zone 5b-6a)
- Greens: Creeping Bentgrass
- Fairways: Kentucky Bluegrass / Perennial Ryegrass
- Rough: Kentucky Bluegrass / Tall Fescue`;

// Tool definitions for Claude
const TOOLS = [
  {
    name: "query_table",
    description: "Query any table in the database. Use this to look up information, generate reports, check inventory, view staff, etc. Supports filtering, ordering, and limiting results.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          description: "Table name: profiles, tasks, equipment, chemical_products, chemical_applications, expenses, budget_items, schedules, time_off_requests, course_zones, photos, notifications, weather_logs, irrigation_zones, irrigation_logs, equipment_logs, plan_goals, knowledge_articles, course_observations, improvement_plan_items, improvement_plans, golfer_feedback, community_posts, tee_times, round_ratings, channels, messages, activity_log, equipment_checkouts, diagnostics, shift_swap_posts",
        },
        select: {
          type: "string",
          description: "Columns to select. Use '*' for all. Can use Supabase select syntax like 'id, title, assigned_to(full_name)'",
        },
        filters: {
          type: "array",
          description: "Array of filter objects to apply",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              operator: { type: "string", description: "eq, neq, gt, gte, lt, lte, like, ilike, in, is" },
              value: { type: ["string", "number", "boolean", "null"] },
            },
            required: ["column", "operator", "value"],
          },
        },
        order: {
          type: "object",
          properties: {
            column: { type: "string" },
            ascending: { type: "boolean" },
          },
        },
        limit: { type: "number", description: "Max rows to return. Default 50." },
      },
      required: ["table", "select"],
    },
  },
  {
    name: "insert_record",
    description: "Insert a new record into any table. Use for adding equipment, staff, tasks, expenses, chemicals, observations, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          description: "Table name to insert into",
        },
        data: {
          type: "object",
          description: "Key-value pairs of column names and values to insert. Do NOT include 'id' (auto-generated) or timestamps (auto-set). DO include created_by with the user's profile ID when the table has that column.",
        },
      },
      required: ["table", "data"],
    },
  },
  {
    name: "update_record",
    description: "Update an existing record in any table. Use for editing equipment status, updating tasks, changing schedules, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          description: "Table name to update",
        },
        id: {
          type: "string",
          description: "UUID of the record to update",
        },
        data: {
          type: "object",
          description: "Key-value pairs of columns to update with new values",
        },
      },
      required: ["table", "id", "data"],
    },
  },
  {
    name: "delete_record",
    description: "Delete a record from a table. Use sparingly and only after confirming with the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          description: "Table name to delete from",
        },
        id: {
          type: "string",
          description: "UUID of the record to delete",
        },
      },
      required: ["table", "id"],
    },
  },
  {
    name: "count_records",
    description: "Count records in a table, optionally with filters. Useful for summaries and reports.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string" },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              operator: { type: "string" },
              value: { type: ["string", "number", "boolean", "null"] },
            },
            required: ["column", "operator", "value"],
          },
        },
      },
      required: ["table"],
    },
  },
  {
    name: "aggregate_query",
    description: "Run an aggregate query (sum, average, min, max) on a numeric column. Useful for budget summaries, cost totals, hour averages, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string" },
        column: { type: "string", description: "Numeric column to aggregate" },
        operation: { type: "string", enum: ["sum", "avg", "min", "max"], description: "Aggregate function" },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              operator: { type: "string" },
              value: { type: ["string", "number", "boolean", "null"] },
            },
            required: ["column", "operator", "value"],
          },
        },
      },
      required: ["table", "column", "operation"],
    },
  },
  {
    name: "get_weather",
    description: "Fetch current weather conditions and 3-day forecast for the golf course. Includes temperature, wind, humidity, rain chance, UV index, and turf management recommendations. Use this when the user asks about weather, when deciding if it's safe to spray chemicals, or when planning outdoor work.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_recommendations: {
          type: "boolean",
          description: "Include turf management recommendations based on current conditions. Default true.",
        },
      },
      required: [],
    },
  },
  {
    name: "analyze_image",
    description: "Analyze a turf/course photo for disease, pest, nutrient deficiency, or damage identification. The user must have attached an image in their message. This tool uses AI vision to diagnose the image and cross-references with the course's chemical inventory for treatment options. Returns diagnosis, treatment plan, and product recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_name: {
          type: "string",
          description: "Which part of the course this is from (e.g. 'Green #7', 'Fairway 12', 'Rough near tee 3'). Ask the user if not provided.",
        },
        additional_context: {
          type: "string",
          description: "Any additional context about the issue (e.g. 'noticed this morning', 'spreading fast', 'only in shade areas')",
        },
      },
      required: [],
    },
  },
  ...HISTORICAL_QUERY_TOOLS,
];

// Execute a tool call against Supabase or external APIs
 
// Internal tool dispatcher — input/supabase/return types are intentionally
// loose because this dynamically dispatches over a variety of tool shapes
// defined in the OpenAI function schema above.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function executeTool(
  toolName: string,
  input: any,
  supabase: any,
  imageData?: string | null
): Promise<any> {
/* eslint-enable @typescript-eslint/no-explicit-any */
  try {
    switch (toolName) {
      case "query_table": {
        let query = supabase.from(input.table).select(input.select || "*");

        if (input.filters) {
          for (const filter of input.filters) {
            switch (filter.operator) {
              case "eq": query = query.eq(filter.column, filter.value); break;
              case "neq": query = query.neq(filter.column, filter.value); break;
              case "gt": query = query.gt(filter.column, filter.value); break;
              case "gte": query = query.gte(filter.column, filter.value); break;
              case "lt": query = query.lt(filter.column, filter.value); break;
              case "lte": query = query.lte(filter.column, filter.value); break;
              case "like": query = query.like(filter.column, filter.value); break;
              case "ilike": query = query.ilike(filter.column, filter.value); break;
              case "in": query = query.in(filter.column, Array.isArray(filter.value) ? filter.value : [filter.value]); break;
              case "is": query = query.is(filter.column, filter.value); break;
            }
          }
        }

        if (input.order) {
          query = query.order(input.order.column, { ascending: input.order.ascending ?? true });
        }

        query = query.limit(input.limit || 50);
        const { data, error } = await query;
        if (error) return { error: error.message };
        return { data, count: data?.length || 0 };
      }

      case "insert_record": {
        const { data, error } = await supabase
          .from(input.table)
          .insert(input.data)
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, data };
      }

      case "update_record": {
        const { data, error } = await supabase
          .from(input.table)
          .update(input.data)
          .eq("id", input.id)
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, data };
      }

      case "delete_record": {
        const { error } = await supabase
          .from(input.table)
          .delete()
          .eq("id", input.id);
        if (error) return { error: error.message };
        return { success: true, message: `Record deleted from ${input.table}` };
      }

      case "count_records": {
        let query = supabase.from(input.table).select("*", { count: "exact", head: true });
        if (input.filters) {
          for (const filter of input.filters) {
            switch (filter.operator) {
              case "eq": query = query.eq(filter.column, filter.value); break;
              case "neq": query = query.neq(filter.column, filter.value); break;
              case "gt": query = query.gt(filter.column, filter.value); break;
              case "gte": query = query.gte(filter.column, filter.value); break;
              case "lt": query = query.lt(filter.column, filter.value); break;
              case "lte": query = query.lte(filter.column, filter.value); break;
              case "in": query = query.in(filter.column, Array.isArray(filter.value) ? filter.value : [filter.value]); break;
              case "is": query = query.is(filter.column, filter.value); break;
            }
          }
        }
        const { count, error } = await query;
        if (error) return { error: error.message };
        return { count: count ?? 0 };
      }

      case "aggregate_query": {
        let query = supabase.from(input.table).select(input.column);
        if (input.filters) {
          for (const filter of input.filters) {
            switch (filter.operator) {
              case "eq": query = query.eq(filter.column, filter.value); break;
              case "neq": query = query.neq(filter.column, filter.value); break;
              case "gt": query = query.gt(filter.column, filter.value); break;
              case "gte": query = query.gte(filter.column, filter.value); break;
              case "lt": query = query.lt(filter.column, filter.value); break;
              case "lte": query = query.lte(filter.column, filter.value); break;
            }
          }
        }
        const { data, error } = await query;
        if (error) return { error: error.message };

        const values = (data || [])
          .map((row: Record<string, unknown>) => Number(row[input.column]))
          .filter((v: number) => !isNaN(v));

        if (values.length === 0) return { result: 0, count: 0 };

        let result: number;
        switch (input.operation) {
          case "sum": result = values.reduce((a: number, b: number) => a + b, 0); break;
          case "avg": result = values.reduce((a: number, b: number) => a + b, 0) / values.length; break;
          case "min": result = Math.min(...values); break;
          case "max": result = Math.max(...values); break;
          default: result = 0;
        }

        return { result: Math.round(result * 100) / 100, count: values.length };
      }

      case "get_weather": {
        const weather = await fetchWeather(COURSE.lat, COURSE.lng, 3);
        if (!weather) {
          return { error: "Weather data not available. The WEATHER_API_KEY may not be configured." };
        }

        const includeRecs = input.include_recommendations !== false;
        const recommendations = includeRecs
          ? getWeatherRecommendations(weather.current)
          : [];

        return {
          current: {
            temperature: `${weather.current.temp_f}°F (feels like ${weather.current.feels_like_f}°F)`,
            condition: weather.current.condition,
            humidity: `${weather.current.humidity}%`,
            wind: `${weather.current.wind_mph} mph ${weather.current.wind_direction}`,
            uv_index: weather.current.uv,
            precipitation: `${weather.current.precip_in} in`,
            cloud_cover: `${weather.current.cloud}%`,
          },
          forecast: weather.forecast.map((day) => ({
            date: day.date,
            high: `${day.max_temp_f}°F`,
            low: `${day.min_temp_f}°F`,
            condition: day.condition,
            rain_chance: `${day.chance_of_rain}%`,
            snow_chance: `${day.chance_of_snow}%`,
            max_wind: `${day.max_wind_mph} mph`,
            humidity: `${day.avg_humidity}%`,
            uv: day.uv,
            sunrise: day.sunrise,
            sunset: day.sunset,
          })),
          alerts: weather.alerts.length > 0 ? weather.alerts : "No active weather alerts",
          recommendations: recommendations.length > 0 ? recommendations : ["Conditions look good for normal operations"],
          location: weather.location,
        };
      }

      case "analyze_image": {
        if (!imageData) {
          return { error: "No image was provided. Please ask the user to attach a photo." };
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return { error: "AI not configured for image analysis." };
        }

        // Fetch chemical inventory for cross-referencing
        const { data: chemicals } = await supabase
          .from("chemical_products")
          .select("id, product_name, active_ingredient, product_type, signal_word, current_quantity_oz")
          .gt("current_quantity_oz", 0);

        const inventoryList = (chemicals || [])
          .map((c: { product_name: string; active_ingredient: string | null; product_type: string; current_quantity_oz: number }) =>
            `${c.product_name} (${c.active_ingredient || "unknown"}) - ${c.product_type} - ${c.current_quantity_oz}oz in stock`
          )
          .join("\n");

        // Fetch weather for application window
        const weather = await fetchWeather(COURSE.lat, COURSE.lng, 3);
        const weatherContext = weather
          ? `Current: ${weather.current.temp_f}°F, ${weather.current.condition}, Wind ${weather.current.wind_mph}mph, Humidity ${weather.current.humidity}%`
          : "Weather data not available";

        const diagnosisPrompt = `Analyze this golf course photo and provide a diagnosis.

Course: Veterans Memorial GC, Naval Station Great Lakes, IL (USDA Zone 5b-6a)
Greens: Creeping Bentgrass | Fairways: KBG/Perennial Rye | Rough: KBG/Tall Fescue
${input.zone_name ? `Zone: ${input.zone_name}` : ""}
${input.additional_context ? `Context: ${input.additional_context}` : ""}

Current weather: ${weatherContext}

Chemical inventory in stock:
${inventoryList || "No inventory data available"}

Provide your analysis as structured text with these sections:
DIAGNOSIS: What you see, condition name, confidence level (high/medium/low), severity (1-5)
IMMEDIATE ACTIONS: What to do right now (numbered list)
TREATMENT PRODUCTS: Specific product recommendations with rates, noting which are IN STOCK
APPLICATION WINDOW: Best time to apply based on weather
FOLLOW-UP: What to check and when
PREVENTION: Long-term cultural practices to prevent recurrence

Be specific with rates and timing — this is for a professional superintendent.`;

        // Determine media type from base64 header
        let mediaType = "image/jpeg";
        if (imageData.startsWith("data:")) {
          const match = imageData.match(/^data:(image\/[a-z+]+);base64,/);
          if (match) {
            mediaType = match[1];
            imageData = imageData.replace(/^data:image\/[a-z+]+;base64,/, "");
          }
        }

        const analysisController = new AbortController();
        const analysisTimeout = setTimeout(() => analysisController.abort(), 60_000);
        let analysisRes: Response;
        try {
          analysisRes = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 4096,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image",
                      source: {
                        type: "base64",
                        media_type: mediaType,
                        data: imageData,
                      },
                    },
                    {
                      type: "text",
                      text: diagnosisPrompt,
                    },
                  ],
                },
              ],
            }),
            signal: analysisController.signal,
          });
        } finally {
          clearTimeout(analysisTimeout);
        }

        if (!analysisRes.ok) {
          const errBody = await analysisRes.text();
          return { error: `Image analysis failed: ${errBody}` };
        }

        const analysisData = await analysisRes.json();
        const analysisText = analysisData.content
          ?.filter((b: { type: string }) => b.type === "text")
          ?.map((b: { text: string }) => b.text)
          ?.join("\n") || "Unable to analyze the image.";

        return {
          analysis: analysisText,
          weather_context: weatherContext,
          inventory_checked: (chemicals || []).length,
        };
      }

      // Historical query tools
      case "query_chemical_history":
      case "query_observation_history":
      case "query_weather_history":
      case "query_task_history":
      case "query_equipment_history":
      case "query_budget_expenses": {
        const impl = HISTORICAL_QUERY_IMPLEMENTATIONS[toolName];
        if (impl) {
          const result = await impl(input, supabase);
          return { data: result };
        }
        return { error: `Unknown historical tool: ${toolName}` };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI assistant not configured. Add ANTHROPIC_API_KEY to environment variables." },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile for context
     
    const { data: profile } = await supabase.from("profiles")
      .select("id, full_name, role, email")
      .eq("id", user.id)
      .single();

    const body = await request.json();
    const { messages: clientMessages, currentPage, imageData } = body;

    if (!clientMessages || !Array.isArray(clientMessages)) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Build page context
    let pageContext = "";
    if (currentPage) {
      pageContext = `\n\nThe user is currently viewing: ${currentPage}`;

      // Extract entity IDs from the URL for context
      const equipmentMatch = currentPage.match(/\/equipment\/([a-f0-9-]+)/);
      const taskMatch = currentPage.match(/\/tasks\/([a-f0-9-]+)/);
      const planMatch = currentPage.match(/\/plan\/([a-f0-9-]+)/);

      if (equipmentMatch) {
        pageContext += `\nThey are looking at equipment ID: ${equipmentMatch[1]}. If they ask about "this equipment" or "this item", query the equipment table for this ID.`;
      } else if (taskMatch) {
        pageContext += `\nThey are looking at task ID: ${taskMatch[1]}. If they ask about "this task", query the tasks table for this ID.`;
      } else if (planMatch) {
        pageContext += `\nThey are looking at plan goal ID: ${planMatch[1]}. If they ask about "this goal", query the plan_goals table for this ID.`;
      } else if (currentPage === "/dashboard") {
        pageContext += `\nThey are on the main dashboard. Help with overview questions.`;
      } else if (currentPage === "/equipment") {
        pageContext += `\nThey are on the equipment list page. Help with equipment-related queries.`;
      } else if (currentPage === "/tasks") {
        pageContext += `\nThey are on the tasks list page.`;
      } else if (currentPage === "/schedule") {
        pageContext += `\nThey are on the schedule page. Help with scheduling questions.`;
      } else if (currentPage === "/chemicals") {
        pageContext += `\nThey are on the chemicals inventory page.`;
      } else if (currentPage === "/messages") {
        pageContext += `\nThey are in the messaging area.`;
      }
    }

    // Build the system prompt with user context
    const systemPrompt = `${SYSTEM_PROMPT}

Current user:
- Name: ${profile?.full_name || "Unknown"}
- Role: ${profile?.role || "unknown"}
- Profile ID: ${user.id}
- Email: ${profile?.email || "unknown"}
${pageContext}
${imageData ? "\nThe user has attached an image to analyze. Use the analyze_image tool to diagnose it." : ""}

When inserting records that need a created_by, submitted_by, or assigned_by field, use the profile ID: ${user.id}`;

    // Initial Claude API call
    let response = await callClaude(apiKey, systemPrompt, clientMessages);

    // Tool use loop — keep calling Claude until it stops requesting tools
    const maxToolRounds = 10;
    let round = 0;

    while (response.stop_reason === "tool_use" && round < maxToolRounds) {
      round++;
      const toolUseBlocks = response.content.filter(
        (block: { type: string }) => block.type === "tool_use"
      );

      // Execute all tool calls
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await executeTool(toolBlock.name, toolBlock.input, supabase, imageData);
        toolResults.push({
          type: "tool_result" as const,
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      // Send results back to Claude
      const updatedMessages = [
        ...clientMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];

      response = await callClaude(apiKey, systemPrompt, updatedMessages);
    }

    // Extract the text response
    const textBlocks = response.content.filter(
      (block: { type: string }) => block.type === "text"
    );
    const assistantText = textBlocks.map((b: { text: string }) => b.text).join("\n");

    return NextResponse.json({
      response: assistantText,
      // Pass back the full content for conversation continuity
      rawContent: response.content,
    });
  } catch (err) {
    console.error("AI Assistant error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s per round
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
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
        tools: TOOLS,
        messages,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errBody}`);
  }

  return res.json();
}
