import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// =============================================
// GreenKeeper Pro AI Assistant — API Route
// Uses Claude with tool_use to perform CRUD
// operations across all Supabase tables.
// =============================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are the GreenKeeper Pro AI Assistant for Veterans Memorial Golf Course at Naval Station Great Lakes, IL. You help the superintendent manage every aspect of the course through conversation.

You can perform actions like:
- Adding/editing/viewing equipment, chemical products, staff profiles, tasks, schedules
- Recording expenses and purchases with receipt info
- Creating reports and summaries from the database
- Managing time-off requests, crew assignments, and notifications
- Adding observations and updating improvement plans
- Answering questions about course data, budgets, inventory, and staff

IMPORTANT RULES:
- Always confirm destructive actions (deletes) before executing them
- When creating records, use reasonable defaults for optional fields
- When listing data, format it clearly with the most important info first
- If a query returns no results, say so plainly
- For financial data, always format as currency
- When asked for reports, query the relevant tables and summarize the data clearly
- The current user's profile ID will be provided — use it for created_by/assigned_by fields
- Today's date: ${new Date().toISOString().split("T")[0]}

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
          description: "Table name: profiles, tasks, equipment, chemical_products, chemical_applications, expenses, budget_items, schedules, time_off_requests, course_zones, photos, notifications, weather_logs, irrigation_zones, irrigation_logs, equipment_logs, plan_goals, knowledge_articles, course_observations, improvement_plan_items, improvement_plans, golfer_feedback, community_posts, tee_times, round_ratings, channels, messages, activity_log",
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
];

// Execute a tool call against Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(toolName: string, input: any, supabase: any): Promise<any> {
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
        // Supabase doesn't have native aggregate functions via JS client,
        // so we fetch all values and compute client-side (fine for typical dataset sizes)
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role, email")
      .eq("id", user.id)
      .single();

    const body = await request.json();
    const { messages: clientMessages } = body;

    if (!clientMessages || !Array.isArray(clientMessages)) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Build the system prompt with user context
    const systemPrompt = `${SYSTEM_PROMPT}

Current user:
- Name: ${profile?.full_name || "Unknown"}
- Role: ${profile?.role || "unknown"}
- Profile ID: ${user.id}
- Email: ${profile?.email || "unknown"}

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
        const result = await executeTool(toolBlock.name, toolBlock.input, supabase);
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
  const res = await fetch(ANTHROPIC_API_URL, {
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
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errBody}`);
  }

  return res.json();
}
