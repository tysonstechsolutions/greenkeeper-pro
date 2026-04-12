// =============================================
// Historical Query Tools for "Ask Your Course"
// Extends the AI assistant with tools to search
// past records: chemicals, observations, weather,
// tasks, equipment, and expenses.
// =============================================

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Tool Definitions (Claude tool_use format) ──

export const HISTORICAL_QUERY_TOOLS = [
  {
    name: "query_chemical_history",
    description:
      "Search chemical/pesticide application history for the course. Returns matching applications with dates, products, rates, and target areas.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "Filter by a specific course zone ID",
        },
        hole_number: {
          type: "number",
          description: "Filter by hole number (1-18)",
        },
        product_name: {
          type: "string",
          description:
            "Filter by product name (partial match, case-insensitive)",
        },
        since: {
          type: "string",
          description: "Start date filter (ISO date, e.g. 2026-01-01)",
        },
        until: {
          type: "string",
          description: "End date filter (ISO date, e.g. 2026-12-31)",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 20, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_observation_history",
    description:
      "Search course observation history including hole observations and general course observations. Returns observations with dates, types, severity, status, and notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        hole_number: {
          type: "number",
          description: "Filter by hole number",
        },
        issue_type: {
          type: "string",
          description:
            "Filter by issue type (e.g. fungus_disease, dry_spot, weed_pressure)",
        },
        status: {
          type: "string",
          description:
            "Filter by status: open, in_progress, resolved, monitoring",
        },
        since: {
          type: "string",
          description: "Start date filter (ISO date)",
        },
        until: {
          type: "string",
          description: "End date filter (ISO date)",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 20, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_weather_history",
    description:
      "Look up historical weather data for the course. Can aggregate or return daily records. Returns temperature, precipitation, wind, humidity, and growing degree days.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Start date (ISO date, required)",
        },
        until: {
          type: "string",
          description: "End date (ISO date, required)",
        },
        metric: {
          type: "string",
          enum: ["temperature", "precipitation", "wind", "all"],
          description:
            "Which metric to focus on. Default 'all' returns everything.",
        },
        aggregate: {
          type: "boolean",
          description:
            "If true, return summary stats (avg/min/max/sum) instead of daily rows",
        },
      },
      required: ["since", "until"],
    },
  },
  {
    name: "query_task_history",
    description:
      "Search task assignment and completion history. Can filter by assignee, status, priority, category, and date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        assignee_name: {
          type: "string",
          description:
            "Filter by assignee name (partial match, case-insensitive)",
        },
        status: {
          type: "string",
          description:
            "Filter by status: pending, in_progress, completed, verified, blocked, deferred, cancelled",
        },
        priority: {
          type: "string",
          description: "Filter by priority: critical, high, normal, low",
        },
        category: {
          type: "string",
          description:
            "Filter by task category: mowing, irrigation, chemical, mechanical, etc.",
        },
        since: {
          type: "string",
          description: "Start date filter (ISO date) — filters on due_date",
        },
        until: {
          type: "string",
          description: "End date filter (ISO date) — filters on due_date",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 20, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_equipment_history",
    description:
      "Look up equipment service records, usage hours, and maintenance history from equipment logs.",
    input_schema: {
      type: "object" as const,
      properties: {
        equipment_name: {
          type: "string",
          description:
            "Filter by equipment name (partial match, case-insensitive)",
        },
        equipment_id: {
          type: "string",
          description: "Filter by specific equipment UUID",
        },
        log_type: {
          type: "string",
          description:
            "Filter by log type: service, repair, fuel, inspection, incident, hours_update",
        },
        since: {
          type: "string",
          description: "Start date filter (ISO date)",
        },
        until: {
          type: "string",
          description: "End date filter (ISO date)",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 20, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_budget_expenses",
    description:
      "Search expense records and budget spending. Can aggregate totals by vendor or return individual expense items.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "Start date filter (ISO date)",
        },
        until: {
          type: "string",
          description: "End date filter (ISO date)",
        },
        min_amount: {
          type: "number",
          description: "Minimum expense amount filter",
        },
        description_search: {
          type: "string",
          description:
            "Search expense descriptions (partial match, case-insensitive)",
        },
        aggregate: {
          type: "boolean",
          description:
            "If true, return totals grouped by vendor instead of individual items",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 20, max 50)",
        },
      },
      required: [],
    },
  },
];

