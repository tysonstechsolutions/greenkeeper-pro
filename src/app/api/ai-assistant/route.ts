// src/app/api/ai-assistant/route.ts
// AI Assistant — server-side Claude integration with read + write database tools
// All tool execution happens here on the server. Client just sends messages.

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 45_000;

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
  {
    name: "get_recent_observations",
    description:
      "Get recent turf/course observations logged by crew — fungus/disease, dry/wet spots, bare spots, weed pressure, pest damage, irrigation issues, etc. Use this to assess course health, spot disease patterns, or answer questions like 'what issues are we tracking?' or 'any fungus problems lately?'. Returns title, hole, issue type, priority, status, and date reported.",
    input_schema: {
      type: "object" as const,
      properties: {
        days_back: { type: "number", description: "How many days of history to include (default 7, max 30)" },
        issue_type: {
          type: "string",
          enum: ["fungus_disease","dry_spot","wet_area","bare_spot","weed_pressure","pest_damage","mechanical_damage","drainage","bunker_issue","tree_issue","irrigation_issue","turf_thin","algae","frost_damage","other"],
          description: "Filter to one type of observation",
        },
        status: {
          type: "string",
          enum: ["open","in_progress","resolved","monitoring"],
          description: "Filter by status (default: all non-resolved)",
        },
        hole_number: { type: "number", description: "Specific hole 1-18" },
        limit: { type: "number", description: "Max results (default 25, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_daily_snapshot",
    description:
      "One-shot situational awareness: returns a compact summary of TODAY's pending tasks, equipment needing service, open course/parking/clubhouse issues, and MIA assets. Use this when the user asks 'what's going on today?', 'give me a briefing', 'what needs attention?', or at the start of a conversation to orient yourself. Much faster than calling 4 separate search tools.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_vendors",
    description:
      "Search the vendor contact directory by name, company, category, or what they supply. Use when the user asks 'who is our spray contractor?', 'find irrigation vendor', 'vendor phone number', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Search vendor name, company, or supplies text" },
        category: {
          type: "string",
          enum: ["spray_contractor", "equipment_dealer", "parts_supplier", "irrigation", "landscaping", "construction", "fuel", "seed_sod", "general"],
          description: "Filter by vendor category",
        },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_fy26_assets_summary",
    description:
      "Summary of FY26 annual inventory assets by status (Present / MIA / Unverified / Disposed) and site (7009 Golf Course, 7010 Maintenance). Use when the user asks about inventory status, MIA counts, missing equipment, or annual inventory progress. Also supports searching specific assets by description or serial.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Search description / asset # / serial to list matching assets" },
        status: {
          type: "string",
          enum: ["verified_present","mia","unverified","disposed"],
          description: "Filter asset list to one status",
        },
        site: { type: "string", enum: ["7009","7010"], description: "Filter to one site" },
        limit: { type: "number", description: "Max results when listing (default 20, max 50)" },
      },
      required: [],
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolInput = Record<string, any>;

async function executeTool(
  toolName: string,
  input: ToolInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  photoStoragePath?: string
): Promise<string> {
  try {
    switch (toolName) {
      // ── READ tools ──────────────────────────────────────────────────────

      case "search_tasks": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("tasks")
          .select("id, title, status, priority, category, due_date, notes, assigned_to, estimated_minutes, completed_at, profiles:assigned_to(full_name)")
          .order("due_date", { ascending: true })
          .limit(limit);

        if (input.status) query = query.eq("status", input.status);
        if (input.category) query = query.eq("category", input.category);
        if (input.due_date_from) query = query.gte("due_date", input.due_date_from);
        if (input.due_date_to) query = query.lte("due_date", input.due_date_to);

        const { data, error } = await query;
        if (error) return `Error querying tasks: ${error.message}`;
        if (!data || data.length === 0) return "No tasks found matching your criteria.";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.map((t: any) =>
          `• [${t.id.substring(0, 8)}] [${t.status}] ${t.title} (${t.priority}) — Due: ${t.due_date}${t.profiles?.full_name ? `, Assigned: ${t.profiles.full_name}` : ""}${t.notes ? ` | Notes: ${t.notes.substring(0, 100)}` : ""}`
        ).join("\n");
      }

      case "search_equipment": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("equipment")
          .select("id, name, equipment_type, status, condition_status, current_hours, next_service_due_hours, next_service_due_date, make, model, notes")
          .order("name")
          .limit(limit);

        if (input.status) query = query.eq("status", input.status);
        if (input.equipment_type) query = query.eq("equipment_type", input.equipment_type);

        const { data, error } = await query;
        if (error) return `Error querying equipment: ${error.message}`;
        if (!data || data.length === 0) return "No equipment found matching your criteria.";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.map((e: any) =>
          `• [${e.id.substring(0, 8)}] ${e.name}${e.make ? ` (${e.make} ${e.model || ""})` : ""} — Status: ${e.status}, Condition: ${e.condition_status}${e.current_hours ? `, Hours: ${e.current_hours}` : ""}${e.next_service_due_date ? `, Next service: ${e.next_service_due_date}` : ""}${e.notes ? ` | ${e.notes.substring(0, 80)}` : ""}`
        ).join("\n");
      }

      case "search_chemicals": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("chemical_products")
          .select("id, name, product_type, quantity_on_hand, unit_of_measure, signal_word, epa_registration, rei_hours, active_ingredient")
          .order("name")
          .limit(limit);

        if (input.product_type) query = query.eq("product_type", input.product_type);

        const { data, error } = await query;
        if (error) return `Error querying chemicals: ${error.message}`;
        if (!data || data.length === 0) return "No chemical products found.";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result = data.map((c: any) =>
          `• ${c.name} (${c.product_type}) — On hand: ${c.quantity_on_hand ?? "N/A"} ${c.unit_of_measure || ""}${c.active_ingredient ? `, Active: ${c.active_ingredient}` : ""}${c.rei_hours ? `, REI: ${c.rei_hours}hr` : ""}`
        ).join("\n");

        if (input.include_applications) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const { data: apps, error: appErr } = await supabase
            .from("chemical_applications")
            .select("application_date, product:chemical_products!product_id(name), area_treated_sqft, total_amount_used, method, target_pest, applicator:profiles!applied_by(full_name)")
            .gte("application_date", thirtyDaysAgo.toISOString().slice(0, 10))
            .order("application_date", { ascending: false })
            .limit(15);

          if (!appErr && apps && apps.length > 0) {
            result += "\n\nRecent applications (last 30 days):\n";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          .select("date, high_temp_f, low_temp_f, precipitation_in, wind_speed_mph, humidity_pct, gdd, conditions")
          .gte("date", since.toISOString().slice(0, 10))
          .order("date", { ascending: false })
          .limit(days);

        if (error) return `Error querying weather: ${error.message}`;
        if (!data || data.length === 0) return `No weather data found for the last ${days} days.`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const totalSpent = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
            result += `\n\nRecent expenses (total shown: $${totalSpent.toLocaleString()}):\n`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.map((s: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          .select("date, shift_type, start_time, end_time, notes, profile:profiles!user_id(full_name)")
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date")
          .limit(50);

        if (error) return `Error querying schedule: ${error.message}`;
        if (!data || data.length === 0) return `No schedule entries found for ${dateFrom}${dateTo !== dateFrom ? ` to ${dateTo}` : ""}.`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          const timestamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          .select("id, item_name, description, category, quantity, priority, status, vendor, estimated_cost, notes, ordered_date, received_date, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.status) query = query.eq("status", input.status);
        if (input.category) query = query.eq("category", input.category);
        if (input.search) query = query.ilike("item_name", `%${input.search}%`);

        const { data, error } = await query;
        if (error) return `Error searching orders: ${error.message}`;
        if (!data || data.length === 0) return "No order items found.";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              priority: input.severity === "critical" ? "urgent" : input.severity === "severe" ? "high" : "normal",
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
          const priority = input.severity === "critical" ? "critical"
            : input.severity === "severe" ? "high"
            : input.severity === "minor" ? "low" : "normal";
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
              notes: input.notes ? `[Issue] ${input.notes}${input.location ? ` — Location: ${input.location}` : ""}` : (input.location ? `[Issue] Location: ${input.location}` : null),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      case "get_recent_observations": {
        const daysBack = Math.min(Math.max(input.days_back || 7, 1), 30);
        const since = new Date(Date.now() - daysBack * 86400000).toISOString();
        const limit = Math.min(input.limit || 25, 50);

        let query = supabase
          .from("hole_observations")
          .select("id, hole_number, issue_type, priority, status, title, description, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.issue_type) query = query.eq("issue_type", input.issue_type);
        if (input.hole_number) query = query.eq("hole_number", input.hole_number);
        if (input.status) {
          query = query.eq("status", input.status);
        } else {
          query = query.neq("status", "resolved");
        }

        const { data, error } = await query;
        if (error) return `Error fetching observations: ${error.message}`;
        if (!data || data.length === 0) {
          return `No observations in the last ${daysBack} days${input.issue_type ? ` for ${input.issue_type}` : ""}.`;
        }

        // Summarize by issue_type for pattern recognition
        const counts: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((o: any) => {
          counts[o.issue_type] = (counts[o.issue_type] || 0) + 1;
        });
        const summary = Object.entries(counts)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = data.map((o: any) => {
          const date = new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return `• [${date}] Hole ${o.hole_number} — ${o.issue_type} (${o.priority}, ${o.status}): ${o.title}${o.description ? ` — ${o.description.substring(0, 80)}` : ""}`;
        });
        return `Observations in last ${daysBack} days (${data.length} total — ${summary}):\n${lines.join("\n")}`;
      }

      case "get_daily_snapshot": {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

        const [tasksRes, equipRes, courseIssuesRes, parkingRes, clubhouseRes, miaRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("id, title, priority, category, due_date, status")
            .in("status", ["pending", "in_progress"])
            .lte("due_date", tomorrow)
            .order("priority", { ascending: false })
            .limit(15),
          supabase
            .from("equipment")
            .select("id, name, status, condition_status")
            .in("status", ["needs_service", "in_repair", "out_of_service"])
            .limit(15),
          supabase
            .from("hole_observations")
            .select("id, hole_number, issue_type, priority, title")
            .neq("status", "resolved")
            .gte("created_at", sevenDaysAgo)
            .order("priority", { ascending: false })
            .limit(10),
          supabase
            .from("parking_lot_issues")
            .select("id, title, severity")
            .eq("status", "open")
            .limit(10),
          supabase
            .from("clubhouse_issues")
            .select("id, title, priority")
            .eq("status", "open")
            .limit(10),
          supabase
            .from("fy26_assets")
            .select("id", { count: "exact", head: true })
            .eq("status", "mia"),
        ]);

        const sections: string[] = [];
        sections.push(`📅 SNAPSHOT for ${today}`);

        const tasks = tasksRes.data || [];
        if (tasks.length > 0) {
          sections.push(`\n🗒️  Pending tasks due by tomorrow (${tasks.length}):`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tasks.slice(0, 8).forEach((t: any) =>
            sections.push(`  • [${t.priority}] ${t.title} (${t.category}, due ${t.due_date})`)
          );
          if (tasks.length > 8) sections.push(`  ...and ${tasks.length - 8} more`);
        } else {
          sections.push(`\n🗒️  No pending tasks due today/tomorrow.`);
        }

        const equip = equipRes.data || [];
        if (equip.length > 0) {
          sections.push(`\n🔧 Equipment needing attention (${equip.length}):`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          equip.slice(0, 6).forEach((e: any) =>
            sections.push(`  • ${e.name} — ${e.status}${e.condition_status ? `, ${e.condition_status}` : ""}`)
          );
          if (equip.length > 6) sections.push(`  ...and ${equip.length - 6} more`);
        }

        const obs = courseIssuesRes.data || [];
        if (obs.length > 0) {
          sections.push(`\n🌱 Open course observations (last 7 days, ${obs.length}):`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          obs.slice(0, 6).forEach((o: any) =>
            sections.push(`  • [${o.priority}] Hole ${o.hole_number}: ${o.title} (${o.issue_type})`)
          );
        }

        const parking = parkingRes.data || [];
        const clubhouse = clubhouseRes.data || [];
        if (parking.length > 0 || clubhouse.length > 0) {
          sections.push(`\n🏗️  Open facility issues:`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parking.forEach((p: any) => sections.push(`  • Parking — [${p.severity}] ${p.title}`));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          clubhouse.forEach((c: any) => sections.push(`  • Clubhouse — [${c.priority}] ${c.title}`));
        }

        const miaCount = miaRes.count || 0;
        if (miaCount > 0) {
          sections.push(`\n📦 FY26 inventory: ${miaCount} asset${miaCount === 1 ? "" : "s"} currently flagged MIA.`);
        }

        if (tasks.length === 0 && equip.length === 0 && obs.length === 0 && parking.length === 0 && clubhouse.length === 0) {
          sections.push(`\n✅ All quiet. No open tasks, equipment issues, or facility issues.`);
        }

        return sections.join("\n");
      }

      case "search_vendors": {
        const limit = Math.min(input.limit || 20, 50);
        let query = supabase
          .from("vendors")
          .select("id, name, company, phone, email, category, supplies, notes, contract_end_date")
          .order("name")
          .limit(limit);

        if (input.category) query = query.eq("category", input.category);
        if (input.search) {
          const term = `%${input.search}%`;
          query = query.or(
            `name.ilike.${term},company.ilike.${term},supplies.ilike.${term}`
          );
        }

        const { data, error } = await query;
        if (error) return `Error searching vendors: ${error.message}`;
        if (!data || data.length === 0) return "No vendors found matching your criteria.";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.map((v: any) =>
          `• ${v.name}${v.company ? ` (${v.company})` : ""} — ${v.category.replace(/_/g, " ")}${v.phone ? ` | Phone: ${v.phone}` : ""}${v.email ? ` | Email: ${v.email}` : ""}${v.supplies ? ` | Supplies: ${v.supplies}` : ""}${v.notes ? ` | Notes: ${v.notes.substring(0, 80)}` : ""}`
        ).join("\n");
      }

      case "get_fy26_assets_summary": {
        // If caller provides filters, return a list. Otherwise return counts by status & site.
        const hasFilters = !!(input.search || input.status || input.site);

        if (hasFilters) {
          const limit = Math.min(input.limit || 20, 50);
          let query = supabase
            .from("fy26_assets")
            .select("id, site, asset_number, description, manufacturer, model_text, serial_number, status, original_value")
            .order("site", { ascending: true })
            .order("asset_number", { ascending: true })
            .limit(limit);

          if (input.status) query = query.eq("status", input.status);
          if (input.site) query = query.eq("site", input.site);
          if (input.search) {
            const term = `%${input.search}%`;
            query = query.or(
              `description.ilike.${term},asset_number.ilike.${term},serial_number.ilike.${term},model_text.ilike.${term},manufacturer.ilike.${term}`
            );
          }

          const { data, error } = await query;
          if (error) return `Error searching assets: ${error.message}`;
          if (!data || data.length === 0) return `No assets matched the filters.`;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return data.map((a: any) =>
            `• [${a.status}] Site ${a.site} #${a.asset_number} — ${a.description}${a.manufacturer ? ` (${a.manufacturer})` : ""}${a.serial_number ? `, SN ${a.serial_number}` : ""}`
          ).join("\n");
        }

        // No filters: return rollup.
        const { data, error } = await supabase
          .from("fy26_assets")
          .select("site, status");
        if (error) return `Error fetching assets summary: ${error.message}`;
        if (!data) return `No asset inventory records found.`;

        const totals = { verified_present: 0, mia: 0, unverified: 0, disposed: 0 };
        const bySite: Record<string, typeof totals> = {
          "7009": { verified_present: 0, mia: 0, unverified: 0, disposed: 0 },
          "7010": { verified_present: 0, mia: 0, unverified: 0, disposed: 0 },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((a: any) => {
          if (a.status in totals) totals[a.status as keyof typeof totals]++;
          if (a.site in bySite && a.status in bySite[a.site]) {
            bySite[a.site][a.status as keyof typeof totals]++;
          }
        });

        const lines = [
          `📦 FY26 Inventory Summary (${data.length} total assets):`,
          `  • Present (located): ${totals.verified_present}`,
          `  • MIA (missing):     ${totals.mia}`,
          `  • Unverified:        ${totals.unverified}`,
          `  • Disposed:          ${totals.disposed}`,
          ``,
          `By site:`,
          `  • Site 7009 (Golf Course):   Present ${bySite["7009"].verified_present}, MIA ${bySite["7009"].mia}`,
          `  • Site 7010 (Maintenance):   Present ${bySite["7010"].verified_present}, MIA ${bySite["7010"].mia}`,
        ];
        return lines.join("\n");
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

You are the superintendent's right-hand tool. When they tell you something needs to happen, DO IT — don't tell them to go to another page. You have full read and write access via tools.

═══════════════════════════════════════════════
CAPABILITIES
═══════════════════════════════════════════════
Read: tasks, equipment, chemicals, weather, budget, staff, schedules, order items, course observations (turf issues), facility issues (parking/clubhouse), FY26 inventory assets.
Create: tasks, order items, course / parking / clubhouse issues.
Update: tasks (status, priority, notes), order items (status, vendor), equipment (status, condition).

═══════════════════════════════════════════════
TOOL-USE STRATEGY — pick the right tool
═══════════════════════════════════════════════
• "What's going on today?" / "Give me a briefing" / "What needs attention?"
  → Use get_daily_snapshot FIRST. It's one call, returns tasks+equipment+issues+MIA inventory in one shot. Then synthesize the answer. Don't call 4 separate search tools when this exists.

• "Any disease / fungus / dry spots / weed pressure lately?" / "What issues are we tracking on the course?"
  → Use get_recent_observations. Look for patterns (same issue on multiple holes, recent uptick) and call that out.

• "How many assets are MIA?" / "Did we find the [X]?" / "Annual inventory status"
  → Use get_fy26_assets_summary (no filters for overview, with filters to find a specific asset).

• Direct action request ("fix sprinkler on 7", "order bunker sand", "mark task done")
  → Go straight to the write tool. Don't search if the user already told you what to do.

• Ambiguous reference ("update that task", "order more of the stuff from yesterday")
  → Search first to resolve, confirm the match with the user if uncertain, then act.

═══════════════════════════════════════════════
ACTION RULES (DO, don't deflect)
═══════════════════════════════════════════════
1. "We need to fix X" → CREATE A TASK immediately with create_task.
2. "We need more X / out of X" → ADD TO ORDER LIST immediately with add_order_item.
3. "There's a problem at X" → REPORT THE ISSUE with report_course_issue.
4. "Mark X done" / "X is finished" → UPDATE TASK STATUS to completed with update_task.
5. Data questions → LOOK IT UP. Never invent data.

═══════════════════════════════════════════════
PROACTIVE SYNTHESIS (what separates good from great)
═══════════════════════════════════════════════
When you pull observation or snapshot data, don't just recite it — analyze:
• Multiple fungus_disease observations within a week → flag disease pressure, recommend contacting the spray contractor.
• Equipment overdue for service + heavy use season → suggest scheduling the service.
• Critical/high priority tasks bunching on one date → flag potential crew overload.
• MIA assets that match a recently-added equipment record → suggest verifying it.
Do this briefly in 1–2 sentences after the data, not as a lecture.

═══════════════════════════════════════════════
STYLE
═══════════════════════════════════════════════
• Phone-first: concise, actionable. Use bullets. Avoid preamble.
• Confirm writes with what you did ("✅ Task created: Fix sprinkler on 7, due today, normal priority").
• If a tool errors, say what failed in one line, then suggest the next step.
• For dates: "today" = current date. "tomorrow" = current+1.

═══════════════════════════════════════════════
DOMAIN RULES (Illinois / Veterans Memorial)
═══════════════════════════════════════════════
• ALL chemical spraying (herbicides, pesticides, insecticides, fungicides, algaecides) is handled by a CONTRACTED SPRAY COMPANY this year. Never recommend crew apply chemicals. For anything spray-related: "contact the spray contractor to schedule."
• For chemical / pesticide questions, mention Illinois RUP compliance when relevant.
• The report_course_issue tool routes automatically: parking → parking_lot_issues, clubhouse → clubhouse_issues, course → tasks.

═══════════════════════════════════════════════
EXAMPLE INTERACTIONS
═══════════════════════════════════════════════
User: "What's the state of the course this morning?"
You → call get_daily_snapshot → respond:
  "5 open tasks for today, 2 high priority (irrigation leak H4, bunker drainage H12). Triplex mower #2 needs service. 3 open course observations — dollar spot concern on greens 7 and 14. No parking/clubhouse issues. Want me to schedule the spray contractor for the dollar spot?"

User: "What fungus have we seen lately?"
You → call get_recent_observations with issue_type=fungus_disease, days_back=14 → respond:
  "5 fungus observations in the last 14 days, concentrated on greens 7, 11, and 14. Looks like dollar spot pattern — humidity has been up. Recommend contacting the spray contractor for a curative fungicide application."

User: "Mark the hole 7 sprinkler task done"
You → call search_tasks with category=irrigation to find it → call update_task with status=completed → respond:
  "✅ Marked done: 'Repair broken sprinkler hole 7'. Logged you as completer at ${new Date().toLocaleDateString()}."

═══════════════════════════════════════════════
Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

The user's role and name will be provided with each message.`;

// ── Main handler ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = any;

/** Call Anthropic with stream=true and return the raw fetch Response. */
async function streamClaudeRaw(
  apiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[]
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse Anthropic's SSE stream. Invokes onTextDelta for incremental text and
 * onToolStart when a tool_use block begins. Returns the final assembled content
 * blocks and stop_reason so the caller can decide whether to continue the loop.
 */
async function consumeClaudeStream(
  response: Response,
  onTextDelta: (delta: string) => Promise<void>,
  onToolStart: (name: string) => Promise<void>
): Promise<{ stopReason: string | null; contentBlocks: ContentBlock[] }> {
  if (!response.body) {
    throw new Error("No response body from Claude");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const contentBlocks: ContentBlock[] = [];
  const toolInputBuffers: Record<number, string> = {};
  let stopReason: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines.
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      if (!rawEvent.trim()) continue;
      let eventType = "";
      let dataStr = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataStr += line.slice(6);
      }
      if (!dataStr) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (eventType === "content_block_start") {
        const idx = data.index as number;
        const block = data.content_block;
        if (block.type === "text") {
          contentBlocks[idx] = { type: "text", text: "" };
        } else if (block.type === "tool_use") {
          contentBlocks[idx] = { type: "tool_use", id: block.id, name: block.name, input: {} };
          toolInputBuffers[idx] = "";
          await onToolStart(block.name);
        }
      } else if (eventType === "content_block_delta") {
        const idx = data.index as number;
        const delta = data.delta;
        if (!contentBlocks[idx]) continue;
        if (delta.type === "text_delta") {
          contentBlocks[idx].text = (contentBlocks[idx].text || "") + delta.text;
          await onTextDelta(delta.text);
        } else if (delta.type === "input_json_delta") {
          toolInputBuffers[idx] = (toolInputBuffers[idx] || "") + delta.partial_json;
        }
      } else if (eventType === "content_block_stop") {
        const idx = data.index as number;
        const block = contentBlocks[idx];
        if (block?.type === "tool_use") {
          const buf = toolInputBuffers[idx] || "{}";
          try {
            block.input = JSON.parse(buf);
          } catch {
            block.input = {};
          }
          delete toolInputBuffers[idx];
        }
      } else if (eventType === "message_delta") {
        if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
      } else if (eventType === "error") {
        throw new Error(data.error?.message || "Claude stream error");
      }
    }
  }

  return { stopReason, contentBlocks };
}

export async function POST(request: NextRequest) {
  // Auth check (non-streaming — errors here are returned as JSON)
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const userName = profile?.full_name || "User";
  const userRole = profile?.role || "crew";

  let body: { message?: string; history?: ChatMessage[]; photoStoragePath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, history, photoStoragePath } = body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI assistant is not configured. Please set the ANTHROPIC_API_KEY environment variable." },
      { status: 503 }
    );
  }

  const recentHistory = (history || []).slice(-10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // ── SSE stream back to client ─────────────────────────────────────────────

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventType: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may have been closed by the client; ignore.
        }
      };

      // Heartbeat every 15s so proxies don't kill an idle connection during
      // long tool executions.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // ignore
        }
      }, 15_000);

      try {
        let rounds = 0;
        const MAX_ROUNDS = 5;

        while (true) {
          const claudeRes = await streamClaudeRaw(apiKey, messages);
          if (!claudeRes.ok) {
            const errText = await claudeRes.text();
            console.error(`Claude API error ${claudeRes.status}:`, errText);
            send("error", { message: "AI service is temporarily unavailable. Please try again in a moment." });
            break;
          }

          const { stopReason, contentBlocks } = await consumeClaudeStream(
            claudeRes,
            async (delta) => send("text", { delta }),
            async (name) => send("tool", { name, status: "start" })
          );

          // If the model wants tools, execute them and loop.
          if (stopReason === "tool_use" && rounds < MAX_ROUNDS) {
            rounds++;

            const toolUseBlocks = contentBlocks.filter(
              (b) => b && b.type === "tool_use"
            );
            if (toolUseBlocks.length === 0) break;

            const toolResults: Array<{
              type: "tool_result";
              tool_use_id: string;
              content: string;
            }> = [];

            for (const toolBlock of toolUseBlocks) {
              const result = await executeTool(
                toolBlock.name,
                toolBlock.input,
                supabase,
                user.id,
                photoStoragePath
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolBlock.id,
                content: result,
              });
              send("tool", { name: toolBlock.name, status: "done" });
            }

            messages.push({ role: "assistant", content: contentBlocks });
            messages.push({ role: "user", content: toolResults });
            continue; // next round
          }

          // Done (end_turn, max_tokens, stop_sequence, etc.)
          send("done", { stopReason: stopReason || "end_turn" });
          break;
        }
      } catch (err) {
        console.error("AI assistant streaming error:", err);
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        send("error", { message: msg });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
