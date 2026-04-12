import { describe, it, expect, vi } from "vitest";
import {
  HISTORICAL_QUERY_TOOLS,
  HISTORICAL_QUERY_IMPLEMENTATIONS,
} from "@/lib/ai/tools/historical-queries";

// ── Mock Supabase client builder ──

function createMockSupabase(returnData: unknown[] | null, returnError: { message: string } | null = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.contains = vi.fn().mockReturnValue(chain);
  // Terminal — resolves the promise-like chain
  chain.then = vi.fn().mockImplementation((resolve) =>
    resolve({ data: returnData, error: returnError })
  );
  return chain as unknown as Record<string, unknown>;
}

// ── Tool definition tests ──

describe("HISTORICAL_QUERY_TOOLS definitions", () => {
  it("exports exactly 6 tool definitions", () => {
    expect(HISTORICAL_QUERY_TOOLS).toHaveLength(6);
  });

  it("each tool has name, description, and input_schema", () => {
    for (const tool of HISTORICAL_QUERY_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe("object");
    }
  });

  it("tool names all start with query_", () => {
    for (const tool of HISTORICAL_QUERY_TOOLS) {
      expect(tool.name).toMatch(/^query_/);
    }
  });
});

// ── Implementation tests ──

describe("query_chemical_history", () => {
  const impl = HISTORICAL_QUERY_IMPLEMENTATIONS.query_chemical_history;

  it("returns formatted results when data exists", async () => {
    const mockData = [
      {
        id: "1",
        application_date: "2026-05-15",
        application_time: "08:00",
        hole_numbers: [3, 5, 7],
        area_treated_sqft: 15000,
        application_rate: "3.6 fl oz/1000 sqft",
        total_amount_used: 54,
        method: "spray",
        target_pest: "Dollar Spot",
        notes: null,
        weather_temp_f: 72,
        weather_wind_mph: 5,
        product: {
          product_name: "Daconil",
          active_ingredient: "chlorothalonil",
          product_type: "fungicide",
        },
      },
    ];
    const supabase = createMockSupabase(mockData);
    const result = await impl({}, supabase);

    expect(result).toContain("Found 1 chemical application");
    expect(result).toContain("Daconil");
    expect(result).toContain("chlorothalonil");
    expect(result).toContain("Holes 3, 5, 7");
    expect(result).toContain("Dollar Spot");
  });

  it("returns empty message when no data matches", async () => {
    const supabase = createMockSupabase([]);
    const result = await impl({}, supabase);
    expect(result).toBe("No chemical applications found matching your criteria.");
  });

  it("filters by product name in JS", async () => {
    const mockData = [
      {
        id: "1",
        application_date: "2026-05-15",
        hole_numbers: [],
        product: { product_name: "Heritage", active_ingredient: "azoxystrobin", product_type: "fungicide" },
      },
      {
        id: "2",
        application_date: "2026-05-10",
        hole_numbers: [],
        product: { product_name: "Daconil", active_ingredient: "chlorothalonil", product_type: "fungicide" },
      },
    ];
    const supabase = createMockSupabase(mockData);
    const result = await impl({ product_name: "heritage" }, supabase);

    expect(result).toContain("Heritage");
    expect(result).not.toContain("Daconil");
  });
});

describe("query_observation_history", () => {
  const impl = HISTORICAL_QUERY_IMPLEMENTATIONS.query_observation_history;

  it("returns empty message when no observations found", async () => {
    const supabase = createMockSupabase([]);
    const result = await impl({}, supabase);
    expect(result).toBe("No observations found matching your criteria.");
  });

  it("returns formatted results combining hole and course observations", async () => {
    // The mock returns the same data for both queries (hole_observations and course_observations)
    // Since the impl does two queries, we need a mock that can be called twice
    const callCount = { n: 0 };
    const holeData = [
      {
        id: "h1",
        hole_number: 7,
        issue_type: "dry_spot",
        priority: "high",
        status: "open",
        title: "Dry spot on collar",
        description: "Northwest corner",
        created_at: "2026-04-01T10:00:00Z",
        resolved_at: null,
      },
    ];
    const courseData = [
      {
        id: "c1",
        category: "turf",
        sentiment: "negative",
        title: "Thin turf near cart path",
        description: "Between holes 3 and 4",
        location: "Cart path area",
        hole_number: null,
        is_addressed: false,
        created_at: "2026-03-28T08:00:00Z",
      },
    ];

    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockImplementation(() => {
      callCount.n++;
      return chain;
    });
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.lte = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn().mockImplementation((resolve) => {
      return resolve({
        data: callCount.n <= 1 ? holeData : courseData,
        error: null,
      });
    });

    const result = await impl({}, chain as unknown as Record<string, unknown>);

    expect(result).toContain("Found 2 observations");
    expect(result).toContain("Dry spot on collar");
    expect(result).toContain("Thin turf near cart path");
  });
});