// ── Tool Implementations ──

type SupabaseClient = any;

function clampLimit(input: number | undefined): number {
  const val = input ?? 20;
  return Math.min(Math.max(val, 1), 50);
}

export const HISTORICAL_QUERY_IMPLEMENTATIONS: Record<
  string,
  (input: any, supabase: SupabaseClient) => Promise<string>
> = {
  // ── Chemical Application History ──
  async query_chemical_history(input: any, supabase: SupabaseClient) {
    try {
      const limit = clampLimit(input.limit);

      let query = supabase
        .from("chemical_applications")
        .select(
          "id, application_date, application_time, hole_numbers, area_treated_sqft, application_rate, total_amount_used, method, target_pest, notes, weather_temp_f, weather_wind_mph, product:product_id(product_name, active_ingredient, product_type)"
        )
        .order("application_date", { ascending: false })
        .limit(limit);

      if (input.zone_id) {
        query = query.contains("zone_ids", [input.zone_id]);
      }
      if (input.hole_number) {
        query = query.contains("hole_numbers", [input.hole_number]);
      }
      if (input.since) {
        query = query.gte("application_date", input.since);
      }
      if (input.until) {
        query = query.lte("application_date", input.until);
      }

      const { data, error } = await query;
      if (error)
        return `I couldn't retrieve chemical history right now: ${error.message}`;

      // If filtering by product name, we need to filter in JS since it's a joined column
      let results = data || [];
      if (input.product_name) {
        const search = input.product_name.toLowerCase();
        results = results.filter(
          (r: any) =>
            r.product?.product_name?.toLowerCase().includes(search) ||
            r.product?.active_ingredient?.toLowerCase().includes(search)
        );
      }

      if (results.length === 0)
        return "No chemical applications found matching your criteria.";

      const lines = results.map((r: any, i: number) => {
        const product = r.product;
        const productName = product?.product_name || "Unknown product";
        const ai = product?.active_ingredient
          ? ` (${product.active_ingredient})`
          : "";
        const holes = r.hole_numbers?.length
          ? `Holes ${r.hole_numbers.join(", ")}`
          : "All areas";
        const rate = r.application_rate
          ? `Rate: ${r.application_rate}`
          : "";
        const target = r.target_pest ? `Target: ${r.target_pest}` : "";
        const details = [rate, target].filter(Boolean).join(" | ");

        return `${i + 1}. ${r.application_date} — ${productName}${ai} applied to ${holes}${details ? `\n   ${details}` : ""}${r.notes ? `\n   Notes: ${r.notes}` : ""}`;
      });

      return `Found ${results.length} chemical application${results.length !== 1 ? "s" : ""} matching your criteria:\n\n${lines.join("\n\n")}`;
    } catch (err) {
      return `I couldn't retrieve chemical history right now — the database might be temporarily unavailable.`;
    }
  },

  // ── Observation History ──
  async query_observation_history(input: any, supabase: SupabaseClient) {
    try {
      const limit = clampLimit(input.limit);
      const results: any[] = [];

      // Query hole_observations
      {
        let query = supabase
          .from("hole_observations")
          .select(
            "id, hole_number, issue_type, priority, status, title, description, created_at, resolved_at"
          )
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.hole_number) {
          query = query.eq("hole_number", input.hole_number);
        }
        if (input.issue_type) {
          query = query.eq("issue_type", input.issue_type);
        }
        if (input.status) {
          query = query.eq("status", input.status);
        }
        if (input.since) {
          query = query.gte("created_at", input.since);
        }
        if (input.until) {
          query = query.lte("created_at", input.until + "T23:59:59");
        }

        const { data, error } = await query;
        if (!error && data) {
          results.push(
            ...data.map((r: any) => ({
              ...r,
              source: "hole_observation",
            }))
          );
        }
      }

      // Query course_observations
      {
        let query = supabase
          .from("course_observations")
          .select(
            "id, category, sentiment, title, description, location, hole_number, is_addressed, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(limit);

        if (input.hole_number) {
          query = query.eq("hole_number", input.hole_number);
        }
        if (input.issue_type) {
          // course_observations uses "category" instead of "issue_type"
          query = query.eq("category", input.issue_type);
        }
        if (input.status === "resolved" || input.status === "addressed") {
          query = query.eq("is_addressed", true);
        } else if (input.status === "open") {
          query = query.eq("is_addressed", false);
        }
        if (input.since) {
          query = query.gte("created_at", input.since);
        }
        if (input.until) {
          query = query.lte("created_at", input.until + "T23:59:59");
        }

        const { data, error } = await query;
        if (!error && data) {
          results.push(
            ...data.map((r: any) => ({
              ...r,
              source: "course_observation",
            }))
          );
        }
      }

      // Sort combined results by date descending and limit
      results.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const trimmed = results.slice(0, limit);

      if (trimmed.length === 0)
        return "No observations found matching your criteria.";

      const lines = trimmed.map((r: any, i: number) => {
        const date = r.created_at?.split("T")[0] || "Unknown date";
        if (r.source === "hole_observation") {
          const statusBadge = r.status === "resolved" ? " [RESOLVED]" : ` [${(r.status || "open").toUpperCase()}]`;
          return `${i + 1}. ${date} — Hole #${r.hole_number}: ${r.title}${statusBadge}\n   Type: ${r.issue_type} | Priority: ${r.priority}${r.description ? `\n   ${r.description}` : ""}`;
        } else {
          const statusBadge = r.is_addressed ? " [ADDRESSED]" : " [OPEN]";
          const loc = r.hole_number
            ? `Hole #${r.hole_number}`
            : r.location || "General";
          return `${i + 1}. ${date} — ${loc}: ${r.title}${statusBadge}\n   Category: ${r.category} | Sentiment: ${r.sentiment}${r.description ? `\n   ${r.description}` : ""}`;
        }
      });

      return `Found ${trimmed.length} observation${trimmed.length !== 1 ? "s" : ""} matching your criteria:\n\n${lines.join("\n\n")}`;
    } catch (err) {
      return `I couldn't retrieve observation history right now — the database might be temporarily unavailable.`;
    }
  },

  // ── Weather History ──
  async query_weather_history(input: any, supabase: SupabaseClient) {
    try {
      let query = supabase
        .from("weather_logs")
        .select("*")
        .gte("log_date", input.since)
        .lte("log_date", input.until)
        .order("log_date", { ascending: true });

      const { data, error } = await query;
      if (error)
        return `I couldn't retrieve weather history right now: ${error.message}`;
      if (!data || data.length === 0)
        return `No weather records found between ${input.since} and ${input.until}.`;

      if (input.aggregate) {
        const temps = data
          .filter((d: any) => d.high_temp_f != null || d.low_temp_f != null);
        const precips = data
          .filter((d: any) => d.precipitation_inches != null);
        const winds = data.filter(
          (d: any) => d.wind_max_mph != null
        );
        const humidities = data.filter(
          (d: any) => d.humidity_avg != null
        );

        const avgHigh =
          temps.length > 0
            ? (
                temps.reduce(
                  (s: number, d: any) => s + (d.high_temp_f || 0),
                  0
                ) / temps.length
              ).toFixed(1)
            : "N/A";
        const avgLow =
          temps.length > 0
            ? (
                temps.reduce(
                  (s: number, d: any) => s + (d.low_temp_f || 0),
                  0
                ) / temps.length
              ).toFixed(1)
            : "N/A";
        const maxHigh =
          temps.length > 0
            ? Math.max(...temps.map((d: any) => d.high_temp_f || 0))
            : "N/A";
        const minLow =
          temps.length > 0
            ? Math.min(
                ...temps.map((d: any) => d.low_temp_f ?? 999)
              )
            : "N/A";
        const totalPrecip =
          precips.length > 0
            ? precips
                .reduce(
                  (s: number, d: any) => s + (d.precipitation_inches || 0),
                  0
                )
                .toFixed(2)
            : "0.00";
        const maxWind =
          winds.length > 0
            ? Math.max(...winds.map((d: any) => d.wind_max_mph || 0))
            : "N/A";
        const avgHumidity =
          humidities.length > 0
            ? (
                humidities.reduce(
                  (s: number, d: any) => s + (d.humidity_avg || 0),
                  0
                ) / humidities.length
              ).toFixed(0)
            : "N/A";
        const frostDays = data.filter(
          (d: any) => d.frost_observed
        ).length;
        const totalGDD = data
          .reduce((s: number, d: any) => s + (d.gdd_base50 || 0), 0)
          .toFixed(1);

        return `Weather summary for ${input.since} to ${input.until} (${data.length} days):

Temperature:
  Avg High: ${avgHigh}°F | Avg Low: ${avgLow}°F
  Max High: ${maxHigh}°F | Min Low: ${minLow}°F

Precipitation:
  Total: ${totalPrecip} inches
  Rainy days: ${precips.filter((d: any) => (d.precipitation_inches || 0) > 0).length}

Wind:
  Max gust: ${maxWind} mph

Humidity:
  Average: ${avgHumidity}%

Growing Degree Days (base 50): ${totalGDD}
Frost days: ${frostDays}`;
      }

      // Daily rows — limit to 50
      const rows = data.slice(0, 50);
      const lines = rows.map((d: any) => {
        const parts: string[] = [];
        if (d.high_temp_f != null || d.low_temp_f != null) {
          parts.push(`${d.high_temp_f ?? "?"}°F / ${d.low_temp_f ?? "?"}°F`);
        }
        if (d.precipitation_inches != null && d.precipitation_inches > 0) {
          parts.push(`Rain: ${d.precipitation_inches}in`);
        }
        if (d.wind_max_mph != null) {
          parts.push(`Wind: ${d.wind_max_mph}mph`);
        }
        if (d.humidity_avg != null) {
          parts.push(`Humidity: ${d.humidity_avg}%`);
        }
        if (d.frost_observed) {
          parts.push("FROST");
        }
        if (d.conditions) {
          parts.push(d.conditions);
        }
        return `${d.log_date}: ${parts.join(" | ")}`;
      });

      return `Weather records from ${input.since} to ${input.until} (${data.length} days${data.length > 50 ? ", showing first 50" : ""}):\n\n${lines.join("\n")}`;
    } catch (err) {
      return `I couldn't retrieve weather history right now — the database might be temporarily unavailable.`;
    }
  },

  // ── Task History ──
  async query_task_history(input: any, supabase: SupabaseClient) {
    try {
      const limit = clampLimit(input.limit);

      let query = supabase
        .from("tasks")
        .select(
          "id, title, category, priority, status, due_date, completed_at, notes, assigned_to, assignee:assigned_to(full_name)"
        )
        .order("due_date", { ascending: false })
        .limit(limit);

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.priority) {
        query = query.eq("priority", input.priority);
      }
      if (input.category) {
        query = query.eq("category", input.category);
      }
      if (input.since) {
        query = query.gte("due_date", input.since);
      }
      if (input.until) {
        query = query.lte("due_date", input.until);
      }

      const { data, error } = await query;
      if (error)
        return `I couldn't retrieve task history right now: ${error.message}`;

      let results = data || [];

      // Filter by assignee name in JS (joined field)
      if (input.assignee_name) {
        const search = input.assignee_name.toLowerCase();
        results = results.filter((r: any) =>
          r.assignee?.full_name?.toLowerCase().includes(search)
        );
      }

      if (results.length === 0)
        return "No tasks found matching your criteria.";

      const lines = results.map((r: any, i: number) => {
        const assignee = r.assignee?.full_name || "Unassigned";
        const statusBadge = `[${(r.status || "pending").toUpperCase()}]`;
        const completed = r.completed_at
          ? ` | Completed: ${r.completed_at.split("T")[0]}`
          : "";
        return `${i + 1}. ${r.due_date} — ${r.title} ${statusBadge}\n   Assigned to: ${assignee} | Priority: ${r.priority} | Category: ${r.category}${completed}${r.notes ? `\n   Notes: ${r.notes}` : ""}`;
      });

      return `Found ${results.length} task${results.length !== 1 ? "s" : ""} matching your criteria:\n\n${lines.join("\n\n")}`;
    } catch (err) {
      return `I couldn't retrieve task history right now — the database might be temporarily unavailable.`;
    }
  },

  // ── Equipment History ──
  async query_equipment_history(input: any, supabase: SupabaseClient) {
    try {
      const limit = clampLimit(input.limit);

      let query = supabase
        .from("equipment_logs")
        .select(
          "id, log_type, description, performed_by, hours_at_service, cost, vendor, downtime_hours, created_at, equipment:equipment_id(name, equipment_type)"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (input.equipment_id) {
        query = query.eq("equipment_id", input.equipment_id);
      }
      if (input.log_type) {
        query = query.eq("log_type", input.log_type);
      }
      if (input.since) {
        query = query.gte("created_at", input.since);
      }
      if (input.until) {
        query = query.lte("created_at", input.until + "T23:59:59");
      }

      const { data, error } = await query;
      if (error)
        return `I couldn't retrieve equipment history right now: ${error.message}`;

      let results = data || [];

      // Filter by equipment name in JS (joined field)
      if (input.equipment_name) {
        const search = input.equipment_name.toLowerCase();
        results = results.filter((r: any) =>
          r.equipment?.name?.toLowerCase().includes(search)
        );
      }

      if (results.length === 0)
        return "No equipment log entries found matching your criteria.";

      const lines = results.map((r: any, i: number) => {
        const eqName = r.equipment?.name || "Unknown equipment";
        const date = r.created_at?.split("T")[0] || "Unknown date";
        const costStr = r.cost != null ? ` | Cost: $${r.cost.toFixed(2)}` : "";
        const hours =
          r.hours_at_service != null ? ` | Hours: ${r.hours_at_service}` : "";
        const downtime =
          r.downtime_hours != null
            ? ` | Downtime: ${r.downtime_hours}h`
            : "";
        return `${i + 1}. ${date} — ${eqName} [${r.log_type.toUpperCase()}]\n   ${r.description}${costStr}${hours}${downtime}`;
      });

      return `Found ${results.length} equipment log${results.length !== 1 ? "s" : ""} matching your criteria:\n\n${lines.join("\n\n")}`;
    } catch (err) {
      return `I couldn't retrieve equipment history right now — the database might be temporarily unavailable.`;
    }
  },

  // ── Budget / Expenses ──
  async query_budget_expenses(input: any, supabase: SupabaseClient) {
    try {
      const limit = clampLimit(input.limit);

      let query = supabase
        .from("expenses")
        .select(
          "id, amount, description, vendor, expense_date, status, notes"
        )
        .order("expense_date", { ascending: false })
        .limit(input.aggregate ? 1000 : limit);

      if (input.since) {
        query = query.gte("expense_date", input.since);
      }
      if (input.until) {
        query = query.lte("expense_date", input.until);
      }
      if (input.min_amount) {
        query = query.gte("amount", input.min_amount);
      }
      if (input.description_search) {
        query = query.ilike("description", `%${input.description_search}%`);
      }

      const { data, error } = await query;
      if (error)
        return `I couldn't retrieve expense records right now: ${error.message}`;

      const results = data || [];
      if (results.length === 0)
        return "No expense records found matching your criteria.";

      if (input.aggregate) {
        const byVendor: Record<string, { total: number; count: number }> = {};
        let grandTotal = 0;
        for (const r of results) {
          const vendor = r.vendor || "Unspecified";
          if (!byVendor[vendor]) byVendor[vendor] = { total: 0, count: 0 };
          byVendor[vendor].total += r.amount || 0;
          byVendor[vendor].count++;
          grandTotal += r.amount || 0;
        }

        const sorted = Object.entries(byVendor).sort(
          (a, b) => b[1].total - a[1].total
        );
        const lines = sorted.map(
          ([vendor, { total, count }]) =>
            `  ${vendor}: $${total.toFixed(2)} (${count} expense${count !== 1 ? "s" : ""})`
        );

        return `Expense summary (${results.length} records):\n\nTotal: $${grandTotal.toFixed(2)}\n\nBy vendor:\n${lines.join("\n")}`;
      }

      const lines = results.map((r: any, i: number) => {
        const vendor = r.vendor ? ` — ${r.vendor}` : "";
        const status = r.status !== "paid" ? ` [${r.status.toUpperCase()}]` : "";
        return `${i + 1}. ${r.expense_date} — $${r.amount.toFixed(2)}${vendor}${status}\n   ${r.description}${r.notes ? `\n   Notes: ${r.notes}` : ""}`;
      });

      return `Found ${results.length} expense${results.length !== 1 ? "s" : ""} matching your criteria:\n\n${lines.join("\n\n")}`;
    } catch (err) {
      return `I couldn't retrieve expense records right now — the database might be temporarily unavailable.`;
    }
  },
};
