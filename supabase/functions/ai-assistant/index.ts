/**
 * ai-assistant — Deno edge function port of /api/ai-assistant.
 *
 * Server-side Claude integration with full read + write database tools for
 * managing the course from a single chat surface. All tool execution happens
 * here so the client only sends the user's message; the response is the
 * assistant's final reply after any tool_use loop completes.
 *
 * Auth: requires a signed-in user (RLS applies to all DB tool calls).
 * Secrets needed: ANTHROPIC_API_KEY
 *
 * Deploy:  supabase functions deploy ai-assistant
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 45_000;
const MAX_TOOL_ROUNDS = 5;
// 2000 was a guard for chat-style messages. Structured-generation callers
// (e.g. the SOW writer in src/lib/reports/sow-content.ts) build a full
// prompt with vendor info, line items, and section instructions and can
// legitimately need 3-6 KB. Anthropic's per-message ceiling is far higher
// than this; we just want to block accidental megabyte-pastes.
const MAX_MESSAGE_LENGTH = 12000;

// ── Tool definitions for Claude ─────────────────────────────────────────────

const TOOLS = [
  // ── READ tools ──────────────────────────────────────────────────────────
  {
    name: "search_tasks",
    description:
      "Search tasks by status, category, date range, or assignee. Returns task details including title, status, priority, due date, assigned person, and notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "verified", "blocked", "deferred", "cancelled"],
          description: "Filter by task status",
        },
        category: {
          type: "string",
          enum: ["mowing", "irrigation", "chemical", "mechanical", "landscaping", "construction", "bunker", "greens", "admin", "safety"],
          description: "Filter by task category",
        },
        due_date_from: { type: "string", description: "Start of date range (YYYY-MM-DD)" },
        due_date_to: { type: "string", description: "End of date range (YYYY-MM-DD)" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "search_equipment",
    description:
      "Search equipment inventory. Returns equipment name, type, status, condition, hours, next service due, and notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["operational", "needs_service", "in_repair", "out_of_service", "retired"],
          description: "Filter by equipment status",
        },
        equipment_type: { type: "string", description: "Filter by type (e.g., mower_reel, sprayer, tractor)" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "search_chemicals",
    description:
      "Search chemical products inventory and recent application history.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_type: {
          type: "string",
          enum: ["fertilizer", "herbicide", "insecticide", "fungicide", "growth_regulator", "wetting_agent", "colorant", "seed", "amendment"],
        },
        include_applications: { type: "boolean", description: "Include recent application records (default false)" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_weather",
    description: "Get recent weather log data including temperature, precipitation, wind, humidity, and growing degree days.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "Number of days to look back (default 7, max 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_budget_summary",
    description: "Get budget overview with allocated vs spent by category, plus recent expenses.",
    input_schema: {
      type: "object" as const,
      properties: {
        year: { type: "number", description: "Budget year (default current year)" },
        include_expenses: { type: "boolean", description: "Include recent expense detail (default false)" },
      },
      required: [],
    },
  },
  {
    name: "search_staff",
    description: "Get staff profiles including name, role, certifications, and contact info.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: ["super", "asst_super", "foreman", "mechanic", "crew", "seasonal", "pro", "director"],
        },
        active_only: { type: "boolean", description: "Only active staff (default true)" },
      },
      required: [],
    },
  },
  {
    name: "get_schedule",
    description: "Get staff schedule for a date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        date_from: { type: "string", description: "Start date (YYYY-MM-DD, default today)" },
        date_to: { type: "string", description: "End date (YYYY-MM-DD, default today)" },
      },
      required: [],
    },
  },

  // ── WRITE tools ─────────────────────────────────────────────────────────
  {
    name: "create_task",
    description:
      "Create a new task/work order. Use this when the user wants something done on the course — mowing, repairs, chemical apps, inspections, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short task title (e.g., 'Fix irrigation head on #7 fairway')" },
        description: { type: "string", description: "Detailed description of what needs to be done" },
        category: {
          type: "string",
          enum: ["mowing", "irrigation", "chemical", "mechanical", "landscaping", "construction", "bunker", "greens", "admin", "safety"],
          description: "Task category",
        },
        priority: {
          type: "string",
          enum: ["critical", "high", "normal", "low"],
          description: "Priority level (default: normal)",
        },
        due_date: { type: "string", description: "Due date YYYY-MM-DD (default: today)" },
        hole_numbers: {
          type: "array",
          items: { type: "number" },
          description: "Hole numbers this task relates to (e.g., [3, 4])",
        },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "update_task",
    description:
      "Update an existing task — change its status, priority, notes, or due date. Search for the task first to get its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "The task ID to update (get this from search_tasks)" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "blocked", "deferred", "cancelled"],
        },
        priority: { type: "string", enum: ["critical", "high", "normal", "low"] },
        notes: { type: "string", description: "New notes (appended to existing)" },
        due_date: { type: "string", description: "New due date YYYY-MM-DD" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "add_order_item",
    description:
      "Add an item to the order list — supplies, parts, materials, anything that needs to be purchased.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_name: { type: "string", description: "Name of the item to order (e.g., 'Bunker sand', 'Reel blades for triplex #2')" },
        description: { type: "string", description: "Additional details about the item" },
        category: {
          type: "string",
          enum: ["clubhouse", "cart_paths", "turf_course", "general"],
          description: "Order category (default: general)",
        },
        quantity: { type: "string", description: "Quantity needed (e.g., '5 bags', '2 cases', '1')" },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description: "Priority (default: normal)",
        },
        vendor: { type: "string", description: "Preferred vendor/supplier if known" },
        estimated_cost: { type: "number", description: "Estimated cost in dollars" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["item_name"],
    },
  },
  {
    name: "update_order_item",
    description:
      "Update an order item — change status (needed → ordered → received), add vendor, notes, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_id: { type: "string", description: "The order item ID to update" },
        status: { type: "string", enum: ["needed", "ordered", "received"] },
        vendor: { type: "string" },
        notes: { type: "string" },
        ordered_date: { type: "string", description: "Date ordered YYYY-MM-DD" },
        received_date: { type: "string", description: "Date received YYYY-MM-DD" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "search_order_items",
    description: "Search the order list for items by status, category, or name.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["needed", "ordered", "received"] },
        category: { type: "string", enum: ["clubhouse", "cart_paths", "turf_course", "general"] },
        search: { type: "string", description: "Search item name or description" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "report_course_issue",
    description:
      "Report a course issue — problems on holes, greens, fairways, bunkers, cart paths, parking lots, or the clubhouse. Use this when someone reports damage, a problem, or something that needs attention on the course.",
    input_schema: {
      type: "object" as const,
      properties: {
        area: {
          type: "string",
          enum: ["parking_lot", "clubhouse", "course"],
          description: "Where is the issue? 'parking_lot' for parking/cart path issues, 'clubhouse' for building issues, 'course' for holes/greens/fairways/bunkers",
        },
        title: { type: "string", description: "Short title (e.g., 'Broken sprinkler head', 'Sinkhole near bunker #5', 'Pothole by cart barn')" },
        description: { type: "string", description: "Detailed description of the issue" },
        location: { type: "string", description: "Specific location (e.g., 'Hole 7 green left side', 'Cart path between 3 and 4', 'Men\\'s restroom')" },
        severity: {
          type: "string",
          enum: ["minor", "moderate", "severe", "critical"],
          description: "How bad is it? (default: moderate)",
        },
        issue_type: {
          type: "string",
          description: "For parking_lot: pothole|crack|drainage|erosion|marking|curbing|other. For clubhouse: damage|cleaning|order|maintenance. For course: this creates a task instead.",
        },
        hole_numbers: {
          type: "array",
          items: { type: "number" },
          description: "Which holes are affected (for course issues)",
        },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["area", "title"],
    },
  },
  {
    name: "update_equipment_status",
    description:
      "Update an equipment item's status or condition — mark it as needing service, in repair, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        equipment_id: { type: "string", description: "Equipment ID (get from search_equipment)" },
        status: {
          type: "string",
          enum: ["operational", "needs_service", "in_repair", "out_of_service"],
        },
        condition_status: {
          type: "string",
          enum: ["good", "fair", "needs_repair", "beyond_repair"],
        },
        condition_notes: { type: "string", description: "Notes about the condition" },
        notes: { type: "string", description: "General notes" },
      },
      required: ["equipment_id"],
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type ToolInput = Record<string, any>;

async function executeTool(
  toolName: string,
  input: ToolInput,
  supabase: SupabaseClient,
  userId: string,
  photoStoragePath?: string,
): Promise<string> {
  try {
    switch (toolName) {
      // ── READ tools ──────────────────────────────────────────────────────

      case "search_tasks": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("tasks")
          .select(
            "id, title, status, priority, category, due_date, notes, assigned_to, estimated_minutes, completed_at, profiles:assigned_to(full_name)",
          )
          .order("due_date", { ascending: true })
          .limit(limit);

        if (input.status) query = query.eq("status", input.status);
        if (input.category) query = query.eq("category", input.category);
        if (input.due_date_from) query = query.gte("due_date", input.due_date_from);
        if (input.due_date_to) query = query.lte("due_date", input.due_date_to);

        const { data, error } = await query;
        if (error) return `Error querying tasks: ${error.message}`;
        if (!data || data.length === 0) return "No tasks found matching your criteria.";

        // deno-lint-ignore no-explicit-any
        return data.map((t: any) =>
          `• [${t.id.substring(0, 8)}] [${t.status}] ${t.title} (${t.priority}) — Due: ${t.due_date}${t.profiles?.full_name ? `, Assigned: ${t.profiles.full_name}` : ""}${t.notes ? ` | Notes: ${t.notes.substring(0, 100)}` : ""}`
        ).join("\n");
      }

      case "search_equipment": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("equipment")
          .select(
            "id, name, equipment_type, status, condition_status, current_hours, next_service_due_hours, next_service_due_date, make, model, notes",
          )
          .order("name")
          .limit(limit);

        if (input.status) query = query.eq("status", input.status);
        if (input.equipment_type) query = query.eq("equipment_type", input.equipment_type);

        const { data, error } = await query;
        if (error) return `Error querying equipment: ${error.message}`;
        if (!data || data.length === 0) return "No equipment found matching your criteria.";

        // deno-lint-ignore no-explicit-any
        return data.map((e: any) =>
          `• [${e.id.substring(0, 8)}] ${e.name}${e.make ? ` (${e.make} ${e.model || ""})` : ""} — Status: ${e.status}, Condition: ${e.condition_status}${e.current_hours ? `, Hours: ${e.current_hours}` : ""}${e.next_service_due_date ? `, Next service: ${e.next_service_due_date}` : ""}${e.notes ? ` | ${e.notes.substring(0, 80)}` : ""}`
        ).join("\n");
      }

      case "search_chemicals": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("chemical_products")
          .select(
            "id, name, product_type, quantity_on_hand, unit_of_measure, signal_word, epa_registration, rei_hours, active_ingredient",
          )
          .order("name")
          .limit(limit);

        if (input.product_type) query = query.eq("product_type", input.product_type);

        const { data, error } = await query;
        if (error) return `Error querying chemicals: ${error.message}`;
        if (!data || data.length === 0) return "No chemical products found.";

        // deno-lint-ignore no-explicit-any
        let result = data.map((c: any) =>
          `• ${c.name} (${c.product_type}) — On hand: ${c.quantity_on_hand ?? "N/A"} ${c.unit_of_measure || ""}${c.active_ingredient ? `, Active: ${c.active_ingredient}` : ""}${c.rei_hours ? `, REI: ${c.rei_hours}hr` : ""}`
        ).join("\n");

        if (input.include_applications) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const { data: apps, error: appErr } = await supabase
            .from("chemical_applications")
            .select(
              "application_date, product:chemical_products!product_id(name), area_treated_sqft, total_amount_used, method, target_pest, applicator:profiles!applied_by(full_name)",
            )
            .gte("application_date", thirtyDaysAgo.toISOString().slice(0, 10))
            .order("application_date", { ascending: false })
            .limit(15);

          if (!appErr && apps && apps.length > 0) {
            result += "\n\nRecent applications (last 30 days):\n";
            // deno-lint-ignore no-explicit-any
            result += apps.map((a: any) =>
              `• ${a.application_date}: ${a.product?.name || "Unknown"} — ${a.method || "applied"}${a.area_treated_sqft ? `, ${a.area_treated_sqft} sq ft` : ""}${a.target_pest ? `, Target: ${a.target_pest}` : ""}`
            ).join("\n");
          }
        }
        return result;
      }

      case "get_weather": {
        const days = Math.min(input.days || 7, 30);
        const since = new Date();
        since.setDate(since.getDate() - days);

        const { data, error } = await supabase
          .from("weather_logs")
          .select(
            "date, high_temp_f, low_temp_f, precipitation_in, wind_speed_mph, humidity_pct, gdd, conditions",
          )
          .gte("date", since.toISOString().slice(0, 10))
          .order("date", { ascending: false })
          .limit(days);

        if (error) return `Error querying weather: ${error.message}`;
        if (!data || data.length === 0) return `No weather data found for the last ${days} days.`;

        // deno-lint-ignore no-explicit-any
        return data.map((w: any) =>
          `• ${w.date}: High ${w.high_temp_f}°F / Low ${w.low_temp_f}°F${w.precipitation_in ? `, Precip: ${w.precipitation_in}"` : ""}${w.wind_speed_mph ? `, Wind: ${w.wind_speed_mph} mph` : ""}${w.humidity_pct ? `, Humidity: ${w.humidity_pct}%` : ""}${w.gdd ? `, GDD: ${w.gdd}` : ""}`
        ).join("\n");
      }

      case "get_budget_summary": {
        const year = input.year || new Date().getFullYear();

        const { data: budget, error: budgetErr } = await supabase
          .from("budget_items")
          .select("category, amount, month")
          .eq("year", year);

        if (budgetErr) return `Error querying budget: ${budgetErr.message}`;

        const categoryTotals: Record<string, number> = {};
        // deno-lint-ignore no-explicit-any
        for (const b of (budget || []) as any[]) {
          categoryTotals[b.category] = (categoryTotals[b.category] || 0) + (b.amount || 0);
        }

        let result = `Budget ${year} by category:\n`;
        for (const [cat, total] of Object.entries(categoryTotals)) {
          result += `• ${cat}: $${total.toLocaleString()}\n`;
        }

        const totalBudget = Object.values(categoryTotals).reduce((s, v) => s + v, 0);
        result += `\nTotal allocated: $${totalBudget.toLocaleString()}`;

        if (input.include_expenses) {
          const { data: expenses, error: expErr } = await supabase
            .from("expenses")
            .select("description, amount, category, status, date, vendor")
            .gte("date", `${year}-01-01`)
            .order("date", { ascending: false })
            .limit(15);

          if (!expErr && expenses && expenses.length > 0) {
            // deno-lint-ignore no-explicit-any
            const totalSpent = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
            result += `\n\nRecent expenses (total shown: $${totalSpent.toLocaleString()}):\n`;
            // deno-lint-ignore no-explicit-any
            result += expenses.map((e: any) =>
              `• ${e.date}: $${e.amount?.toLocaleString()} — ${e.description}${e.vendor ? ` (${e.vendor})` : ""} [${e.status}]`
            ).join("\n");
          }
        }
        return result;
      }

      case "search_staff": {
        const activeOnly = input.active_only !== false;
        let query = supabase
          .from("profiles")
          .select("full_name, role, email, phone, hire_date, certifications, is_active")
          .order("full_name");

        if (activeOnly) query = query.eq("is_active", true);
        if (input.role) query = query.eq("role", input.role);

        const { data, error } = await query;
        if (error) return `Error querying staff: ${error.message}`;
        if (!data || data.length === 0) return "No staff found.";

        // deno-lint-ignore no-explicit-any
        return data.map((s: any) => {
          // deno-lint-ignore no-explicit-any
          const certs = (s.certifications || []) as any[];
          const certStr = certs.length > 0
            ? ` | Certs: ${certs.map((c: { name: string }) => c.name).join(", ")}`
            : "";
          return `• ${s.full_name} (${s.role})${s.phone ? ` — ${s.phone}` : ""}${certStr}${!s.is_active ? " [INACTIVE]" : ""}`;
        }).join("\n");
      }

      case "get_schedule": {
        const today = new Date().toISOString().slice(0, 10);
        const dateFrom = input.date_from || today;
        const dateTo = input.date_to || today;

        const { data, error } = await supabase
          .from("schedules")
          .select(
            "date, shift_type, start_time, end_time, notes, profile:profiles!user_id(full_name)",
          )
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date")
          .limit(50);

        if (error) return `Error querying schedule: ${error.message}`;
        if (!data || data.length === 0) return `No schedule entries found for ${dateFrom}${dateTo !== dateFrom ? ` to ${dateTo}` : ""}.`;

        // deno-lint-ignore no-explicit-any
        return data.map((s: any) =>
          `• ${s.date}: ${s.profile?.full_name || "Unassigned"} — ${s.shift_type}${s.start_time ? ` (${s.start_time}–${s.end_time})` : ""}${s.notes ? ` | ${s.notes}` : ""}`
        ).join("\n");
      }

      // ── WRITE tools ─────────────────────────────────────────────────────

      case "create_task": {
        const today = new Date().toISOString().slice(0, 10);
        const photos = photoStoragePath ? [photoStoragePath] : [];
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            title: input.title,
            description: input.description || null,
            category: input.category,
            priority: input.priority || "normal",
            status: "pending",
            due_date: input.due_date || today,
            hole_numbers: input.hole_numbers || [],
            notes: input.notes || null,
            assigned_by: userId,
            equipment_needed: [],
            materials_needed: [],
            checklist: [],
            photos,
            requires_photo_before: false,
            requires_photo_after: false,
            weather_dependent: false,
          })
          .select("id, title, priority, due_date")
          .single();

        if (error) return `Error creating task: ${error.message}`;
        return `✅ Task created successfully!\n• Title: ${data.title}\n• Priority: ${data.priority}\n• Due: ${data.due_date}\n• ID: ${data.id.substring(0, 8)}`;
      }

      case "update_task": {
        // deno-lint-ignore no-explicit-any
        const updates: Record<string, any> = {};
        if (input.status) {
          updates.status = input.status;
          if (input.status === "completed") {
            updates.completed_at = new Date().toISOString();
            updates.completed_by = userId;
          }
        }
        if (input.priority) updates.priority = input.priority;
        if (input.due_date) updates.due_date = input.due_date;

        // For notes, fetch existing and append
        if (input.notes) {
          const { data: existing } = await supabase
            .from("tasks")
            .select("notes")
            .eq("id", input.task_id)
            .single();

          const existingNotes = existing?.notes || "";
          const timestamp = new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          updates.notes = existingNotes
            ? `${existingNotes}\n[${timestamp}] ${input.notes}`
            : `[${timestamp}] ${input.notes}`;
        }

        if (Object.keys(updates).length === 0) {
          return "No updates provided. Specify status, priority, due_date, or notes to update.";
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from("tasks")
          .update(updates)
          .eq("id", input.task_id)
          .select("id, title, status, priority, due_date")
          .single();

        if (error) return `Error updating task: ${error.message}`;
        if (!data) return `Task not found with ID: ${input.task_id}`;
        return `✅ Task updated!\n• ${data.title}\n• Status: ${data.status}\n• Priority: ${data.priority}\n• Due: ${data.due_date}`;
      }

      case "add_order_item": {
        const { data, error } = await supabase
          .from("order_items")
          .insert({
            created_by: userId,
            item_name: input.item_name,
            description: input.description || null,
            category: input.category || "general",
            quantity: input.quantity || null,
            priority: input.priority || "normal",
            status: "needed",
            vendor: input.vendor || null,
            estimated_cost: input.estimated_cost || null,
            notes: input.notes || null,
          })
          .select("id, item_name, category, priority, quantity")
          .single();

        if (error) return `Error adding order item: ${error.message}`;
        return `✅ Added to order list!\n• Item: ${data.item_name}\n• Category: ${data.category}\n• Priority: ${data.priority}${data.quantity ? `\n• Quantity: ${data.quantity}` : ""}\n• Status: needed`;
      }

      case "update_order_item": {
        // deno-lint-ignore no-explicit-any
        const updates: Record<string, any> = {};
        if (input.status) updates.status = input.status;
        if (input.vendor) updates.vendor = input.vendor;
        if (input.notes) updates.notes = input.notes;
        if (input.ordered_date) updates.ordered_date = input.ordered_date;
        if (input.received_date) updates.received_date = input.received_date;

        if (Object.keys(updates).length === 0) {
          return "No updates provided.";
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from("order_items")
          .update(updates)
          .eq("id", input.item_id)
          .select("id, item_name, status, vendor")
          .single();

        if (error) return `Error updating order item: ${error.message}`;
        if (!data) return `Order item not found with ID: ${input.item_id}`;
        return `✅ Order item updated!\n• ${data.item_name}\n• Status: ${data.status}${data.vendor ? `\n• Vendor: ${data.vendor}` : ""}`;
      }

      case "search_order_items": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("order_items")
          .select(
            "id, item_name, description, category, quantity, priority, status, vendor, estimated_cost, notes, ordered_date, received_date, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.status) query = query.eq("status", input.status);
        if (input.category) query = query.eq("category", input.category);
        if (input.search) query = query.ilike("item_name", `%${input.search}%`);

        const { data, error } = await query;
        if (error) return `Error searching orders: ${error.message}`;
        if (!data || data.length === 0) return "No order items found.";

        // deno-lint-ignore no-explicit-any
        return data.map((o: any) =>
          `• [${o.id.substring(0, 8)}] ${o.item_name} (${o.category}) — ${o.status}${o.quantity ? `, Qty: ${o.quantity}` : ""}${o.priority !== "normal" ? `, ${o.priority} priority` : ""}${o.vendor ? `, Vendor: ${o.vendor}` : ""}${o.estimated_cost ? `, ~$${o.estimated_cost}` : ""}${o.notes ? ` | ${o.notes.substring(0, 60)}` : ""}`
        ).join("\n");
      }

      case "report_course_issue": {
        const area = input.area;

        if (area === "parking_lot") {
          const photos = photoStoragePath ? [photoStoragePath] : [];
          const { data, error } = await supabase
            .from("parking_lot_issues")
            .insert({
              reported_by: userId,
              title: input.title,
              description: input.description || null,
              location: input.location || null,
              issue_type: input.issue_type || "other",
              severity: input.severity || "moderate",
              status: "open",
              photos,
            })
            .select("id, title, severity, location")
            .single();

          if (error) return `Error reporting parking lot issue: ${error.message}`;
          return `✅ Parking/cart path issue reported!\n• ${data.title}\n• Severity: ${data.severity}${data.location ? `\n• Location: ${data.location}` : ""}\n• Status: open`;
        }

        if (area === "clubhouse") {
          const categoryMap: Record<string, string> = {
            damage: "damage",
            cleaning: "cleaning",
            order: "order",
            maintenance: "maintenance",
          };
          const photos = photoStoragePath ? [photoStoragePath] : [];
          const { data, error } = await supabase
            .from("clubhouse_issues")
            .insert({
              reported_by: userId,
              title: input.title,
              description: input.description || null,
              location: input.location || null,
              category: categoryMap[input.issue_type] || "maintenance",
              priority: input.severity === "critical"
                ? "urgent"
                : input.severity === "severe"
                ? "high"
                : "normal",
              status: "open",
              photos,
            })
            .select("id, title, category, priority, location")
            .single();

          if (error) return `Error reporting clubhouse issue: ${error.message}`;
          return `✅ Clubhouse issue reported!\n• ${data.title}\n• Category: ${data.category}\n• Priority: ${data.priority}${data.location ? `\n• Location: ${data.location}` : ""}\n• Status: open`;
        }

        // Course issue → create as a task
        if (area === "course") {
          const today = new Date().toISOString().slice(0, 10);
          const priority = input.severity === "critical"
            ? "critical"
            : input.severity === "severe"
            ? "high"
            : input.severity === "minor"
            ? "low"
            : "normal";
          const photos = photoStoragePath ? [photoStoragePath] : [];

          const { data, error } = await supabase
            .from("tasks")
            .insert({
              title: input.title,
              description: input.description || null,
              category: "greens",
              priority,
              status: "pending",
              due_date: today,
              hole_numbers: input.hole_numbers || [],
              notes: input.notes
                ? `[Issue] ${input.notes}${input.location ? ` — Location: ${input.location}` : ""}`
                : (input.location ? `[Issue] Location: ${input.location}` : null),
              assigned_by: userId,
              equipment_needed: [],
              materials_needed: [],
              checklist: [],
              photos,
              requires_photo_before: false,
              requires_photo_after: false,
              weather_dependent: false,
            })
            .select("id, title, priority, due_date, hole_numbers")
            .single();

          if (error) return `Error reporting course issue: ${error.message}`;
          return `✅ Course issue reported as task!\n• ${data.title}\n• Priority: ${data.priority}${data.hole_numbers?.length ? `\n• Holes: ${data.hole_numbers.join(", ")}` : ""}${input.location ? `\n• Location: ${input.location}` : ""}\n• Due: ${data.due_date}\n• Status: pending`;
        }

        return `Unknown area "${area}". Use parking_lot, clubhouse, or course.`;
      }

      case "update_equipment_status": {
        // deno-lint-ignore no-explicit-any
        const updates: Record<string, any> = {};
        if (input.status) updates.status = input.status;
        if (input.condition_status) updates.condition_status = input.condition_status;
        if (input.condition_notes) updates.condition_notes = input.condition_notes;
        if (input.notes) updates.notes = input.notes;

        if (Object.keys(updates).length === 0) {
          return "No updates provided.";
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from("equipment")
          .update(updates)
          .eq("id", input.equipment_id)
          .select("id, name, status, condition_status")
          .single();

        if (error) return `Error updating equipment: ${error.message}`;
        if (!data) return `Equipment not found with ID: ${input.equipment_id}`;
        return `✅ Equipment updated!\n• ${data.name}\n• Status: ${data.status}\n• Condition: ${data.condition_status}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Tool ${toolName} execution error:`, message);
    return `Error executing ${toolName}: ${message}`;
  }
}

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the AI assistant for GreenKeeper Pro, a golf course management app used at Veterans Memorial Golf Course, Naval Station Great Lakes, Illinois.

You are the superintendent's right-hand tool. When they tell you something needs to happen, DO IT — don't tell them to go to another page. You have full read and write access.

CAPABILITIES:
- Search and look up: tasks, equipment, chemicals, weather, budget, staff, schedules, order items
- Create: tasks, order items, course/parking/clubhouse issues
- Update: tasks (status, priority, notes), order items (status, vendor), equipment (status, condition)

HOW TO HANDLE REQUESTS:
1. When someone says something needs to be done (e.g., "we need to fix the sprinkler on 7"), CREATE A TASK for it immediately.
2. When someone says they need something ordered (e.g., "we need more bunker sand"), ADD IT TO THE ORDER LIST immediately.
3. When someone reports a problem (e.g., "there's a pothole by the cart barn"), REPORT THE ISSUE immediately.
4. When someone says to mark something done, UPDATE THE TASK STATUS to completed.
5. When they ask about data, LOOK IT UP with the search tools first. Don't guess.

IMPORTANT RULES:
1. Always use tools to look up or write real data. Never make up information.
2. Keep answers concise — this is used on a phone.
3. When you create or update something, confirm what you did with the details.
4. If you need to find a task/item before updating it, search first, then update.
5. For chemical/pesticide questions, mention Illinois RUP compliance requirements when relevant.
6. When the user says "today", use the current date.
7. Use the report_course_issue tool for problems on the course — it automatically routes to the right table (parking_lot_issues, clubhouse_issues, or tasks).

Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

The user's role and name will be provided with each message.`;

// ── Claude API helper ───────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  // deno-lint-ignore no-explicit-any
  messages: any[],
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "GET") {
    const hasKey = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    return jsonResponse({ healthy: hasKey, model: MODEL });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const supabase = getUserClient(req);

    // Get user profile for context (best-effort — defaults are fine)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const userName = profile?.full_name || "User";
    const userRole = profile?.role || "crew";

    // Parse request
    const body = (await req.json().catch(() => ({}))) as {
      message?: unknown;
      history?: unknown;
      photoStoragePath?: unknown;
    };

    const message = typeof body.message === "string" ? body.message : "";
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
    const photoStoragePath = typeof body.photoStoragePath === "string"
      ? body.photoStoragePath
      : undefined;

    if (!message || message.trim().length === 0) {
      return jsonError("Message is required", 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonError(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonError(
        "AI assistant is not configured. Please set the ANTHROPIC_API_KEY secret.",
        503,
      );
    }

    // Build messages array — include recent history for context
    const recentHistory = history.slice(-10);
    // deno-lint-ignore no-explicit-any
    const messages: any[] = [
      ...recentHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: `[${userName}, ${userRole}]: ${message}`,
      },
    ];

    // ── First Claude call (may return tool_use) ─────────────────────────
    let claudeResponse = await callClaude(apiKey, messages);
    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error(`Claude API error ${claudeResponse.status}:`, errText);
      return jsonError(
        "AI service is temporarily unavailable. Please try again in a moment.",
        502,
      );
    }

    let responseData = await claudeResponse.json();

    // ── Tool use loop ───────────────────────────────────────────────────
    let rounds = 0;
    while (responseData.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const toolUseBlocks = (responseData.content || []).filter(
        // deno-lint-ignore no-explicit-any
        (b: any) => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) break;

      // Execute each tool call
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await executeTool(
          toolBlock.name,
          toolBlock.input,
          supabase,
          user.id,
          photoStoragePath,
        );
        toolResults.push({
          type: "tool_result" as const,
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      // Send results back to Claude
      messages.push({
        role: "assistant" as const,
        content: responseData.content,
      });
      messages.push({
        role: "user" as const,
        // deno-lint-ignore no-explicit-any
        content: toolResults as any,
      });

      claudeResponse = await callClaude(apiKey, messages);
      if (!claudeResponse.ok) {
        console.error(`Claude API error on tool round ${rounds}:`, claudeResponse.status);
        return jsonError("AI service error during tool processing.", 502);
      }
      responseData = await claudeResponse.json();
    }

    // ── Extract final text response ─────────────────────────────────────
    const textBlocks = (responseData.content || [])
      // deno-lint-ignore no-explicit-any
      .filter((b: any) => b.type === "text")
      // deno-lint-ignore no-explicit-any
      .map((b: any) => b.text);

    const reply = textBlocks.join("\n\n") ||
      "I wasn't able to generate a response. Please try again.";

    return jsonResponse({ reply });
  } catch (err) {
    console.error("AI assistant error:", err);
    return jsonError("Something went wrong. Please try again.", 500);
  }
});