describe("query_weather_history", () => {
  const impl = HISTORICAL_QUERY_IMPLEMENTATIONS.query_weather_history;

  it("returns empty message when no weather records found", async () => {
    const supabase = createMockSupabase([]);
    const result = await impl({ since: "2026-01-01", until: "2026-01-31" }, supabase);
    expect(result).toContain("No weather records found");
  });

  it("returns aggregated stats when aggregate=true", async () => {
    const weatherData = [
      { log_date: "2026-08-01", high_temp_f: 90, low_temp_f: 70, precipitation_inches: 0.5, wind_max_mph: 15, humidity_avg: 75, frost_observed: false, gdd_base50: 30, conditions: "Partly cloudy" },
      { log_date: "2026-08-02", high_temp_f: 85, low_temp_f: 65, precipitation_inches: 0, wind_max_mph: 10, humidity_avg: 60, frost_observed: false, gdd_base50: 25, conditions: "Sunny" },
      { log_date: "2026-08-03", high_temp_f: 88, low_temp_f: 68, precipitation_inches: 1.2, wind_max_mph: 20, humidity_avg: 80, frost_observed: false, gdd_base50: 28, conditions: "Thunderstorms" },
    ];
    const supabase = createMockSupabase(weatherData);
    const result = await impl(
      { since: "2026-08-01", until: "2026-08-03", aggregate: true },
      supabase
    );

    expect(result).toContain("Weather summary");
    expect(result).toContain("3 days");
    expect(result).toContain("Total:");
    expect(result).toContain("1.70");
    expect(result).toContain("Max gust: 20 mph");
  });

  it("returns daily rows when aggregate=false", async () => {
    const weatherData = [
      { log_date: "2026-08-01", high_temp_f: 90, low_temp_f: 70, precipitation_inches: 0.5, wind_max_mph: 15, humidity_avg: 75, frost_observed: false, conditions: "Partly cloudy" },
    ];
    const supabase = createMockSupabase(weatherData);
    const result = await impl(
      { since: "2026-08-01", until: "2026-08-01" },
      supabase
    );

    expect(result).toContain("2026-08-01");
    expect(result).toContain("90°F / 70°F");
    expect(result).toContain("Rain: 0.5in");
  });
});

describe("query_task_history", () => {
  const impl = HISTORICAL_QUERY_IMPLEMENTATIONS.query_task_history;

  it("returns formatted task results", async () => {
    const taskData = [
      {
        id: "t1",
        title: "Mow greens holes 1-9",
        category: "mowing",
        priority: "normal",
        status: "completed",
        due_date: "2026-04-05",
        completed_at: "2026-04-05T14:00:00Z",
        notes: null,
        assigned_to: "user-1",
        assignee: { full_name: "Miguel Rodriguez" },
      },
    ];
    const supabase = createMockSupabase(taskData);
    const result = await impl({}, supabase);

    expect(result).toContain("Found 1 task");
    expect(result).toContain("Mow greens holes 1-9");
    expect(result).toContain("Miguel Rodriguez");
    expect(result).toContain("[COMPLETED]");
  });

  it("returns empty message when no tasks found", async () => {
    const supabase = createMockSupabase([]);
    const result = await impl({ assignee_name: "Nobody" }, supabase);
    expect(result).toBe("No tasks found matching your criteria.");
  });

  it("filters by assignee name in JS", async () => {
    const taskData = [
      { id: "t1", title: "Task A", category: "mowing", priority: "normal", status: "completed", due_date: "2026-04-05", completed_at: null, notes: null, assignee: { full_name: "Miguel Rodriguez" } },
      { id: "t2", title: "Task B", category: "mowing", priority: "normal", status: "completed", due_date: "2026-04-05", completed_at: null, notes: null, assignee: { full_name: "John Smith" } },
    ];
    const supabase = createMockSupabase(taskData);
    const result = await impl({ assignee_name: "miguel" }, supabase);

    expect(result).toContain("Task A");
    expect(result).not.toContain("Task B");
  });
});

describe("query_equipment_history", () => {
  const impl = HISTORICAL_QUERY_IMPLEMENTATIONS.query_equipment_history;

  it("returns formatted equipment log results", async () => {
    const logData = [
      {
        id: "e1",
        log_type: "service",
        description: "Oil change and blade sharpening",
        performed_by: "user-1",
        hours_at_service: 450,
        cost: 125.0,
        vendor: null,
        downtime_hours: 2,
        created_at: "2026-04-01T10:00:00Z",
        equipment: { name: "Toro Greensmaster 3250-D", equipment_type: "mower_reel" },
      },
    ];
    const supabase = createMockSupabase(logData);
    const result = await impl({}, supabase);

    expect(result).toContain("Found 1 equipment log");
    expect(result).toContain("Toro Greensmaster 3250-D");
    expect(result).toContain("[SERVICE]");
    expect(result).toContain("$125.00");
    expect(result).toContain("Hours: 450");
  });

  it("returns empty message when no logs found", async () => {
    const supabase = createMockSupabase([]);
    const result = await impl({ equipment_name: "nonexistent" }, supabase);
    expect(result).toBe("No equipment log entries found matching your criteria.");
  });
});

describe("query_budget_expenses", () => {
  const impl = HISTORICAL_QUERY_IMPLEMENTATIONS.query_budget_expenses;

  it("returns formatted individual expense items", async () => {
    const expenseData = [
      {
        id: "x1",
        amount: 450.0,
        description: "Fungicide bulk order",
        vendor: "SiteOne Landscape Supply",
        expense_date: "2026-04-01",
        status: "paid",
        notes: null,
      },
    ];
    const supabase = createMockSupabase(expenseData);
    const result = await impl({}, supabase);

    expect(result).toContain("Found 1 expense");
    expect(result).toContain("$450.00");
    expect(result).toContain("SiteOne Landscape Supply");
    expect(result).toContain("Fungicide bulk order");
  });

  it("returns aggregated totals when aggregate=true", async () => {
    const expenseData = [
      { id: "x1", amount: 450.0, description: "Fungicide", vendor: "SiteOne", expense_date: "2026-04-01", status: "paid", notes: null },
      { id: "x2", amount: 200.0, description: "Fertilizer", vendor: "SiteOne", expense_date: "2026-04-05", status: "paid", notes: null },
      { id: "x3", amount: 75.0, description: "Oil filter", vendor: "NAPA", expense_date: "2026-04-03", status: "paid", notes: null },
    ];
    const supabase = createMockSupabase(expenseData);
    const result = await impl({ aggregate: true }, supabase);

    expect(result).toContain("Expense summary");
    expect(result).toContain("$725.00");
    expect(result).toContain("SiteOne");
    expect(result).toContain("NAPA");
  });

  it("returns empty message when no expenses found", async () => {
    const supabase = createMockSupabase([]);
    const result = await impl({ since: "2099-01-01" }, supabase);
    expect(result).toBe("No expense records found matching your criteria.");
  });
});

describe("error handling", () => {
  it("returns user-friendly error message on database error", async () => {
    const supabase = createMockSupabase(null, { message: "connection timeout" });
    const result = await HISTORICAL_QUERY_IMPLEMENTATIONS.query_chemical_history({}, supabase);
    expect(result).toContain("couldn't retrieve chemical history");
  });
});
